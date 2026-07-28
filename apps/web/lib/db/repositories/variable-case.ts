import { and, asc, cosineDistance, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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

// ─────────────────────────────────────────────────────────────────────────────
// Story 4.1(FR-10): 클러스터링 입력. 위와 마찬가지로 **읽기 전용**이다.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClusteringCase {
  id: string;
  stepName: string;
  situation: string;
  rationale: string;
  hallId: string;
  hallName: string;
  createdAt: Date;
}

// 임베딩 컬럼은 select하지 않는다 — 1024차원 벡터 N개를 앱으로 실어올 이유가 없다.
// 벡터가 필요한 유일한 계산(쌍 유사도)은 listSimilarPairs가 DB 안에서 끝낸다.
export async function listAllForClustering(): Promise<ClusteringCase[]> {
  return db
    .select({
      id: variableCases.id,
      stepName: variableCases.stepName,
      situation: variableCases.situation,
      rationale: variableCases.rationale,
      hallId: variableCases.hallId,
      hallName: halls.name,
      createdAt: variableCases.createdAt,
    })
    .from(variableCases)
    .innerJoin(halls, eq(halls.id, variableCases.hallId))
    .orderBy(asc(variableCases.createdAt), asc(variableCases.id));
}

/**
 * 유사도가 `minSimilarity` 이상인 케이스 쌍(= 클러스터링 그래프의 엣지).
 *
 * `a.id < b.id` 조건이 각 쌍을 정확히 한 번만 내려보내고 자기 자신과의 비교도 제거한다.
 * 임계값을 넘는 쌍만 반환하므로 결과가 희소하다 — 전체 N²이 앱으로 오지 않는다.
 * ANN 인덱스는 쓰지 않는다(searchBySimilarity와 동일한 이유 — 근사 검색은 결정성을 해친다).
 */
export async function listSimilarPairs(
  minSimilarity: number,
): Promise<{ aId: string; bId: string }[]> {
  const a = alias(variableCases, "a");
  const b = alias(variableCases, "b");
  const maxDistance = 1 - minSimilarity;

  return db
    .select({ aId: a.id, bId: b.id })
    .from(a)
    .innerJoin(
      b,
      and(
        sql`${a.id} < ${b.id}`,
        sql`(${a.embedding} <=> ${b.embedding}) <= ${maxDistance}`,
      ),
    )
    // 출력 순서는 union-find 결과에 영향을 주지 않지만, 테스트 재현성과 NFR-1 관례상 고정한다.
    .orderBy(asc(a.id), asc(b.id));
}

export interface EvidenceCase {
  id: string;
  stepName: string;
  situation: string;
  outcome: string;
  rationale: string;
  hallId: string;
  hallName: string;
  createdAt: Date;
}

/** 클러스터의 근거 목록(AC 4) 조회. 존재하지 않는 id는 결과에서 빠질 뿐 오류가 아니다. */
export async function listByIds(ids: string[]): Promise<EvidenceCase[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: variableCases.id,
      stepName: variableCases.stepName,
      situation: variableCases.situation,
      outcome: variableCases.outcome,
      rationale: variableCases.rationale,
      hallId: variableCases.hallId,
      hallName: halls.name,
      createdAt: variableCases.createdAt,
    })
    .from(variableCases)
    .innerJoin(halls, eq(halls.id, variableCases.hallId))
    .where(inArray(variableCases.id, ids))
    .orderBy(asc(variableCases.createdAt), asc(variableCases.id));
}

/** 통계 카드용. `since`를 주면 그 시각 이후 생성분만 센다. */
export async function countCases(since?: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(variableCases)
    .where(since ? sql`${variableCases.createdAt} >= ${since}` : undefined);
  return rows[0]?.count ?? 0;
}
