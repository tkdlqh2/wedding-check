import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { VoyageEmbeddingAdapter } from "@/lib/ai/adapters/voyage";

function dummyEmbedding(fill: number): number[] {
  return Array.from({ length: 1024 }, () => fill);
}

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
            { embedding: dummyEmbedding(2), index: 1 },
            { embedding: dummyEmbedding(1), index: 0 },
          ],
        }),
      }),
    );

    const result = await new VoyageEmbeddingAdapter().embed(["첫번째", "두번째"]);

    expect(result).toEqual([dummyEmbedding(1), dummyEmbedding(2)]);
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
        json: async () => ({ data: [{ embedding: dummyEmbedding(1), index: 0 }] }),
      }),
    );

    await expect(new VoyageEmbeddingAdapter().embed(["첫번째", "두번째"])).rejects.toThrow(
      /응답 형식이 올바르지 않습니다/,
    );
  });

  // 코덱스 리뷰 3라운드: 길이/타입만 보고 통과시키면 embedding: []도 "배열이고
  // 숫자로만 이뤄짐(공허하게 참)"을 통과해 요청한 1024차원과 다른 빈 벡터가
  // ::vector 캐스팅까지 흘러갈 수 있었다.
  it("embedding이 요청한 차원(1024)과 다르면 명확한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [], index: 0 }] }),
      }),
    );

    await expect(new VoyageEmbeddingAdapter().embed(["텍스트"])).rejects.toThrow(
      /응답 형식이 올바르지 않습니다/,
    );
  });

  // 코덱스 리뷰 3라운드: index 중복/누락을 확인하지 않으면 두 항목이 모두
  // index:0을 주장하는 응답도 길이/개별 shape 검증을 통과해, 정렬 후 엉뚱한
  // 텍스트에 엉뚱한 임베딩이 짝지어질 수 있었다("근거는 신성하다").
  it("index가 중복되면 명확한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { embedding: dummyEmbedding(1), index: 0 },
            { embedding: dummyEmbedding(2), index: 0 },
          ],
        }),
      }),
    );

    await expect(new VoyageEmbeddingAdapter().embed(["첫번째", "두번째"])).rejects.toThrow(
      /응답 형식이 올바르지 않습니다/,
    );
  });

  // 코덱스 리뷰 4라운드: 중복 index 테스트만으로는 범위(0..N-1) 검사 자체를
  // 실제로 통과시켜야 하는 경로(중복은 없지만 범위를 벗어난 경우)가 검증되지
  // 않았다 — 단일 텍스트 요청에 index: 5가 오는 경우를 별도로 확인한다.
  it("index가 유효 범위(0..N-1)를 벗어나면 명확한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: dummyEmbedding(1), index: 5 }] }),
      }),
    );

    await expect(new VoyageEmbeddingAdapter().embed(["텍스트"])).rejects.toThrow(
      /응답 형식이 올바르지 않습니다/,
    );
  });

  // Story 3.3: 비대칭 검색 — 문서(확정 시점)는 "document", 실행 중 질의는 "query".
  it("inputType을 지정하지 않으면 input_type 'document'로 요청한다(3.2 경로 불변)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: dummyEmbedding(1), index: 0 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new VoyageEmbeddingAdapter().embed(["텍스트"]);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.input_type).toBe("document");
  });

  it("inputType 'query'를 지정하면 input_type 'query'로 요청한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: dummyEmbedding(1), index: 0 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new VoyageEmbeddingAdapter().embed(["텍스트"], { inputType: "query" });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.input_type).toBe("query");
  });

  it("VOYAGE_API_KEY가 없으면 에러를 던진다", async () => {
    delete process.env.VOYAGE_API_KEY;

    await expect(new VoyageEmbeddingAdapter().embed(["텍스트"])).rejects.toThrow(
      /VOYAGE_API_KEY/,
    );
  });
});
