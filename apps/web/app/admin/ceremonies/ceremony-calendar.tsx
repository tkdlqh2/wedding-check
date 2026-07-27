import Link from "next/link";

const DAY_HEADS = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function monthHref(year: number, month: number, selectedDate?: string): string {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (selectedDate) params.set("date", selectedDate);
  return `/admin/ceremonies?${params.toString()}`;
}

function dateHref(year: number, month: number, day: number): string {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    date: `${year}-${pad2(month)}-${pad2(day)}`,
  });
  return `/admin/ceremonies?${params.toString()}`;
}

function clearDateHref(year: number, month: number): string {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  return `/admin/ceremonies?${params.toString()}`;
}

// Story 5.2 AC 1, 2, 4: 예식 등록 폼 오른쪽 월간 캘린더. 예식이 있는 날짜는 점으로 표시하고,
// 날짜 클릭 시 그 날짜로 필터링한다. 순수 Server Component — 월 이동/날짜 선택 모두
// <Link> 쿼리 파라미터(?year=&month=&date=)로 구현한다(Dev Notes: 관리자 데스크톱 화면은
// DESIGN.md §15의 0ms 즉시 반응 요구가 걸린 오퍼레이터 태블릿 화면이 아니므로 클라이언트
// 상태 없이 페이지 단위 내비게이션으로 충분하다).
export function CeremonyCalendar({
  year,
  month,
  selectedDate,
  markedDates,
}: {
  year: number;
  month: number;
  selectedDate?: string;
  markedDates: Set<string>;
}) {
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="ceremony-calendar">
      <div className="ceremony-calendar__header">
        <span className="ceremony-calendar__title">날짜로 필터</span>
        <span className="ceremony-calendar__hint">● 표시가 예식이 있는 날입니다</span>
        {selectedDate && (
          <Link href={clearDateHref(year, month)} className="ceremony-calendar__clear">
            {month}월 {Number(selectedDate.slice(8))}일 ✕ 전체 보기
          </Link>
        )}
      </div>
      <div className="ceremony-calendar__nav">
        <Link
          href={monthHref(prev.year, prev.month, selectedDate)}
          className="ceremony-calendar__nav-btn"
          aria-label="이전 달"
        >
          ◀
        </Link>
        <span className="ceremony-calendar__month-label">
          {year}년 {month}월
        </span>
        <Link
          href={monthHref(next.year, next.month, selectedDate)}
          className="ceremony-calendar__nav-btn"
          aria-label="다음 달"
        >
          ▶
        </Link>
      </div>
      <div className="ceremony-calendar__grid">
        {DAY_HEADS.map((dh) => (
          <div key={dh} className="ceremony-calendar__day-head">
            {dh}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`blank-${idx}`} />;
          const iso = `${year}-${pad2(month)}-${pad2(day)}`;
          const isSelected = selectedDate === iso;
          const hasCeremony = markedDates.has(iso);
          return (
            <Link
              key={iso}
              href={isSelected ? clearDateHref(year, month) : dateHref(year, month, day)}
              className={
                "ceremony-calendar__cell" + (isSelected ? " ceremony-calendar__cell--selected" : "")
              }
            >
              <span>{day}</span>
              <span
                className={
                  "ceremony-calendar__dot" +
                  (isSelected || hasCeremony ? " ceremony-calendar__dot--visible" : "")
                }
              >
                ●
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
