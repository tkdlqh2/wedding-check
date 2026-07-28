import type {
  EmbeddingPort,
  GenerateChunk,
  GenerateInput,
  GenerateResult,
  LLMPort,
} from "../ports";
import { EXPECTED_DIMENSIONS, parseEmbeddingsResponse } from "./embedding-response";

// 2026-07-28 벤더 교체(사용자 결정): Anthropic(구조화)+Voyage(임베딩) → OpenAI 단일 키.
// AD-1 포트 경계 내 교체 — lib/services/*는 무수정. Voyage 어댑터와 같은 이유로
// 벤더 SDK 대신 fetch를 쓴다(의존성 추가 없음, 응답 검증을 직접 통제).
const GENERATE_MODEL = "gpt-4.1";
// FR-9 구조화는 temperature 0 결정성(NFR-1)이 필요하므로 reasoning 계열(gpt-5*,
// temperature 미지원)이 아닌 gpt-4.1-mini를 쓴다(claude-haiku-4-5 대응 등급).
const STRUCTURE_MODEL = "gpt-4.1-mini";
const EMBEDDING_MODEL = "text-embedding-3-large";

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다");
  }
  return key;
}

interface ChatCompletionBody {
  choices?: Array<{
    message?: { content?: unknown; refusal?: unknown };
    finish_reason?: unknown;
  }>;
}

function extractText(body: ChatCompletionBody): string {
  const choice = body.choices?.[0];
  if (!choice) {
    throw new Error("OpenAI 응답에 choices가 없습니다");
  }
  // structured outputs는 모델이 응답을 거부하면 content 대신 refusal을 채운다 —
  // 조용히 빈 텍스트로 흘리지 않고 명확한 에러로 드러낸다.
  if (typeof choice.message?.refusal === "string" && choice.message.refusal) {
    throw new Error(`OpenAI가 응답을 거부했습니다: ${choice.message.refusal}`);
  }
  // finish_reason "length"는 max 토큰에서 잘린 응답 — 잘린 JSON이 파싱 단계까지
  // 흘러가면 원인이 불명확해지므로 여기서 막는다.
  if (choice.finish_reason === "length") {
    throw new Error("OpenAI 응답이 최대 토큰 한도에서 잘렸습니다");
  }
  if (typeof choice.message?.content !== "string" || !choice.message.content) {
    throw new Error("OpenAI 응답에 content가 없습니다");
  }
  return choice.message.content;
}

function buildRequestBody(input: GenerateInput, stream: boolean): Record<string, unknown> {
  return {
    model: input.responseSchema ? STRUCTURE_MODEL : GENERATE_MODEL,
    max_completion_tokens: 1024,
    temperature: input.temperature ?? 0,
    messages: [{ role: "user", content: input.prompt }],
    ...(stream ? { stream: true } : {}),
    ...(input.responseSchema
      ? {
          response_format: {
            type: "json_schema" as const,
            json_schema: {
              name: "structured_response",
              strict: true,
              schema: input.responseSchema,
            },
          },
        }
      : {}),
  };
}

async function postChatCompletions(body: Record<string, unknown>): Promise<Response> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenAI chat completions API 실패: ${res.status} ${await res.text()}`);
  }
  return res;
}

export class OpenAILLMAdapter implements LLMPort {
  async generate(input: GenerateInput): Promise<GenerateResult> {
    const res = await postChatCompletions(buildRequestBody(input, false));
    return { text: extractText((await res.json()) as ChatCompletionBody) };
  }

  async *generateStream(input: GenerateInput): AsyncIterable<GenerateChunk> {
    const res = await postChatCompletions(buildRequestBody(input, true));
    if (!res.body) {
      throw new Error("OpenAI 스트리밍 응답에 body가 없습니다");
    }

    // SSE 파싱: "data: {json}\n\n" 이벤트 스트림, 종료 신호는 "data: [DONE]".
    // 청크가 이벤트 경계와 어긋나게 쪼개질 수 있으므로 버퍼에 이어 붙여 완성된
    // 줄만 처리한다.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice("data: ".length);
          if (payload === "[DONE]") return;
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: unknown } }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (typeof content === "string" && content) {
            yield { text: content };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export class OpenAIEmbeddingAdapter implements EmbeddingPort {
  // OpenAI 임베딩은 대칭(질의/문서가 같은 벡터 공간) — Voyage의 input_type 같은
  // 비대칭 옵션이 없어 EmbedOptions.inputType은 요청에 반영되지 않는다(파라미터
  // 자체를 받지 않아도 EmbeddingPort 구현으로 유효). 질의와 문서가 같은 모델·같은
  // 공간에서 임베딩되므로 검색 자체는 성립한다.
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        // text-embedding-3-*는 Matryoshka 축소를 지원한다 — variable_cases 컬럼
        // vector(1024)와 일치하도록 1024로 요청(스키마 변경 없이 벤더 교체).
        dimensions: EXPECTED_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI 임베딩 API 실패: ${res.status} ${await res.text()}`);
    }

    return parseEmbeddingsResponse(await res.json(), texts.length, "OpenAI");
  }
}
