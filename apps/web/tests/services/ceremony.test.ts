import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall } from "../helpers/db";
import {
  createCeremony,
  listTodaysCeremonies,
  listCeremoniesForDate,
  listCeremoniesPaginated,
  listCeremonyDatesForMonth,
  toggleAssignee,
  listCeremonyAssignees,
  setCeremonyStatus,
  CeremonyValidationError,
} from "@/lib/services/ceremony";
import { createMember } from "@/lib/services/member";

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

  // Story 5.3 AC 2: 신랑·신부 이름이 함께 저장되고, 앞뒤 공백은 제거된다.
  it("groomName/brideName을 넘기면 trim되어 저장된다", async () => {
    const hall = await createTestHall();

    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
      groomName: "  김철수  ",
      brideName: "  이영희  ",
    });

    expect(ceremony.groomName).toBe("김철수");
    expect(ceremony.brideName).toBe("이영희");
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

  it("비활성화된 홀의 예식도 포함한다 (코덱스 리뷰 P2 — 홀 비활성화로 과거 예식이 사라지면 안 됨)", async () => {
    const hall = await createTestHall({ isActive: false });
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    expect(await listCeremoniesForDate("2026-08-01")).toHaveLength(1);
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

  it("비활성화된 홀의 예식도 점 마커에 포함한다 (코덱스 리뷰 P2)", async () => {
    const hall = await createTestHall({ isActive: false });
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    expect(await listCeremonyDatesForMonth(2026, 8)).toEqual(new Set(["2026-08-01"]));
  });
});

describe("listCeremoniesPaginated (Story 5.2 AC 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("예식이 없으면 빈 목록과 totalCount 0, totalPages 1을 반환한다", async () => {
    await createTestHall();
    const result = await listCeremoniesPaginated({ page: 1, pageSize: 10 });
    expect(result).toEqual({ ceremonies: [], page: 1, totalCount: 0, totalPages: 1 });
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

  it("범위를 벗어난 page 값은 유효 범위로 clamp되고, 반환값의 page도 실제로 보여준 페이지를 반영한다", async () => {
    const hall = await createTestHall();
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const tooHigh = await listCeremoniesPaginated({ page: 99, pageSize: 10 });
    const tooLow = await listCeremoniesPaginated({ page: 0, pageSize: 10 });

    expect(tooHigh.ceremonies).toHaveLength(1);
    expect(tooHigh.page).toBe(1); // totalPages가 1이므로 99는 1로 clamp
    expect(tooLow.ceremonies).toHaveLength(1);
    expect(tooLow.page).toBe(1);
  });

  it("NaN 같은 비정상 page 값도 안전하게 1로 처리한다 (코덱스 리뷰 P2 회귀 방지)", async () => {
    await createTestHall();
    const result = await listCeremoniesPaginated({ page: NaN, pageSize: 10 });
    expect(result.page).toBe(1);
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

  it("비활성화된 홀의 예식도 목록에 포함한다 (코덱스 리뷰 P2)", async () => {
    const hall = await createTestHall({ isActive: false });
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    const result = await listCeremoniesPaginated({ page: 1, pageSize: 10 });

    expect(result.totalCount).toBe(1);
  });
});

describe("toggleAssignee — 담당 오퍼레이터 다중 배정 (FR-18)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("활성 오퍼레이터를 토글하면 배정된다 — 여러 명 동시 배정 가능", async () => {
    const hall = await createTestHall();
    const operatorA = await createMember({
      name: "오퍼레이터A",
      phoneNumber: "01098880001",
      password: "pw-91234",
    });
    const operatorB = await createMember({
      name: "오퍼레이터B",
      phoneNumber: "01098880002",
      password: "pw-91234",
    });
    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    await toggleAssignee(hall.id, ceremony.id, operatorA.id);
    await toggleAssignee(hall.id, ceremony.id, operatorB.id);

    const assignees = await listCeremonyAssignees(hall.id, ceremony.id);
    expect(assignees.map((a) => a.name).sort()).toEqual(["오퍼레이터A", "오퍼레이터B"]);
  });

  it("이미 배정된 오퍼레이터를 다시 토글하면 해제된다", async () => {
    const hall = await createTestHall();
    const operator = await createMember({
      name: "오퍼레이터C",
      phoneNumber: "01098880003",
      password: "pw-91234",
    });
    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await toggleAssignee(hall.id, ceremony.id, operator.id);

    await toggleAssignee(hall.id, ceremony.id, operator.id);

    const assignees = await listCeremonyAssignees(hall.id, ceremony.id);
    expect(assignees).toHaveLength(0);
  });

  it("관리자 role 계정은 배정할 수 없다 (`[ASSUMPTION]` 활성 오퍼레이터만)", async () => {
    const hall = await createTestHall();
    const admin = await createMember({
      name: "관리자A",
      phoneNumber: "01098880004",
      password: "pw-91234",
      role: "admin",
    });
    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    await expect(toggleAssignee(hall.id, ceremony.id, admin.id)).rejects.toThrow(
      CeremonyValidationError,
    );
  });

  it("배정 이후 비활성화된 담당자도 토글로 해제할 수 있다(정리 수단 보존)", async () => {
    const hall = await createTestHall();
    const operator = await createMember({
      name: "오퍼레이터D",
      phoneNumber: "01098880005",
      password: "pw-91234",
    });
    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await toggleAssignee(hall.id, ceremony.id, operator.id);
    // 배정 뒤 계정이 비활성화(banned)돼 배정 자격을 잃은 상황을 재현 — 해제는 자격
    // 검증 없이 항상 허용되어야 한다(stale 담당자 정리 수단 보존).
    const { db } = await import("@/lib/db");
    const { user } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(user).set({ banned: true }).where(eq(user.id, operator.id));

    await toggleAssignee(hall.id, ceremony.id, operator.id);

    const assignees = await listCeremonyAssignees(hall.id, ceremony.id);
    expect(assignees).toHaveLength(0);
  });

  it("존재하지 않는 operatorId는 거부된다", async () => {
    const hall = await createTestHall();
    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    await expect(
      toggleAssignee(hall.id, ceremony.id, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(CeremonyValidationError);
  });

  it("존재하지 않는 예식이면 거부된다", async () => {
    const hall = await createTestHall();
    const operator = await createMember({
      name: "오퍼레이터E",
      phoneNumber: "01098880006",
      password: "pw-91234",
    });

    await expect(
      toggleAssignee(hall.id, "00000000-0000-0000-0000-000000000000", operator.id),
    ).rejects.toThrow(CeremonyValidationError);
  });

  it("listCeremoniesPaginated가 반환하는 예식에 담당자 목록이 병합된다", async () => {
    const hall = await createTestHall();
    const operator = await createMember({
      name: "오퍼레이터F",
      phoneNumber: "01098880007",
      password: "pw-91234",
    });
    const assigned = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-02T05:00:00.000Z"),
      contractConditions: {},
    });
    await toggleAssignee(hall.id, assigned.id, operator.id);

    const result = await listCeremoniesPaginated({ page: 1, pageSize: 10 });

    const assignedRow = result.ceremonies.find((c) => c.id === assigned.id);
    const unassignedRow = result.ceremonies.find((c) => c.id !== assigned.id);
    expect(assignedRow?.assignees.map((a) => a.name)).toEqual(["오퍼레이터F"]);
    expect(unassignedRow?.assignees).toEqual([]);
  });
});

