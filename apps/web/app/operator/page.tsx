import Link from "next/link";
import { listTodaysCeremonies } from "@/lib/services/ceremony";
import "./operator-home.css";

// KST 고정 표시 — admin/ceremonies/ceremony-row.tsx와 동일한 포맷터.
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// 오퍼레이터는 특정 홀에 소속되지 않는다(user 테이블에 hallId 없음) — 관리자 화면과
// 동일하게 홀 전체를 교차하는 오늘 예식 목록에서 직접 고른다(Story 2.1 listTodaysCeremonies
// 재사용). 카드 위계는 예식 목록 카드와 동일 — 시간+신랑신부가 제일 크게, 그 아래
// 날짜·홀·항목 수, 담당자가 배정돼 있으면 함께 표시.
export default async function OperatorHomePage() {
  const ceremonies = await listTodaysCeremonies();

  return (
    <section>
      <h1>오늘 예식</h1>

      {ceremonies.length === 0 ? (
        <p className="operator-home__empty">오늘 등록된 예식이 없습니다.</p>
      ) : (
        <ul className="operator-ceremony-list">
          {ceremonies.map((ceremony) => (
            <li key={ceremony.id} className="operator-ceremony-card">
              <Link
                href={`/operator/ceremonies/${ceremony.hallId}/${ceremony.id}`}
                className="operator-ceremony-card__link"
              >
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
                  {dateFormatter.format(ceremony.ceremonyAt)} · {ceremony.hallName} · 체크리스트{" "}
                  {ceremony.itemCount}개
                </span>
                {ceremony.assignees.length > 0 && (
                  <span className="operator-ceremony-card__assignees">
                    담당 {ceremony.assignees.map((a) => a.name).join(", ")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
