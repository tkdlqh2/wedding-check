import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChecklistInstanceView } from "@/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view";

// Story 1.4의 폴링 테스트 패턴(vi.useFakeTimers + vi.stubGlobal("fetch", ...))을 재사용.
// 60초 setInterval은 waitForVideoUpdate의 유한 재시도 루프와 달리 끝나지 않으므로
// vi.runAllTimersAsync() 대신 vi.advanceTimersByTimeAsync(60_000)로 정확히 한 틱만 진행한다.
//
// Story 5.5: POS Tile 라벨이 stepName에서 title로 바뀌었다 — 버튼 조회는 이제 title
// 기준. stepName은 그룹 헤더로만 쓰인다(별도 group 테스트에서 확인).

const initialCeremony = {
  id: "ceremony-1",
  ceremonyAt: "2026-08-01T05:00:00.000Z",
  contractConditions: {},
};
const initialItems = [
  { id: "item-1", stepId: "step-1", stepName: "신랑입장", title: "조명 전환", description: null, sortOrder: 1 },
  { id: "item-2", stepId: "step-2", stepName: "축가", title: "음향 준비", description: null, sortOrder: 2 },
];

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

  it("항목 탭 시 즉시 선택 상태 클래스가 반영된다 (AC 1)", () => {
    renderView();

    const tile = screen.getByRole("button", { name: "조명 전환" });
    expect(tile.className).not.toMatch(/checklist-tile--selected/);

    fireEvent.click(tile);

    expect(tile.className).toMatch(/checklist-tile--selected/);
    expect(tile.getAttribute("aria-pressed")).toBe("true");
  });

  it("단계명이 그룹 헤더로, 체크리스트 항목이 그 아래 개별 타일로 표시된다 (AC 6)", () => {
    renderView();

    expect(screen.getByRole("heading", { name: "신랑입장" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "축가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "조명 전환" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "음향 준비" })).toBeInTheDocument();
  });

  it("같은 단계에 속한 여러 항목은 하나의 그룹 헤더 아래 함께 묶인다 (AC 6)", () => {
    render(
      <ChecklistInstanceView
        hallId="hall-1"
        ceremonyId="ceremony-1"
        hallName="1층 홀"
        initialCeremony={initialCeremony}
        initialItems={[
          { id: "item-1", stepId: "step-1", stepName: "개식사", title: "조명 준비", description: null, sortOrder: 1 },
          { id: "item-2", stepId: "step-1", stepName: "개식사", title: "사전 안내", description: null, sortOrder: 2 },
        ]}
      />,
    );

    expect(screen.getAllByRole("heading", { name: "개식사" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "조명 준비" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사전 안내" })).toBeInTheDocument();
  });

  // 코덱스 리뷰 3차 P2: stepName이 같아도 stepId가 다르면(서로 다른 실제 단계가 우연히
  // 같은 이름을 가진 경우) 별개 그룹으로 표시되어야 한다 — 텍스트만으로 묶으면 두
  // 단계가 하나로 합쳐지는 실결함이었다.
  it("stepName이 같아도 stepId가 다르면 별개의 그룹 헤더로 표시된다 (코덱스 3차 P2)", () => {
    render(
      <ChecklistInstanceView
        hallId="hall-1"
        ceremonyId="ceremony-1"
        hallName="1층 홀"
        initialCeremony={initialCeremony}
        initialItems={[
          { id: "item-1", stepId: "step-1", stepName: "준비", title: "첫 준비", description: null, sortOrder: 1 },
          { id: "item-2", stepId: "step-2", stepName: "준비", title: "둘째 준비", description: null, sortOrder: 2 },
        ]}
      />,
    );

    expect(screen.getAllByRole("heading", { name: "준비" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "첫 준비" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "둘째 준비" })).toBeInTheDocument();
  });

  it("60초 재검증이 성공하면 항목 목록이 갱신된다 (AC 3)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ceremony: initialCeremony,
          items: [
            { id: "item-3", stepName: "새 단계", title: "새 항목", description: null, sortOrder: 1 },
          ],
        }),
      }),
    );

    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByRole("button", { name: "새 항목" })).toBeInTheDocument();
  });

  it("재검증 fetch가 실패하면 기존 항목을 유지하고 오프라인 배너를 띄운다 (AC 2)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByRole("button", { name: "조명 전환" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "음향 준비" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "조명 전환" })).toBeInTheDocument();
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
          items: [
            { id: "item-new", stepName: "단계", title: "최신 항목", description: null, sortOrder: 1 },
          ],
        }),
      });
    });

    // 먼저 시작됐던(이제는 낡은) 요청이 뒤늦게 응답한다 — 이게 최신 상태를 덮으면 버그다.
    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({
          ceremony: initialCeremony,
          items: [
            { id: "item-old", stepName: "단계", title: "오래된 항목", description: null, sortOrder: 1 },
          ],
        }),
      });
    });

    expect(screen.getByRole("button", { name: "최신 항목" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "오래된 항목" })).not.toBeInTheDocument();
  });
});
