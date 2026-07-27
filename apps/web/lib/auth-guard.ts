import { headers } from "next/headers";
import { auth } from "./auth";

// AD-3: layout.tsx의 리다이렉트는 페이지 렌더링만 막을 뿐 Server Action 자체를 보호하지
// 않는다 — 액션 식별자를 아는 클라이언트는 레이아웃을 거치지 않고 액션을 직접 POST할 수
// 있다. 따라서 관리자 전용 Server Action은 반드시 이 가드를 각자 내부에서 호출해야 한다
// (코덱스 리뷰 P1 반영, Story 1.2).
export async function requireAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") {
    throw new Error("관리자만 수행할 수 있는 작업입니다.");
  }
  return session;
}

// operator/admin 둘 다 통과 — 역할 무관, 로그인 여부만 확인한다(AD-3, 체크리스트
// 인스턴스 열람은 두 역할 모두에게 열려 있는 화면).
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("로그인이 필요합니다.");
  }
  return session;
}
