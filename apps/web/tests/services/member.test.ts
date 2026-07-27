import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/db";
import { createMember, MemberValidationError } from "@/lib/services/member";
import * as memberRepo from "@/lib/db/repositories/member";
import { auth } from "@/lib/auth";

// deactivateMember/reactivateMember(lib/services/member.ts)는 next/headers()의 headers()를
// 내부에서 호출한다 — Next.js 요청 스코프 밖(순수 vitest node 테스트)에서 호출하면
// "headers was called outside a request scope"로 즉시 실패한다. 이 프로젝트의 기존
// lib/auth-guard.ts(requireAdminSession/requireSession)도 동일한 이유로 vitest 커버리지가
// 없고 수동 HTTP 검증으로 대체돼왔다(회귀 확인 시 grep으로 확인). 그래서 여기서는 그 얇은
// headers() 배선을 우회하고, 서비스가 실제로 위임하는 better-auth 메커니즘
// (auth.api.banUser/unbanUser + 로그인 시 자동 차단 훅)을 관리자 세션 헤더를 직접 구성해
// 검증한다 — AC 4의 핵심인 "실제 로그인 차단"을 컬럼 값이 아니라 signInPhoneNumber 호출
// 성공/실패로 검증한다(스토리 Dev Notes 요구사항).
async function signInAsAdmin(): Promise<Headers> {
  const phoneNumber = `010${Date.now()}`.slice(0, 11);
  await auth.api.createUser({
    body: {
      email: `${phoneNumber}@internal.wedding-check.local`,
      password: "admin-test-password-1234",
      name: "테스트 관리자",
      role: "admin",
      data: { phoneNumber, phoneNumberVerified: true },
    },
  });
  const signInResult = await auth.api.signInPhoneNumber({
    body: { phoneNumber, password: "admin-test-password-1234" },
    returnHeaders: true,
  });
  const cookie = signInResult.headers.get("set-cookie")?.split(";")[0];
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

describe("createMember (Story 5.4 AC 2, 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("이름/전화번호/비밀번호가 유효하면 오퍼레이터 계정을 생성하고, 그 전화번호+비밀번호로 실제 로그인이 가능하다", async () => {
    const member = await createMember({
      name: "신입 오퍼레이터",
      phoneNumber: "01044441111",
      password: "operator-pw-1234",
    });

    expect(member.name).toBe("신입 오퍼레이터");
    expect(member.role).toBe("operator");
    expect(member.phoneNumber).toBe("01044441111");

    const signInResult = await auth.api.signInPhoneNumber({
      body: { phoneNumber: "01044441111", password: "operator-pw-1234" },
    });
    expect(signInResult.user.id).toBe(member.id);
  });

  it("하이픈이 섞인 전화번호도 정규화되어 저장된다", async () => {
    const member = await createMember({
      name: "정규화 테스트",
      phoneNumber: "010-4444-2222",
      password: "operator-pw-1234",
    });
    expect(member.phoneNumber).toBe("01044442222");
  });

  it("이미 등록된 전화번호로 생성을 시도하면 거부된다 (AC 3)", async () => {
    await createMember({
      name: "먼저 등록됨",
      phoneNumber: "01044443333",
      password: "operator-pw-1234",
    });

    await expect(
      createMember({ name: "나중에 등록", phoneNumber: "01044443333", password: "pw-5678" }),
    ).rejects.toThrow("이미 등록된 전화번호입니다");
    await expect(
      createMember({ name: "나중에 등록", phoneNumber: "010-4444-3333", password: "pw-5678" }),
    ).rejects.toThrow(MemberValidationError);
  });

  it("이름이 비어있으면 거부된다", async () => {
    await expect(
      createMember({ name: "  ", phoneNumber: "01044444444", password: "pw-1234" }),
    ).rejects.toThrow(MemberValidationError);
  });

  it("전화번호가 비어있으면 거부된다", async () => {
    await expect(
      createMember({ name: "이름만있음", phoneNumber: "", password: "pw-1234" }),
    ).rejects.toThrow(MemberValidationError);
  });

  it("비밀번호가 비어있으면 거부된다", async () => {
    await expect(
      createMember({ name: "이름만있음", phoneNumber: "01044445555", password: "  " }),
    ).rejects.toThrow(MemberValidationError);
  });

  it("비밀번호 앞뒤 공백이 trim되지 않고 그대로 저장된다 (코덱스 리뷰 P2)", async () => {
    await createMember({
      name: "공백비번",
      phoneNumber: "01044446666",
      password: "  pw with spaces  ",
    });

    await expect(
      auth.api.signInPhoneNumber({
        body: { phoneNumber: "01044446666", password: "pw with spaces" },
      }),
    ).rejects.toThrow();

    const signInResult = await auth.api.signInPhoneNumber({
      body: { phoneNumber: "01044446666", password: "  pw with spaces  " },
    });
    expect(signInResult.user.phoneNumber).toBe("01044446666");
  });

  it("사전 중복 검사를 통과했더라도 better-auth가 실제 생성 시점에 중복을 거부하면(동시 요청 경합) 동일한 한국어 오류로 번역된다 (코덱스 리뷰 P2)", async () => {
    await createMember({
      name: "먼저 등록됨",
      phoneNumber: "01044447777",
      password: "operator-pw-1234",
    });

    // findByPhoneNumber 사전 검사가 통과했다고 가정하기 위해 mock으로 우회 —
    // better-auth의 createUser 자체가 던지는 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL을
    // 서비스가 그대로 흘려보내지 않고 MemberValidationError로 번역하는지 검증한다.
    const spy = vi.spyOn(memberRepo, "findByPhoneNumber").mockResolvedValue(undefined);
    try {
      await expect(
        createMember({ name: "경합 시도", phoneNumber: "01044447777", password: "pw-5678" }),
      ).rejects.toThrow("이미 등록된 전화번호입니다");
    } finally {
      spy.mockRestore();
    }
  });

  it("동시에 같은 전화번호로 등록을 시도해도 하나만 성공하고 나머지는 항상 동일한 한국어 오류를 받는다 (코덱스 리뷰 P2 — 사전검사/better-auth 사전조회/DB unique 제약 중 어느 경합 창에 걸리든 동일한 결과)", async () => {
    const attempts = await Promise.allSettled([
      createMember({ name: "동시등록A", phoneNumber: "01044448888", password: "pw-a-1234" }),
      createMember({ name: "동시등록B", phoneNumber: "01044448888", password: "pw-b-1234" }),
    ]);

    const fulfilled = attempts.filter((r) => r.status === "fulfilled");
    const rejected = attempts.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(MemberValidationError);
    expect((rejected[0].reason as Error).message).toBe("이미 등록된 전화번호입니다");
  });

  it("drizzle-orm이 감싼 Postgres unique_violation(err.cause.code)도 동일한 한국어 오류로 번역된다 (코덱스 리뷰 3차 P2 — 위의 동시성 테스트는 어느 경합 창에 걸릴지 타이밍에 의존하므로, 가장 좁은 경합 창을 결정적으로 재현)", async () => {
    // better-auth의 createUser 내부 사전 조회까지 통과한 뒤 DB INSERT에서만 실패하는
    // 상황을 결정적으로 재현하기 위해 auth.api.createUser 자체를 drizzle-orm이 실제로
    // 던지는 형태(DrizzleQueryError: err.code 없음, err.cause.code === "23505")로 모킹한다.
    const drizzleWrappedError = Object.assign(new Error("Failed query: insert into user..."), {
      cause: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const spy = vi.spyOn(auth.api, "createUser").mockRejectedValue(drizzleWrappedError);
    try {
      await expect(
        createMember({ name: "경합 시도2", phoneNumber: "01044449999", password: "pw-9999" }),
      ).rejects.toThrow("이미 등록된 전화번호입니다");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("계정 비활성화/재활성화 — better-auth admin 플러그인 위임 (Story 5.4 AC 4)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("계정을 비활성화하면 그 계정으로 로그인이 차단된다", async () => {
    const adminHeaders = await signInAsAdmin();
    const member = await createMember({
      name: "비활성화 대상",
      phoneNumber: "01055556666",
      password: "operator-pw-1234",
    });

    await auth.api.banUser({ body: { userId: member.id }, headers: adminHeaders });

    await expect(
      auth.api.signInPhoneNumber({
        body: { phoneNumber: "01055556666", password: "operator-pw-1234" },
      }),
    ).rejects.toThrow();
  });

  it("비활성화된 계정을 재활성화하면 다시 로그인할 수 있다", async () => {
    const adminHeaders = await signInAsAdmin();
    const member = await createMember({
      name: "재활성화 대상",
      phoneNumber: "01055557777",
      password: "operator-pw-1234",
    });

    await auth.api.banUser({ body: { userId: member.id }, headers: adminHeaders });
    await auth.api.unbanUser({ body: { userId: member.id }, headers: adminHeaders });

    const signInResult = await auth.api.signInPhoneNumber({
      body: { phoneNumber: "01055557777", password: "operator-pw-1234" },
    });
    expect(signInResult.user.id).toBe(member.id);
  });

  it("오퍼레이터 세션으로는 다른 계정을 비활성화할 수 없다 (admin 플러그인 권한 모델 확인)", async () => {
    const operator = await createMember({
      name: "권한없는오퍼레이터",
      phoneNumber: "01055558888",
      password: "operator-pw-1234",
    });
    const target = await createMember({
      name: "대상계정",
      phoneNumber: "01055559999",
      password: "operator-pw-1234",
    });

    const signInResult = await auth.api.signInPhoneNumber({
      body: { phoneNumber: "01055558888", password: "operator-pw-1234" },
      returnHeaders: true,
    });
    const cookie = signInResult.headers.get("set-cookie")?.split(";")[0];
    const operatorHeaders = new Headers();
    if (cookie) operatorHeaders.set("cookie", cookie);
    void operator;

    await expect(
      auth.api.banUser({ body: { userId: target.id }, headers: operatorHeaders }),
    ).rejects.toThrow();
  });
});
