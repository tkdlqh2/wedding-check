import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import { db } from "@/lib/db";
import { checklistInstances, checklistInstanceItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("ceremonyRepo.create — 원자적 생성(ceremony+instance+instance_items)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ceremony, instance, instance_items를 한 번에 만든다", async () => {
    const hall = await createTestHall();
    await createTestTemplateItem(hall.id, { stepName: "사회자 멘트", sortOrder: 1 });
    await createTestTemplateItem(hall.id, { stepName: "신랑입장", sortOrder: 2 });

    const { ceremonyId, instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: { requiresOfficiant: true },
    });

    expect(ceremonyId).toBeTruthy();
    expect(instanceId).toBeTruthy();

    const instance = await db.query.checklistInstances.findFirst({
      where: eq(checklistInstances.id, instanceId),
    });
    expect(instance?.hallId).toBe(hall.id);
    expect(instance?.ceremonyId).toBe(ceremonyId);

    const items = await db.query.checklistInstanceItems.findMany({
      where: eq(checklistInstanceItems.instanceId, instanceId),
    });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.stepName).sort()).toEqual(["사회자 멘트", "신랑입장"]);
    expect(items.every((i) => i.hallId === hall.id)).toBe(true);
  });

  it("AD-9 부분집합 매칭: 예식 조건에 맞지 않는 항목은 제외된다 (AC 1)", async () => {
    const hall = await createTestHall();
    await createTestTemplateItem(hall.id, {
      stepName: "주례 소개",
      sortOrder: 1,
      applicableContractConditions: { requiresOfficiant: true },
    });
    await createTestTemplateItem(hall.id, { stepName: "사회자 멘트", sortOrder: 2 });

    const { instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: { requiresOfficiant: false, hasAdditionalEvent: false },
    });

    const items = await db.query.checklistInstanceItems.findMany({
      where: eq(checklistInstanceItems.instanceId, instanceId),
    });
    expect(items.map((i) => i.stepName)).toEqual(["사회자 멘트"]);
  });

  it("AD-9 부분집합 매칭: 예식 조건이 맞으면 포함된다", async () => {
    const hall = await createTestHall();
    await createTestTemplateItem(hall.id, {
      stepName: "주례 소개",
      sortOrder: 1,
      applicableContractConditions: { requiresOfficiant: true },
    });

    const { instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: { requiresOfficiant: true, hasAdditionalEvent: false },
    });

    const items = await db.query.checklistInstanceItems.findMany({
      where: eq(checklistInstanceItems.instanceId, instanceId),
    });
    expect(items.map((i) => i.stepName)).toEqual(["주례 소개"]);
  });

  it("조건 없는 항목({})은 예식 조건과 무관하게 항상 포함된다", async () => {
    const hall = await createTestHall();
    await createTestTemplateItem(hall.id, { stepName: "무조건 포함", sortOrder: 1 });

    const { instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: { requiresOfficiant: false, hasAdditionalEvent: false },
    });

    const items = await db.query.checklistInstanceItems.findMany({
      where: eq(checklistInstanceItems.instanceId, instanceId),
    });
    expect(items.map((i) => i.stepName)).toEqual(["무조건 포함"]);
  });

  it("템플릿 항목이 없는 홀도 실패 없이 빈 인스턴스를 만든다", async () => {
    const hall = await createTestHall();

    const { instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const items = await db.query.checklistInstanceItems.findMany({
      where: eq(checklistInstanceItems.instanceId, instanceId),
    });
    expect(items).toHaveLength(0);
  });

  it("같은 홀+같은 날짜로 두 번 등록해도 서로 독립된 인스턴스를 가진다", async () => {
    const hall = await createTestHall();
    await createTestTemplateItem(hall.id);

    const first = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    const second = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    expect(first.ceremonyId).not.toBe(second.ceremonyId);
    expect(first.instanceId).not.toBe(second.instanceId);
  });
});

describe("ceremonyRepo.findByHallForDateRange — 홀 스코프 격리", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("다른 홀의 예식을 섞지 않는다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    await ceremonyRepo.create(hallA.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await ceremonyRepo.create(hallB.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const resultForA = await ceremonyRepo.findByHallForDateRange(
      hallA.id,
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-02T00:00:00.000Z"),
    );

    expect(resultForA).toHaveLength(1);
    expect(resultForA[0].hallId).toBe(hallA.id);
  });

  it("날짜 범위 밖의 예식은 제외한다", async () => {
    const hall = await createTestHall();
    await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-05T05:00:00.000Z"),
      contractConditions: {},
    });

    const result = await ceremonyRepo.findByHallForDateRange(
      hall.id,
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-02T00:00:00.000Z"),
    );

    expect(result).toHaveLength(0);
  });

  it("인스턴스 항목 개수를 함께 반환한다", async () => {
    const hall = await createTestHall();
    await createTestTemplateItem(hall.id, { stepName: "항목1", sortOrder: 1 });
    await createTestTemplateItem(hall.id, { stepName: "항목2", sortOrder: 2 });
    await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const result = await ceremonyRepo.findByHallForDateRange(
      hall.id,
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-02T00:00:00.000Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0].itemCount).toBe(2);
  });
});

describe("ceremonyRepo.findAllByHall — 홀 스코프 전체 목록 (Story 5.2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("예식이 없으면 빈 배열을 반환한다", async () => {
    const hall = await createTestHall();
    const result = await ceremonyRepo.findAllByHall(hall.id);
    expect(result).toEqual([]);
  });

  it("날짜 필터 없이 그 홀의 예식을 모두 반환한다", async () => {
    const hall = await createTestHall();
    await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-01-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-12-31T05:00:00.000Z"),
      contractConditions: {},
    });

    const result = await ceremonyRepo.findAllByHall(hall.id);

    expect(result).toHaveLength(2);
  });

  it("다른 홀의 예식은 섞이지 않는다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    await ceremonyRepo.create(hallA.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await ceremonyRepo.create(hallB.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const result = await ceremonyRepo.findAllByHall(hallA.id);

    expect(result).toHaveLength(1);
    expect(result[0].hallId).toBe(hallA.id);
  });
});
