import type {
  CandidateChecklistItem,
  ChecklistInstanceItem,
} from "@/lib/db/repositories/checklist-instance";

// candidates/items는 이미 리포지토리에서 (단계 순서, 항목 순서)로 정렬되어 온다 — 순서를
// 유지한 채 연속된 같은 그룹 키끼리만 묶는 순차 그룹핑이면 충분하다(재정렬 불필요).
// 코덱스 리뷰 3차 P2(candidates): stepName은 유일함이 보장되지 않는다(관리자가 같은
// 이름의 단계를 두 번 만들 수 있음) — templateItemId(단계 FK)로 묶어 서로 다른 두
// 단계가 이름이 같다는 이유로 하나로 합쳐지지 않게 한다.
export function groupSequentialByKey<T, K>(items: T[], keyFn: (item: T) => K): [K, T[]][] {
  const groups: [K, T[]][] = [];
  for (const item of items) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0] === keyFn(item)) {
      lastGroup[1].push(item);
    } else {
      groups.push([keyFn(item), [item]]);
    }
  }
  return groups;
}

export function groupCandidatesByStep(
  candidates: CandidateChecklistItem[],
): [string, CandidateChecklistItem[]][] {
  return groupSequentialByKey(candidates, (c) => c.templateItemId);
}

// 코덱스 리뷰 P2: templateItemId가 null인(부모 단계가 삭제된) 항목이 여러 개 있으면
// 전부 같은 null 키로 묶여, 서로 다른 삭제된 단계에서 온 항목들이 하나의 그룹으로
// 합쳐지고 첫 항목의 stepName만 헤더에 표시되는 문제가 있었다. templateItemId가
// null일 때는 각 항목의 고유 id를 키로 써서 절대 서로 합쳐지지 않게 한다(단일 항목
// 그룹이 되더라도, 잘못된 그룹핑보다 안전하다 — 각자의 stepName은 정확히 유지됨).
export function groupItemsByStep(
  items: ChecklistInstanceItem[],
): [string, ChecklistInstanceItem[]][] {
  return groupSequentialByKey(items, (i) => i.templateItemId ?? `orphan:${i.id}`);
}
