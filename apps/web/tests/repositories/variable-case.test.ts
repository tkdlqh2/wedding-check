import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb,
  createTestHall,
  createConfirmedVariableCase,
} from "../helpers/db";
import * as variableCaseRepo from "@/lib/db/repositories/variable-case";
import { db } from "@/lib/db";
import { variableCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// 통제된 1024차원 임베딩 — i번째 축의 단위 벡터. 코사인 거리: 같은 축 = 0,
// 직교 축 = 1. 실제 Voyage 임베딩 없이 pgvector 검색의 정렬/조인/limit을
// 결정적으로 검증한다(Story 3.2 테스트 전략과 동일 — 더미 임베딩으로 충분).
function unitVector(axis: number, scale = 1): number[] {
  const v = Array.from({ length: 1024 }, () => 0);
  v[axis] = scale;
  return v;
}

// 두 축을 섞은 벡터 — axis 축과의 코사인 거리가 0과 1 사이에 온다.
function mixedVector(mainAxis: number, otherAxis: number, mainWeight: number): number[] {
  const v = Array.from({ length: 1024 }, () => 0);
  v[mainAxis] = mainWeight;
  v[otherAxis] = Math.sqrt(1 - mainWeight * mainWeight);
  return v;
}

type Hall = Awaited<ReturnType<typeof createTestHall>>;

// Story 4.1: 케이스 생성 헬퍼는 tests/helpers/db.ts로 옮겨 insight 테스트와 공유한다
// (AD-8대로 confirmAndCreateVariableCase 단일 경로를 쓰는 것은 그대로). 여기서는
// 기존 호출부의 hall 객체 시그니처만 유지하는 얇은 래퍼로 남긴다.
const createConfirmedCase = (
  hall: Hall,
  embedding: number[],
  fields: Partial<{
    situation: string;
    rationale: string;
    outcome: string;
    stepName: string;
  }> = {},
) => createConfirmedVariableCase(hall.id, embedding, fields);

describe("variableCaseRepo.searchBySimilarity", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("코사인 유사도가 높은 순으로 정렬해 반환한다 (AC 1/2)", async () => {
    const hall = await createTestHall();
    const far = await createConfirmedCase(hall, unitVector(1), { situation: "무관한 상황" });
    const near = await createConfirmedCase(hall, mixedVector(0, 1, 0.95), {
      situation: "비슷한 상황",
    });
    const exact = await createConfirmedCase(hall, unitVector(0), { situation: "같은 상황" });

    const results = await variableCaseRepo.searchBySimilarity(unitVector(0), 3);

    expect(results.map((r) => r.id)).toEqual([exact.id, near.id, far.id]);
    expect(results[0].similarity).toBeCloseTo(1, 5);
    expect(results[1].similarity).toBeCloseTo(0.95, 5);
    expect(results[2].similarity).toBeCloseTo(0, 5);
  });

  it("limit을 초과하는 결과는 잘라낸다", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, unitVector(0));
    await createConfirmedCase(hall, unitVector(1));
    await createConfirmedCase(hall, unitVector(2));
    await createConfirmedCase(hall, unitVector(3));

    const results = await variableCaseRepo.searchBySimilarity(unitVector(0), 3);

    expect(results).toHaveLength(3);
  });

  it("홀 필터 없이 사업체 전체 케이스를 검색하고 발생 홀 이름을 태그로 붙인다 (AD-6)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const caseA = await createConfirmedCase(hallA, unitVector(0));
    const caseB = await createConfirmedCase(hallB, mixedVector(0, 1, 0.9));

    const results = await variableCaseRepo.searchBySimilarity(unitVector(0), 3);

    expect(results.map((r) => r.id)).toEqual([caseA.id, caseB.id]);
    expect(results[0].hallName).toBe("A홀");
    expect(results[1].hallName).toBe("B홀");
  });

  // NFR-1: 거리가 완전히 같은 행들 사이에서도 순서가 실행마다 흔들리면 안 된다 —
  // created_at DESC, id ASC 고정 tie-break를 검증한다.
  it("거리가 같으면 created_at DESC, id ASC로 결정적으로 정렬한다 (NFR-1)", async () => {
    const hall = await createTestHall();
    const first = await createConfirmedCase(hall, unitVector(0));
    const second = await createConfirmedCase(hall, unitVector(0));
    const sameTimestamp = new Date("2026-08-01T00:00:00.000Z");
    await db.update(variableCases).set({ createdAt: sameTimestamp });

    const expectedOrder = [first.id, second.id].sort();
    for (let i = 0; i < 3; i++) {
      const results = await variableCaseRepo.searchBySimilarity(unitVector(0), 3);
      expect(results.map((r) => r.id)).toEqual(expectedOrder);
    }
  });

  it("케이스가 없으면 빈 배열을 반환한다", async () => {
    const results = await variableCaseRepo.searchBySimilarity(unitVector(0), 3);
    expect(results).toEqual([]);
  });

  it("검색 결과에 표시용 필드가 모두 포함된다", async () => {
    const hall = await createTestHall({ name: "그랜드홀" });
    await createConfirmedCase(hall, unitVector(0), {
      situation: "주례자가 순서를 바꿈",
      rationale: "미리 큐시트를 재확인해야 함",
      outcome: "mishandled",
      stepName: "주례사",
    });

    const [result] = await variableCaseRepo.searchBySimilarity(unitVector(0), 1);

    expect(result.stepName).toBe("주례사");
    expect(result.situation).toBe("주례자가 순서를 바꿈");
    expect(result.rationale).toBe("미리 큐시트를 재확인해야 함");
    expect(result.outcome).toBe("mishandled");
    expect(result.tags).toEqual(["태그1"]);
    expect(result.hallName).toBe("그랜드홀");
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});

