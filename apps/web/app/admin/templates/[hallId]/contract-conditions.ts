// ceremony-form.tsx의 contractConditions와 키 이름은 같지만(requiresOfficiant,
// hasAdditionalEvent) 의미가 다르다 — 예식 쪽은 "그 예식의 실제 상태"라 두 키를 항상
// true/false로 채우는 게 맞지만, 템플릿 항목 쪽은 "이 조건이어야만 포함"이라는 요구
// 조건이라 체크 안 한 조건은 아예 키를 넣지 않아야 한다(부분집합 매칭이 정확히
// 동작하려면 무관심=키 없음, false 아님). 항상 두 키를 채우면 태깅 안 한 항목도
// {requiresOfficiant:false, hasAdditionalEvent:false}가 되어, 정작 그 조건이
// true인 예식에서 부분집합 매칭에 실패해 잘못 제외된다(Story 2.2 코덱스 리뷰 P1).
//
// "use server" 파일(actions.ts)의 export는 전부 async Server Action이어야 해서
// (Next.js 빌드 제약) 이 순수 함수는 별도 파일로 분리한다.
export function readContractConditions(formData: FormData): Record<string, boolean> {
  const conditions: Record<string, boolean> = {};
  if (formData.get("requiresOfficiant") === "on") conditions.requiresOfficiant = true;
  if (formData.get("hasAdditionalEvent") === "on") conditions.hasAdditionalEvent = true;
  return conditions;
}
