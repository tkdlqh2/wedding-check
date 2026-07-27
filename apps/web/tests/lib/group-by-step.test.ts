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
});

describe("groupCandidatesByStep", () => {
  it("빈 배열은 빈 그룹 목록을 반환한다", () => {
    expect(groupCandidatesByStep([])).toEqual([]);
  });
});
