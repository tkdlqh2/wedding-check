import Link from "next/link";
import { listTodaysCeremonies } from "@/lib/services/ceremony";
import "./operator-home.css";

// KST 고정 표시 — admin/ceremonies/ceremony-row.tsx와 동일한 포맷터.
const ceremonyDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// 오퍼레이터는 특정 홀에 소속되지 않는다(user 테이블에 hallId 없음) — 관리자 화면과
// 동일하게 홀 전체를 교차하는 오늘 예식 목록에서 직접 고른다(Story 2.1 listTodaysCeremonies
// 재사용, Story 2.3 Dev Notes "오퍼레이터가 어떤 예식을 보는지" 참고).
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
                <span className="operator-ceremony-card__hall">{ceremony.hallName}</span>
                <span className="operator-ceremony-card__time">
                  {ceremonyDateFormatter.format(ceremony.ceremonyAt)}
                </span>
                <span className="operator-ceremony-card__item-count">
                  체크리스트 항목 {ceremony.itemCount}개
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
