import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as instanceRepo from "@/lib/db/repositories/checklist-instance";

async function createCeremonyWithNoItems(hallId: string) {
  const { ceremonyId, instanceId } = await ceremonyRepo.create(hallId, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
  return { ceremonyId, instanceId };
}

describe("checklistInstanceRepo — addItem/removeItem", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("addItem은 템플릿 항목을 스냅샷으로 복사해 추가한다", async () => {
    const hall = await createTestHall();
    // 예식을 먼저 만들어야 자동 조합(Task 2 CTE)이 이 템플릿 항목을 이미 넣어버리지
    // 않는다 — 순서를 바꾸면 addItem이 같은 항목을 중복으로 추가하는 꼴이 된다.
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const templateItem = await createTestTemplateItem(hall.id, {
      stepName: "신랑입장",
      sortOrder: 1,
    });

    const added = await instanceRepo.addItem(hall.id, instanceId, templateItem);

    expect(added.stepName).toBe("신랑입장");
    expect(added.templateItemId).toBe(templateItem.id);
    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(1);
  });

  it("removeItem은 인스턴스에서 해당 항목만 제거한다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const templateItem = await createTestTemplateItem(hall.id, { stepName: "축가" });
    const added = await instanceRepo.addItem(hall.id, instanceId, templateItem);

    await instanceRepo.removeItem(hall.id, instanceId, added.id);

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(0);
  });

  it("다른 홀의 instanceId/itemId로는 제거되지 않는다 (홀 스코프 격리)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { instanceId } = await createCeremonyWithNoItems(hallA.id);
    const templateItem = await createTestTemplateItem(hallA.id, { stepName: "A홀 항목" });
    const added = await instanceRepo.addItem(hallA.id, instanceId, templateItem);

    // hallB로 hallA의 instance/item을 지우려는 시도 — 조용히 0행 삭제로 끝나야 한다.
    await instanceRepo.removeItem(hallB.id, instanceId, added.id);

    const items = await instanceRepo.listItems(hallA.id, instanceId);
    expect(items).toHaveLength(1);
  });
});

describe("checklistInstanceRepo.listCandidateTemplateItems — 홀 스코프 격리 (AC 4)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("이미 포함된 항목은 후보에서 제외된다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const included = await createTestTemplateItem(hall.id, { stepName: "포함됨", sortOrder: 1 });
    const notIncluded = await createTestTemplateItem(hall.id, {
      stepName: "미포함",
      sortOrder: 2,
    });
    await instanceRepo.addItem(hall.id, instanceId, included);

    const candidates = await instanceRepo.listCandidateTemplateItems(hall.id, instanceId);

    expect(candidates.map((c) => c.id)).toEqual([notIncluded.id]);
  });

  it("다른 홀의 템플릿 항목은 후보로 노출되지 않는다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    await createTestTemplateItem(hallB.id, { stepName: "B홀 전용 항목" });
    const { instanceId } = await createCeremonyWithNoItems(hallA.id);

    const candidates = await instanceRepo.listCandidateTemplateItems(hallA.id, instanceId);

    expect(candidates).toHaveLength(0);
  });
});
