import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import "../design-tokens.css";
import "./operator-nav.css";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="operator-shell">
      <main className="operator-content">{children}</main>
      <nav className="operator-nav" aria-label="주요 기능">
        <Link href="/operator" className="operator-nav__item">
          체크리스트
        </Link>
        <span className="operator-nav__item operator-nav__item--placeholder">질의</span>
        <span className="operator-nav__item operator-nav__item--placeholder">피드백</span>
      </nav>
    </div>
  );
}
