import { requireAdminPage } from "@/lib/auth-guard";
import { listActiveHalls } from "@/lib/services/hall";
import { HallForm } from "./hall-form";
import { HallRow } from "./hall-row";
import "./halls.css";

export default async function HallsPage() {
  // 레이아웃 가드만으로는 soft navigation을 막지 못한다(lib/auth-guard.ts 주석, AD-3).
  await requireAdminPage();

  const halls = await listActiveHalls();

  return (
    <section className="halls-page">
      <h1>홀 관리</h1>
      <p className="halls-page__subtitle">홀별로 독립된 체크리스트 템플릿을 관리할 수 있습니다.</p>

      {halls.length === 0 ? (
        <p className="halls-page__empty">
          등록된 홀이 없습니다. 아래에서 첫 홀을 등록해보세요.
        </p>
      ) : (
        <ul className="hall-list">
          {halls.map((hall) => (
            <HallRow key={hall.id} hall={hall} />
          ))}
        </ul>
      )}

      <div className="halls-page__add-hall">
        <HallForm />
      </div>
    </section>
  );
}
