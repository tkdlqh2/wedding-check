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

  it("문법적으로 유효하지만 기대 셰이프가 아닌 JSON(예: {})은 null을 반환한다 (코덱스 1차 P2)", () => {
    const ceremonyId = "44444444-4444-4444-4444-444444444444";
    window.localStorage.setItem(`wedding-check:operator-checklist:${ceremonyId}`, "{}");

    expect(readCache(ceremonyId)).toBeNull();
  });

  it("items가 배열이 아니면 null을 반환한다", () => {
    const ceremonyId = "55555555-5555-5555-5555-555555555555";
    window.localStorage.setItem(
      `wedding-check:operator-checklist:${ceremonyId}`,
      JSON.stringify({ ceremony: { id: "x", ceremonyAt: "2026-08-01T00:00:00.000Z" }, items: "not-an-array" }),
    );

    expect(readCache(ceremonyId)).toBeNull();
  });

  it("items 배열 안에 형태가 다른 원소(null 등)가 있으면 null을 반환한다 (코덱스 4차 P2)", () => {
    const ceremonyId = "66666666-6666-6666-6666-666666666666";
    window.localStorage.setItem(
      `wedding-check:operator-checklist:${ceremonyId}`,
      JSON.stringify({
        ceremony: { id: "x", ceremonyAt: "2026-08-01T00:00:00.000Z" },
        items: [null],
      }),
    );

    expect(readCache(ceremonyId)).toBeNull();
  });

  it("ceremonyAt이 유효한 날짜 문자열이 아니면 null을 반환한다 (코덱스 4차 P2)", () => {
    const ceremonyId = "77777777-7777-7777-7777-777777777777";
    window.localStorage.setItem(
      `wedding-check:operator-checklist:${ceremonyId}`,
      JSON.stringify({ ceremony: { id: "x", ceremonyAt: "not-a-date" }, items: [] }),
    );

    expect(readCache(ceremonyId)).toBeNull();
  });
});
