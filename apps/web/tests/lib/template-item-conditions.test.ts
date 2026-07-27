import { describe, it, expect } from "vitest";
import { readContractConditions } from "@/app/admin/templates/[hallId]/contract-conditions";

// Story 2.2 코덱스 리뷰 P1 회귀 테스트: 템플릿 항목의 조건 객체는 체크 안 한 키를
// false로 채우면 안 된다 — 부분집합 매칭(JSONB @>)에서 "무관심"과 "false 요구"가
// 달라지기 때문이다. 체크 안 한 항목은 반드시 {}(빈 객체, 무조건 포함)여야 한다.
describe("readContractConditions", () => {
  it("아무것도 체크 안 하면 빈 객체를 반환한다(무조건 포함)", () => {
    const fd = new FormData();
    expect(readContractConditions(fd)).toEqual({});
  });

  it("체크한 키만 포함하고 체크 안 한 키는 넣지 않는다", () => {
    const fd = new FormData();
    fd.set("requiresOfficiant", "on");
    expect(readContractConditions(fd)).toEqual({ requiresOfficiant: true });
    expect(readContractConditions(fd)).not.toHaveProperty("hasAdditionalEvent");
  });

  it("둘 다 체크하면 둘 다 포함한다", () => {
    const fd = new FormData();
    fd.set("requiresOfficiant", "on");
    fd.set("hasAdditionalEvent", "on");
    expect(readContractConditions(fd)).toEqual({
      requiresOfficiant: true,
      hasAdditionalEvent: true,
    });
  });
});
