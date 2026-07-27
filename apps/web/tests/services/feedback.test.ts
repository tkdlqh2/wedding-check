import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDb,
  createTestHall,
  createTestTemplateItem,
  createTestChecklistItem,
} from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as feedbackRepo from "@/lib/db/repositories/feedback";
import { db } from "@/lib/db";
import { feedback, variableCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Story 3.2: LLM/임베딩은 실제 벤더를 호출하지 않고 가짜 포트를 주입해 검증한다
// (Dev Notes 테스트 전략 — 어댑터 자체의 벤더 계약 테스트는 범위 밖, 수동 검증으로 대체).
// vi.mock은 파일 상단으로 호이스팅되므로 아래 static import보다 먼저 적용된다.
const generateMock = vi.fn();
const embedMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  getLLMPort: () => ({ generate: generateMock, generateStream: vi.fn() }),
  getEmbeddingPort: () => ({ embed: embedMock }),
}));

import {
  saveDraftFeedback,
  getDraftFeedback,
  structureFeedback,
  updateStructuredFields,
  confirmFeedback,
  FeedbackValidationError,
} from "@/lib/services/feedback";

// ceremonyRepo.create()의 CTE는 "그 시점에 이미 존재하는" checklistTemplateItems +
// checklistTemplateItemChecks만 INNER JOIN으로 인스턴스에 조합한다 — 단계+체크리스트
// 항목을 먼저 만든 뒤에 예식을 생성해야 그 단계가 실제로 이 예식의 체크리스트에
// 포함된다(코덱스 리뷰 P2가 지적한 "이 예식에 포함된 단계인지" 검증을 통과하려면
// 필수). 순서를 반대로 하면(예식을 먼저 만들면) 단계가 인스턴스에 전혀 조합되지
// 않아 saveDraftFeedback/getDraftFeedback이 항상 "포함되지 않은 단계" 오류를 던진다.
async function setupCeremonyWithStep(hallOverrides: Partial<{ name: string }> = {}) {
  const hall = await createTestHall(hallOverrides);
  const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });
  await createTestChecklistItem(hall.id, step.id, { title: "조명 전환" });
  const { ceremonyId } = await ceremonyRepo.create(hall.id, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
  return { hall, step, ceremonyId };
}

