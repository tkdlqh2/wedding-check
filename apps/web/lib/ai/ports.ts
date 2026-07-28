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

// Story 3.3: 비대칭 검색(문서는 "document", 검색 질의는 "query"로 임베딩)을 위한
// 선택 옵션 — 스파인 AD-1 확정 시그니처의 하위호환 확장이다(기존 호출부 무수정).
// query/document 구분은 Voyage 전용 개념이 아니라 임베딩 검색 일반 개념이므로
// 포트 경계를 깨지 않는다. 생략 시 어댑터가 "document"로 동작한다.
export interface EmbedOptions {
  inputType?: "document" | "query";
}

export interface EmbeddingPort {
  embed(texts: string[], options?: EmbedOptions): Promise<number[][]>;
}
