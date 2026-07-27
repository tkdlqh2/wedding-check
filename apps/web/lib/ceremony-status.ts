// [ASSUMPTION] 예식 진행 상태(예정/진행중/완료)를 오퍼레이터가 직접 바꾸는 FR은 아직
// 없다(Story 2.1 Dev Notes에 이미 기록된 제약) — 예식 일시와 현재 시각만 비교한 단순
// 2단계(예정/완료) 표시로, 별도 저장 필드 없이 렌더링 시점에 계산한다. 목록 카드
// (ceremony-row.tsx)와 상세 화면(page.tsx) 둘 다 이 계산을 공유한다.
export function isCeremonyDone(ceremonyAt: Date): boolean {
  return ceremonyAt.getTime() <= Date.now();
}
