import { requireAdminPage } from "@/lib/auth-guard";
import { getInsights } from "@/lib/services/insight";
import { InsightCard } from "./insight-card";
import { InsightStats, InsightsEmptyState } from "./insight-stats";
import { RecomputeStatus } from "./recompute-status";
import "./insights.css";

// Story 4.1(FR-10) — prototype/js/screens/InsightScreen.js 이식.
// Story 4.2(FR-11) — 관리자 전용 접근을 이 페이지가 **스스로** 확인한다. 레이아웃 가드는
// 클라이언트 사이드 내비게이션에서 다시 실행되지 않아 단독으로는 충분하지 않다
// (근거와 재현 경로: lib/auth-guard.ts::requireAdminPage 주석).

// hour12를 명시적으로 끈다: 기본값(12시간제)은 런타임 ICU 빌드에 따라 "오후 3:29"가
// 되기도 "PM 03:29"가 되기도 해서(로컬에서 후자 확인) 표기가 환경마다 갈린다.
// 24시간제는 결정적이고, 운영 화면에 더 맞는 표기다.
const UPDATED_AT_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatLastCompletedAt(value: Date | null): string {
  if (value === null) return "아직 갱신되지 않음";
  // Invalid Date가 화면에 문자열로 노출되지 않게 방어한다(Story 3.4 Task 4와 동일 관례).
  if (Number.isNaN(value.getTime())) return "아직 갱신되지 않음";
  return `마지막 갱신 ${UPDATED_AT_FORMAT.format(value)}`;
}

export default async function InsightsPage() {
  // FR-11. 데이터를 읽기 **전에** 확인한다 — 권한 없는 요청에는 인사이트 쿼리가 나가지 않는다.
  await requireAdminPage();

  const { items, isRecomputing, lastCompletedAt, hasAggregated, totalCases, recentCases } =
    await getInsights();

  return (
    <section className="insights-page">
      <h1 className="insights-page__title">
        인사이트
        <span className="insights-page__badge">관리자 전용 · 읽기 전용</span>
      </h1>
      <p className="insights-page__description">
        누적 피드백을 의미 기반으로 묶었습니다. 표현이 달라도 같은 원인이면 하나로 집계됩니다.
        매일 새벽 1회 갱신 · {formatLastCompletedAt(lastCompletedAt)}
      </p>

      <InsightStats
        totalCases={totalCases}
        recentCases={recentCases}
        clusterCount={items.length}
        hasAggregated={hasAggregated}
      />

      {/* Story 4.1 AC 2: 갱신 중이어도 기존 목록은 그대로 보이고, 스켈레톤만 위에 덧붙는다. */}
      <RecomputeStatus isRecomputing={isRecomputing} />

      {items.length === 0 ? (
        <InsightsEmptyState hasAggregated={hasAggregated} />
      ) : (
        <div className="insights-page__list">
          {items.map((item) => (
            <InsightCard key={item.rootCaseId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
