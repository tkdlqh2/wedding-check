import { redirect } from "next/navigation";

// 대표 지시(2026-07-28): 관리자 로그인 직후 기본 홈은 예식 탭이다 — /admin 자체는
// 별도 콘텐츠 없이 예식 목록으로 보낸다.
export default function AdminHomePage() {
  redirect("/admin/ceremonies");
}
