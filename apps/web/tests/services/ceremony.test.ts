import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall } from "../helpers/db";
import {
  createCeremony,
  listTodaysCeremonies,
  listCeremoniesForDate,
  listCeremoniesPaginated,
  listCeremonyDatesForMonth,
  CeremonyValidationError,
} from "@/lib/services/ceremony";

describe("createCeremony — 검증", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("hallId가 비어있으면 거부된다 (AC 2)", async () => {
    await expect(
      createCeremony({ hallId: "", ceremonyAt: new Date(), contractConditions: {} }),
    ).rejects.toThrow(CeremonyValidationError);
  });

  it("존재하지 않는 홀이면 거부된다", async () => {
    await expect(
      createCeremony({
        hallId: "00000000-0000-0000-0000-000000000000",
        ceremonyAt: new Date(),
        contractConditions: {},
      }),
    ).rejects.toThrow(CeremonyValidationError);
  });

  it("유효한 홀이면 예식을 생성하고 저장된 값을 반환한다", async () => {
    const hall = await createTestHall();
    const ceremonyAt = new Date("2026-08-01T05:00:00.000Z");

    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt,
      contractConditions: { requiresOfficiant: true },
    });

    expect(ceremony.hallId).toBe(hall.id);
    expect(ceremony.ceremonyAt.toISOString()).toBe(ceremonyAt.toISOString());
    expect(ceremony.contractConditions).toEqual({ requiresOfficiant: true });
  });

  it("같은 홀+같은 날짜로 두 번 등록해도 독립된 예식 두 개가 생긴다 (AC 3)", async () => {
    const hall = await createTestHall();
    const ceremonyAt = new Date("2026-08-01T05:00:00.000Z");

    const first = await createCeremony({ hallId: hall.id, ceremonyAt, contractConditions: {} });
    const second = await createCeremony({ hallId: hall.id, ceremonyAt, contractConditions: {} });

    expect(first.id).not.toBe(second.id);
  });
});

describe("listTodaysCeremonies", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("오늘 예식이 없으면 빈 배열을 반환한다 (AC 4)", async () => {
    await createTestHall();
    const result = await listTodaysCeremonies();
    expect(result).toEqual([]);
  });

  it("오늘 등록된 예식을 홀 이름과 함께 반환한다", async () => {
    const hall = await createTestHall({ name: "1층 홀" });
    const now = new Date();
    await createCeremony({ hallId: hall.id, ceremonyAt: now, contractConditions: {} });

    const result = await listTodaysCeremonies();

    expect(result).toHaveLength(1);
    expect(result[0].hallName).toBe("1층 홀");
    expect(result[0].hallId).toBe(hall.id);
  });

  it("여러 홀의 오늘 예식을 모두 병합해 반환한다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const now = new Date();
    await createCeremony({ hallId: hallA.id, ceremonyAt: now, contractConditions: {} });
    await createCeremony({ hallId: hallB.id, ceremonyAt: now, contractConditions: {} });

    const result = await listTodaysCeremonies();

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.hallName).sort()).toEqual(["A홀", "B홀"]);
  });
});

describe("listCeremoniesForDate (Story 5.2 AC 2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("해당 날짜(KST)의 예식만 반환한다", async () => {
    const hall = await createTestHall();
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"), // 2026-08-01 14:00 KST
      contractConditions: {},
    });
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-02T05:00:00.000Z"), // 다른 날
      contractConditions: {},
    });

    const result = await listCeremoniesForDate("2026-08-01");

    expect(result).toHaveLength(1);
  });

  it("UTC 날짜가 다르더라도 KST 자정 경계를 정확히 따른다 (Story 2.1 타임존 버그 회귀 방지)", async () => {
    const hall = await createTestHall();
    // 2026-07-31T16:00:00Z = 2026-08-01 01:00 KST — UTC로는 7/31이지만 KST로는 8/1이다.
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-07-31T16:00:00.000Z"),
      contractConditions: {},
    });

    expect(await listCeremoniesForDate("2026-08-01")).toHaveLength(1);
    expect(await listCeremoniesForDate("2026-07-31")).toHaveLength(0);
  });

  it("해당 날짜에 예식이 없으면 빈 배열을 반환한다", async () => {
    await createTestHall();
    expect(await listCeremoniesForDate("2026-08-01")).toEqual([]);
  });
});

