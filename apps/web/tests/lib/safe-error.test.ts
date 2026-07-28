import { describe, it, expect } from "vitest";
import { toSafeErrorLabel } from "@/lib/safe-error";

// NFR-5: 이 함수의 유일한 계약은 "메시지가 절대 새어나가지 않는다"이다.
// (Story 4.1 코덱스 1차 P1 — drizzle이 실패한 쿼리의 파라미터를, 벤더 어댑터가
//  응답 본문을 메시지에 싣기 때문에 메시지가 곧 유출 통로가 된다.)

describe("toSafeErrorLabel", () => {
  it("오류 메시지를 포함하지 않는다", () => {
    const secret = "주례자가 성혼 선언을 축가 앞으로 당겼다";
    const label = toSafeErrorLabel(new Error(`쿼리 실패: params=["${secret}"]`));

    expect(label).not.toContain(secret);
    expect(label).not.toContain("params");
    expect(label).toBe("Error");
  });

  it("오류 종류(name)를 남긴다", () => {
    class DrizzleQueryError extends Error {
      override name = "DrizzleQueryError";
    }
    expect(toSafeErrorLabel(new DrizzleQueryError("상황 원문이 담긴 메시지"))).toBe(
      "DrizzleQueryError",
    );
  });

  it("Postgres SQLSTATE가 있으면 함께 남긴다", () => {
    const err = Object.assign(new Error("duplicate key value ... (상황 원문)"), {
      code: "23505",
    });
    expect(toSafeErrorLabel(err)).toBe("Error(23505)");
  });

  // Story 5.4 코덱스 3차에서 확인 — drizzle이 감싸면 실제 코드는 cause에 있다.
  it("drizzle이 감싼 경우 cause.code를 읽는다", () => {
    class DrizzleQueryError extends Error {
      override name = "DrizzleQueryError";
    }
    const err = new DrizzleQueryError("Failed query: insert into variable_cases ...");
    err.cause = { code: "23503" };

    expect(toSafeErrorLabel(err)).toBe("DrizzleQueryError(23503)");
  });

  it("Error가 아닌 값도 안전하게 처리한다", () => {
    expect(toSafeErrorLabel("문자열 상황 설명")).toBe("UnknownError");
    expect(toSafeErrorLabel(null)).toBe("UnknownError");
    expect(toSafeErrorLabel({ message: "객체 상황 설명" })).toBe("UnknownError");
  });

  it("name이 비어 있으면 Error로 대체한다", () => {
    const err = new Error("메시지");
    err.name = "";
    expect(toSafeErrorLabel(err)).toBe("Error");
  });
});
