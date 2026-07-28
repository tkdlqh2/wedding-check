import * as variableCaseRepo from "../db/repositories/variable-case";
import type { VariableCaseMatch } from "../db/repositories/variable-case";
import { getEmbeddingPort } from "../ai";

export class QueryValidationError extends Error {}

export type QueryMatch = VariableCaseMatch;

// 3.4 AC("유사도 상위 3건까지 노출" [ASSUMPTION])와 정합하는 상한 — 3.4는 이 결과에
// 임계값 필터("관련 사례 없음" 판단)만 얹는다.
const MAX_MATCHES = 3;

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
export async function queryVariableCases(text: string): Promise<QueryMatch[]> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new QueryValidationError("상황을 입력하세요");
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    throw new QueryValidationError(`질의는 ${MAX_QUERY_LENGTH}자 이내로 입력하세요`);
  }

  const [embedding] = await getEmbeddingPort().embed([trimmed], { inputType: "query" });
  return variableCaseRepo.searchBySimilarity(embedding, MAX_MATCHES);
}
