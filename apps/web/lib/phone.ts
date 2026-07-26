/**
 * 전화번호는 하이픈 없이 숫자만 저장/조회한다(2026-07-26 결정 — 입력 시 하이픈을
 * 넣든 안 넣든 동일한 계정으로 인식되어야 함). 시드 스크립트(쓰기)와 로그인
 * 폼(읽기) 양쪽에서 이 함수를 거쳐야 phoneNumber 조회가 어긋나지 않는다.
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, "");
}
