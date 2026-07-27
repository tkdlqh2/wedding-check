/**
 * 전화번호는 하이픈 없이 숫자만 저장/조회한다(2026-07-26 결정 — 입력 시 하이픈을
 * 넣든 안 넣든 동일한 계정으로 인식되어야 함). 시드 스크립트(쓰기)와 로그인
 * 폼(읽기) 양쪽에서 이 함수를 거쳐야 phoneNumber 조회가 어긋나지 않는다.
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, "");
}

/**
 * Story 5.7 AC 3: 회원 목록 표시 전용 포맷 — 저장/조회는 계속 숫자만(normalizePhoneNumber)
 * 쓰고, 이 함수는 화면 표시 직전에만 적용한다. 11자리(휴대전화)는 3-4-4, 10자리(구형
 * 번호대)는 3-3-4로 나눈다. 그 외 길이는 원본을 그대로 반환한다(방어적 폴백 — 저장된
 * 값을 훼손하지 않음).
 */
export function formatPhoneNumberDisplay(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return "전화번호 미등록";
  const digits = normalizePhoneNumber(phoneNumber);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phoneNumber;
}
