// 임베딩 API 응답 검증 — Story 3.2 코덱스 리뷰 1~4라운드에서 확정된 계약을
// 벤더 어댑터(Voyage/OpenAI)가 공유한다. 응답 shape는 두 벤더가 동일하다
// (data: [{ embedding, index }]).
//
// 코덱스 리뷰: res.ok=true라도 응답 shape가 기대와 다를 수 있다(부분 실패 응답 등) —
// 검증 없이 body.data를 바로 쓰면 undefined 임베딩이 조용히 흘러가 이후
// ::vector 캐스팅에서야 불명확한 DB 에러로 드러난다. 여기서 명확한 에러로 막는다.
// 코덱스 리뷰 2라운드: 배열 길이만 보고 통과시키면 각 항목의 embedding이 빠진
// 응답이 여전히 통과했다 — 항목별로도 검증한다.
// 코덱스 리뷰 3라운드: "배열이고 원소가 숫자"만으로는 embedding: [] (빈 배열)도
// 통과했다 — 요청한 차원(1024)과 정확히 일치하는지 확인한다. 또한
// index 중복/누락(예: 두 항목이 같은 index:0)을 걸러내지 않으면 .sort() 이후
// 엉뚱한 텍스트에 엉뚱한 임베딩이 짝지어질 수 있었다 — index가 0..N-1의
// 유일한 값 집합인지도 확인한다("근거는 신성하다" — 변수 케이스 매칭 정확성 직결).

// variable_cases.embedding vector(1024)와 일치해야 한다 — 차원을 바꾸려면 마이그레이션 필요.
export const EXPECTED_DIMENSIONS = 1024;

export interface EmbeddingsResponseBody {
  data?: Array<{ embedding?: unknown; index?: unknown }>;
}

export function parseEmbeddingsResponse(
  body: EmbeddingsResponseBody,
  requestedCount: number,
  vendorName: string,
): number[][] {
  function isValidItem(
    d: { embedding?: unknown; index?: unknown },
  ): d is { embedding: number[]; index: number } {
    return (
      Array.isArray(d.embedding) &&
      d.embedding.length === EXPECTED_DIMENSIONS &&
      d.embedding.every((n) => typeof n === "number") &&
      typeof d.index === "number"
    );
  }

  const data = body.data;
  const indices = new Set(Array.isArray(data) ? data.map((d) => d.index) : []);
  if (
    !Array.isArray(data) ||
    data.length !== requestedCount ||
    !data.every(isValidItem) ||
    indices.size !== requestedCount ||
    !Array.from(indices).every((i) => typeof i === "number" && i >= 0 && i < requestedCount)
  ) {
    throw new Error(
      `${vendorName} 임베딩 API 응답 형식이 올바르지 않습니다(요청 ${requestedCount}건, 응답 ${data?.length ?? 0}건)`,
    );
  }
  return data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
