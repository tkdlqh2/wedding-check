import { headers } from "next/headers";
import { APIError } from "better-auth";
import * as memberRepo from "../db/repositories/member";
import type { Member } from "../db/repositories/member";
import { auth } from "../auth";
import { normalizePhoneNumber } from "../phone";

export type { Member };

export class MemberValidationError extends Error {}

// Postgres unique_violation(SQLSTATE 23505) — drizzle-orm은 raw 드라이버 에러를
// DrizzleQueryError로 감싸 err.cause에 원본을 보존한다(node_modules/drizzle-orm/errors.js
// 확인 완료). 감싸지 않은 raw 에러가 직접 올라오는 경로도 함께 확인한다.
function isPostgresUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "23505") return true;
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
  return cause?.code === "23505";
}

export async function listMembers(): Promise<Member[]> {
  return memberRepo.findAll();
}

export async function createMember(input: {
  name: string;
  phoneNumber: string;
  password: string;
}): Promise<Member> {
  const name = input.name.trim();
  // 코덱스 리뷰 P2: 빈 값 여부만 trim으로 확인하고, 실제 저장되는 비밀번호는 원본
  // 그대로 둔다 — trim된 값을 저장하면 관리자가 실제로 입력한 값과 달라져 앞뒤 공백이
  // 있는 비밀번호를 발급했을 때 그대로 로그인이 안 되는 문제가 생긴다.
  const password = input.password;
  if (!name) {
    throw new MemberValidationError("이름은 필수입니다");
  }
  if (!password.trim()) {
    throw new MemberValidationError("초기 비밀번호는 필수입니다");
  }
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  if (!phoneNumber) {
    throw new MemberValidationError("전화번호는 필수입니다");
  }

  const existing = await memberRepo.findByPhoneNumber(phoneNumber);
  if (existing) {
    // AC 3: 서버 사이드 검증이 실제 안전장치다.
    throw new MemberValidationError("이미 등록된 전화번호입니다");
  }

  // better-auth 코어가 구조적으로 요구하는 email 컬럼을 채우기 위한 합성 placeholder —
  // 실제로 수집/노출하지 않고 UI에도 쓰지 않는다(scripts/seed-accounts.ts의 고정 시드
  // 이메일과 동일 계열의 결정, 프로젝트 메모리 참고). 무작위/UUID 값을 쓰지 않는다 —
  // 전화번호 기반으로 결정적으로 생성해야 나중에 이 계정을 다시 조회/디버깅할 때 email
  // 값만 보고도 어떤 계정인지 알 수 있다.
  const email = `${phoneNumber}@internal.wedding-check.local`;

  // createUser는 headers 없이 호출한다 — better-auth는 세션(headers)이 없으면 자체 권한
  // 체크를 스킵하고 신뢰된 내부 호출로 취급한다(routes.mjs 확인 완료). 이 함수 자체의
  // 권한 검증은 호출부(Server Action의 requireAdminSession())가 이미 수행했으므로
  // 이중 체크가 불필요하다.
  try {
    const { user: created } = await auth.api.createUser({
      body: {
        email,
        password,
        name,
        role: "operator",
        data: {
          phoneNumber,
          phoneNumberVerified: true,
        },
      },
    });
    return created as Member;
  } catch (err) {
    // 코덱스 리뷰 P2(1~3차): (1) 위의 findByPhoneNumber 사전 검증과 실제 생성 사이에
    // 동시 요청이 끼어들면 이메일(전화번호 기반 합성값)이 여전히 중복될 수 있어
    // better-auth의 자체 사전 조회가 직접 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL을
    // 던진다. (2) 비밀번호가 better-auth 정책(길이 등)에 안 맞으면
    // PASSWORD_TOO_SHORT/PASSWORD_TOO_LONG을 던진다. (3) 두 요청이 better-auth의
    // 자체 사전 조회까지도 동시에 통과하면(더 좁은 경합 창) email/phone_number unique
    // 제약을 건 DB INSERT 자체가 실패하는데, drizzle-orm이 Postgres raw 에러(SQLSTATE
    // 23505 = unique_violation)를 DrizzleQueryError로 감싸 err.code가 아니라
    // err.cause.code에 실제 코드가 있다(node_modules/drizzle-orm/errors.js 확인 완료) —
    // 감싸지 않은 raw 드라이버 에러가 직접 올라오는 경로도 대비해 둘 다 확인한다. 셋 다
    // 그대로 흘려보내면 Server Action이 처리 안 된 일반 오류로 실패하므로, 여기서 전부
    // MemberValidationError로 번역해 폼에 구체적 오류가 표시되게 한다(AC 3).
    if (err instanceof APIError) {
      if (err.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        throw new MemberValidationError("이미 등록된 전화번호입니다");
      }
      if (err.body?.code === "PASSWORD_TOO_SHORT" || err.body?.code === "PASSWORD_TOO_LONG") {
        throw new MemberValidationError("비밀번호 길이가 올바르지 않습니다");
      }
      throw new MemberValidationError(err.body?.message ?? "계정 생성에 실패했습니다");
    }
    if (isPostgresUniqueViolation(err)) {
      throw new MemberValidationError("이미 등록된 전화번호입니다");
    }
    throw err;
  }
}

// AC 4: 비활성화 — better-auth admin 플러그인의 banUser가 세션 무효화까지 처리한다.
// banUser는 adminMiddleware를 써서 headers(호출자 세션) 없이는 무조건 실패한다
// (createUser와 반대) — 반드시 headers를 넘겨야 한다.
export async function deactivateMember(id: string): Promise<void> {
  await auth.api.banUser({
    body: { userId: id },
    headers: await headers(),
  });
}

// [ASSUMPTION] 원본 AC에는 없지만 prototype/js/screens/MemberScreen.js가 대칭적인
// "다시 활성화"를 보여주고 unbanUser가 이미 존재해 구현 비용이 거의 없다 — 비활성화가
// 영구 잠금이 되는 것을 막기 위해 포함.
export async function reactivateMember(id: string): Promise<void> {
  await auth.api.unbanUser({
    body: { userId: id },
    headers: await headers(),
  });
}
