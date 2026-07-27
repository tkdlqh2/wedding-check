import { listActiveHalls } from "@/lib/services/hall";
import {
  listCeremoniesForDate,
  listCeremoniesPaginated,
  listCeremonyDatesForMonth,
} from "@/lib/services/ceremony";
import { CeremonyForm } from "./ceremony-form";
import { CeremonyRow } from "./ceremony-row";
import { CeremonyCalendar } from "./ceremony-calendar";
import { CeremonyPagination } from "./ceremony-pagination";
import "./ceremonies.css";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PAGE_SIZE = 10;

function currentKstYearMonth(): { year: number; month: number } {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  return { year: kstNow.getUTCFullYear(), month: kstNow.getUTCMonth() + 1 };
}

export default async function CeremoniesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; year?: string; month?: string; page?: string }>;
}) {
  const params = await searchParams;
  const defaultYearMonth = currentKstYearMonth();
  const year = params.year ? Number(params.year) : defaultYearMonth.year;
  const month = params.month ? Number(params.month) : defaultYearMonth.month;
  const selectedDate = params.date;
  const page = params.page ? Number(params.page) : 1;

  const [halls, markedDates, listResult] = await Promise.all([
    listActiveHalls(),
    listCeremonyDatesForMonth(year, month),
    selectedDate
      ? listCeremoniesForDate(selectedDate).then((ceremonies) => ({
          ceremonies,
          totalCount: ceremonies.length,
          totalPages: 1,
        }))
      : listCeremoniesPaginated({ page, pageSize: PAGE_SIZE }),
  ]);

  const listTitle = selectedDate
    ? `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8))}일 예식`
    : "등록된 예식";

  return (
    <section className="ceremonies-page">
      <h1>예식 등록</h1>

      <div className="ceremonies-page__layout">
        <div className="ceremonies-page__form-card">
          <h2 className="ceremonies-page__form-title">새 예식</h2>
          <CeremonyForm halls={halls} />
        </div>

        <div className="ceremonies-page__list-column">
          <CeremonyCalendar
            year={year}
            month={month}
            selectedDate={selectedDate}
            markedDates={markedDates}
          />

          <h2 className="ceremonies-page__list-title">{listTitle}</h2>
          {listResult.ceremonies.length === 0 ? (
            <p className="ceremonies-page__empty">
              {selectedDate
                ? "이 날짜에 등록된 예식이 없습니다."
                : "등록된 예식이 없습니다. 위에서 예식을 등록해보세요."}
            </p>
          ) : (
            <ul className="ceremony-list">
              {listResult.ceremonies.map((ceremony) => (
                <CeremonyRow key={ceremony.id} ceremony={ceremony} />
              ))}
            </ul>
          )}

          {!selectedDate && <CeremonyPagination page={page} totalPages={listResult.totalPages} />}
        </div>
      </div>
    </section>
  );
}
