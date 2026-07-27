import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as feedbackRepo from "@/lib/db/repositories/feedback";

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
});
