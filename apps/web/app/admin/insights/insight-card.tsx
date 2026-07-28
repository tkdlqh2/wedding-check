"use client";

import { useId, useState } from "react";
import type { InsightEvidence, InsightItem } from "@/lib/services/insight";

// prototype/js/screens/InsightScreen.js 29~54행 이식. 헤더 버튼 전체가 토글이고,
// 펼치면 클러스터의 근거가 된 원본 피드백 목록이 나온다(AC 4).

const EVIDENCE_DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

// Story 3.4 매칭 카드 메타와 같은 형식이다.
// 프로토타입 메타의 "김도윤 선임"은 쓸 수 없다 — feedback 테이블에 작성자 식별자
// 컬럼이 의도적으로 없다(NFR-5, schema.ts). 그 자리를 발생 홀이 대신한다.
function formatEvidenceMeta(evidence: InsightEvidence): string {
  const parts: string[] = [];
  // createdAt이 파싱 불가한 값이면 날짜 조각만 생략한다 — "Invalid Date"가 관리자
  // 화면에 그대로 노출되면 안 된다(3.4 Task 4와 동일 방어).
  if (!Number.isNaN(evidence.createdAt.getTime())) {
    parts.push(EVIDENCE_DATE_FORMAT.format(evidence.createdAt));
  }
  parts.push(evidence.hallName, evidence.stepName);
  return parts.join(" · ");
}

export function InsightCard({ item }: { item: InsightItem }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  // AC 1이 요구하는 발생 홀 분포. AD-6대로 클러스터링 자체는 홀 무관 사업체 전체
  // 범위이고, 홀은 여기서 표시용 태그로만 붙는다.
  const subtitle = [
    `${item.stepName} 단계`,
    ...item.hallDistribution.map((h) => `${h.hallName} ${h.count}건`),
  ].join(" · ");

  return (
    <div className="insight-card">
      <button
        type="button"
        className="insight-card__header"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <span className="insight-card__count">{item.count}회</span>
        <span className="insight-card__headings">
          <span className="insight-card__label">{item.label}</span>
          <span className="insight-card__subtitle">{subtitle}</span>
        </span>
        <span className="insight-card__toggle">
          {expanded ? "▲" : "▼"} 원본 피드백
        </span>
      </button>

      {expanded && (
        <div className="insight-card__evidence" id={panelId}>
          {item.evidence.map((evidence) => (
            <div key={evidence.id} className="insight-evidence">
              <p className="insight-evidence__situation">&ldquo;{evidence.situation}&rdquo;</p>
              <p className="insight-evidence__meta">{formatEvidenceMeta(evidence)}</p>
            </div>
          ))}
          <p className="insight-card__footnote">
            템플릿 반영 여부는 사람이 판단합니다 — 자동 반영은 v2에서 다룹니다.
          </p>
        </div>
      )}
    </div>
  );
}
