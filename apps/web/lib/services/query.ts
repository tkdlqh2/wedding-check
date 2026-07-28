import * as variableCaseRepo from "../db/repositories/variable-case";
import type { VariableCaseMatch } from "../db/repositories/variable-case";
import { getEmbeddingPort } from "../ai";

export class QueryValidationError extends Error {}

export type QueryMatch = VariableCaseMatch;

export interface QueryResult {
  matches: QueryMatch[];
  /**
   * 임계값 필터 **이전**의 최고 유사도(확정 케이스가 0건이면 null).
   * 관측성 전용(AD-10) — 임계값 재보정의 유일한 계측 근거이며, 클라이언트 응답
   * 바디에는 포함하지 않는다(라우트 참고).
   */
  topSimilarity: number | null;
}

// 3.4 AC("유사도 상위 3건까지 노출" [ASSUMPTION])와 정합하는 상한.
const MAX_MATCHES = 3;

// Story 3.4(FR-7, NFR-7, SM-2): "관련 있는 케이스가 하나도 없음"을 판정하는 유일한
// 기준. pgvector 검색은 코퍼스에 행이 있으면 항상 상위 N건을 반환하므로, 이 임계값이
// 없으면 "무관한 사례를 근거처럼 제시하지 않는다"는 안전장치가 구조적으로 성립하지
// 않는다.
//
// 값의 근거 [ASSUMPTION] — 현 임베딩 벤더는 OpenAI text-embedding-3-large(1024차원):
//  1. text-embedding-3-* 는 ada-002와 달리 무관한 텍스트 쌍의 코사인 유사도가 낮게
//     퍼진다(무관 쌍 평균 ≈0.43, 일반 코퍼스 실무 기준선으로 0.45가 자주 인용됨).
//  2. 그런데 우리 코퍼스는 전부 웨딩홀 예식 운영 텍스트라 도메인이 좁다 — 서로 무관한
//     두 변수 케이스도 일반 코퍼스의 무관 쌍보다 높게 나온다. 기준선보다 보수적으로
//     올려 잡아야 SM-2(무관 사례 0%)를 지킬 수 있다.
//  3. 두 실패 모드의 비용이 비대칭이다. 거짓 양성(무관한 사례를 근거로 제시)은 PRD
//     §6 Safety가 지목한 실제 사고 경로이고, 거짓 음성("없음")은 "선임에게 연락하세요"
//     라는 유효한 다음 행동이 있는 설계된 안전한 실패다 — 의심스러우면 높은 쪽.
//
// 환경변수로 덮어쓰지 않는다: 설정 한 줄로 안전 게이트가 꺼지는 경로를 만들지 않고,
// NFR-1(동일 질의 → 동일 결과)도 상수여야 보장된다. 실키 확보 후 SM-2 검수 세트와
// query_no_match 로그의 topSimilarity 분포로 재보정할 것(deferred-work.md).
export const MIN_SIMILARITY = 0.5;

// FR-6 질의는 한두 문장이다 — 피드백 본문(자유 서술)이 아니므로 상한을 둔다
// ([ASSUMPTION], 스토리 Task 3). 임베딩 API 비용/지연 방어를 겸한다.
const MAX_QUERY_LENGTH = 500;

// Story 3.3(FR-6): 실행 중 자연어 상황 질의 — 질의 텍스트를 임베딩(input_type
// "query", 비대칭 검색)해 확정된 변수 케이스 전체(AD-6 사업체 범위)에서 유사도
// 상위 케이스를 찾는다.
//
// LLM 생성은 사용하지 않는다([ASSUMPTION], 스토리 Dev Notes "LLM 미사용 결정"):
// AC가 요구하는 것은 저장된 케이스의 매칭·표시이지 생성 요약이 아니며, 생성이
// 없어야 NFR-1(결정성)·NFR-2(p95 5초)·SM-2(무관 사례 0%)가 구조적으로 지켜진다.
export async function queryVariableCases(text: string): Promise<QueryResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new QueryValidationError("상황을 입력하세요");
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    throw new QueryValidationError(`질의는 ${MAX_QUERY_LENGTH}자 이내로 입력하세요`);
  }

  const [embedding] = await getEmbeddingPort().embed([trimmed], { inputType: "query" });
  const candidates = await variableCaseRepo.searchBySimilarity(embedding, MAX_MATCHES);

  // 상위 MAX_MATCHES건을 먼저 자른 뒤 필터해도 결과는 정확하다: 정렬이 distance
  // 오름차순(= similarity 내림차순)이고 필터 술어가 distance에 단조이므로
  // filter(top N) === top N(filter)다. over-fetch로 바꿀 이유가 없다.
  return {
    matches: candidates.filter((c) => c.similarity >= MIN_SIMILARITY),
    topSimilarity: candidates.length > 0 ? candidates[0].similarity : null,
  };
}
