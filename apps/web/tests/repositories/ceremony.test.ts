import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb,
  createTestHall,
  createTestTemplateItem,
  createTestChecklistItem,
} from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import { createMember } from "@/lib/services/member";
import { db } from "@/lib/db";
import { checklistInstances, checklistInstanceItems } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

describe("ceremonyRepo.create — 원자적 생성(ceremony+instance+instance_items)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ceremony, instance, instance_items를 한 번에 만든다", async () => {
    const hall = await createTestHall();
    const step1 = await createTestTemplateItem(hall.id, { stepName: "사회자 멘트", sortOrder: 1 });
    await createTestChecklistItem(hall.id, step1.id, { title: "마이크 점검" });
    const step2 = await createTestTemplateItem(hall.id, { stepName: "신랑입장", sortOrder: 2 });
    await createTestChecklistItem(hall.id, step2.id, { title: "조명 전환" });

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
    expect(items.map((i) => i.title).sort()).toEqual(["마이크 점검", "조명 전환"]);
    expect(items.every((i) => i.hallId === hall.id)).toBe(true);
  });

  // Story 5.5 AC 5: 단계 하나에 체크리스트 항목이 여러 개면 전부 인스턴스에 전개된다.
  it("한 단계 안의 체크리스트 항목이 여러 개면 전부 인스턴스에 전개된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id, { stepName: "개식사", sortOrder: 1 });
    await createTestChecklistItem(hall.id, step.id, { title: "사회자 조명 준비", sortOrder: 1 });
    await createTestChecklistItem(hall.id, step.id, { title: "사전 안내", sortOrder: 2 });

    const { instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const items = await db.query.checklistInstanceItems.findMany({
      where: eq(checklistInstanceItems.instanceId, instanceId),
      orderBy: asc(checklistInstanceItems.sortOrder),
    });
    expect(items.map((i) => i.title)).toEqual(["사회자 조명 준비", "사전 안내"]);
    expect(items.every((i) => i.stepName === "개식사")).toBe(true);
  });

  // Story 5.5: 체크리스트 항목이 하나도 없는 단계는 INNER JOIN 특성상 인스턴스에서
  // 자연히 빠진다(오퍼레이터가 체크할 것이 없는 빈 단계는 노출할 이유가 없다).
  it("체크리스트 항목이 하나도 없는 단계는 인스턴스에서 제외된다", async () => {
    const hall = await createTestHall();
    const stepWithItems = await createTestTemplateItem(hall.id, { stepName: "행진", sortOrder: 1 });
    await createTestChecklistItem(hall.id, stepWithItems.id, { title: "행진 진행" });
    await createTestTemplateItem(hall.id, { stepName: "빈 단계", sortOrder: 2 });

    const { instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const items = await db.query.checklistInstanceItems.findMany({
      where: eq(checklistInstanceItems.instanceId, instanceId),
    });
    expect(items.map((i) => i.stepName)).toEqual(["행진"]);
  });

  it("AD-9 부분집합 매칭: 예식 조건에 맞지 않는 항목은 제외된다 (AC 1)", async () => {
    const hall = await createTestHall();
    const officiantStep = await createTestTemplateItem(hall.id, {
      stepName: "주례 소개",
      sortOrder: 1,
      applicableContractConditions: { requiresOfficiant: true },
    });
    await createTestChecklistItem(hall.id, officiantStep.id, { title: "주례자 소개 멘트" });
    const mcStep = await createTestTemplateItem(hall.id, { stepName: "사회자 멘트", sortOrder: 2 });
    await createTestChecklistItem(hall.id, mcStep.id, { title: "개회 안내" });

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
    const step = await createTestTemplateItem(hall.id, {
      stepName: "주례 소개",
      sortOrder: 1,
      applicableContractConditions: { requiresOfficiant: true },
    });
    await createTestChecklistItem(hall.id, step.id, { title: "주례자 소개 멘트" });

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
    const step = await createTestTemplateItem(hall.id, { stepName: "무조건 포함", sortOrder: 1 });
    await createTestChecklistItem(hall.id, step.id, { title: "항상 포함되는 항목" });

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
    const step = await createTestTemplateItem(hall.id);
    await createTestChecklistItem(hall.id, step.id);

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

  // Story 5.3 AC 2, 4
  it("groomName/brideName을 넘기면 저장되고 그대로 조회된다", async () => {
    const hall = await createTestHall();

    const { ceremonyId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
      groomName: "김철수",
      brideName: "이영희",
    });

    const ceremony = await ceremonyRepo.findById(hall.id, ceremonyId);
    expect(ceremony?.groomName).toBe("김철수");
    expect(ceremony?.brideName).toBe("이영희");
  });

  // Story 5.3: 기존 호출부(groomName/brideName 생략)와의 하위 호환 — DB 컬럼이
  // nullable이므로 생략 시 null로 저장된다.
  it("groomName/brideName을 생략하면 null로 저장된다", async () => {
    const hall = await createTestHall();

    const { ceremonyId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const ceremony = await ceremonyRepo.findById(hall.id, ceremonyId);
    expect(ceremony?.groomName).toBeNull();
    expect(ceremony?.brideName).toBeNull();
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
    const step1 = await createTestTemplateItem(hall.id, { stepName: "항목1", sortOrder: 1 });
    await createTestChecklistItem(hall.id, step1.id, { title: "체크1" });
    const step2 = await createTestTemplateItem(hall.id, { stepName: "항목2", sortOrder: 2 });
    await createTestChecklistItem(hall.id, step2.id, { title: "체크2" });
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

describe("ceremonyRepo 담당 오퍼레이터 다중 배정 (FR-18)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("여러 명을 배정하면 전원이 조회된다", async () => {
    const hall = await createTestHall();
    const operatorA = await createMember({
      name: "오퍼레이터A",
      phoneNumber: "01099990001",
      password: "pw-91234",
    });
    const operatorB = await createMember({
      name: "오퍼레이터B",
      phoneNumber: "01099990002",
      password: "pw-91234",
    });
    const { ceremonyId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    await ceremonyRepo.addAssignee(hall.id, ceremonyId, operatorA.id);
    await ceremonyRepo.addAssignee(hall.id, ceremonyId, operatorB.id);

    const assignees = await ceremonyRepo.findAssigneesByCeremony(hall.id, ceremonyId);
    expect(assignees.map((a) => a.operatorId).sort()).toEqual(
      [operatorA.id, operatorB.id].sort(),
    );
  });

  it("같은 오퍼레이터를 두 번 추가해도 중복 저장되지 않는다(멱등)", async () => {
    const hall = await createTestHall();
    const operator = await createMember({
      name: "오퍼레이터C",
      phoneNumber: "01099990003",
      password: "pw-91234",
    });
    const { ceremonyId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    await ceremonyRepo.addAssignee(hall.id, ceremonyId, operator.id);
    await ceremonyRepo.addAssignee(hall.id, ceremonyId, operator.id);

    const assignees = await ceremonyRepo.findAssigneesByCeremony(hall.id, ceremonyId);
    expect(assignees).toHaveLength(1);
  });

  it("removeAssignee는 해당 배정만 제거한다", async () => {
    const hall = await createTestHall();
    const operatorA = await createMember({
      name: "오퍼레이터D",
      phoneNumber: "01099990004",
      password: "pw-91234",
    });
    const operatorB = await createMember({
      name: "오퍼레이터E",
      phoneNumber: "01099990005",
      password: "pw-91234",
    });
    const { ceremonyId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await ceremonyRepo.addAssignee(hall.id, ceremonyId, operatorA.id);
    await ceremonyRepo.addAssignee(hall.id, ceremonyId, operatorB.id);

    await ceremonyRepo.removeAssignee(hall.id, ceremonyId, operatorA.id);

    const assignees = await ceremonyRepo.findAssigneesByCeremony(hall.id, ceremonyId);
    expect(assignees.map((a) => a.operatorId)).toEqual([operatorB.id]);
  });

  it("다른 홀 hallId로는 배정을 제거할 수 없다(AD-2 hallId 스코프)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const operator = await createMember({
      name: "오퍼레이터F",
      phoneNumber: "01099990006",
      password: "pw-91234",
    });
    const { ceremonyId } = await ceremonyRepo.create(hallA.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await ceremonyRepo.addAssignee(hallA.id, ceremonyId, operator.id);

    await ceremonyRepo.removeAssignee(hallB.id, ceremonyId, operator.id);

    const assignees = await ceremonyRepo.findAssigneesByCeremony(hallA.id, ceremonyId);
    expect(assignees).toHaveLength(1);
  });

  it("findAssigneesByHall은 그 홀의 배정만 반환한다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const operator = await createMember({
      name: "오퍼레이터G",
      phoneNumber: "01099990007",
      password: "pw-91234",
    });
    const a = await ceremonyRepo.create(hallA.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    const b = await ceremonyRepo.create(hallB.id, {
      ceremonyAt: new Date("2026-08-01T06:00:00.000Z"),
      contractConditions: {},
    });
    await ceremonyRepo.addAssignee(hallA.id, a.ceremonyId, operator.id);
    await ceremonyRepo.addAssignee(hallB.id, b.ceremonyId, operator.id);

    const rows = await ceremonyRepo.findAssigneesByHall(hallA.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].ceremonyId).toBe(a.ceremonyId);
  });
});
