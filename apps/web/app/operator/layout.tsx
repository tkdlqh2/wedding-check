import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AccountMenu } from "../admin/account-menu";
import "../design-tokens.css";
import "../admin/admin-nav.css";
import "./operator-nav.css";

// 대표 피드백(2026-07-27): 하단 탭(체크리스트/질의/피드백 placeholder)은 쓸모없어 제거 —
// 질의/피드백은 실행 화면 안에 이미 들어가는 구조라 별도 탭이 필요 없다. 대신 어드민과
// 동일하게 상단 헤더에 계정 메뉴(비밀번호 변경/로그아웃)를 둔다(account-menu.tsx 재사용 —
// better-auth core 엔드포인트라 역할 무관).
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="operator-shell">
      <header className="operator-header">
        <div className="operator-header__inner">
          <div className="operator-header__logo">웨딩체크</div>
          <AccountMenu />
        </div>
      </header>
      <main className="operator-content">{children}</main>
    </div>
  );
}
