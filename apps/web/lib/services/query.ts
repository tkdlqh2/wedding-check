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
// 값의 근거 — 현 벤더(OpenAI text-embedding-3-large, 1024차원)로 실제 임베딩을
// 호출해 측정한 값이다(2026-07-28, 웨딩홀 도메인 문서 3건 × 질의 8건):
//
//   관련 질의   0.500 ~ 0.674   (표현이 다르지만 어휘·주제가 겹치는 경우)
//   무관 질의   0.183 ~ 0.366   (부케/주차/하객수 등 같은 도메인의 다른 상황 포함)
//
// 두 구간 사이가 비어 있고, 그 중간인 0.42를 취한다 — 무관 최댓값(0.366)에서 +0.054,
// 관련 최솟값(0.500)에서 -0.08의 여유. 처음에 문헌 기준선만 보고 0.5로 잡았더니
// 진짜 매칭 하나가 0.5007로 0.0005 차이로 통과해, 표현이 조금만 달라져도 "관련 사례
// 없음"으로 뒤집히는 취약한 지점이었다.
//
// 두 실패 모드의 비용은 여전히 비대칭이다 — 거짓 양성(무관한 사례를 근거로 제시)은
// PRD §6 Safety가 지목한 실제 사고 경로이고, 거짓 음성("없음")은 "선임에게 연락하세요"
// 라는 유효한 다음 행동이 있는 설계된 안전한 실패다. 그래서 두 구간의 정중앙(0.43)이
// 아니라 무관 쪽에서 조금 더 떨어진 값을 쓴다.
//
// [알려진 한계] PRD가 NFR-4 예시로 든 "주례자가 순서를 바꿈" ≒ "목사님이 애드리브함"
// 쌍은 실측 0.277로, 무관 질의(주차 0.366)보다도 낮다 — 어휘가 완전히 어긋나는 동의
// 관계는 임베딩 검색만으로는 어떤 임계값에서도 무관 사례를 함께 들이지 않고는 잡을 수
// 없다. 이 한계는 deferred-work.md에 기록했다(하이브리드 검색/동의어 확장 후보).
//
// 환경변수로 덮어쓰지 않는다: 설정 한 줄로 안전 게이트가 꺼지는 경로를 만들지 않고,
// NFR-1(동일 질의 → 동일 결과)도 상수여야 보장된다. 실제 피드백이 쌓이면 SM-2 검수
// 세트와 query_no_match 로그의 topSimilarity 분포로 재보정할 것.
export const MIN_SIMILARITY = 0.42;

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
