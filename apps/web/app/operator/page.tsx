import Link from "next/link";
import { listCeremoniesForDate, listCeremonyDatesForMonth } from "@/lib/services/ceremony";
import { CeremonyCalendar } from "../admin/ceremonies/ceremony-calendar";
import { asCeremonyStatus, CEREMONY_STATUS_LABELS } from "@/lib/ceremony-status";
import "../admin/ceremonies/ceremonies.css";
import "./operator-home.css";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const CONTRACT_LABELS: Record<string, string> = {
  requiresOfficiant: "주례 있음",
  hasAdditionalEvent: "이벤트 추가",
};

function contractLabel(conditions: Record<string, boolean>): string {
  const labels = Object.entries(conditions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => CONTRACT_LABELS[key] ?? key);
  return labels.length > 0 ? labels.join(" · ") : "기본 계약";
}

function todayKstDateString(): string {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kstNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// admin/ceremonies/page.tsx와 동일한 URL 파라미터 검증(코덱스 리뷰 P2 선례).
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

// prototype/js/screens/ScheduleScreen.js — "담당 예식 일정". 캘린더에서 날짜를 고르면
// 그 날의 예식이 보이고, 기본 선택은 오늘이다. 오퍼레이터는 특정 홀에 소속되지 않으므로
// (user 테이블에 hallId 없음) 홀 교차 목록을 그대로 보여주고 담당자 이름을 함께 표시한다.
export default async function OperatorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; year?: string; month?: string }>;
}) {
  const params = await searchParams;
  // 프로토타입은 항상 날짜가 하나 선택돼 있다(opDate 기본 오늘) — date 파라미터가
  // 없거나 잘못됐으면 오늘로 되돌린다.
  const selectedDate = parseDateParam(params.date) ?? todayKstDateString();
  const { year, month } = parseYearMonthParams(params.year, params.month, {
    year: Number(selectedDate.slice(0, 4)),
    month: Number(selectedDate.slice(5, 7)),
  });

  const [markedDates, ceremonies] = await Promise.all([
    listCeremonyDatesForMonth(year, month),
    listCeremoniesForDate(selectedDate),
  ]);

  return (
    <section className="operator-home">
      <h1>담당 예식 일정</h1>
      <p className="operator-home__subtitle">
        날짜를 선택하면 그 날의 예식이 보입니다. ● 표시가 예식이 있는 날입니다.
      </p>

      <CeremonyCalendar
        year={year}
        month={month}
        selectedDate={selectedDate}
        markedDates={markedDates}
        basePath="/operator"
      />

      <h2 className="operator-home__list-title">
        {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8))}일 예식
      </h2>

      {ceremonies.length === 0 ? (
        <p className="operator-home__empty">이 날짜에 예식이 없습니다.</p>
      ) : (
        <ul className="operator-ceremony-list">
          {ceremonies.map((ceremony) => {
            const status = asCeremonyStatus(ceremony.status);
            return (
              <li key={ceremony.id} className={"operator-ceremony-card operator-ceremony-card--" + status}>
                <div className="operator-ceremony-card__body">
                  <span className="operator-ceremony-card__title">
                    {timeFormatter.format(ceremony.ceremonyAt)}
                    {ceremony.groomName && ceremony.brideName && (
                      <span className="operator-ceremony-card__couple">
                        {" "}
                        {ceremony.groomName} · {ceremony.brideName}
                      </span>
                    )}
                  </span>
                  <span className="operator-ceremony-card__meta">
                    {ceremony.hallName} · {contractLabel(ceremony.contractConditions)} · 담당{" "}
                    {ceremony.assignees.length > 0 ? (
                      ceremony.assignees.map((a) => a.name).join(", ")
                    ) : (
                      <span className="operator-ceremony-card__unassigned">미배정</span>
                    )}
                  </span>
                </div>
                <div className="operator-ceremony-card__side">
                  <span
                    className={
                      "operator-ceremony-card__status-badge operator-ceremony-card__status-badge--" +
                      status
                    }
                  >
                    {CEREMONY_STATUS_LABELS[status]}
                  </span>
                  <Link
                    href={`/operator/ceremonies/${ceremony.hallId}/${ceremony.id}`}
                    className="btn-primary operator-ceremony-card__open"
                  >
                    체크리스트 열기
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
