// AI 포트 인터페이스 — lib/services/*는 벤더 SDK를 직접 import하지 않고 반드시 이 포트를 거친다.
// (ARCHITECTURE-SPINE.md Design Paradigm / AD-1) 실제 구현은 lib/ai/adapters/*에서 Story 3.x부터 채워진다.

export interface LLMPort {
  generate(prompt: string): Promise<string>;
}

export interface EmbeddingPort {
  embed(text: string): Promise<number[]>;
}
