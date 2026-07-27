import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChecklistInstanceView } from "@/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view";

// Story 1.4의 폴링 테스트 패턴(vi.useFakeTimers + vi.stubGlobal("fetch", ...))을 재사용.
// 60초 setInterval은 waitForVideoUpdate의 유한 재시도 루프와 달리 끝나지 않으므로
// vi.runAllTimersAsync() 대신 vi.advanceTimersByTimeAsync(60_000)로 정확히 한 틱만 진행한다.
//
// 실행 화면 재구성(2026-07-27, prototype RunScreen.js 이식): POS Tile이 단계 아코디언 +
// 항목별 원형 체크 버튼(aria-label "{제목} 체크")으로 바뀌었다 — 단계 헤더는 접기/펼치기
// 버튼, 항목 제목은 텍스트, 체크 토글은 별도 원형 버튼.

const initialCeremony = {
  id: "ceremony-1",
  ceremonyAt: "2026-08-01T05:00:00.000Z",
  contractConditions: {},
  groomName: "김신랑",
  brideName: "이신부",
};

const initialItems = [
  {
    id: "item-1",
    templateItemId: "step-1",
    adHocGroupRootId: null,
    stepName: "신랑입장",
    title: "조명 전환",
    description: null,
    sortOrder: 1,
    videoUrl: null,
  },
  {
    id: "item-2",
    templateItemId: "step-2",
    adHocGroupRootId: null,
    stepName: "축가",
    title: "음향 준비",
    description: null,
    sortOrder: 2,
    videoUrl: null,
  },
];

type TestItem = {
  id: string;
  templateItemId: string | null;
  adHocGroupRootId: string | null;
  stepName: string;
  title: string;
  description: string | null;
  sortOrder: number;
  videoUrl: string | null;
};

function makeItem(overrides: Partial<TestItem> & { id: string }): TestItem {
  return {
    templateItemId: null,
    adHocGroupRootId: null,
    stepName: "단계",
    title: "항목",
    description: null,
    sortOrder: 1,
    videoUrl: null,
    ...overrides,
  };
}

function renderView() {
  return render(
    <ChecklistInstanceView
      hallId="hall-1"
      ceremonyId="ceremony-1"
      hallName="1층 홀"
      initialCeremony={initialCeremony}
      initialItems={initialItems}
    />,
  );
}

