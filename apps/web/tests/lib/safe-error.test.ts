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

  // 코덱스 2차 P2: name과 code는 오류를 만든 쪽이 자유롭게 지정할 수 있는 값이다.
  // 벤더 SDK나 미래의 코드가 여기에 원문을 담아버리면 "메시지만 막으면 된다"는 전제가
  // 무너지므로, 통과 조건을 형태로 못 박는다.
  it.each([
    ["공백 포함", "Error: 주례자가 순서를 바꿈"],
    ["한글", "오류주례자가순서를바꿈"],
    ["기호 포함", "Error(축가-MR)"],
    ["숫자로 시작", "1Error"],
    ["64자 초과", "E".repeat(65)],
  ])("name이 안전한 형태가 아니면(%s) Error로 떨어뜨린다", (_case, name) => {
    const err = new Error("메시지");
    err.name = name;

    const label = toSafeErrorLabel(err);

    expect(label).toBe("Error");
    expect(label).not.toContain("주례자");
  });

  it.each([
    ["5자리가 아님", "235"],
    ["소문자", "23a05"],
    ["문장", "duplicate key (주례자가 순서를 바꿈)"],
  ])("code가 SQLSTATE 형태가 아니면(%s) 생략한다", (_case, code) => {
    const err = Object.assign(new Error("메시지"), { code });

    const label = toSafeErrorLabel(err);

    expect(label).toBe("Error");
    expect(label).not.toContain("주례자");
  });

  // 출력 형태 자체를 고정해 둔다 — 이 계약이 깨지면 유출 가능성이 다시 열린다.
  it("출력은 항상 Name 또는 Name(SQLSTATE) 형태다", () => {
    const cases: unknown[] = [
      new Error("메시지"),
      Object.assign(new Error("메시지"), { code: "23505" }),
      Object.assign(new Error("메시지"), { name: "한글이름", code: "!!!" }),
      "문자열",
      null,
    ];
    for (const err of cases) {
      expect(toSafeErrorLabel(err)).toMatch(/^[A-Za-z][A-Za-z0-9_]*(\([0-9A-Z]{5}\))?$/);
    }
  });
});
