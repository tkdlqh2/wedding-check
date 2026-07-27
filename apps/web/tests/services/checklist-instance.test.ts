import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as instanceRepo from "@/lib/db/repositories/checklist-instance";
import {
  getCeremonyDetail,
  addInstanceItem,
  removeInstanceItem,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";

async function createCeremony(hallId: string) {
  return ceremonyRepo.create(hallId, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
}

describe("addInstanceItem — AD-2 2-hop 재검증 (AC 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("같은 홀의 templateItemId면 추가된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const templateItem = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });

    const item = await addInstanceItem(hall.id, ceremonyId, templateItem.id);

    expect(item.stepName).toBe("신랑입장");
  });

  it("다른 홀의 templateItemId로 추가를 시도하면 거부된다 — 핵심 케이스", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { ceremonyId } = await createCeremony(hallA.id);
    const templateItemInHallB = await createTestTemplateItem(hallB.id, {
      stepName: "B홀 전용 항목",
    });

    await expect(
      addInstanceItem(hallA.id, ceremonyId, templateItemInHallB.id),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("존재하지 않는 ceremonyId면 거부된다", async () => {
    const hall = await createTestHall();
    const templateItem = await createTestTemplateItem(hall.id);

    await expect(
      addInstanceItem(hall.id, "00000000-0000-0000-0000-000000000000", templateItem.id),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("존재하지 않는 templateItemId면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      addInstanceItem(hall.id, ceremonyId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});

describe("removeInstanceItem", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("정상적으로 항목을 제거한다", async () => {
    const hall = await createTestHall();
    const { ceremonyId, instanceId } = await createCeremony(hall.id);
    const templateItem = await createTestTemplateItem(hall.id, { stepName: "축가" });
    const added = await instanceRepo.addItem(hall.id, instanceId, templateItem);

    await removeInstanceItem(hall.id, ceremonyId, added.id);

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(0);
  });

  it("존재하지 않는 ceremonyId면 거부된다", async () => {
    const hall = await createTestHall();

    await expect(
      removeInstanceItem(hall.id, "00000000-0000-0000-0000-000000000000", "some-id"),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});

describe("getCeremonyDetail", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("예식+인스턴스+항목+후보 목록을 함께 반환한다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const candidate = await createTestTemplateItem(hall.id, { stepName: "미포함 항목" });

    const detail = await getCeremonyDetail(hall.id, ceremonyId);

    expect(detail.ceremony.id).toBe(ceremonyId);
    expect(detail.items).toHaveLength(0);
    expect(detail.candidates.map((c) => c.id)).toEqual([candidate.id]);
  });

  it("존재하지 않는 예식이면 거부된다", async () => {
    const hall = await createTestHall();

    await expect(
      getCeremonyDetail(hall.id, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});
