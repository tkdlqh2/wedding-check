import { listActiveHalls } from "@/lib/services/hall";
import { listTodaysCeremonies } from "@/lib/services/ceremony";
import { CeremonyForm } from "./ceremony-form";
import { CeremonyRow } from "./ceremony-row";
import "./ceremonies.css";

export default async function CeremoniesPage() {
  const [halls, ceremonies] = await Promise.all([
    listActiveHalls(),
    listTodaysCeremonies(),
  ]);

  return (
    <section className="ceremonies-page">
      <h1>예식 등록</h1>

      <div className="ceremonies-page__form-card">
        <CeremonyForm halls={halls} />
      </div>

      <h2>오늘 예식</h2>
      {ceremonies.length === 0 ? (
        <p className="ceremonies-page__empty">
          오늘 등록된 예식이 없습니다. 위에서 예식을 등록해보세요.
        </p>
      ) : (
        <ul className="ceremony-list">
          {ceremonies.map((ceremony) => (
            <CeremonyRow key={ceremony.id} ceremony={ceremony} />
          ))}
        </ul>
      )}
    </section>
  );
}
