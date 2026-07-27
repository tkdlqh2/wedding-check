// 예식 진행 상태 — ceremonies.status 저장 필드의 앱 레이어 표현(2026-07-27 대표 지시:
// 상태는 시간으로 추정하지 않고 오퍼레이터가 실행 화면의 예식 시작/종료 버튼으로 직접
// 변경한다, prototype RunScreen.js). 전환은 upcoming → ongoing → done 한 방향만
// 허용한다(라이브 예식은 되돌릴 수 없다 — DESIGN.md §12.3).
export const CEREMONY_STATUSES = ["upcoming", "ongoing", "done"] as const;

export type CeremonyStatus = (typeof CEREMONY_STATUSES)[number];

export const CEREMONY_STATUS_LABELS: Record<CeremonyStatus, string> = {
  upcoming: "예정",
  ongoing: "진행중",
  done: "완료",
};

// DB의 plain text 값을 안전하게 좁힌다 — 알 수 없는 값(이론상 조작·마이그레이션 누락)은
// 가장 보수적인 done(수정 잠금 + 완료 표시)으로 취급하지 않고 upcoming으로 되돌리면
// 잠금이 풀리므로, 편집 잠금 관점에서 안전한 done으로 처리한다.
export function asCeremonyStatus(value: string): CeremonyStatus {
  return (CEREMONY_STATUSES as readonly string[]).includes(value)
    ? (value as CeremonyStatus)
    : "done";
}

// 대표 지시(2026-07-27): 예정이 아닌 예식(진행중·종료)은 관리자 단에서 수정 불가.
export function isEditableStatus(status: string): boolean {
  return asCeremonyStatus(status) === "upcoming";
}

export function nextCeremonyStatus(current: CeremonyStatus): CeremonyStatus | null {
  if (current === "upcoming") return "ongoing";
  if (current === "ongoing") return "done";
  return null;
}
