import type {
  EmbeddingPort,
  GenerateChunk,
  GenerateInput,
  GenerateResult,
  LLMPort,
  TranscribeInput,
  TranscriptionPort,
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
// Story 6.1(FR-19): 음성 전사. 이 화면에서 말하는 건 "주례자가 순서를 갑자기
// 바꿨어요" 수준의 한 문장이라 최상위 모델이 필요하지 않고, 실행 화면에서는 지연이
// 곧 사용성이다(UX-DR19) — 더 빠르고 싼 mini 등급을 쓴다.
const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

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

// OpenAI 전사 API는 **파일명 확장자로 컨테이너를 판별한다** — MIME 타입만 맞고
// 확장자가 없거나 엉뚱하면 지원 형식인데도 400이 떨어진다. 그래서 브라우저가 관측한
// MIME을 벤더가 아는 확장자로 옮기는 표가 필요하다(벤더 고유 관심사 → 어댑터 소유).
//
// MediaRecorder가 실제로 내는 값: iOS/macOS Safari `audio/mp4`,
// Chrome/Edge `audio/webm;codecs=opus`, Firefox `audio/ogg;codecs=opus`.
// `;codecs=...` 파라미터는 벗겨내고 베이스 타입만 본다.
const TRANSCRIBE_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

export class OpenAITranscriptionAdapter implements TranscriptionPort {
  async transcribe(input: TranscribeInput): Promise<string> {
    const base = baseMimeType(input.mimeType);
    const extension = TRANSCRIBE_EXTENSIONS[base];
    if (!extension) {
      throw new Error(`지원하지 않는 오디오 형식입니다: ${base}`);
    }

    const form = new FormData();
    form.append("file", new Blob([input.audio], { type: base }), `audio.${extension}`);
    form.append("model", TRANSCRIBE_MODEL);
    if (input.language) {
      form.append("language", input.language);
    }

    // Content-Type을 직접 지정하지 않는다 — fetch가 FormData의 multipart 경계를
    // 스스로 붙여야 하고, 여기서 덮어쓰면 경계가 빠져 벤더가 본문을 못 읽는다.
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireApiKey()}` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`OpenAI 전사 API 실패: ${res.status} ${await res.text()}`);
    }

    // 다른 어댑터와 같은 이유로 응답 셰이프를 검증한다(Story 3.2 코덱스 1~4차):
    // 2xx인데 기대 형태가 아니면 조용히 빈 문자열로 흘러가 "말한 내용이 사라진"
    // 것처럼 보인다 — 원인이 드러나지 않는 실패가 예식 중에는 최악이다.
    const body: unknown = await res.json().catch(() => null);
    const text = (body as { text?: unknown } | null)?.text;
    if (typeof text !== "string") {
      throw new Error("OpenAI 전사 응답에 text가 없습니다");
    }
    return text;
  }
}
