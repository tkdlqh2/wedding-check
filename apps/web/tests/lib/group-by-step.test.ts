import { describe, it, expect } from "vitest";
import {
  groupSequentialByKey,
  groupCandidatesByStep,
  groupItemsByStep,
} from "@/app/admin/ceremonies/[hallId]/[ceremonyId]/group-by-step";
import type { ChecklistInstanceItem } from "@/lib/db/repositories/checklist-instance";

function makeItem(overrides: Partial<ChecklistInstanceItem>): ChecklistInstanceItem {
  return {
    id: "item-id",
    hallId: "hall-id",
    instanceId: "instance-id",
    templateItemId: null,
    templateItemCheckId: null,
    adHocGroupRootId: null,
    stepName: "단계",
    title: "제목",
    description: null,
    sortOrder: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("groupSequentialByKey", () => {
  it("연속된 같은 키만 하나의 그룹으로 묶는다", () => {
    const result = groupSequentialByKey([1, 1, 2, 2, 1], (n) => n);
    expect(result).toEqual([
      [1, [1, 1]],
      [2, [2, 2]],
      [1, [1]],
    ]);
  });
});

describe("groupItemsByStep (Story 5.8 AC 6, 코덱스 리뷰 P2)", () => {
  it("templateItemId가 같은 항목끼리 묶인다", () => {
    const items = [
      makeItem({ id: "a", templateItemId: "step-1", stepName: "개식사" }),
      makeItem({ id: "b", templateItemId: "step-1", stepName: "개식사" }),
      makeItem({ id: "c", templateItemId: "step-2", stepName: "신랑입장" }),
    ];

    const groups = groupItemsByStep(items);

    expect(groups).toHaveLength(2);
    expect(groups[0][1].map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1][1].map((i) => i.id)).toEqual(["c"]);
  });

  it("templateItemId가 null인 서로 다른 삭제된 단계의 항목들이 하나로 합쳐지지 않는다 (회귀 지점)", () => {
    // 두 개의 서로 다른 단계가 삭제되어 templateItemId가 둘 다 null이 된 상황을 재현.
    const items = [
      makeItem({ id: "orphan-a1", templateItemId: null, stepName: "삭제된 단계 A" }),
      makeItem({ id: "orphan-a2", templateItemId: null, stepName: "삭제된 단계 A" }),
      makeItem({ id: "orphan-b1", templateItemId: null, stepName: "삭제된 단계 B" }),
    ];

    const groups = groupItemsByStep(items);

    // 예전 구현(templateItemId 그대로 키로 사용)은 null === null이라 이 3개가 전부
    // 하나의 그룹으로 합쳐지고 헤더에 "삭제된 단계 A"만 표시됐다 — 이제는 항목별로
    // 분리되어 각자의 stepName이 정확히 유지되어야 한다.
    expect(groups).toHaveLength(3);
    expect(groups.map(([, groupItems]) => groupItems[0].stepName)).toEqual([
      "삭제된 단계 A",
      "삭제된 단계 A",
      "삭제된 단계 B",
    ]);
  });
  it("adHocGroupRootId가 같은 항목끼리 묶인다 (Story 5.8 ad-hoc 단계, 코덱스 리뷰 2차 P1 회귀 지점)", () => {
    // "이 예식에만" 새 단계는 templateItemId가 항상 null이지만 adHocGroupRootId로
    // 소속을 표시한다 — 이 값을 확인하지 않으면 같은 단계에 항목을 두 번째로 추가해도
    // 각자 별도 그룹(별도 헤더)으로 렌더링되는 실결함이 있었다.
    const items = [
      makeItem({ id: "adhoc-1", templateItemId: null, adHocGroupRootId: "group-1", stepName: "새 단계" }),
      makeItem({ id: "adhoc-2", templateItemId: null, adHocGroupRootId: "group-1", stepName: "새 단계" }),
      makeItem({ id: "adhoc-3", templateItemId: null, adHocGroupRootId: "group-2", stepName: "다른 새 단계" }),
    ];

    const groups = groupItemsByStep(items);

    expect(groups).toHaveLength(2);
    expect(groups[0][1].map((i) => i.id)).toEqual(["adhoc-1", "adhoc-2"]);
    expect(groups[1][1].map((i) => i.id)).toEqual(["adhoc-3"]);
  });
});

describe("groupCandidatesByStep", () => {
  it("빈 배열은 빈 그룹 목록을 반환한다", () => {
    expect(groupCandidatesByStep([])).toEqual([]);
  });
});
