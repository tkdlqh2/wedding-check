import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InsightCard } from "@/app/admin/insights/insight-card";
import { RecomputeStatus } from "@/app/admin/insights/recompute-status";
import type { InsightEvidence, InsightItem } from "@/lib/services/insight";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function makeEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    situation: "축가 반주가 늦게 나와서 축가자가 어색하게 서 있었다",
    outcome: "mishandled",
    rationale: "MR은 사회자 소개 멘트 시작할 때 미리 걸어놔야 한다",
    hallName: "그랜드홀",
    stepName: "축가",
    createdAt: new Date("2026-06-14T05:00:00.000Z"),
    ...overrides,
  };
}

function makeItem(overrides: Partial<InsightItem> = {}): InsightItem {
  return {
    rootCaseId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    label: "축가 반주(MR) 큐 지연",
    stepName: "축가",
    count: 3,
    hallDistribution: [
      { hallName: "그랜드홀", count: 2 },
      { hallName: "리버사이드홀", count: 1 },
    ],
    evidence: [makeEvidence()],
    ...overrides,
  };
}

describe("InsightCard (AC 1, 4)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("반복 횟수·라벨·단계·발생 홀 분포를 렌더링한다 (AC 1)", () => {
    render(<InsightCard item={makeItem()} />);

    expect(screen.getByText("3회")).toBeInTheDocument();
    expect(screen.getByText("축가 반주(MR) 큐 지연")).toBeInTheDocument();
    expect(
      screen.getByText("축가 단계 · 그랜드홀 2건 · 리버사이드홀 1건"),
    ).toBeInTheDocument();
  });

  it("접힌 상태에서는 근거가 노출되지 않는다", () => {
    render(<InsightCard item={makeItem()} />);

    expect(screen.queryByText(/축가 반주가 늦게 나와서/)).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("펼치면 근거가 된 원본 피드백이 표시된다 (AC 4)", () => {
    render(<InsightCard item={makeItem()} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText(/축가 반주가 늦게 나와서/)).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("다시 누르면 접힌다", () => {
    render(<InsightCard item={makeItem()} />);
    const toggle = screen.getByRole("button");

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(screen.queryByText(/축가 반주가 늦게 나와서/)).not.toBeInTheDocument();
  });

  // 3.4 매칭 카드 메타와 같은 형식. 작성자 이름은 데이터 자체가 없다(NFR-5).
  it("근거 메타는 날짜 · 홀 · 단계 순서로 표시된다", () => {
    render(<InsightCard item={makeItem()} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("6월 14일 · 그랜드홀 · 축가")).toBeInTheDocument();
  });

  // "Invalid Date"가 관리자 화면에 그대로 노출되면 안 된다.
  it("createdAt이 파싱 불가하면 날짜 조각만 생략한다", () => {
    const item = makeItem({
      evidence: [makeEvidence({ createdAt: new Date("깨진 값") })],
    });
    render(<InsightCard item={item} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("그랜드홀 · 축가")).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it("펼침 영역에 v2 안내 꼬리말이 붙는다", () => {
    render(<InsightCard item={makeItem()} />);
    fireEvent.click(screen.getByRole("button"));

    expect(
      screen.getByText("템플릿 반영 여부는 사람이 판단합니다 — 자동 반영은 v2에서 다룹니다."),
    ).toBeInTheDocument();
  });

  it("여러 근거를 모두 렌더링한다", () => {
    const item = makeItem({
      evidence: [
        makeEvidence({ id: "1", situation: "첫 번째 상황" }),
        makeEvidence({ id: "2", situation: "두 번째 상황" }),
      ],
    });
    render(<InsightCard item={item} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText(/첫 번째 상황/)).toBeInTheDocument();
    expect(screen.getByText(/두 번째 상황/)).toBeInTheDocument();
  });
});

describe("RecomputeStatus (AC 2)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("갱신 중이 아니면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(<RecomputeStatus isRecomputing={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  // UX-DR13: 화면을 덮는 스피너가 아니라 스켈레톤만 덧붙는다.
  it("갱신 중이면 스켈레톤과 안내 문구를 표시한다", () => {
    render(<RecomputeStatus isRecomputing />);

    expect(
      screen.getByText("인사이트를 갱신하는 중입니다. 아래 목록은 직전 집계 결과입니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("갱신 중일 때만 주기적으로 새로고침한다", () => {
    vi.useFakeTimers();
    render(<RecomputeStatus isRecomputing />);

    act(() => {
      vi.advanceTimersByTime(25_000);
    });

    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("갱신 중이 아니면 타이머가 돌지 않는다", () => {
    vi.useFakeTimers();
    render(<RecomputeStatus isRecomputing={false} />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(refreshMock).not.toHaveBeenCalled();
  });
});
