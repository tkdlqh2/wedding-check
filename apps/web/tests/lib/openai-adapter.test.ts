import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { OpenAIEmbeddingAdapter, OpenAILLMAdapter } from "@/lib/ai/adapters/openai";
import type { EmbeddingPort } from "@/lib/ai/ports";

function dummyEmbedding(fill: number): number[] {
  return Array.from({ length: 1024 }, () => fill);
}

// 실제 OpenAI API를 호출하지 않는다(Voyage 어댑터 테스트와 동일 원칙 — 벤더 계약
// 테스트는 범위 밖). 요청 조립과 응답 파싱/검증만 확인한다. 응답 shape 검증
// 자체(차원/index 중복/범위)는 공유 모듈(embedding-response.ts)로 Voyage 테스트가
// 이미 고정하고 있으므로, 여기서는 OpenAI 경로가 그 검증을 실제로 통과하는지와
// OpenAI 고유 요청 파라미터를 확인한다.
describe("OpenAIEmbeddingAdapter", () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = originalEnv;
  });

  it("index 순서로 정렬해 반환한다", async () => {
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

    const result = await new OpenAIEmbeddingAdapter().embed(["첫번째", "두번째"]);

    expect(result).toEqual([dummyEmbedding(1), dummyEmbedding(2)]);
  });

  it("model과 dimensions(1024)를 요청에 싣고, input_type은 보내지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: dummyEmbedding(1), index: 0 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // OpenAI 임베딩은 대칭 — 포트 호출부(질의 경로)가 inputType "query"를 넘겨도
    // 요청에는 반영되지 않아야 한다(포트 인터페이스 경유 호출로 검증).
    const port: EmbeddingPort = new OpenAIEmbeddingAdapter();
    await port.embed(["텍스트"], { inputType: "query" });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.model).toBe("text-embedding-3-large");
    expect(requestBody.dimensions).toBe(1024);
    expect(requestBody.input_type).toBeUndefined();
  });

  it("응답 shape가 잘못되면(차원 불일치) 명확한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [1, 2, 3], index: 0 }] }),
      }),
    );

    await expect(new OpenAIEmbeddingAdapter().embed(["텍스트"])).rejects.toThrow(
      /응답 형식이 올바르지 않습니다/,
    );
  });

  it("HTTP 실패 시 상태 코드를 포함한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" }),
    );

    await expect(new OpenAIEmbeddingAdapter().embed(["텍스트"])).rejects.toThrow(/429/);
  });

  it("OPENAI_API_KEY가 없으면 에러를 던진다", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(new OpenAIEmbeddingAdapter().embed(["텍스트"])).rejects.toThrow(
      /OPENAI_API_KEY/,
    );
  });
});

describe("OpenAILLMAdapter", () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = originalEnv;
  });

  function completionResponse(message: Record<string, unknown>, finishReason = "stop") {
    return {
      ok: true,
      json: async () => ({ choices: [{ message, finish_reason: finishReason }] }),
    };
  }

  it("responseSchema가 있으면 구조화 모델 + strict json_schema로 요청한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completionResponse({ content: '{"ok":true}' }));
    vi.stubGlobal("fetch", fetchMock);

    const schema = { type: "object", properties: {}, additionalProperties: false };
    const result = await new OpenAILLMAdapter().generate({
      prompt: "구조화해줘",
      responseSchema: schema,
    });

    expect(result.text).toBe('{"ok":true}');
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.model).toBe("gpt-4.1-mini");
    expect(requestBody.temperature).toBe(0);
    expect(requestBody.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "structured_response", strict: true, schema },
    });
  });

  it("responseSchema가 없으면 일반 생성 모델로 요청하고 response_format을 보내지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse({ content: "답변" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAILLMAdapter().generate({ prompt: "질문" });

    expect(result.text).toBe("답변");
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.model).toBe("gpt-4.1");
    expect(requestBody.response_format).toBeUndefined();
  });

  it("모델이 응답을 거부하면(refusal) 명확한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(completionResponse({ refusal: "정책상 답변 불가" })),
    );

    await expect(new OpenAILLMAdapter().generate({ prompt: "질문" })).rejects.toThrow(
      /거부/,
    );
  });

  // 잘린 JSON이 파싱 단계까지 흘러가면 "유효한 JSON이 아닙니다"라는 불명확한
  // 에러로 드러난다 — 어댑터에서 원인(토큰 한도)을 명시해 막는다.
  it("finish_reason이 length면(토큰 한도 잘림) 명확한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(completionResponse({ content: '{"잘린' }, "length")),
    );

    await expect(new OpenAILLMAdapter().generate({ prompt: "질문" })).rejects.toThrow(
      /잘렸습니다/,
    );
  });

  it("content가 비어 있으면 명확한 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completionResponse({ content: "" })));

    await expect(new OpenAILLMAdapter().generate({ prompt: "질문" })).rejects.toThrow(
      /content가 없습니다/,
    );
  });

  it("HTTP 실패 시 상태 코드를 포함한 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "invalid key" }),
    );

    await expect(new OpenAILLMAdapter().generate({ prompt: "질문" })).rejects.toThrow(/401/);
  });

  it("OPENAI_API_KEY가 없으면 에러를 던진다", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(new OpenAILLMAdapter().generate({ prompt: "질문" })).rejects.toThrow(
      /OPENAI_API_KEY/,
    );
  });

  it("generateStream은 SSE 청크가 줄 경계와 어긋나게 쪼개져도 델타를 순서대로 합친다", async () => {
    const encoder = new TextEncoder();
    // 의도적으로 이벤트 중간에서 청크를 자른다(네트워크 청크 경계는 보장되지 않음).
    const sse =
      'data: {"choices":[{"delta":{"content":"안"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"녕"}}]}\n\n' +
      "data: [DONE]\n\n";
    const chunks = [sse.slice(0, 25), sse.slice(25, 60), sse.slice(60)].map((s) =>
      encoder.encode(s),
    );
    let i = 0;
    const reader = {
      read: async () =>
        i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined },
      releaseLock: () => {},
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, body: { getReader: () => reader } }),
    );

    const received: string[] = [];
    for await (const chunk of new OpenAILLMAdapter().generateStream({ prompt: "질문" })) {
      received.push(chunk.text);
    }

    expect(received.join("")).toBe("안녕");
  });
});
