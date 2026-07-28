import { OpenAIEmbeddingAdapter, OpenAILLMAdapter } from "./adapters/openai";
import type { EmbeddingPort, LLMPort } from "./ports";

// 2026-07-28 벤더 교체(사용자 결정): Anthropic+Voyage → OpenAI 단일 키(OPENAI_API_KEY).
// 기존 어댑터(anthropic.ts/voyage.ts)는 롤백 대비로 보존 — 여기 조립 지점만 바꾸면 복귀된다.
let llmPort: LLMPort | undefined;
let embeddingPort: EmbeddingPort | undefined;

export function getLLMPort(): LLMPort {
  if (!llmPort) {
    llmPort = new OpenAILLMAdapter();
  }
  return llmPort;
}

export function getEmbeddingPort(): EmbeddingPort {
  if (!embeddingPort) {
    embeddingPort = new OpenAIEmbeddingAdapter();
  }
  return embeddingPort;
}
