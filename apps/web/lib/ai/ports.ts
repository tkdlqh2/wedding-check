// AI 포트 인터페이스 — lib/services/*는 벤더 SDK를 직접 import하지 않고 반드시 이 포트를 거친다.
// (ARCHITECTURE-SPINE.md Design Paradigm / AD-1) 시그니처는 스파인 AD-1에서 고정.

export interface GenerateInput {
  prompt: string;
  /** JSON Schema. 지정하면 GenerateResult.text는 이 스키마를 만족하는 JSON 문자열이다. */
  responseSchema?: Record<string, unknown>;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  /** 근거로 쓰인 변수 케이스 ID (FR-6/7 전용 — FR-9 구조화 응답에는 항상 undefined) */
  variableCaseId?: string;
}

export interface GenerateChunk {
  text: string;
}

export interface LLMPort {
  generate(input: GenerateInput): Promise<GenerateResult>;
  generateStream(input: GenerateInput): AsyncIterable<GenerateChunk>;
}

export interface EmbeddingPort {
  embed(texts: string[]): Promise<number[][]>;
}
