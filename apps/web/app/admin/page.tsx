import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth-guard";

// 대표 지시(2026-07-28): 관리자 로그인 직후 기본 홈은 예식 탭이다 — /admin 자체는
// 별도 콘텐츠 없이 예식 목록으로 보낸다.
export default async function AdminHomePage() {
  // 이 페이지는 데이터를 렌더하지 않지만 가드는 둔다 — "/admin/** 페이지는 자기 자신을
  // 지킨다"가 예외 없는 규칙이어야 다음 페이지를 추가하는 사람이 빠뜨리지 않는다(FR-11).
  await requireAdminPage();
  redirect("/admin/ceremonies");
}
