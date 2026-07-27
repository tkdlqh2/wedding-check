import Link from "next/link";
import type { CeremonyWithHallName } from "@/lib/services/ceremony";
import { isCeremonyDone } from "@/lib/ceremony-status";
import { AssigneePills } from "./assignee-pills";

// KST 고정 표시 — 이 제품은 국내 단일 웨딩홀 대상이라 서버/브라우저 로컬 타임존과
// 무관하게 항상 한국 표준시로 표시한다(actions.ts의 입력 파싱과 대칭).
const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const CONTRACT_LABELS: Record<string, string> = {
  requiresOfficiant: "주례 있음",
  hasAdditionalEvent: "이벤트 추가",
};

// prototype/js/screens/WeddingScreen.js의 vals.contractLabel과 동일한 개념 —
// 선택된 계약 형태를 한글 라벨로 이어붙이고, 아무것도 없으면 "기본 계약".
function contractLabel(conditions: Record<string, boolean>): string {
  const labels = Object.entries(conditions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => CONTRACT_LABELS[key] ?? key);
  return labels.length > 0 ? labels.join(" · ") : "기본 계약";
}

export function CeremonyRow({
  ceremony,
  activeOperators,
}: {
  ceremony: CeremonyWithHallName;
  activeOperators: { id: string; name: string }[];
}) {
  const isDone = isCeremonyDone(ceremony.ceremonyAt);

  return (
    <li className={"ceremony-card" + (isDone ? " ceremony-card--done" : "")}>
      <div className="ceremony-card__body">
        <div className="ceremony-card__title">
          <span className="ceremony-card__time">{timeFormatter.format(ceremony.ceremonyAt)}</span>
          {ceremony.groomName && ceremony.brideName && (
            <span className="ceremony-card__couple">
              {ceremony.groomName} · {ceremony.brideName}
            </span>
          )}
        </div>
        <div className="ceremony-card__meta">
          {dateFormatter.format(ceremony.ceremonyAt)} · {ceremony.hallName} ·{" "}
          {contractLabel(ceremony.contractConditions)}
        </div>
        {/* FR-18 다중 배정(프로토타입 WeddingScreen.js): 카드에서 바로 pill 토글로 배정. */}
        <AssigneePills
          hallId={ceremony.hallId}
          ceremonyId={ceremony.id}
          activeOperators={activeOperators}
          assignees={ceremony.assignees}
        />
      </div>

      <div className="ceremony-card__side">
        <div className="ceremony-card__checklist">
          <span className="ceremony-card__checklist-label">체크리스트</span>
          <span className="ceremony-card__checklist-count">{ceremony.itemCount}개</span>
        </div>
        <span
          className={"ceremony-card__status-badge" + (isDone ? " ceremony-card__status-badge--done" : "")}
        >
          {isDone ? "완료" : "예정"}
        </span>
        <Link href={`/admin/ceremonies/${ceremony.hallId}/${ceremony.id}`} className="btn-secondary">
          상세
        </Link>
      </div>
    </li>
  );
}
