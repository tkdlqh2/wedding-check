"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "템플릿"은 여기 없다 — fix/admin-nav-remove-redundant-template-tab(03e3c84, 이 스토리의
// 베이스 커밋)에서 "홀"과 같은 목적지(/admin/halls)로 가는 중복 탭이라 이미 제거됐다.
const LINKS = [
  { href: "/admin/halls", label: "홀" },
  { href: "/admin/ceremonies", label: "예식" },
] as const;

// Story 5.2 AC 5: 현재 위치한 탭을 prototype/js/screens/AdminScreen.js와 동일하게
// 강조 표시한다(활성 = 틴트 배경 + 브랜드 텍스트). 경로 판별에 usePathname()이 필요해
// nav 링크만 이 Client Component로 분리했다 — AdminLayout(부모, Server Component)의
// 세션 체크/리다이렉트 로직은 그대로 두고 건드리지 않는다(Story 5.1 Dev Notes와 동일 원칙).
export function AdminNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav__links">
      {LINKS.map(({ href, label }) => {
        // "/admin/ceremonies/[hallId]/[ceremonyId]"처럼 하위 경로여도 "예식" 탭이
        // 활성이어야 하므로 접두 일치로 판별한다.
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={label}
            href={href}
            className={"admin-nav__link" + (isActive ? " admin-nav__link--active" : "")}
          >
            {label}
          </Link>
        );
      })}
      <span className="admin-nav__link admin-nav__link--placeholder">인사이트</span>
    </nav>
  );
}
