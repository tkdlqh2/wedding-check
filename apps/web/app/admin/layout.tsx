import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
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
        <div className="admin-nav__logo">웨딩체크</div>
        <nav className="admin-nav__links">
          <Link href="/admin/halls" className="admin-nav__link">
            홀
          </Link>
          <Link href="/admin/halls" className="admin-nav__link">
            템플릿
          </Link>
          <Link href="/admin/ceremonies" className="admin-nav__link">
            예식
          </Link>
          <span className="admin-nav__link admin-nav__link--placeholder">인사이트</span>
        </nav>
        <Link href="/admin/ceremonies" className="btn-primary">
          새 예식 등록
        </Link>
      </header>
      <main className="admin-content">{children}</main>
    </div>
  );
}
