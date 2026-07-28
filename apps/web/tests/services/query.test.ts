import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as feedbackRepo from "@/lib/db/repositories/feedback";

// Story 3.3: 임베딩은 실제 벤더(Voyage)를 호출하지 않고 가짜 포트를 주입한다
// (Story 3.2 확립 패턴 — 조립 지점 @/lib/ai만 모킹). 텍스트→벡터 매핑을 우리가
// 통제하므로 "표현이 달라도 같은 케이스 매칭"(AC 2)을 결정적으로 재현할 수 있다.
const embedMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  getLLMPort: () => ({ generate: vi.fn(), generateStream: vi.fn() }),
  getEmbeddingPort: () => ({ embed: embedMock }),
}));

import { queryVariableCases, QueryValidationError, MIN_SIMILARITY } from "@/lib/services/query";

function unitVector(axis: number, scale = 1): number[] {
  const v = Array.from({ length: 1024 }, () => 0);
  v[axis] = scale;
  return v;
}

function mixedVector(mainAxis: number, otherAxis: number, mainWeight: number): number[] {
  const v = Array.from({ length: 1024 }, () => 0);
  v[mainAxis] = mainWeight;
  v[otherAxis] = Math.sqrt(1 - mainWeight * mainWeight);
  return v;
}

type Hall = Awaited<ReturnType<typeof createTestHall>>;

