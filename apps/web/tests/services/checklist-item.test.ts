import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import {
  createChecklistItem,
  updateChecklistItem,
  listChecklistItems,
  ChecklistItemValidationError,
} from "@/lib/services/checklist-item";

describe("createChecklistItem — 제목 필수 검증 (AC 4)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("제목을 입력하면 저장된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);

    const item = await createChecklistItem(hall.id, step.id, { title: "조명 준비" });

    expect(item.title).toBe("조명 준비");
    const listed = await listChecklistItems(hall.id, step.id);
    expect(listed).toHaveLength(1);
  });

  it("빈 제목은 거부된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);

    await expect(createChecklistItem(hall.id, step.id, { title: "" })).rejects.toThrow(
      ChecklistItemValidationError,
    );
  });

  it("공백만 있는 제목은 거부된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);

    await expect(createChecklistItem(hall.id, step.id, { title: "   " })).rejects.toThrow(
      ChecklistItemValidationError,
    );
  });

  it("설명은 선택 입력이다 — 생략해도 저장된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);

    const item = await createChecklistItem(hall.id, step.id, { title: "조명 준비" });

    expect(item.description).toBeNull();
  });
});

describe("createChecklistItem — AD-2 2-hop 재검증", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("다른 홀 소속 templateItemId로 생성을 시도하면 거부된다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const stepInHallB = await createTestTemplateItem(hallB.id);

    await expect(
      createChecklistItem(hallA.id, stepInHallB.id, { title: "조명 준비" }),
    ).rejects.toThrow(ChecklistItemValidationError);
  });

  it("존재하지 않는 templateItemId는 거부된다", async () => {
    const hall = await createTestHall();

    await expect(
      createChecklistItem(hall.id, "00000000-0000-0000-0000-000000000000", {
        title: "조명 준비",
      }),
    ).rejects.toThrow(ChecklistItemValidationError);
  });
});

describe("updateChecklistItem", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("빈 제목으로 수정을 시도하면 거부된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);
    const item = await createChecklistItem(hall.id, step.id, { title: "조명 준비" });

    await expect(updateChecklistItem(hall.id, item.id, { title: "" })).rejects.toThrow(
      ChecklistItemValidationError,
    );
  });
});
