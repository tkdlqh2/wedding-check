import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Next.js 16: 파일명이 middleware.ts → proxy.ts로, export 함수명이
// `middleware()` → `proxy()`로 바뀌었다(공식 안내: https://nextjs.org/docs/messages/middleware-to-proxy).
// 이 파일은 세션 쿠키 유무만으로 미인증 사용자를 낙관적으로 리다이렉트한다("이 검사는
// 안전하지 않다"고 better-auth 공식 문서가 명시함) — 실제 role 기반 접근 차단(AD-3)은
// 여기서 하지 않는다. Next.js 공식 가이드가 Proxy에서 무거운 세션/DB 검증을 하지 말라고
// 권고하기 때문에, 그 검증은 app/(admin)/layout.tsx와 app/(operator)/layout.tsx에서
// auth.api.getSession()으로 수행한다.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname.startsWith("/operator");

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/operator/:path*"],
};
