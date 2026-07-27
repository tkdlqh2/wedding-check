import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import * as memberRepo from "@/lib/db/repositories/member";
import { auth } from "@/lib/auth";

async function createTestMember(overrides: Partial<{
  name: string;
  phoneNumber: string;
  role: "operator" | "admin";
  password: string;
}> = {}) {
  const phoneNumber = overrides.phoneNumber ?? `010${Date.now()}`.slice(0, 11);
  const { user } = await auth.api.createUser({
    body: {
      email: `${phoneNumber}@internal.wedding-check.local`,
      password: overrides.password ?? "test-password-1234",
      name: overrides.name ?? "테스트 회원",
      role: overrides.role ?? "operator",
      data: { phoneNumber, phoneNumberVerified: true },
    },
  });
  return user;
}

describe("memberRepo.findAll", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("계정이 없으면 빈 배열을 반환한다", async () => {
    const result = await memberRepo.findAll();
    expect(result).toEqual([]);
  });

  it("등록된 계정을 모두 반환한다", async () => {
    await createTestMember({ phoneNumber: "01011111111", name: "회원A" });
    await createTestMember({ phoneNumber: "01022222222", name: "회원B" });

    const result = await memberRepo.findAll();

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.name).sort()).toEqual(["회원A", "회원B"]);
  });
});

describe("memberRepo.findByPhoneNumber", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("해당 전화번호의 계정이 없으면 undefined를 반환한다", async () => {
    const result = await memberRepo.findByPhoneNumber("01099999999");
    expect(result).toBeUndefined();
  });

  it("해당 전화번호의 계정을 반환한다", async () => {
    await createTestMember({ phoneNumber: "01033333333", name: "회원C" });

    const result = await memberRepo.findByPhoneNumber("01033333333");

    expect(result?.name).toBe("회원C");
  });
});

describe("memberRepo.findById (Story 5.7)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("존재하지 않는 id면 undefined를 반환한다", async () => {
    const result = await memberRepo.findById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeUndefined();
  });

  it("해당 id의 계정을 반환한다", async () => {
    const created = await createTestMember({ phoneNumber: "01044441234", name: "회원D" });

    const result = await memberRepo.findById(created.id);

    expect(result?.name).toBe("회원D");
  });
});