// ─── Story 4.1(FR-10) 클러스터링 입력 ────────────────────────────────────────

describe("variableCaseRepo.listSimilarPairs", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("임계값 이상인 쌍만 반환한다", async () => {
    const hall = await createTestHall();
    const a = await createConfirmedCase(hall, unitVector(0));
    // a와 유사도 0.95 — 임계값 위
    const near = await createConfirmedCase(hall, mixedVector(0, 1, 0.95));
    // a와 직교(유사도 0) — 임계값 아래
    await createConfirmedCase(hall, unitVector(2));

    const pairs = await variableCaseRepo.listSimilarPairs(0.9);

    expect(pairs).toHaveLength(1);
    expect([pairs[0].aId, pairs[0].bId].sort()).toEqual([a.id, near.id].sort());
  });

  // a.id < b.id 조건이 각 쌍을 정확히 한 번만 내려보내고 자기 자신과의 비교도 제거한다.
  it("각 쌍은 한 번만 나오고 자기 자신과 짝지어지지 않는다", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, unitVector(0));
    await createConfirmedCase(hall, unitVector(0));
    await createConfirmedCase(hall, unitVector(0));

    const pairs = await variableCaseRepo.listSimilarPairs(0.9);

    // 동일 벡터 3건이면 서로 다른 쌍은 3개(3C2)뿐이어야 한다.
    expect(pairs).toHaveLength(3);
    for (const { aId, bId } of pairs) {
      expect(aId).not.toBe(bId);
      expect(aId < bId).toBe(true);
    }
  });

  it("케이스가 1건뿐이면 빈 배열을 반환한다", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, unitVector(0));

    expect(await variableCaseRepo.listSimilarPairs(0.5)).toEqual([]);
  });

  it("케이스가 없으면 빈 배열을 반환한다", async () => {
    expect(await variableCaseRepo.listSimilarPairs(0.5)).toEqual([]);
  });

  // AD-6: 클러스터링도 검색과 동일하게 홀 무관 사업체 전체 범위다.
  it("서로 다른 홀의 케이스도 짝지어진다 (AD-6)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    await createConfirmedCase(hallA, unitVector(0));
    await createConfirmedCase(hallB, unitVector(0));

    expect(await variableCaseRepo.listSimilarPairs(0.9)).toHaveLength(1);
  });
});

describe("variableCaseRepo.listAllForClustering / listByIds / countCases", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("클러스터링 대상을 created_at ASC, id ASC로 반환한다 (NFR-1 관례)", async () => {
    const hall = await createTestHall({ name: "그랜드홀" });
    const first = await createConfirmedCase(hall, unitVector(0), { stepName: "주례사" });
    const second = await createConfirmedCase(hall, unitVector(1));
    await db.update(variableCases).set({ createdAt: new Date("2026-08-01T00:00:00.000Z") });

    const rows = await variableCaseRepo.listAllForClustering();

    expect(rows.map((r) => r.id)).toEqual([first.id, second.id].sort());
    expect(rows[0].hallName).toBe("그랜드홀");
    expect(rows.some((r) => r.stepName === "주례사")).toBe(true);
  });

  it("listByIds는 요청한 케이스만 돌려주고 없는 id는 조용히 건너뛴다", async () => {
    const hall = await createTestHall();
    const a = await createConfirmedCase(hall, unitVector(0), { situation: "축가 MR 지연" });
    await createConfirmedCase(hall, unitVector(1));

    const rows = await variableCaseRepo.listByIds([
      a.id,
      "00000000-0000-4000-8000-000000000000",
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].situation).toBe("축가 MR 지연");
  });

  it("listByIds는 빈 배열 입력에 쿼리 없이 빈 배열을 반환한다", async () => {
    expect(await variableCaseRepo.listByIds([])).toEqual([]);
  });

  it("countCases는 전체와 기간 필터를 모두 센다", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, unitVector(0));
    const old = await createConfirmedCase(hall, unitVector(1));
    await db
      .update(variableCases)
      .set({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
      .where(eq(variableCases.id, old.id));

    expect(await variableCaseRepo.countCases()).toBe(2);
    expect(await variableCaseRepo.countCases(new Date("2026-01-01T00:00:00.000Z"))).toBe(1);
  });
});