describe("saveDraftFeedback (AC 1, 2, 4)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("최초 저장 시 새 draft 행을 생성한다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();

    const result = await saveDraftFeedback(hall.id, ceremonyId, step.id, "주례자가 순서를 바꿨다");

    expect(result.status).toBe("draft");
    expect(result.content).toBe("주례자가 순서를 바꿨다");
    expect(result.stepName).toBe("신랑입장");
  });

  it("같은 예식+단계에 재저장하면 같은 행이 갱신된다(id 불변, 이어 쓰기 — AC 2)", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();

    const first = await saveDraftFeedback(hall.id, ceremonyId, step.id, "1차 작성");
    const second = await saveDraftFeedback(hall.id, ceremonyId, step.id, "1차 작성 이어서 2차");

    expect(second.id).toBe(first.id);
    expect(second.content).toBe("1차 작성 이어서 2차");

    const rows = await db.select().from(feedback).where(eq(feedback.ceremonyId, ceremonyId));
    expect(rows).toHaveLength(1);
  });

  // 코덱스 리뷰 P1: "조회 → 없으면 생성" 두 단계였을 때 동시 최초 저장이 UNIQUE 위반
  // 500으로 이어질 수 있었다 — ON CONFLICT DO UPDATE 단일 문(feedbackRepo.upsertDraft)
  // 도입 후 두 요청이 겹쳐도 에러 없이 하나의 행으로 수렴하는지 재현 테스트.
  it("같은 예식+단계에 동시에 최초 저장해도 에러 없이 하나의 행으로 수렴한다(코덱스 P1)", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();

    const [a, b] = await Promise.all([
      saveDraftFeedback(hall.id, ceremonyId, step.id, "동시 저장 A"),
      saveDraftFeedback(hall.id, ceremonyId, step.id, "동시 저장 B"),
    ]);

    expect(a.id).toBe(b.id);
    const rows = await db.select().from(feedback).where(eq(feedback.ceremonyId, ceremonyId));
    expect(rows).toHaveLength(1);
    // 둘 중 하나의 내용으로 정상 저장돼 있어야 한다(경합 승자는 비결정적이라 값 자체는
    // 검증하지 않는다 — 중요한 건 에러 없이 단일 행으로 수렴한다는 것).
    expect(["동시 저장 A", "동시 저장 B"]).toContain(rows[0].content);
  });

  it("존재하지 않는 예식이면 거부된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);

    await expect(
      saveDraftFeedback(hall.id, "00000000-0000-0000-0000-000000000000", step.id, "내용"),
    ).rejects.toThrow(FeedbackValidationError);
  });

  it("다른 홀의 예식이면 거부된다(2-hop 재검증 — hall 불일치)", async () => {
    const { ceremonyId } = await setupCeremonyWithStep({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const stepInHallB = await createTestTemplateItem(hallB.id);

    await expect(
      saveDraftFeedback(hallB.id, ceremonyId, stepInHallB.id, "내용"),
    ).rejects.toThrow(FeedbackValidationError);
  });

  it("존재하지 않는 단계면 거부된다", async () => {
    const { hall, ceremonyId } = await setupCeremonyWithStep();

    await expect(
      saveDraftFeedback(hall.id, ceremonyId, "00000000-0000-0000-0000-000000000000", "내용"),
    ).rejects.toThrow(FeedbackValidationError);
  });

  // 코덱스 리뷰 P2: 단계가 같은 홀 소속이라는 것만으로는 부족하다 — AD-9 계약 형태
  // 조건부 포함(또는 이 테스트처럼 체크리스트 항목이 하나도 없는 단계)으로 이 예식의
  // 실제 체크리스트(checklist_instance_items)에서 제외될 수 있다. 그런 단계를 조작된
  // templateItemId로 지정하면 이 예식과 무관한 피드백이 만들어지던 실결함.
  it("같은 홀 소속이어도 이 예식의 체크리스트에 포함되지 않은 단계면 거부된다(코덱스 P2)", async () => {
    const hall = await createTestHall();
    // 체크리스트 항목(checklistTemplateItemChecks)을 하나도 만들지 않은 단계 —
    // ceremonyRepo.create()의 INNER JOIN 특성상 이 단계는 어떤 예식의 인스턴스에도
    // 조합되지 않는다(빈 단계는 오퍼레이터가 체크할 것이 없어 의도된 제외, ceremony.ts
    // 코멘트 참고).
    const excludedStep = await createTestTemplateItem(hall.id, { stepName: "제외된 단계" });
    const includedStep = await createTestTemplateItem(hall.id, {
      stepName: "포함된 단계",
      sortOrder: 2,
    });
    await createTestChecklistItem(hall.id, includedStep.id, { title: "포함된 항목" });
    const { ceremonyId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    await expect(
      saveDraftFeedback(hall.id, ceremonyId, excludedStep.id, "내용"),
    ).rejects.toThrow(FeedbackValidationError);
  });

  it("빈 문자열(trim 후 빈 값 포함)은 거부된다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();

    await expect(saveDraftFeedback(hall.id, ceremonyId, step.id, "   ")).rejects.toThrow(
      FeedbackValidationError,
    );
  });

  // AD-8 방어적 코딩: 이 스토리는 confirmed를 만드는 코드가 없어 프로덕션 경로로는
  // 도달 불가능하지만, 스키마가 이미 status를 지원하므로 지금 막아둔다(Story 3.2가
  // 확정 기능을 추가했을 때 이 화면을 통한 조용한 덮어쓰기를 원천 차단).
  it("이미 confirmed 상태인 피드백은 수정할 수 없다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();

    const created = await feedbackRepo.create({
      hallId: hall.id,
      ceremonyId,
      templateItemId: step.id,
      stepName: step.stepName,
      content: "확정된 내용",
    });
    await db.update(feedback).set({ status: "confirmed" }).where(eq(feedback.id, created.id));

    await expect(
      saveDraftFeedback(hall.id, ceremonyId, step.id, "덮어쓰기 시도"),
    ).rejects.toThrow(FeedbackValidationError);

    const [row] = await db.select().from(feedback).where(eq(feedback.id, created.id));
    expect(row.content).toBe("확정된 내용");
  });
});

describe("getDraftFeedback (AC 2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("기존 draft가 있으면 반환한다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "이어 쓸 내용");

    const result = await getDraftFeedback(hall.id, ceremonyId, step.id);

    expect(result?.content).toBe("이어 쓸 내용");
  });

  it("아직 저장된 적 없으면 undefined를 반환한다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();

    const result = await getDraftFeedback(hall.id, ceremonyId, step.id);

    expect(result).toBeUndefined();
  });

  it("다른 홀의 예식으로 조회하면 거부된다", async () => {
    const { ceremonyId } = await setupCeremonyWithStep({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const stepInHallB = await createTestTemplateItem(hallB.id);

    await expect(getDraftFeedback(hallB.id, ceremonyId, stepInHallB.id)).rejects.toThrow(
      FeedbackValidationError,
    );
  });
});

