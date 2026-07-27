import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as feedbackRepo from "@/lib/db/repositories/feedback";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function createCeremony(hallId: string) {
  return ceremonyRepo.create(hallId, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
}

describe("feedback 리포지토리", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("create로 생성한 행을 findByCeremonyAndStep으로 조회할 수 있다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });

    const created = await feedbackRepo.create({
      hallId: hall.id,
      ceremonyId,
      templateItemId: step.id,
      stepName: step.stepName,
      content: "주례자가 순서를 바꿨다",
    });

    expect(created.status).toBe("draft");
    expect(created.stepName).toBe("신랑입장");

    const found = await feedbackRepo.findByCeremonyAndStep(ceremonyId, step.id);
    expect(found?.id).toBe(created.id);
    expect(found?.content).toBe("주례자가 순서를 바꿨다");
  });

  it("존재하지 않는 예식+단계 조합이면 undefined를 반환한다", async () => {
    const found = await feedbackRepo.findByCeremonyAndStep(
      "00000000-0000-0000-0000-000000000000",
      "00000000-0000-0000-0000-000000000001",
    );
    expect(found).toBeUndefined();
  });

  it("updateContent로 같은 행의 내용을 갱신한다(id 불변)", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id);

    const created = await feedbackRepo.create({
      hallId: hall.id,
      ceremonyId,
      templateItemId: step.id,
      stepName: step.stepName,
      content: "초안",
    });

    const updated = await feedbackRepo.updateContent(created.id, "수정된 내용");

    expect(updated.id).toBe(created.id);
    expect(updated.content).toBe("수정된 내용");
    expect(updated.status).toBe("draft");
  });

  // 코덱스 리뷰 P1: "조회 → 없으면 생성" 두 단계 대신 ON CONFLICT DO UPDATE 단일 문으로
  // 원자성을 확보한다(demo-video.ts::upsertForChecklistItem과 동일 패턴).
  describe("upsertDraft", () => {
    it("행이 없으면 새로 생성한다", async () => {
      const hall = await createTestHall();
      const { ceremonyId } = await createCeremony(hall.id);
      const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });

      const result = await feedbackRepo.upsertDraft({
        hallId: hall.id,
        ceremonyId,
        templateItemId: step.id,
        stepName: step.stepName,
        content: "최초 저장",
      });

      expect(result?.status).toBe("draft");
      expect(result?.content).toBe("최초 저장");
    });

    it("같은 예식+단계에 다시 호출하면 같은 행의 content만 갱신한다(id 불변)", async () => {
      const hall = await createTestHall();
      const { ceremonyId } = await createCeremony(hall.id);
      const step = await createTestTemplateItem(hall.id);

      const first = await feedbackRepo.upsertDraft({
        hallId: hall.id,
        ceremonyId,
        templateItemId: step.id,
        stepName: step.stepName,
        content: "1차",
      });
      const second = await feedbackRepo.upsertDraft({
        hallId: hall.id,
        ceremonyId,
        templateItemId: step.id,
        stepName: step.stepName,
        content: "2차",
      });

      expect(second?.id).toBe(first?.id);
      expect(second?.content).toBe("2차");
    });

    // 코덱스 리뷰 2차 P2: onConflictDoUpdate의 set에 updatedAt을 명시하지 않으면
    // $onUpdate가 자동 적용되지 않아(일반 db.update()에만 적용됨) 재저장해도 갱신
    // 시각이 최초 생성 시각에 머문다 — "언제 마지막으로 이어 썼는지"가 부정확해짐.
    it("재저장하면 updatedAt이 최초 생성 시각보다 갱신된다(코덱스 2차 P2)", async () => {
      const hall = await createTestHall();
      const { ceremonyId } = await createCeremony(hall.id);
      const step = await createTestTemplateItem(hall.id);

      const first = await feedbackRepo.upsertDraft({
        hallId: hall.id,
        ceremonyId,
        templateItemId: step.id,
        stepName: step.stepName,
        content: "1차",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = await feedbackRepo.upsertDraft({
        hallId: hall.id,
        ceremonyId,
        templateItemId: step.id,
        stepName: step.stepName,
        content: "2차",
      });

      expect(second!.updatedAt.getTime()).toBeGreaterThan(first!.updatedAt.getTime());
    });

    it("기존 행이 confirmed면 갱신하지 않고 undefined를 반환한다(AD-8 방어)", async () => {
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

      const result = await feedbackRepo.upsertDraft({
        hallId: hall.id,
        ceremonyId,
        templateItemId: step.id,
        stepName: step.stepName,
        content: "덮어쓰기 시도",
      });

      expect(result).toBeUndefined();
      const untouched = await feedbackRepo.findByCeremonyAndStep(ceremonyId, step.id);
      expect(untouched?.content).toBe("확정된 내용");
    });
  });
});
