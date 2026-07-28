import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

// 한 요청 안에서 세션 조회는 한 번이면 된다. Story 4.2가 관리자 페이지마다 가드를
// 넣으면서 레이아웃+페이지가 각각 getSession()을 호출하게 됐는데, better-auth의 세션
// 조회는 DB 왕복이다. React.cache는 **요청 스코프**라 요청이 바뀌면 캐시도 사라진다 —
// 검사 자체는 매 요청 그대로 수행되고, 같은 렌더 안의 중복 왕복만 없어진다.
const getCurrentSession = cache(async () => auth.api.getSession({ headers: await headers() }));

// AD-3: layout.tsx의 리다이렉트는 페이지 렌더링만 막을 뿐 Server Action 자체를 보호하지
// 않는다 — 액션 식별자를 아는 클라이언트는 레이아웃을 거치지 않고 액션을 직접 POST할 수
// 있다. 따라서 관리자 전용 Server Action은 반드시 이 가드를 각자 내부에서 호출해야 한다
// (코덱스 리뷰 P1 반영, Story 1.2).
export async function requireAdminSession() {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
    throw new Error("관리자만 수행할 수 있는 작업입니다.");
  }
  return session;
}

/**
 * 관리자 전용 **페이지**(Server Component)의 가드. FR-11 / AD-3.
 *
 * `app/admin/layout.tsx`에 같은 검사가 있는데도 페이지마다 다시 호출하는 이유 —
 * Next.js는 Partial Rendering 때문에 **레이아웃이 클라이언트 사이드 내비게이션에서
 * 다시 렌더되지 않는다.** 공식 문서가 명시적으로 경고하는 지점이다:
 *
 *   "Due to Partial Rendering, be cautious when doing checks in Layouts as these don't
 *    re-render on navigation, meaning the user session won't be checked on every route
 *    change. Instead, you should do the checks close to your data source or the
 *    component that'll be conditionally rendered."
 *   — node_modules/next/dist/docs/01-app/02-guides/authentication.md
 *
 * 구체적인 재현 경로: 관리자가 /admin/* 탭을 열어 둔 상태에서 다른 관리자가 회원 관리
 * 화면(Story 5.7)으로 그를 오퍼레이터로 강등한다 → 그가 내비의 다른 관리자 화면을
 * 클릭하면 soft navigation이라 레이아웃은 실행되지 않고 페이지 RSC 페이로드만 온다 →
 * 페이지에 가드가 없으면 오퍼레이터에게 관리자 데이터가 렌더된다.
 *
 * 레이아웃 가드는 없애지 않고 그대로 둔다 — 첫 진입(hard navigation)에서는 여전히 가장
 * 싼 차단 지점이고, 두 겹이 서로를 대체하는 게 아니라 서로 다른 진입 경로를 막는다.
 *
 * 실패 처리는 두 경우를 **구분한다**(Story 4.2 D-4):
 *   - 세션 없음  → /login    (로그인이 실제로 필요하다)
 *   - admin 아님 → /operator (로그인은 이미 돼 있다. 로그인 폼을 다시 띄우는 건 사실과
 *                  다르고, §10의 운영 에러 톤 — 사용자를 탓하거나 헷갈리게 하지 않는다 —
 *                  에도 어긋난다)
 *
 * Next.js에는 이 용도의 전용 API(`forbidden()` + 403 페이지)가 있지만 쓰지 않는다 —
 * 아직 experimental이고 `experimental.authInterrupts` 플래그를 요구한다. 라이브 예식
 * 파일럿에서 실험적 런타임 플래그를 켜는 대가가 403 화면의 값어치보다 크다.
 */
export async function requireAdminPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/operator");
  }
  return session;
}

// operator/admin 둘 다 통과 — 역할 무관, 로그인 여부만 확인한다(AD-3, 체크리스트
// 인스턴스 열람은 두 역할 모두에게 열려 있는 화면).
export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("로그인이 필요합니다.");
  }
  return session;
}

// Story 3.1이 도입한 Route Handler 전용 401 응답 패턴(requireSession() 실패를 명시적
// JSON 401로 변환) — feedback 관련 Route Handler 3개(route.ts, structure/route.ts,
// confirm/route.ts)에 동일 코드가 복붙돼 있던 것을 코덱스 리뷰 후 여기로 추출했다.
export async function requireSessionOr401(): Promise<Response | null> {
  try {
    await requireSession();
    return null;
  } catch {
    return Response.json(
      { error: { code: "unauthorized", message: "로그인이 필요합니다" } },
      { status: 401 },
    );
  }
}
