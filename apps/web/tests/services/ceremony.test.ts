import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall } from "../helpers/db";
import {
  createCeremony,
  listTodaysCeremonies,
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
