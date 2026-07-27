import Link from "next/link";
import type { CeremonyWithHallName } from "@/lib/services/ceremony";

// KST 고정 표시 — 이 제품은 국내 단일 웨딩홀 대상이라 서버/브라우저 로컬 타임존과
// 무관하게 항상 한국 표준시로 표시한다(actions.ts의 입력 파싱과 대칭).
const ceremonyDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function CeremonyRow({ ceremony }: { ceremony: CeremonyWithHallName }) {
  return (
    <li className="ceremony-card">
      <div className="ceremony-card__body">
        <span className="ceremony-card__hall">{ceremony.hallName}</span>
        <span className="ceremony-card__time">
          {ceremonyDateFormatter.format(ceremony.ceremonyAt)}
        </span>
        {ceremony.groomName && ceremony.brideName && (
          <span className="ceremony-card__couple">
            {ceremony.groomName} · {ceremony.brideName}
          </span>
        )}
      </div>
      <span className="ceremony-card__item-count">체크리스트 항목 {ceremony.itemCount}개</span>
      {/* Story 5.8 AC 8: 읽기 전용 — 배정 조작은 상세 화면(AC 7)에서만 가능하다. */}
      {ceremony.assignedOperatorName ? (
        <span className="ceremony-card__assignee">담당 {ceremony.assignedOperatorName}</span>
      ) : (
        <span className="ceremony-card__assignee ceremony-card__assignee--unassigned">미배정</span>
      )}
      <Link href={`/admin/ceremonies/${ceremony.hallId}/${ceremony.id}`} className="btn-secondary">
        관리
      </Link>
    </li>
  );
}
