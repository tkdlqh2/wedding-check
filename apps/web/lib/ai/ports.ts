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

// Story 6.1(FR-19): 음성 → 텍스트. LLMPort/EmbeddingPort와 같은 이유로 포트를
// 둔다(AD-1, NFR-6) — lib/services/*는 벤더 엔드포인트도 멀티파트 형식도 모른다.
export interface TranscribeInput {
  /** 브라우저가 녹음한 오디오. 컨테이너/코덱은 기기마다 다르다(아래 mimeType). */
  audio: ArrayBuffer;
  /**
   * 녹음 시 실제로 쓰인 MIME 타입. iOS Safari는 `audio/mp4`, Chrome/Firefox는
   * `audio/webm;codecs=opus`를 낸다 — 벤더가 컨테이너를 형식 이름으로 판별하므로
   * 클라이언트가 관측한 값을 그대로 전달해야 한다(추측해서 붙이면 안 된다).
   */
  mimeType: string;
  /** BCP-47 언어 코드. 생략 시 벤더 자동 판별. */
  language?: string;
}

export interface TranscriptionPort {
  /** 전사된 텍스트. 인식된 말이 없으면 빈 문자열일 수 있다(호출자가 판단). */
  transcribe(input: TranscribeInput): Promise<string>;
}
