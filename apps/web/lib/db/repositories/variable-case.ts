import { asc, cosineDistance, desc, eq } from "drizzle-orm";
import { db } from "../index";
import { halls, variableCases } from "../schema";

// Story 3.3(FR-6): 확정된 변수 케이스에 대한 pgvector 유사도 검색 — 읽기 전용
// 리포지토리다. 쓰기(생성) 함수를 여기에 추가하는 것은 금지: variable_case 생성은
// feedbackRepo.confirmAndCreateVariableCase() 단일 경로뿐이다(AD-8 우회 경로 방지,
// Story 3.2 Task 6 결정).
//
// AD-6: 검색은 홀 필터 없이 사업체 전체 범위 — halls JOIN은 격리 조건이 아니라
// 발생 홀 이름을 표시용 태그로 함께 내려주기 위한 것이다.

export interface VariableCaseMatch {
  id: string;
  stepName: string;
  situation: string;
  outcome: string;
  rationale: string;
  tags: string[];
  hallName: string;
  /** 1 - cosine distance. 유사도 임계값 판단("관련 사례 없음")은 Story 3.4 범위. */
  similarity: number;
  createdAt: Date;
}

// NFR-1(동일 질의 → 동일 결과): 거리가 같은 행이 있어도 실행마다 순서가 흔들리지
// 않도록 created_at DESC, id ASC로 tie-break를 고정한다. ANN 인덱스(ivfflat/hnsw)는
// 두지 않는다 — 파일럿 규모에서 정확 검색이 충분히 빠르고, 근사 검색은 결정성을
// 해친다(스토리 Dev Notes, 데이터 수천 건 이상이면 재검토).
export async function searchBySimilarity(
  embedding: number[],
  limit: number,
): Promise<VariableCaseMatch[]> {
  const distance = cosineDistance(variableCases.embedding, embedding);
  const rows = await db
    .select({
      id: variableCases.id,
      stepName: variableCases.stepName,
      situation: variableCases.situation,
      outcome: variableCases.outcome,
      rationale: variableCases.rationale,
      tags: variableCases.tags,
      hallName: halls.name,
      distance,
      createdAt: variableCases.createdAt,
    })
    .from(variableCases)
    .innerJoin(halls, eq(halls.id, variableCases.hallId))
    .orderBy(asc(distance), desc(variableCases.createdAt), asc(variableCases.id))
    .limit(limit);

  return rows.map(({ distance, ...rest }) => ({
    ...rest,
    similarity: 1 - Number(distance),
  }));
}
