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
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentKstYearMonth(): { year: number; month: number } {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  return { year: kstNow.getUTCFullYear(), month: kstNow.getUTCMonth() + 1 };
}

// 코덱스 리뷰(P2): year/month/date/page는 사용자가 URL을 직접 조작할 수 있는 값이다.
// 검증 없이 Number()로 바로 변환해 DB 쿼리에 넘기면 NaN이 Invalid Date를 만들어
// 500을 일으키거나, 범위 밖 값(예: month=13)이 조용히 엉뚱한 날짜로 굴러떨어질 수
// 있다 — 여기서 형식과 범위를 검증하고, 유효하지 않으면 필터 없음/기본값으로 처리한다.
function parseDateParam(value: string | undefined): string | undefined {
  if (!value || !DATE_PARAM_RE.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const roundTrip = new Date(Date.UTC(y, m - 1, d));
  const isRealDate =
    roundTrip.getUTCFullYear() === y &&
    roundTrip.getUTCMonth() === m - 1 &&
    roundTrip.getUTCDate() === d;
  return isRealDate ? value : undefined;
}

function parseYearMonthParams(
  yearParam: string | undefined,
  monthParam: string | undefined,
  fallback: { year: number; month: number },
): { year: number; month: number } {
  const year = yearParam ? Number(yearParam) : NaN;
  const month = monthParam ? Number(monthParam) : NaN;
  const validYear = Number.isInteger(year) && year >= 1970 && year <= 2200;
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  return {
    year: validYear ? year : fallback.year,
    month: validMonth ? month : fallback.month,
  };
}

function parsePageParam(value: string | undefined): number {
  const page = value ? Number(value) : 1;
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export default async function CeremoniesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; year?: string; month?: string; page?: string }>;
}) {
  const params = await searchParams;
  const selectedDate = parseDateParam(params.date);
  // 코덱스 리뷰(P2): year/month와 date가 서로 다른 달을 가리키는 URL(예: 정상적인
  // 링크 흐름에서는 안 나오지만 즐겨찾기·수동 수정된 URL)이 오면, 캘린더에 표시되는
  // 달과 실제 필터링된 목록의 달이 어긋나 선택된 셀도 안 보이는 상태가 될 수 있다 —
  // 유효한 date가 있으면 그 date의 연/월을 그대로 신뢰하고, year/month 파라미터는
  // date가 없을 때만 쓴다.
  const { year, month } = selectedDate
    ? { year: Number(selectedDate.slice(0, 4)), month: Number(selectedDate.slice(5, 7)) }
    : parseYearMonthParams(params.year, params.month, currentKstYearMonth());
  const page = parsePageParam(params.page);

  const [halls, markedDates, listResult] = await Promise.all([
    listActiveHalls(),
    listCeremonyDatesForMonth(year, month),
    selectedDate
      ? listCeremoniesForDate(selectedDate).then((ceremonies) => ({
          ceremonies,
          page: 1,
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

          {!selectedDate && (
            <CeremonyPagination page={listResult.page} totalPages={listResult.totalPages} />
          )}
        </div>
      </div>
    </section>
  );
}
