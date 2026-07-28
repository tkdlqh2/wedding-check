import { AnthropicLLMAdapter } from "./adapters/anthropic";
import { VoyageEmbeddingAdapter } from "./adapters/voyage";
import type { EmbeddingPort, LLMPort } from "./ports";

let llmPort: LLMPort | undefined;
let embeddingPort: EmbeddingPort | undefined;

export function getLLMPort(): LLMPort {
  if (!llmPort) {
    llmPort = new AnthropicLLMAdapter();
  }
  return llmPort;
}

export function getEmbeddingPort(): EmbeddingPort {
  if (!embeddingPort) {
    embeddingPort = new VoyageEmbeddingAdapter();
  }
  return embeddingPort;
}
