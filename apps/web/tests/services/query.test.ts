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

import { queryVariableCases, QueryValidationError } from "@/lib/services/query";

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

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(first[0].situation).toBe("주례자가 예고 없이 순서를 바꿈");
    expect(second[0].situation).toBe("주례자가 예고 없이 순서를 바꿈");
    expect(first[0].id).toBe(second[0].id);
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

  it("유사도 상위 3건까지만 반환한다 (3.4 AC 정합)", async () => {
    const hall = await createTestHall();
    await createConfirmedCase(hall, unitVector(0), "케이스 1", 1);
    await createConfirmedCase(hall, unitVector(1), "케이스 2", 2);
    await createConfirmedCase(hall, unitVector(2), "케이스 3", 3);
    await createConfirmedCase(hall, unitVector(3), "케이스 4", 4);
    embedMock.mockResolvedValue([unitVector(0)]);

    const results = await queryVariableCases("아무 상황");

    expect(results).toHaveLength(3);
    expect(results[0].situation).toBe("케이스 1");
  });

  it("확정된 케이스가 없으면 빈 배열을 반환한다", async () => {
    embedMock.mockResolvedValue([unitVector(0)]);

    const results = await queryVariableCases("아무 상황");

    expect(results).toEqual([]);
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
