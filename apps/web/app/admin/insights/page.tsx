import { getInsights } from "@/lib/services/insight";
import { InsightCard } from "./insight-card";
import { RecomputeStatus } from "./recompute-status";
import "./insights.css";

// Story 4.1(FR-10) — prototype/js/screens/InsightScreen.js 이식.
// 관리자 전용 접근은 app/admin/layout.tsx가 이미 강제한다(AD-3) — Story 4.2가
// 오퍼레이터 차단(FR-11)과 미집계 표시를 별도로 다룬다.

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
  const { items, isRecomputing, lastCompletedAt, totalCases, recentCases } =
    await getInsights();

  const stats = [
    { label: "누적 확정 피드백", value: `${totalCases}건` },
    { label: "반복 원인 클러스터", value: `${items.length}개` },
    // 프로토타입 9행의 "이번 달 신입 동반 예식"은 쓸 수 없다 — AD-3(2026-07-24 PRD
    // 변경)에 따라 이 시스템에 신입/선임 구분 자체가 없어 데이터 소스가 존재하지
    // 않는다. 지어낸 숫자를 띄우는 대신 실제로 세어지는 값으로 대체한다.
    { label: "최근 30일 신규 피드백", value: `${recentCases}건` },
  ];

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

      <div className="insights-page__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="insights-stat">
            <div className="insights-stat__label">{stat.label}</div>
            <div className="insights-stat__value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* AC 2: 갱신 중이어도 기존 목록은 그대로 보이고, 스켈레톤만 위에 덧붙는다. */}
      <RecomputeStatus isRecomputing={isRecomputing} />

      {items.length === 0 ? (
        <p className="insights-page__empty">
          아직 반복 패턴이 없습니다. 같은 원인의 피드백이 2건 이상 쌓이면 여기에 표시됩니다.
        </p>
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
