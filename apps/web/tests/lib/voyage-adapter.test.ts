import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { VoyageEmbeddingAdapter } from "@/lib/ai/adapters/voyage";

// 실제 Voyage API를 호출하지 않는다(스토리 Dev Notes — 벤더 계약 테스트는 범위 밖).
// 여기서는 순수 응답 파싱/검증 로직만 확인한다: 정렬, 그리고 코덱스 리뷰에서 지적된
// "res.ok=true인데 shape가 기대와 다른 응답"에 대한 방어.
describe("VoyageEmbeddingAdapter", () => {
  const originalEnv = process.env.VOYAGE_API_KEY;

  beforeEach(() => {
    process.env.VOYAGE_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.VOYAGE_API_KEY = originalEnv;
  });

  it("index 순서로 정렬해 반환한다(응답 순서가 요청 순서와 다를 수 있음)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { embedding: [2, 2], index: 1 },
            { embedding: [1, 1], index: 0 },
          ],
        }),
      }),
    );

    const result = await new VoyageEmbeddingAdapter().embed(["첫번째", "두번째"]);

    expect(result).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("data 필드가 없으면 명확한 에러를 던진다(malformed 응답 방어)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    await expect(new VoyageEmbeddingAdapter().embed(["텍스트"])).rejects.toThrow(
      /응답 형식이 올바르지 않습니다/,
    );
  });

  it("data 길이가 요청 개수와 다르면 명확한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [1], index: 0 }] }),
      }),
    );

    await expect(new VoyageEmbeddingAdapter().embed(["첫번째", "두번째"])).rejects.toThrow(
      /응답 형식이 올바르지 않습니다/,
    );
  });

  it("VOYAGE_API_KEY가 없으면 에러를 던진다", async () => {
    delete process.env.VOYAGE_API_KEY;

    await expect(new VoyageEmbeddingAdapter().embed(["텍스트"])).rejects.toThrow(
      /VOYAGE_API_KEY/,
    );
  });
});