describe("structureFeedback (AC 1, 4)", () => {
  beforeEach(async () => {
    await resetDb();
    generateMock.mockReset();
    embedMock.mockReset();
  });

  it("LLMPort.generate 결과로 4개 필드를 채운 초안을 저장한다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "주례자가 순서를 바꿨다");
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        situation: "주례자가 사전 협의 없이 순서를 바꿨다",
        outcome: "well_handled",
        rationale: "당황하지 않고 다음 순서를 안내했다",
        tags: ["주례자", "순서변경"],
      }),
    });

    const result = await structureFeedback(hall.id, ceremonyId, step.id);

    expect(result.situation).toBe("주례자가 사전 협의 없이 순서를 바꿨다");
    expect(result.outcome).toBe("well_handled");
    expect(result.tags).toEqual(["주례자", "순서변경"]);
    expect(result.status).toBe("draft");
    // NFR-1: 결정성 확보를 위해 temperature 등은 어댑터 책임 — 서비스는 5필드 스키마를
    // 넘겼는지만 확인한다(어댑터 자체는 실제 API 호출이라 단위 테스트 범위 밖).
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({ responseSchema: expect.any(Object) }),
    );
  });

  it("LLM 응답이 유효한 JSON이 아니면 에러를 던진다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "내용");
    generateMock.mockResolvedValue({ text: "not json" });

    await expect(structureFeedback(hall.id, ceremonyId, step.id)).rejects.toThrow();
  });

  it("LLM 응답의 outcome이 허용된 값이 아니면 에러를 던진다(AD-8 방어)", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "내용");
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        situation: "상황",
        outcome: "완벽함", // 스키마 밖 값 — LLM이 스키마를 어겼다고 가정
        rationale: "판단",
        tags: [],
      }),
    });

    await expect(structureFeedback(hall.id, ceremonyId, step.id)).rejects.toThrow();
  });

  it("draft 피드백이 없으면 거부된다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();

    await expect(structureFeedback(hall.id, ceremonyId, step.id)).rejects.toThrow(
      FeedbackValidationError,
    );
  });
});

describe("updateStructuredFields (AC 2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("오퍼레이터가 수정한 값을 최종본으로 저장한다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "내용");

    const result = await updateStructuredFields(hall.id, ceremonyId, step.id, {
      situation: "직접 수정한 상황 설명",
      outcome: "mishandled",
      rationale: "직접 수정한 사후 판단",
      tags: ["수정태그"],
    });

    expect(result.situation).toBe("직접 수정한 상황 설명");
    expect(result.outcome).toBe("mishandled");
    expect(result.tags).toEqual(["수정태그"]);
  });

  it("situation이 빈 값이면 거부된다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "내용");

    await expect(
      updateStructuredFields(hall.id, ceremonyId, step.id, {
        situation: "   ",
        outcome: "well_handled",
        rationale: "판단",
        tags: [],
      }),
    ).rejects.toThrow(FeedbackValidationError);
  });

  it("outcome이 허용된 값이 아니면 거부된다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "내용");

    await expect(
      updateStructuredFields(hall.id, ceremonyId, step.id, {
        situation: "상황",
        outcome: "invalid",
        rationale: "판단",
        tags: [],
      }),
    ).rejects.toThrow(FeedbackValidationError);
  });
});

describe("confirmFeedback (AC 3, AD-8)", () => {
  beforeEach(async () => {
    await resetDb();
    embedMock.mockReset();
  });

  it("5필드가 모두 채워진 draft를 confirmed로 바꾸고 variable_case를 생성한다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "내용");
    await updateStructuredFields(hall.id, ceremonyId, step.id, {
      situation: "상황 설명",
      outcome: "well_handled",
      rationale: "사후 판단",
      tags: ["태그"],
    });
    embedMock.mockResolvedValue([Array.from({ length: 1024 }, () => 0.1)]);

    const result = await confirmFeedback(hall.id, ceremonyId, step.id);

    expect(result.status).toBe("confirmed");
    expect(embedMock).toHaveBeenCalledWith(["상황 설명 사후 판단"]);
    const cases = await db.select().from(variableCases).where(eq(variableCases.feedbackId, result.id));
    expect(cases).toHaveLength(1);
  });

  it("구조화가 안 된(situation 등이 비어있는) draft는 확정을 거부한다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "내용");

    await expect(confirmFeedback(hall.id, ceremonyId, step.id)).rejects.toThrow(
      FeedbackValidationError,
    );
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("이미 confirmed인 피드백은 다시 확정할 수 없다", async () => {
    const { hall, ceremonyId, step } = await setupCeremonyWithStep();
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "내용");
    await updateStructuredFields(hall.id, ceremonyId, step.id, {
      situation: "상황",
      outcome: "well_handled",
      rationale: "판단",
      tags: [],
    });
    embedMock.mockResolvedValue([Array.from({ length: 1024 }, () => 0.1)]);
    await confirmFeedback(hall.id, ceremonyId, step.id);

    await expect(confirmFeedback(hall.id, ceremonyId, step.id)).rejects.toThrow(
      FeedbackValidationError,
    );
  });
});
