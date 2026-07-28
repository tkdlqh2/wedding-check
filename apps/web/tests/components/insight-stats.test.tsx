import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  InsightStats,
  InsightsEmptyState,
  NOT_AGGREGATED,
} from "@/app/admin/insights/insight-stats";

// Story 4.2 AC 3(UX-DR17, DESIGN.md §14 Skeleton):
// "숫자 플레이스홀더는 `—`로, `0`으로 표시하지 않음(집계 전과 0건을 혼동시키지 않기 위해)"

describe("InsightStats — 미집계 표시 (AC 3)", () => {
  it("집계 전에는 클러스터 수가 `—`이고 `0개`는 화면 어디에도 없다", () => {
    render(
      <InsightStats totalCases={7} recentCases={3} clusterCount={0} hasAggregated={false} />,
    );

    expect(screen.getByText(NOT_AGGREGATED)).toBeInTheDocument();
    // 이 단언이 이 테스트의 핵심이다 — `—`가 있는지만 보면, 실수로 `—`와 `0개`를
    // 함께 렌더해도 통과해버린다.
    expect(screen.queryByText("0개")).not.toBeInTheDocument();
  });

  it("집계 후에는 결과가 0개여도 `0개`로 정직하게 표시한다", () => {
    render(
      <InsightStats totalCases={7} recentCases={3} clusterCount={0} hasAggregated={true} />,
    );

    expect(screen.getByText("0개")).toBeInTheDocument();
    expect(screen.queryByText(NOT_AGGREGATED)).not.toBeInTheDocument();
  });

  it("집계 후 클러스터가 있으면 그 수를 표시한다", () => {
    render(
      <InsightStats totalCases={12} recentCases={4} clusterCount={3} hasAggregated={true} />,
    );

    expect(screen.getByText("3개")).toBeInTheDocument();
  });

  it("피드백 건수는 배치 산출물이 아니므로 집계 전에도 실제 숫자를 보여준다", () => {
    render(
      <InsightStats totalCases={7} recentCases={3} clusterCount={0} hasAggregated={false} />,
    );

    // 아는 숫자를 `—`로 가리면 UX-DR17이 막으려는 혼동을 반대 방향으로 만든다(D-6).
    expect(screen.getByText("7건")).toBeInTheDocument();
    expect(screen.getByText("3건")).toBeInTheDocument();
  });

  it("플레이스홀더에만 별도 클래스가 붙는다(색만 다르고 기하는 유지)", () => {
    const { container } = render(
      <InsightStats totalCases={0} recentCases={0} clusterCount={0} hasAggregated={false} />,
    );

    const placeholders = container.querySelectorAll(".insights-stat__value--placeholder");
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].textContent).toBe(NOT_AGGREGATED);
    // 세 카드 모두 같은 기본 클래스를 유지해야 첫 집계 후 레이아웃이 흔들리지 않는다.
    expect(container.querySelectorAll(".insights-stat__value")).toHaveLength(3);
  });

  it("0건이어도 `—`가 아니라 `0건`이다 — 실시간 카운트는 언제나 사실이다", () => {
    render(
      <InsightStats totalCases={0} recentCases={0} clusterCount={0} hasAggregated={false} />,
    );

    expect(screen.getAllByText("0건")).toHaveLength(2);
  });
});

describe("InsightsEmptyState — 미집계와 0건은 다른 문장이다 (AC 3)", () => {
  it("집계 전에는 '없다'고 단정하지 않고 언제 갱신되는지 알려준다", () => {
    render(<InsightsEmptyState hasAggregated={false} />);

    expect(screen.getByText(/아직 집계 전입니다/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 반복 패턴이 없습니다/)).not.toBeInTheDocument();
  });

  it("집계 후 0개일 때만 '반복 패턴이 없습니다'라고 말한다", () => {
    render(<InsightsEmptyState hasAggregated={true} />);

    expect(screen.getByText(/아직 반복 패턴이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 집계 전입니다/)).not.toBeInTheDocument();
  });
});
