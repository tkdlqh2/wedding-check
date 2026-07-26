import { describe, it, expect, vi, afterEach } from "vitest";
import { waitForVideoUpdate } from "@/app/admin/templates/[hallId]/video-upload";

// Story 1.4 코덱스 리뷰 2~3차 회귀 테스트: onUploadCompleted 웹훅은 upload() 응답과
// 별도(비동기)로 도착한다. 고정 시간 재시도(2차 수정)는 웹훅이 늦으면 낡은 상태를
// 조용히 성공처럼 보여줄 수 있어 "관련 사례 없음" 원칙(DESIGN.md §4 — 확인 안 된
// 것을 확인된 것처럼 보여주지 않는다)에 위배됐고, 실제 반영을 폴링해 확인하는
// 지금 구현(3차 수정)으로 대체됐다. 이 동작이 재도입 실수로 되돌아가지 않도록 고정한다.
describe("waitForVideoUpdate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("상태 API가 새 videoUrl을 반환하면 true를 반환하고 폴링을 멈춘다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videoUrl: "/api/local-videos/new.mp4" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = waitForVideoUpdate("hall-1", "item-1", undefined);
    await vi.runAllTimersAsync();

    expect(await resultPromise).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("끝까지 반영이 확인되지 않으면 false를 반환한다 — 성공을 가장하지 않는다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videoUrl: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = waitForVideoUpdate("hall-1", "item-1", undefined);
    await vi.runAllTimersAsync();

    expect(await resultPromise).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(15);
  });

  it("반환된 videoUrl이 업로드 이전 값과 같으면 아직 반영된 것으로 보지 않는다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videoUrl: "/api/local-videos/old.mp4" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = waitForVideoUpdate(
      "hall-1",
      "item-1",
      "/api/local-videos/old.mp4",
    );
    await vi.runAllTimersAsync();

    expect(await resultPromise).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(15);
  });

  it("폴링 중 네트워크 실패는 무시하고 다음 시도로 넘어간다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ videoUrl: "/api/local-videos/new.mp4" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = waitForVideoUpdate("hall-1", "item-1", undefined);
    await vi.runAllTimersAsync();

    expect(await resultPromise).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
