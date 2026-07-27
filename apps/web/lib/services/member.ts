import { headers } from "next/headers";
import * as memberRepo from "../db/repositories/member";
import type { Member } from "../db/repositories/member";
import { auth } from "../auth";
import { normalizePhoneNumber } from "../phone";

export type { Member };

export class MemberValidationError extends Error {}

export async function listMembers(): Promise<Member[]> {
  return memberRepo.findAll();
}

export async function createMember(input: {
  name: string;
  phoneNumber: string;
  password: string;
}): Promise<Member> {
  const name = input.name.trim();
  const password = input.password.trim();
  if (!name) {
    throw new MemberValidationError("이름은 필수입니다");
  }
  if (!password) {
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
