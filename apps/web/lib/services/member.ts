import { headers } from "next/headers";
import { APIError } from "better-auth";
import * as memberRepo from "../db/repositories/member";
import type { Member } from "../db/repositories/member";
import { auth, type Role } from "../auth";
import { normalizePhoneNumber } from "../phone";

export type { Member };

export class MemberValidationError extends Error {}

// better-auth 기본값(node_modules/better-auth/dist/context/create-context.mjs:
// `options.emailAndPassword?.minPasswordLength || 8`, maxPasswordLength 128) — lib/auth.ts의
// emailAndPassword 설정이 이 값을 오버라이드하지 않으므로 그대로 맞춘다. 코덱스 리뷰 P2:
// auth.api.createUser는 회원가입(sign-up) 경로와 달리 이 길이 제한을 직접 검사하지 않고
// 비밀번호를 그대로 해싱해버려서, 검증 없이는 한 글자짜리 비밀번호도 그대로 발급된다 —
// 여기서 sign-up과 동일한 정책을 직접 적용한다. lib/auth.ts에서 minPasswordLength/
// maxPasswordLength를 오버라이드하면 이 값도 함께 바꿔야 한다.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

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

export type PaginatedMembers = {
  members: Member[];
  page: number;
  totalPages: number;
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  activeAdminCount: number;
};

// Story 5.7 AC 4, 5: 전체/활성/비활성 카운트는 항상 전체 목록 기준(showInactive 필터와
// 무관)이고, 페이지네이션·정렬만 필터 이후 결과에 적용한다. 페이지 clamp는
// listCeremoniesPaginated(lib/services/ceremony.ts)와 동일한 패턴.
// 이름 검색(search)이 있으면 요약 카운트(total/active/inactive)는 검색 결과 기준으로
// 좁혀진다 — 화면에 보이는 숫자와 실제 표시되는 목록이 항상 일치해야 하기 때문이다.
// activeAdminCount만은 예외로, 검색어와 무관하게 항상 전체 목록 기준이다 — 마지막 활성
// 관리자 보호(setMemberRole)를 위한 안전 계산값이지 화면 통계가 아니다.
export async function listMembersPaginated(input: {
  page: number;
  pageSize: number;
  showInactive: boolean;
  search?: string;
}): Promise<PaginatedMembers> {
  const all = await memberRepo.findAll();
  const activeAdminCount = all.filter((m) => m.role === "admin" && !m.banned).length;

  const searchTerm = input.search?.trim().toLowerCase();
  const searched = searchTerm
    ? all.filter((m) => m.name.toLowerCase().includes(searchTerm))
    : all;

  const totalCount = searched.length;
  const activeCount = searched.filter((m) => !m.banned).length;
  const inactiveCount = totalCount - activeCount;

  // Array.prototype.sort는 안정 정렬(ECMA2019+)이라, banned 기준으로만 정렬해도
  // findAll()의 기존 createdAt desc 순서가 각 그룹(활성/비활성) 내부에서 유지된다.
  const sorted = [...searched].sort((a, b) => Number(a.banned) - Number(b.banned));
  const filtered = input.showInactive ? sorted : sorted.filter((m) => !m.banned);

  const filteredCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / input.pageSize));
  const requestedPage = Number.isFinite(input.page) ? Math.trunc(input.page) : 1;
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIdx = (page - 1) * input.pageSize;

  return {
    members: filtered.slice(startIdx, startIdx + input.pageSize),
    page,
    totalPages,
    totalCount,
    activeCount,
    inactiveCount,
    activeAdminCount,
  };
}

export async function createMember(input: {
  name: string;
  phoneNumber: string;
  password: string;
  role?: Role;
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
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new MemberValidationError(
      `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다`,
    );
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
        role: input.role ?? "operator",
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

// Story 5.7 AC 2: 역할 변경. better-auth의 setRole은 banUser의 YOU_CANNOT_BAN_YOURSELF와
// 달리 자기 자신 보호 로직이 없다(routes.mjs 확인 완료) — 이 함수가 유일한 방어선이다.
// AD-3에 따라 admin 세션만 이 화면에 접근할 수 있으므로, "활성 관리자가 1명뿐인" 상황의
// 그 1명은 항상 호출자 자신이다 — 그래도 target.id === currentUserId를 명시적으로
// 검사해 카운트 로직 버그가 다른 사람의 역할 변경까지 막지 않도록 한다.
export async function setMemberRole(
  currentUserId: string,
  targetId: string,
  role: string,
): Promise<void> {
  if (role !== "operator" && role !== "admin") {
    throw new MemberValidationError("잘못된 역할입니다");
  }

  const target = await memberRepo.findById(targetId);
  if (!target) {
    throw new MemberValidationError("존재하지 않는 회원입니다");
  }

  if (target.id === currentUserId && target.role === "admin" && role !== "admin") {
    const all = await memberRepo.findAll();
    const activeAdminCount = all.filter((m) => m.role === "admin" && !m.banned).length;
    if (activeAdminCount <= 1) {
      throw new MemberValidationError(
        "마지막 활성 관리자는 역할을 변경할 수 없습니다. 다른 계정을 관리자로 지정한 뒤 다시 시도하세요.",
      );
    }
  }

  await auth.api.setRole({
    body: { userId: targetId, role },
    headers: await headers(),
  });
}
