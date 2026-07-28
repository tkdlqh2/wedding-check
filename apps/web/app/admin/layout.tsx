import { requireAdminPage } from "@/lib/auth-guard";
import { AdminNavLinks } from "./admin-nav-links";
import { AccountMenu } from "./account-menu";
import "../design-tokens.css";
import "./admin-nav.css";

// AD-3: 역할은 operator/admin 2종뿐. 관리자 전용 라우트는 admin만 접근 가능하다.
//
// **이 가드만으로는 부족하다.** 레이아웃은 클라이언트 사이드 내비게이션에서 다시 렌더되지
// 않으므로(Next.js Partial Rendering), /admin/**의 각 page.tsx도 requireAdminPage()를
// 각자 호출한다 — 자세한 재현 경로와 근거는 lib/auth-guard.ts::requireAdminPage 주석 참고.
// 레이아웃 가드는 첫 진입(hard navigation)을 가장 싸게 막는 바깥 그물로 남긴다.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();

  return (
    <div className="admin-shell">
      <header className="admin-nav">
        <div className="admin-nav__inner">
          <div className="admin-nav__logo">웨딩체크</div>
          <AdminNavLinks />
          <AccountMenu />
        </div>
      </header>
      <main className="admin-content">
        <div className="admin-content__inner">{children}</div>
      </main>
    </div>
  );
}