describe("setCeremonyStatus — 오퍼레이터의 예식 시작/종료 (2026-07-27 대표 지시)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("upcoming → ongoing → done 순방향 전환만 허용된다", async () => {
    const hall = await createTestHall();
    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    expect(ceremony.status).toBe("upcoming");

    // 예정 상태에서 곧바로 done으로 건너뛸 수 없다.
    await expect(setCeremonyStatus(hall.id, ceremony.id, "done")).rejects.toThrow(
      CeremonyValidationError,
    );

    await setCeremonyStatus(hall.id, ceremony.id, "ongoing");
    await setCeremonyStatus(hall.id, ceremony.id, "done");

    const updated = await (await import("@/lib/db/repositories/ceremony")).findById(
      hall.id,
      ceremony.id,
    );
    expect(updated?.status).toBe("done");

    // 종료된 예식은 되돌릴 수 없다.
    await expect(setCeremonyStatus(hall.id, ceremony.id, "ongoing")).rejects.toThrow(
      CeremonyValidationError,
    );
  });

  it("경합에서 진 전환(0행 갱신)은 실제 상태가 요청과 다르면 성공으로 응답하지 않는다 (코덱스 리뷰 P2)", async () => {
    const hall = await createTestHall();
    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    const ceremonyRepo = await import("@/lib/db/repositories/ceremony");
    const { vi } = await import("vitest");
    // 이 요청이 upcoming을 읽은 직후, 다른 요청들이 ongoing→done까지 전환한 경합을
    // 결정적으로 재현 — findById는 처음엔 upcoming을 주지만 UPDATE 시점엔 DB가 이미
    // done이라 0행 갱신이 된다.
    const findByIdSpy = vi.spyOn(ceremonyRepo, "findById");
    const original = await ceremonyRepo.findById(hall.id, ceremony.id);
    findByIdSpy.mockResolvedValueOnce(original); // 서비스의 첫 조회: upcoming으로 보임
    await ceremonyRepo.updateStatus(hall.id, ceremony.id, "upcoming", "ongoing");
    await ceremonyRepo.updateStatus(hall.id, ceremony.id, "ongoing", "done");

    await expect(setCeremonyStatus(hall.id, ceremony.id, "ongoing")).rejects.toThrow(
      CeremonyValidationError,
    );
    findByIdSpy.mockRestore();

    const latest = await ceremonyRepo.findById(hall.id, ceremony.id);
    expect(latest?.status).toBe("done");
  });

  it("진행중/종료 상태의 예식에는 담당자를 배정/해제할 수 없다", async () => {
    const hall = await createTestHall();
    const operator = await createMember({
      name: "오퍼레이터H",
      phoneNumber: "01098880008",
      password: "pw-91234",
    });
    const ceremony = await createCeremony({
      hallId: hall.id,
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await setCeremonyStatus(hall.id, ceremony.id, "ongoing");

    await expect(toggleAssignee(hall.id, ceremony.id, operator.id)).rejects.toThrow(
      "진행 중이거나 종료된 예식은 수정할 수 없습니다",
    );
  });
});
