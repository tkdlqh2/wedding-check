// Story 4.2(FR-11) AC 3 / UX-DR17 / DESIGN.md §14 Skeleton:
// "숫자 플레이스홀더는 `—`로, `0`으로 표시하지 않음(집계 전과 0건을 혼동시키지 않기 위해)"
//
// 표시만 하는 컴포넌트로 떼어낸 이유는 page.tsx가 Server Component라 이 분기를 단위로
// 검증하기 어려워서다(tests/components/insight-stats.test.tsx).

/** 아직 집계된 적 없는 숫자의 자리. `0`과 절대 섞이면 안 된다. */
export const NOT_AGGREGATED = "—";

export interface InsightStatsProps {
  /** `variable_cases` 실시간 COUNT — 배치와 무관하게 항상 참인 값. */
  totalCases: number;
  /** 최근 30일 신규 확정 피드백. 위와 같은 성격. */
  recentCases: number;
  /** **배치 산출물.** 집계 전에는 표시할 숫자 자체가 없다. */
  clusterCount: number;
  hasAggregated: boolean;
}

export function InsightStats({
  totalCases,
  recentCases,
  clusterCount,
  hasAggregated,
}: InsightStatsProps) {
  // `—`가 필요한 건 배치가 만들어내는 값 하나뿐이다. 누적/최근 피드백 수는 확정 피드백을
  // 그 자리에서 세는 값이라 집계 여부와 상관없이 언제나 사실이며, 아는 숫자를 `—`로
  // 가리는 것은 UX-DR17이 막으려는 혼동을 반대 방향으로 만드는 것이다.
  const stats = [
    { label: "누적 확정 피드백", value: `${totalCases}건`, isPlaceholder: false },
    {
      label: "반복 원인 클러스터",
      value: hasAggregated ? `${clusterCount}개` : NOT_AGGREGATED,
      isPlaceholder: !hasAggregated,
    },
    // 프로토타입 9행의 "이번 달 신입 동반 예식"은 쓸 수 없다 — AD-3(2026-07-24 PRD
    // 변경)에 따라 이 시스템에 신입/선임 구분 자체가 없어 데이터 소스가 존재하지
    // 않는다. 지어낸 숫자를 띄우는 대신 실제로 세어지는 값으로 대체한다.
    { label: "최근 30일 신규 피드백", value: `${recentCases}건`, isPlaceholder: false },
  ];

  return (
    <div className="insights-page__stats">
      {stats.map((stat) => (
        <div key={stat.label} className="insights-stat">
          <div className="insights-stat__label">{stat.label}</div>
          <div
            className={
              stat.isPlaceholder
                ? "insights-stat__value insights-stat__value--placeholder"
                : "insights-stat__value"
            }
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 목록이 비었을 때의 문구. 집계 전과 "집계했더니 0개"는 다른 사실이므로 같은 문장을 쓸 수
 * 없다 — 집계 전에 "아직 반복 패턴이 없습니다"라고 쓰면 알 수 없는 것을 단정하는 셈이다.
 * §14 Empty 톤대로 다음에 무슨 일이 일어나는지를 알려준다.
 */
export function InsightsEmptyState({ hasAggregated }: { hasAggregated: boolean }) {
  return (
    <p className="insights-page__empty">
      {hasAggregated
        ? "아직 반복 패턴이 없습니다. 같은 원인의 피드백이 2건 이상 쌓이면 여기에 표시됩니다."
        : "아직 집계 전입니다. 매일 새벽 1회 갱신되며, 첫 갱신 후 반복 패턴이 여기에 표시됩니다."}
    </p>
  );
}
