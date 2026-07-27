import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChecklistInstanceView } from "@/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view";

// Story 1.4의 폴링 테스트 패턴(vi.useFakeTimers + vi.stubGlobal("fetch", ...))을 재사용.
// 60초 setInterval은 waitForVideoUpdate의 유한 재시도 루프와 달리 끝나지 않으므로
// vi.runAllTimersAsync() 대신 vi.advanceTimersByTimeAsync(60_000)로 정확히 한 틱만 진행한다.

const initialCeremony = {
  id: "ceremony-1",
  ceremonyAt: "2026-08-01T05:00:00.000Z",
  contractConditions: {},
};
const initialItems = [
  { id: "item-1", stepName: "신랑입장", description: null, sortOrder: 1 },
  { id: "item-2", stepName: "축가", description: null, sortOrder: 2 },
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
    vi.useRealTimers();
  });

  it("항목 탭 시 즉시 선택 상태 클래스가 반영된다 (AC 1)", () => {
    renderView();

    const tile = screen.getByRole("button", { name: "신랑입장" });
    expect(tile.className).not.toMatch(/checklist-tile--selected/);

    fireEvent.click(tile);

    expect(tile.className).toMatch(/checklist-tile--selected/);
    expect(tile.getAttribute("aria-pressed")).toBe("true");
  });

  it("60초 재검증이 성공하면 항목 목록이 갱신된다 (AC 3)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ceremony: initialCeremony,
          items: [{ id: "item-3", stepName: "새 항목", description: null, sortOrder: 1 }],
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

    expect(screen.getByRole("button", { name: "신랑입장" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "축가" })).toBeInTheDocument();
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
});
