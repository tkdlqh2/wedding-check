import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/db";
import {
  createMember,
  setMemberRole,
  listMembersPaginated,
  MemberValidationError,
} from "@/lib/services/member";
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
async function signInAsAdmin(
  overrides: Partial<{ phoneNumber: string; name: string }> = {},
): Promise<{ headers: Headers; userId: string }> {
  const phoneNumber = overrides.phoneNumber ?? `010${Date.now()}`.slice(0, 11);
  const { user: created } = await auth.api.createUser({
    body: {
      email: `${phoneNumber}@internal.wedding-check.local`,
      password: "admin-test-password-1234",
      name: overrides.name ?? "테스트 관리자",
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
  return { headers, userId: created.id };
}

describe("createMember (Story 5.4 AC 2, 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("이름/전화번호/비밀번호가 유효하면 오퍼레이터 계정을 생성하고, 그 전화번호+비밀번호로 실제 로그인이 가능하다", async () => {
    const member = await createMember({
      name: "신입 오퍼레이터",
      phoneNumber: "01044441111",
      password: "operator-pw-91234",
    });

    expect(member.name).toBe("신입 오퍼레이터");
    expect(member.role).toBe("operator");
    expect(member.phoneNumber).toBe("01044441111");

    const signInResult = await auth.api.signInPhoneNumber({
      body: { phoneNumber: "01044441111", password: "operator-pw-91234" },
    });
    expect(signInResult.user.id).toBe(member.id);
  });

  it("하이픈이 섞인 전화번호도 정규화되어 저장된다", async () => {
    const member = await createMember({
      name: "정규화 테스트",
      phoneNumber: "010-4444-2222",
      password: "operator-pw-91234",
    });
    expect(member.phoneNumber).toBe("01044442222");
  });

  it("이미 등록된 전화번호로 생성을 시도하면 거부된다 (AC 3)", async () => {
    await createMember({
      name: "먼저 등록됨",
      phoneNumber: "01044443333",
      password: "operator-pw-91234",
    });

    await expect(
      createMember({ name: "나중에 등록", phoneNumber: "01044443333", password: "pw-95678" }),
    ).rejects.toThrow("이미 등록된 전화번호입니다");
    await expect(
      createMember({ name: "나중에 등록", phoneNumber: "010-4444-3333", password: "pw-95678" }),
    ).rejects.toThrow(MemberValidationError);
  });

  it("이름이 비어있으면 거부된다", async () => {
    await expect(
      createMember({ name: "  ", phoneNumber: "01044444444", password: "pw-91234" }),
    ).rejects.toThrow(MemberValidationError);
  });

  it("전화번호가 비어있으면 거부된다", async () => {
    await expect(
      createMember({ name: "이름만있음", phoneNumber: "", password: "pw-91234" }),
    ).rejects.toThrow(MemberValidationError);
  });

  it("비밀번호가 비어있으면 거부된다", async () => {
    await expect(
      createMember({ name: "이름만있음", phoneNumber: "01044445555", password: "  " }),
    ).rejects.toThrow(MemberValidationError);
  });

  it("비밀번호가 8자 미만이면 거부된다 (코덱스 리뷰 4차 P2 — auth.api.createUser는 better-auth의 sign-up 최소 길이 정책을 직접 검사하지 않아, 검증 없이는 한 글자짜리 비밀번호도 그대로 발급될 수 있었다)", async () => {
    await expect(
      createMember({ name: "짧은비번", phoneNumber: "01044440000", password: "a" }),
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
      password: "operator-pw-91234",
    });

    // findByPhoneNumber 사전 검사가 통과했다고 가정하기 위해 mock으로 우회 —
    // better-auth의 createUser 자체가 던지는 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL을
    // 서비스가 그대로 흘려보내지 않고 MemberValidationError로 번역하는지 검증한다.
    const spy = vi.spyOn(memberRepo, "findByPhoneNumber").mockResolvedValue(undefined);
    try {
      await expect(
        createMember({ name: "경합 시도", phoneNumber: "01044447777", password: "pw-95678" }),
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
        createMember({ name: "경합 시도2", phoneNumber: "01044449999", password: "pw-99999" }),
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
    const { headers: adminHeaders } = await signInAsAdmin();
    const member = await createMember({
      name: "비활성화 대상",
      phoneNumber: "01055556666",
      password: "operator-pw-91234",
    });

    await auth.api.banUser({ body: { userId: member.id }, headers: adminHeaders });

    await expect(
      auth.api.signInPhoneNumber({
        body: { phoneNumber: "01055556666", password: "operator-pw-91234" },
      }),
    ).rejects.toThrow();
  });

  it("비활성화된 계정을 재활성화하면 다시 로그인할 수 있다", async () => {
    const { headers: adminHeaders } = await signInAsAdmin();
    const member = await createMember({
      name: "재활성화 대상",
      phoneNumber: "01055557777",
      password: "operator-pw-91234",
    });

    await auth.api.banUser({ body: { userId: member.id }, headers: adminHeaders });
    await auth.api.unbanUser({ body: { userId: member.id }, headers: adminHeaders });

    const signInResult = await auth.api.signInPhoneNumber({
      body: { phoneNumber: "01055557777", password: "operator-pw-91234" },
    });
    expect(signInResult.user.id).toBe(member.id);
  });

  it("오퍼레이터 세션으로는 다른 계정을 비활성화할 수 없다 (admin 플러그인 권한 모델 확인)", async () => {
    const operator = await createMember({
      name: "권한없는오퍼레이터",
      phoneNumber: "01055558888",
      password: "operator-pw-91234",
    });
    const target = await createMember({
      name: "대상계정",
      phoneNumber: "01055559999",
      password: "operator-pw-91234",
    });

    const signInResult = await auth.api.signInPhoneNumber({
      body: { phoneNumber: "01055558888", password: "operator-pw-91234" },
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

describe("createMember — role 파라미터 (Story 5.7 AC 1)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('role: "admin"을 전달하면 관리자 계정으로 생성된다', async () => {
    const member = await createMember({
      name: "역할선택 관리자",
      phoneNumber: "01066661111",
      password: "admin-pw-1234",
      role: "admin",
    });
    expect(member.role).toBe("admin");
  });

  it("role을 전달하지 않으면 기존처럼 오퍼레이터로 생성된다 (회귀 확인)", async () => {
    const member = await createMember({
      name: "기본역할",
      phoneNumber: "01066662222",
      password: "operator-pw-1234",
    });
    expect(member.role).toBe("operator");
  });
});

describe("setMemberRole — 마지막 활성 관리자 보호 (Story 5.7 AC 2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("유효하지 않은 role 문자열은 거부된다", async () => {
    const { userId } = await signInAsAdmin();
    await expect(setMemberRole(userId, userId, "owner")).rejects.toThrow(MemberValidationError);
  });

  it("존재하지 않는 대상이면 거부된다", async () => {
    const { userId } = await signInAsAdmin();
    await expect(
      setMemberRole(userId, "00000000-0000-0000-0000-000000000000", "admin"),
    ).rejects.toThrow(MemberValidationError);
  });

  it("본인이 유일한 활성 관리자일 때 자기 역할을 오퍼레이터로 바꾸려 하면 거부되고 역할이 그대로 유지된다 (핵심 회귀 지점)", async () => {
    const { userId } = await signInAsAdmin();

    await expect(setMemberRole(userId, userId, "operator")).rejects.toThrow(
      "마지막 활성 관리자는 역할을 변경할 수 없습니다",
    );

    const stillAdmin = await memberRepo.findById(userId);
    expect(stillAdmin?.role).toBe("admin");
  });

  it("두 관리자가 동시에 자기 자신을 강등하면 하나만 성공하고 활성 관리자가 최소 1명 유지된다 (코덱스 리뷰 P2 — TOCTOU 경합 방지)", async () => {
    const adminA = await signInAsAdmin({ phoneNumber: "01099991111" });
    const adminB = await signInAsAdmin({ phoneNumber: "01099992222" });

    const results = await Promise.allSettled([
      setMemberRole(adminA.userId, adminA.userId, "operator"),
      setMemberRole(adminB.userId, adminB.userId, "operator"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(MemberValidationError);

    const remainingAdmins = (await memberRepo.findAll()).filter(
      (m) => m.role === "admin" && !m.banned,
    );
    expect(remainingAdmins).toHaveLength(1);
  });

  it("본인을 다시 admin으로 지정하는 요청은(role 변화 없음) 마지막 관리자 보호에 걸리지 않고 setRole 호출부까지 도달한다", async () => {
    const { userId } = await signInAsAdmin();
    // 보호 조건은 target.role === "admin" && role !== "admin"일 때만 걸린다 — role이
    // 그대로 "admin"이면 이 조건을 통과해 auth.api.setRole 호출부(next/headers 요청
    // 스코프 필요)까지 도달한다. 순수 node 테스트에서는 이 지점에서 항상
    // "headers was called outside a request scope"로 실패하므로(기존 deactivateMember/
    // reactivateMember 테스트와 동일한 제약, §Dev Notes), 이 에러가 나는 것 자체가
    // "마지막 관리자 보호에 걸리지 않고 통과했다"는 증거다.
    await expect(setMemberRole(userId, userId, "admin")).rejects.toThrow(
      "was called outside a request scope",
    );
  });

  it("다른 활성 관리자가 있으면 admin -> operator 역할 변경이 실제로 반영된다 (better-auth setRole 위임 확인)", async () => {
    const actor = await signInAsAdmin({ phoneNumber: "01066663333" });
    const target = await signInAsAdmin({ phoneNumber: "01066664444" });

    await auth.api.setRole({
      body: { userId: target.userId, role: "operator" },
      headers: actor.headers,
    });

    const updated = await memberRepo.findById(target.userId);
    expect(updated?.role).toBe("operator");
  });

  it("operator -> admin 역할 변경도 실제로 반영된다", async () => {
    const actor = await signInAsAdmin({ phoneNumber: "01066665555" });
    const operatorMember = await createMember({
      name: "승격 대상",
      phoneNumber: "01066666666",
      password: "operator-pw-1234",
    });

    await auth.api.setRole({
      body: { userId: operatorMember.id, role: "admin" },
      headers: actor.headers,
    });

    const updated = await memberRepo.findById(operatorMember.id);
    expect(updated?.role).toBe("admin");
  });

  it("오퍼레이터 세션으로는 다른 계정의 역할을 변경할 수 없다 (admin 플러그인 권한 모델 확인)", async () => {
    const operator = await createMember({
      name: "권한없는오퍼레이터",
      phoneNumber: "01066667777",
      password: "operator-pw-1234",
    });
    const target = await createMember({
      name: "역할변경대상",
      phoneNumber: "01066668888",
      password: "operator-pw-1234",
    });

    const signInResult = await auth.api.signInPhoneNumber({
      body: { phoneNumber: "01066667777", password: "operator-pw-1234" },
      returnHeaders: true,
    });
    const cookie = signInResult.headers.get("set-cookie")?.split(";")[0];
    const operatorHeaders = new Headers();
    if (cookie) operatorHeaders.set("cookie", cookie);
    void operator;

    await expect(
      auth.api.setRole({ body: { userId: target.id, role: "admin" }, headers: operatorHeaders }),
    ).rejects.toThrow();
  });
});

describe("listMembersPaginated (Story 5.7 AC 4, 5)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("활성 회원이 먼저, 비활성 회원이 뒤로 정렬된다", async () => {
    const a = await createMember({ name: "A", phoneNumber: "01077771111", password: "pw-91234" });
    const b = await createMember({ name: "B", phoneNumber: "01077772222", password: "pw-91234" });
    const c = await createMember({ name: "C", phoneNumber: "01077773333", password: "pw-91234" });
    const { headers: adminHeaders } = await signInAsAdmin();
    await auth.api.banUser({ body: { userId: a.id }, headers: adminHeaders });

    const result = await listMembersPaginated({ page: 1, pageSize: 10, showInactive: true });

    const ids = result.members.map((m) => m.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    expect(ids.indexOf(c.id)).toBeLessThan(ids.indexOf(a.id));
  });

  it("showInactive: false면 비활성 회원이 목록에서 제외되지만 카운트는 전체 기준으로 유지된다", async () => {
    const a = await createMember({ name: "A", phoneNumber: "01077774444", password: "pw-91234" });
    await createMember({ name: "B", phoneNumber: "01077775555", password: "pw-91234" });
    const { headers: adminHeaders } = await signInAsAdmin();
    await auth.api.banUser({ body: { userId: a.id }, headers: adminHeaders });

    const result = await listMembersPaginated({ page: 1, pageSize: 10, showInactive: false });

    expect(result.members.some((m) => m.id === a.id)).toBe(false);
    expect(result.totalCount).toBe(3); // A, B + signInAsAdmin이 만든 관리자 1명
    expect(result.activeCount).toBe(2);
    expect(result.inactiveCount).toBe(1);
  });

  it("showInactive: true면 비활성 회원도 목록에 포함된다", async () => {
    const a = await createMember({ name: "A", phoneNumber: "01077776666", password: "pw-91234" });
    const { headers: adminHeaders } = await signInAsAdmin();
    await auth.api.banUser({ body: { userId: a.id }, headers: adminHeaders });

    const result = await listMembersPaginated({ page: 1, pageSize: 10, showInactive: true });

    expect(result.members.some((m) => m.id === a.id)).toBe(true);
  });

  it("범위 밖 페이지를 요청하면 마지막 페이지로 clamp된다", async () => {
    for (let i = 0; i < 3; i++) {
      await createMember({
        name: `회원${i}`,
        phoneNumber: `010777700${i}${i}`,
        password: "pw-91234",
      });
    }

    const result = await listMembersPaginated({ page: 999, pageSize: 2, showInactive: true });

    expect(result.totalPages).toBe(2);
    expect(result.page).toBe(2);
    expect(result.members).toHaveLength(1);
  });

  it("activeAdminCount는 활성 관리자 수만 센다", async () => {
    await signInAsAdmin({ phoneNumber: "01077778888" });
    const bannedAdminSession = await signInAsAdmin({ phoneNumber: "01077779999" });
    const actorHeaders = (await signInAsAdmin({ phoneNumber: "01077770000" })).headers;
    await auth.api.banUser({ body: { userId: bannedAdminSession.userId }, headers: actorHeaders });

    const result = await listMembersPaginated({ page: 1, pageSize: 10, showInactive: true });

    expect(result.activeAdminCount).toBe(2); // 첫 관리자 + actor (비활성화된 admin 제외)
  });

  it("이름 검색어로 부분 일치(대소문자 무시)하는 회원만 반환한다", async () => {
    await createMember({ name: "홍길동", phoneNumber: "01088881111", password: "pw-91234" });
    await createMember({ name: "김철수", phoneNumber: "01088882222", password: "pw-91234" });
    await createMember({ name: "Jane Doe", phoneNumber: "01088883333", password: "pw-91234" });

    const result = await listMembersPaginated({
      page: 1,
      pageSize: 10,
      showInactive: true,
      search: "jane",
    });

    expect(result.members).toHaveLength(1);
    expect(result.members[0].name).toBe("Jane Doe");
  });

  it("검색어와 일치하는 회원이 없어도 요약 카운트는 검색과 무관하게 전체 회원 기준으로 유지된다 (코덱스 리뷰 P2)", async () => {
    await signInAsAdmin({ phoneNumber: "01088884444" });
    await createMember({ name: "박영희", phoneNumber: "01088885555", password: "pw-91234" });

    const result = await listMembersPaginated({
      page: 1,
      pageSize: 10,
      showInactive: true,
      search: "존재하지않는이름",
    });

    expect(result.members).toHaveLength(0);
    expect(result.totalCount).toBe(2); // signInAsAdmin이 만든 관리자 + 박영희, 검색과 무관
    expect(result.activeCount).toBe(2);
    expect(result.activeAdminCount).toBe(1);
  });
});
