import { describe, it, expect, beforeEach } from "vitest";
import { readCache, writeCache } from "@/lib/operator/checklist-cache";

describe("checklist-cache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("존재하지 않는 키를 읽으면 null을 반환한다", () => {
    expect(readCache("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("쓴 값을 그대로 읽을 수 있다(왕복)", () => {
    const ceremonyId = "11111111-1111-1111-1111-111111111111";
    writeCache(ceremonyId, {
      ceremony: { id: ceremonyId, ceremonyAt: "2026-08-01T05:00:00.000Z", contractConditions: {} },
      items: [{ id: "item-1", stepName: "신랑입장", description: null, sortOrder: 1 }],
    });

    const cached = readCache(ceremonyId);

    expect(cached?.ceremony.id).toBe(ceremonyId);
    expect(cached?.items).toHaveLength(1);
    expect(cached?.items[0].stepName).toBe("신랑입장");
    expect(cached?.cachedAt).toBeTruthy();
  });

  it("다른 ceremonyId의 캐시는 서로 섞이지 않는다", () => {
    writeCache("11111111-1111-1111-1111-111111111111", {
      ceremony: { id: "a", ceremonyAt: "2026-08-01T05:00:00.000Z", contractConditions: {} },
      items: [],
    });
    writeCache("22222222-2222-2222-2222-222222222222", {
      ceremony: { id: "b", ceremonyAt: "2026-08-02T05:00:00.000Z", contractConditions: {} },
      items: [],
    });

    expect(readCache("11111111-1111-1111-1111-111111111111")?.ceremony.id).toBe("a");
    expect(readCache("22222222-2222-2222-2222-222222222222")?.ceremony.id).toBe("b");
  });

  it("손상된 JSON이 저장돼 있으면 null을 반환한다(throw하지 않는다)", () => {
    const ceremonyId = "33333333-3333-3333-3333-333333333333";
    window.localStorage.setItem(`wedding-check:operator-checklist:${ceremonyId}`, "{not-json");

    expect(readCache(ceremonyId)).toBeNull();
  });
});