describe("listCeremonyDatesForMonth (Story 5.2 AC 1)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("해당 월(KST)에 예식이 있는 날짜 문자열 Set을 반환한다", async () => {
    const hall = await createTestHall();
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-15T05:00:00.000Z"),
      contractConditions: {},
    });

    const result = await listCeremonyDatesForMonth(2026, 8);

    expect(result).toEqual(new Set(["2026-08-01", "2026-08-15"]));
  });

  it("월 경계에 걸친 예식도 KST 기준으로 올바른 달에 배정한다", async () => {
    const hall = await createTestHall();
    // 2026-01-31T16:00:00Z = 2026-02-01 01:00 KST — 1월이 아니라 2월로 집계되어야 한다.
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-01-31T16:00:00.000Z"),
      contractConditions: {},
    });

    expect(await listCeremonyDatesForMonth(2026, 1)).toEqual(new Set());
    expect(await listCeremonyDatesForMonth(2026, 2)).toEqual(new Set(["2026-02-01"]));
  });

  it("해당 월에 예식이 없으면 빈 Set을 반환한다", async () => {
    await createTestHall();
    expect(await listCeremonyDatesForMonth(2026, 8)).toEqual(new Set());
  });
});

describe("listCeremoniesPaginated (Story 5.2 AC 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("예식이 없으면 빈 목록과 totalCount 0, totalPages 1을 반환한다", async () => {
    await createTestHall();
    const result = await listCeremoniesPaginated({ page: 1, pageSize: 10 });
    expect(result).toEqual({ ceremonies: [], totalCount: 0, totalPages: 1 });
  });

  it("예식 일시 역순으로 정렬해 반환한다", async () => {
    const hall = await createTestHall();
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-03T05:00:00.000Z"),
      contractConditions: {},
    });
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-02T05:00:00.000Z"),
      contractConditions: {},
    });

    const result = await listCeremoniesPaginated({ page: 1, pageSize: 10 });

    expect(result.ceremonies.map((c) => c.ceremonyAt.toISOString())).toEqual([
      "2026-08-03T05:00:00.000Z",
      "2026-08-02T05:00:00.000Z",
      "2026-08-01T05:00:00.000Z",
    ]);
    expect(result.totalCount).toBe(3);
    expect(result.totalPages).toBe(1);
  });

  it("페이지 크기에 맞춰 슬라이스하고 totalPages를 계산한다", async () => {
    const hall = await createTestHall();
    for (let i = 1; i <= 5; i++) {
      await createCeremony({
        hallId: hall.id,
        ceremonyAt: new Date(`2026-08-0${i}T05:00:00.000Z`),
        contractConditions: {},
      });
    }

    const page1 = await listCeremoniesPaginated({ page: 1, pageSize: 2 });
    const page2 = await listCeremoniesPaginated({ page: 2, pageSize: 2 });
    const page3 = await listCeremoniesPaginated({ page: 3, pageSize: 2 });

    expect(page1.ceremonies).toHaveLength(2);
    expect(page2.ceremonies).toHaveLength(2);
    expect(page3.ceremonies).toHaveLength(1);
    expect(page1.totalCount).toBe(5);
    expect(page1.totalPages).toBe(3);
  });

  it("범위를 벗어난 page 값은 유효 범위로 clamp된다", async () => {
    const hall = await createTestHall();
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const tooHigh = await listCeremoniesPaginated({ page: 99, pageSize: 10 });
    const tooLow = await listCeremoniesPaginated({ page: 0, pageSize: 10 });

    expect(tooHigh.ceremonies).toHaveLength(1);
    expect(tooLow.ceremonies).toHaveLength(1);
  });

  it("여러 홀의 예식을 모두 병합해 반환한다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    await createCeremony({
      hallId: hallA.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await createCeremony({
      hallId: hallB.id,
      ceremonyAt: new Date("2026-08-02T05:00:00.000Z"),
      contractConditions: {},
    });

    const result = await listCeremoniesPaginated({ page: 1, pageSize: 10 });

    expect(result.ceremonies.map((c) => c.hallName).sort()).toEqual(["A홀", "B홀"]);
  });
});