async function createConfirmedCase(
  hall: Hall,
  embedding: number[],
  situation: string,
  sortOrder: number,
) {
  const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장", sortOrder });
  const { ceremonyId } = await ceremonyRepo.create(hall.id, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
  const created = await feedbackRepo.create({
    hallId: hall.id,
    ceremonyId,
    templateItemId: step.id,
    stepName: "신랑입장",
    content: situation,
  });
  await feedbackRepo.updateStructuredFields(created.id, {
    situation,
    outcome: "well_handled",
    rationale: "사후 판단",
    tags: ["태그"],
  });
  const confirmed = await feedbackRepo.confirmAndCreateVariableCase(created.id, embedding);
  if (!confirmed) throw new Error("테스트 셋업 실패");
  return created.id;
}

describe("queryVariableCases (FR-6)", () => {
  beforeEach(async () => {
    await resetDb();
    embedMock.mockReset();
  });

  it("표현이 다른 두 질의가 같은 변수 케이스에 매칭된다 (AC 2, NFR-4)", async () => {
    const hall = await createTestHall();
    const officiantFeedbackId = await createConfirmedCase(
      hall,
      unitVector(0),
      "주례자가 예고 없이 순서를 바꿈",
      1,
    );
    await createConfirmedCase(hall, unitVector(1), "축가 반주가 늦게 나옴", 2);

    // 가짜 임베딩: 표현이 다른 두 질의를 서로 다르지만 둘 다 0축(주례 케이스)에
    // 가장 가까운 벡터로 매핑 — 의미 기반 매칭을 결정적으로 시뮬레이션한다.
    embedMock.mockImplementation(async (texts: string[]) =>
      texts.map((t) =>
        t.includes("주례자가 순서를 바꿈")
          ? mixedVector(0, 1, 0.97)
          : t.includes("목사님이 애드리브함")
            ? mixedVector(0, 1, 0.9)
            : unitVector(2),
      ),
    );

    const first = await queryVariableCases("주례자가 순서를 바꿈");
    const second = await queryVariableCases("목사님이 애드리브함");

    expect(first.matches.length).toBeGreaterThan(0);
    expect(second.matches.length).toBeGreaterThan(0);
    expect(first.matches[0].situation).toBe("주례자가 예고 없이 순서를 바꿈");
    expect(second.matches[0].situation).toBe("주례자가 예고 없이 순서를 바꿈");
    expect(first.matches[0].id).toBe(second.matches[0].id);
    // 셋업 무결성: 매칭된 케이스가 실제로 주례 피드백에서 생성된 것인지 확인.
    expect(officiantFeedbackId).toBeTruthy();
  });

  it("동일 질의를 재실행하면 동일한 결과를 반환한다 (AC 4, NFR-1)", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, unitVector(0), "케이스 A", 1);
    await createConfirmedCase(hall, mixedVector(0, 1, 0.8), "케이스 B", 2);
    embedMock.mockResolvedValue([mixedVector(0, 1, 0.99)]);

    const first = await queryVariableCases("주례자가 순서를 바꿈");
    const second = await queryVariableCases("주례자가 순서를 바꿈");

    expect(second).toEqual(first);
  });

  it("질의 임베딩은 inputType 'query'로 요청한다 (비대칭 검색)", async () => {
    embedMock.mockResolvedValue([unitVector(0)]);

    await queryVariableCases("  주례자가 순서를 바꿈  ");

    expect(embedMock).toHaveBeenCalledWith(["주례자가 순서를 바꿈"], { inputType: "query" });
  });

  // AC 2(상위 3건 상한): 4건을 **전부 임계값 위**에 배치해야 이 상한의 의미를
  // 검증할 수 있다 — 직교 축(유사도 0)으로 두면 임계값 필터에서 걸러져 상한이
  // 아니라 필터를 검증하게 된다(Story 3.4 도입 시 실제로 이 함정이 있었다).
  it("유사도 상위 3건까지만 반환한다 (AC 2)", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, mixedVector(0, 1, 0.95), "케이스 1", 1);
    await createConfirmedCase(hall, mixedVector(0, 1, 0.9), "케이스 2", 2);
    await createConfirmedCase(hall, mixedVector(0, 1, 0.85), "케이스 3", 3);
    await createConfirmedCase(hall, mixedVector(0, 1, 0.8), "케이스 4", 4);
    embedMock.mockResolvedValue([unitVector(0)]);

    const { matches } = await queryVariableCases("아무 상황");

    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.situation)).toEqual(["케이스 1", "케이스 2", "케이스 3"]);
    // 4건 모두 임계값 위였음을 명시 — 상한이 잘랐지 필터가 자른 게 아니다.
    expect(matches.every((m) => m.similarity >= MIN_SIMILARITY)).toBe(true);
  });

  it("확정된 케이스가 없으면 빈 배열과 topSimilarity null을 반환한다", async () => {
    embedMock.mockResolvedValue([unitVector(0)]);

    const result = await queryVariableCases("아무 상황");

    expect(result).toEqual({ matches: [], topSimilarity: null });
  });

  // ---- Story 3.4(AC 3, NFR-7, SM-2): 유사도 임계값 안전장치 ----

  it("임계값 미만인 케이스만 있으면 무관 사례를 근거로 제시하지 않는다 (AC 3)", async () => {
    const hall = await createTestHall();
    // 직교에 가까운 케이스 — 검색은 이걸 상위 1건으로 반환하지만 근거로 쓰기엔 멀다.
    await createConfirmedCase(hall, unitVector(1), "전혀 다른 상황", 1);
    embedMock.mockResolvedValue([unitVector(0)]);

    const { matches, topSimilarity } = await queryVariableCases("아무 상황");

    expect(matches).toEqual([]);
    // 코퍼스가 비어서가 아니라 "충분히 가깝지 않아서" 비었다는 게 관측돼야 한다.
    expect(topSimilarity).not.toBeNull();
    expect(topSimilarity!).toBeLessThan(MIN_SIMILARITY);
  });

  it("임계값 이상·미만이 섞이면 이상인 것만 남긴다 (AC 3)", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, mixedVector(0, 1, 0.95), "가까운 케이스", 1);
    await createConfirmedCase(hall, mixedVector(0, 1, 0.2), "먼 케이스", 2);
    embedMock.mockResolvedValue([unitVector(0)]);

    const { matches, topSimilarity } = await queryVariableCases("아무 상황");

    expect(matches.map((m) => m.situation)).toEqual(["가까운 케이스"]);
    expect(topSimilarity).toBeCloseTo(0.95, 5);
  });

  // 컷이 실제로 MIN_SIMILARITY에서 일어나는지(다른 하드코딩 값이 아니라) 확인한다.
  // 정확히 임계값과 같은 벡터로는 검증하지 않는다 — pgvector 부동소수 연산에서
  // 0.5가 0.4999…/0.5000…로 갈리는 동전 던지기가 되어 위양성/위음성이 섞인다.
  // 임계값을 사이에 두고 ±0.02로 straddle하는 것이 결정적이면서 의미도 같다.
  it("컷이 MIN_SIMILARITY 지점에서 일어난다 (경계 straddle)", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, mixedVector(0, 1, MIN_SIMILARITY + 0.02), "바로 위", 1);
    await createConfirmedCase(hall, mixedVector(0, 1, MIN_SIMILARITY - 0.02), "바로 아래", 2);
    embedMock.mockResolvedValue([unitVector(0)]);

    const { matches } = await queryVariableCases("아무 상황");

    expect(matches.map((m) => m.situation)).toEqual(["바로 위"]);
  });

  // 2026-07-28 실제 OpenAI text-embedding-3-large(1024차원) 호출로 측정한 값
  // (웨딩홀 도메인 문서 3건 × 질의 8건). 이 두 수치가 임계값 재보정의 가드레일이다.
  const MEASURED_UNRELATED_MAX = 0.366; // "주차장이 만차라서 하객이 못 들어와요"
  const MEASURED_RELATED_MIN = 0.5; // "축가 반주가 안 나와요"(0.5007)

  // 단순 범위 체크는 무관 사례를 통과시키는 값으로 바뀌어도 성공한다(코덱스 2차 P2) —
  // 실측한 두 구간 사이에 있는지를 직접 고정한다. 재보정 자체는 허용하되, 측정된
  // 무관 사례를 근거로 들이거나(SM-2 위반) 측정된 관련 사례를 버리는 방향으로는
  // 못 움직인다.
  //
  // [한계] 이건 소규모 표본에 대한 회귀 가드이지 SM-2의 증명이 아니다. PRD가 요구하는
  // "검수용 변수 상황 세트에서 무관 사례 0%"는 실제 피드백이 쌓인 뒤 검수 세트로
  // 확인해야 한다(deferred-work.md).
  it("MIN_SIMILARITY가 실측 무관 최댓값과 관련 최솟값 사이에 있다 (SM-2 가드)", () => {
    expect(MIN_SIMILARITY).toBeGreaterThan(MEASURED_UNRELATED_MAX);
    expect(MIN_SIMILARITY).toBeLessThan(MEASURED_RELATED_MIN);
  });

  it("빈 질의는 임베딩 호출 없이 거부한다", async () => {
    await expect(queryVariableCases("   ")).rejects.toThrow(QueryValidationError);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("500자를 초과하는 질의는 임베딩 호출 없이 거부한다", async () => {
    await expect(queryVariableCases("가".repeat(501))).rejects.toThrow(QueryValidationError);
    expect(embedMock).not.toHaveBeenCalled();
  });
});
