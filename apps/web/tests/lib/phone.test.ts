import { describe, it, expect } from "vitest";
import { formatPhoneNumberDisplay } from "@/lib/phone";

describe("formatPhoneNumberDisplay (Story 5.7 AC 3)", () => {
  it("11자리 번호는 3-4-4 형식으로 표시된다", () => {
    expect(formatPhoneNumberDisplay("01012345678")).toBe("010-1234-5678");
  });

  it("하이픈이 섞인 11자리 번호도 정규화 후 3-4-4로 표시된다", () => {
    expect(formatPhoneNumberDisplay("010-1234-5678")).toBe("010-1234-5678");
  });

  it("10자리 번호는 3-3-4 형식으로 표시된다", () => {
    expect(formatPhoneNumberDisplay("0212345678")).toBe("021-234-5678");
  });

  it("null이면 미등록 문구를 반환한다", () => {
    expect(formatPhoneNumberDisplay(null)).toBe("전화번호 미등록");
  });

  it("빈 문자열이면 미등록 문구를 반환한다", () => {
    expect(formatPhoneNumberDisplay("")).toBe("전화번호 미등록");
  });

  it("비정상 길이는 원본을 그대로 반환한다(방어적 폴백)", () => {
    expect(formatPhoneNumberDisplay("123")).toBe("123");
  });
});
