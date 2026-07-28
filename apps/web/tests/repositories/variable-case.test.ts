import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as feedbackRepo from "@/lib/db/repositories/feedback";
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

// variable_case는 confirmAndCreateVariableCase 단일 경로로만 생성된다(AD-8,
// Story 3.2 결정) — 테스트도 그 경로를 그대로 쓴다(직접 INSERT 우회 금지).
async function createConfirmedCase(
  hall: Hall,
  embedding: number[],
  fields: Partial<{ situation: string; rationale: string; outcome: string; stepName: string }> = {},
) {
  const step = await createTestTemplateItem(hall.id, {
    stepName: fields.stepName ?? "신랑입장",
    sortOrder: Math.floor(Math.random() * 1_000_000),
  });
  const { ceremonyId } = await ceremonyRepo.create(hall.id, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
  const created = await feedbackRepo.create({
    hallId: hall.id,
    ceremonyId,
    templateItemId: step.id,
    stepName: fields.stepName ?? "신랑입장",
    content: "원본 내용",
  });
  await feedbackRepo.updateStructuredFields(created.id, {
    situation: fields.situation ?? "상황 설명",
    outcome: fields.outcome ?? "well_handled",
    rationale: fields.rationale ?? "사후 판단",
    tags: ["태그1"],
  });
  const confirmed = await feedbackRepo.confirmAndCreateVariableCase(created.id, embedding);
  if (!confirmed) throw new Error("테스트 셋업 실패: 확정되지 않음");
  const [row] = await db
    .select()
    .from(variableCases)
    .where(eq(variableCases.feedbackId, created.id));
  return row;
}

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
