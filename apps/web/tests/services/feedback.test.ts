import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as feedbackRepo from "@/lib/db/repositories/feedback";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  saveDraftFeedback,
  getDraftFeedback,
  FeedbackValidationError,
} from "@/lib/services/feedback";

async function createCeremony(hallId: string) {
  return ceremonyRepo.create(hallId, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
}

describe("saveDraftFeedback (AC 1, 2, 4)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("최초 저장 시 새 draft 행을 생성한다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });

    const result = await saveDraftFeedback(hall.id, ceremonyId, step.id, "주례자가 순서를 바꿨다");

    expect(result.status).toBe("draft");
    expect(result.content).toBe("주례자가 순서를 바꿨다");
    expect(result.stepName).toBe("신랑입장");
  });

  it("같은 예식+단계에 재저장하면 같은 행이 갱신된다(id 불변, 이어 쓰기 — AC 2)", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id);

    const first = await saveDraftFeedback(hall.id, ceremonyId, step.id, "1차 작성");
    const second = await saveDraftFeedback(hall.id, ceremonyId, step.id, "1차 작성 이어서 2차");

    expect(second.id).toBe(first.id);
    expect(second.content).toBe("1차 작성 이어서 2차");

    const rows = await db.select().from(feedback).where(eq(feedback.ceremonyId, ceremonyId));
    expect(rows).toHaveLength(1);
  });

  it("존재하지 않는 예식이면 거부된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);

    await expect(
      saveDraftFeedback(hall.id, "00000000-0000-0000-0000-000000000000", step.id, "내용"),
    ).rejects.toThrow(FeedbackValidationError);
  });

  it("다른 홀의 예식이면 거부된다(2-hop 재검증 — hall 불일치)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { ceremonyId } = await createCeremony(hallA.id);
    const stepInHallB = await createTestTemplateItem(hallB.id);

    await expect(
      saveDraftFeedback(hallB.id, ceremonyId, stepInHallB.id, "내용"),
    ).rejects.toThrow(FeedbackValidationError);
  });

  it("존재하지 않는 단계면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      saveDraftFeedback(hall.id, ceremonyId, "00000000-0000-0000-0000-000000000000", "내용"),
    ).rejects.toThrow(FeedbackValidationError);
  });

  it("빈 문자열(trim 후 빈 값 포함)은 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id);

    await expect(saveDraftFeedback(hall.id, ceremonyId, step.id, "   ")).rejects.toThrow(
      FeedbackValidationError,
    );
  });

  // AD-8 방어적 코딩: 이 스토리는 confirmed를 만드는 코드가 없어 프로덕션 경로로는
  // 도달 불가능하지만, 스키마가 이미 status를 지원하므로 지금 막아둔다(Story 3.2가
  // 확정 기능을 추가했을 때 이 화면을 통한 조용한 덮어쓰기를 원천 차단).
  it("이미 confirmed 상태인 피드백은 수정할 수 없다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id);

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
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id);
    await saveDraftFeedback(hall.id, ceremonyId, step.id, "이어 쓸 내용");

    const result = await getDraftFeedback(hall.id, ceremonyId, step.id);

    expect(result?.content).toBe("이어 쓸 내용");
  });

  it("아직 저장된 적 없으면 undefined를 반환한다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id);

    const result = await getDraftFeedback(hall.id, ceremonyId, step.id);

    expect(result).toBeUndefined();
  });

  it("다른 홀의 예식으로 조회하면 거부된다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { ceremonyId } = await createCeremony(hallA.id);
    const stepInHallB = await createTestTemplateItem(hallB.id);

    await expect(getDraftFeedback(hallB.id, ceremonyId, stepInHallB.id)).rejects.toThrow(
      FeedbackValidationError,
    );
  });
});
