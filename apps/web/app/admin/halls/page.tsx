import { listActiveHalls } from "@/lib/services/hall";
import { HallForm } from "./hall-form";
import { HallRow } from "./hall-row";
import "./halls.css";

export default async function HallsPage() {
  const halls = await listActiveHalls();

  return (
    <section className="halls-page">
      <h1>홀 관리</h1>

      <div className="halls-page__form-card">
        <HallForm />
      </div>

      {halls.length === 0 ? (
        <p className="halls-page__empty">
          등록된 홀이 없습니다. 위에서 첫 홀을 등록해보세요.
        </p>
      ) : (
        <ul className="hall-list">
          {halls.map((hall) => (
            <HallRow key={hall.id} hall={hall} />
          ))}
        </ul>
      )}
    </section>
  );
}
