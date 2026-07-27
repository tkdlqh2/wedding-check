import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminNavLinks } from "./admin-nav-links";
import { AccountMenu } from "./account-menu";
import "../design-tokens.css";
import "./admin-nav.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  // AD-3: 역할은 operator/admin 2종뿐. 관리자 전용 라우트는 admin만 접근 가능하다.
  if (session.user.role !== "admin") {
    redirect("/login");
  }

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