describe("ChecklistInstanceView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("체크 버튼 탭 시 즉시 완료 상태가 반영되고 진행 카운트가 오른다 (AC 1)", () => {
    const { container } = renderView();

    const progressDone = container.querySelector(".run-header-card__progress-done");
    const check = screen.getByRole("button", { name: "조명 전환 체크" });
    expect(check.className).not.toMatch(/run-item__check--done/);
    expect(progressDone?.textContent).toBe("0");

    fireEvent.click(check);

    expect(check.className).toMatch(/run-item__check--done/);
    expect(check.getAttribute("aria-pressed")).toBe("true");
    expect(progressDone?.textContent).toBe("1");
  });

  it("헤더 카드에 시간+신랑신부 제목이 표시된다", () => {
    renderView();
    expect(screen.getByText(/김신랑 · 이신부 예식/)).toBeInTheDocument();
  });

  it("단계명이 아코디언 헤더로, 항목이 그 아래 행으로 표시된다 (AC 6)", () => {
    renderView();

    expect(screen.getByRole("button", { name: /신랑입장/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /축가/ })).toBeInTheDocument();
    expect(screen.getByText("조명 전환")).toBeInTheDocument();
    expect(screen.getByText("음향 준비")).toBeInTheDocument();
  });

  it("단계 헤더를 탭하면 항목이 접히고 다시 탭하면 펼쳐진다", () => {
    renderView();

    const header = screen.getByRole("button", { name: /신랑입장/ });
    expect(screen.getByText("조명 전환")).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.queryByText("조명 전환")).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.getByText("조명 전환")).toBeInTheDocument();
  });

  it("설명이 있는 항목은 '상세'를 펼쳐야 전문이 보인다", () => {
    render(
      <ChecklistInstanceView
        hallId="hall-1"
        ceremonyId="ceremony-1"
        hallName="1층 홀"
        initialCeremony={initialCeremony}
        initialItems={[
          makeItem({
            id: "item-1",
            templateItemId: "step-1",
            stepName: "개식사",
            title: "조명 준비",
            description: "무대 조명을 50%로 낮춰둔다",
          }),
        ]}
      />,
    );

    expect(screen.queryByText("무대 조명을 50%로 낮춰둔다")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /상세/ }));
    expect(screen.getByText("무대 조명을 50%로 낮춰둔다")).toBeInTheDocument();
  });

  it("같은 단계에 속한 여러 항목은 하나의 단계 헤더 아래 함께 묶인다 (AC 6)", () => {
    render(
      <ChecklistInstanceView
        hallId="hall-1"
        ceremonyId="ceremony-1"
        hallName="1층 홀"
        initialCeremony={initialCeremony}
        initialItems={[
          makeItem({ id: "item-1", templateItemId: "step-1", stepName: "개식사", title: "조명 준비", sortOrder: 1 }),
          makeItem({ id: "item-2", templateItemId: "step-1", stepName: "개식사", title: "사전 안내", sortOrder: 2 }),
        ]}
      />,
    );

    expect(screen.getAllByText("개식사")).toHaveLength(1);
    expect(screen.getByText("조명 준비")).toBeInTheDocument();
    expect(screen.getByText("사전 안내")).toBeInTheDocument();
  });

  // 코덱스 리뷰 3차 P2(Story 5.5): stepName이 같아도 stepId가 다르면 별개 그룹.
  it("stepName이 같아도 stepId가 다르면 별개의 단계 헤더로 표시된다 (코덱스 3차 P2)", () => {
    render(
      <ChecklistInstanceView
        hallId="hall-1"
        ceremonyId="ceremony-1"
        hallName="1층 홀"
        initialCeremony={initialCeremony}
        initialItems={[
          makeItem({ id: "item-1", templateItemId: "step-1", stepName: "준비", title: "첫 준비", sortOrder: 1 }),
          makeItem({ id: "item-2", templateItemId: "step-2", stepName: "준비", title: "둘째 준비", sortOrder: 2 }),
        ]}
      />,
    );

    expect(screen.getAllByText("준비")).toHaveLength(2);
    expect(screen.getByText("첫 준비")).toBeInTheDocument();
    expect(screen.getByText("둘째 준비")).toBeInTheDocument();
  });

  // Story 5.8 그룹핑 위계와 동일 — ad-hoc 단계(templateItemId null)는 adHocGroupRootId로 묶인다.
  it("같은 adHocGroupRootId를 가진 ad-hoc 항목들은 하나의 단계로 묶인다", () => {
    render(
      <ChecklistInstanceView
        hallId="hall-1"
        ceremonyId="ceremony-1"
        hallName="1층 홀"
        initialCeremony={initialCeremony}
        initialItems={[
          makeItem({ id: "item-1", adHocGroupRootId: "group-1", stepName: "깜짝 이벤트", title: "첫 항목", sortOrder: 1 }),
          makeItem({ id: "item-2", adHocGroupRootId: "group-1", stepName: "깜짝 이벤트", title: "둘째 항목", sortOrder: 2 }),
        ]}
      />,
    );

    expect(screen.getAllByText("깜짝 이벤트")).toHaveLength(1);
  });

  it("60초 재검증이 성공하면 항목 목록이 갱신된다 (AC 3)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ceremony: initialCeremony,
          items: [makeItem({ id: "item-3", stepName: "새 단계", title: "새 항목" })],
        }),
      }),
    );

    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByText("새 항목")).toBeInTheDocument();
  });

  it("재검증 fetch가 실패하면 기존 항목을 유지하고 오프라인 배너를 띄운다 (AC 2)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByText("조명 전환")).toBeInTheDocument();
    expect(screen.getByText("음향 준비")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("오프라인");
  });

  it("navigator.onLine이 false면 fetch를 시도하지 않고 오프라인 배너를 띄운다 (AC 2)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);

    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("오프라인");
  });

  it("서버가 500을 반환하면 오프라인이 아닌 별도 오류로 표시하고 캐시로 되돌아가지 않는다 (코덱스 1차 P2)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // 기존 항목은 그대로 — HTTP 오류가 캐시/기존 화면을 건드리지 않는다.
    expect(screen.getByText("조명 전환")).toBeInTheDocument();
    expect(screen.getByText(/새로고침에 실패했습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/오프라인 상태입니다/)).not.toBeInTheDocument();
  });

  it("서버가 401을 반환하면 로그인 화면으로 리다이렉트한다 (세션 만료, 코덱스 1차 P2)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const originalLocation = window.location;
    // jsdom의 window.location은 기본적으로 직접 대입이 막혀 있어 href만 쓰기 가능한
    // 스텁으로 임시 교체한다 — 실제 네비게이션은 발생시키지 않고 호출 여부만 확인.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" },
    });

    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(window.location.href).toBe("/login");

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("겹쳐서 시작된 요청 중 늦게 도착한 이전 응답이 최신 상태를 덮어쓰지 않는다 (코덱스 5차 P2)", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse);
    vi.stubGlobal("fetch", fetchMock);

    renderView();

    // 첫 60초 tick — 첫 요청이 시작되지만 아직 응답하지 않는다(느린 홀 와이파이 재현).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // 두 번째 60초 tick — 첫 요청이 여전히 대기 중인 채로 두 번째 요청이 겹쳐서 시작된다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // 나중에 시작된(최신) 요청이 먼저 응답한다.
    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => ({
          ceremony: initialCeremony,
          items: [makeItem({ id: "item-new", title: "최신 항목" })],
        }),
      });
    });

    // 먼저 시작됐던(이제는 낡은) 요청이 뒤늦게 응답한다 — 이게 최신 상태를 덮으면 버그다.
    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({
          ceremony: initialCeremony,
          items: [makeItem({ id: "item-old", title: "오래된 항목" })],
        }),
      });
    });

    expect(screen.getByText("최신 항목")).toBeInTheDocument();
    expect(screen.queryByText("오래된 항목")).not.toBeInTheDocument();
  });
});
