import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb,
  createTestHall,
  createTestTemplateItem,
  createTestChecklistItem,
} from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as instanceRepo from "@/lib/db/repositories/checklist-instance";

async function createCeremonyWithNoItems(hallId: string) {
  const { ceremonyId, instanceId } = await ceremonyRepo.create(hallId, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
  return { ceremonyId, instanceId };
}

describe("checklistInstanceRepo — addItem/removeItem", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("addItem은 체크리스트 항목을 스냅샷으로 복사해 추가한다", async () => {
    const hall = await createTestHall();
    // 예식을 먼저 만들어야 자동 조합(ceremonyRepo.create의 CTE)이 이 체크리스트 항목을
    // 이미 넣어버리지 않는다 — 순서를 바꾸면 addItem이 같은 항목을 중복으로 추가하는 꼴이 된다.
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장", sortOrder: 1 });
    const checklistItem = await createTestChecklistItem(hall.id, step.id, { title: "조명 전환" });

    const added = await instanceRepo.addItem(hall.id, instanceId, {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    });

    expect(added.stepName).toBe("신랑입장");
    expect(added.title).toBe("조명 전환");
    expect(added.templateItemCheckId).toBe(checklistItem.id);
    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(1);
  });

  it("같은 항목을 두 번 addItem해도 중복 행이 생기지 않는다(재전송/동시 제출 대비, 코덱스 P2)", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });
    const checklistItem = await createTestChecklistItem(hall.id, step.id);
    const input = {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    };

    const first = await instanceRepo.addItem(hall.id, instanceId, input);
    const second = await instanceRepo.addItem(hall.id, instanceId, input);

    expect(second.id).toBe(first.id);
    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(1);
  });

  it("removeItem은 인스턴스에서 해당 항목만 제거한다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "축가" });
    const checklistItem = await createTestChecklistItem(hall.id, step.id);
    const added = await instanceRepo.addItem(hall.id, instanceId, {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    });

    await instanceRepo.removeItem(hall.id, instanceId, added.id);

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(0);
  });

  // 코덱스 리뷰 P1: sortOrder에 체크리스트 항목의 "단계 안" sortOrder를 그대로 쓰면
  // 여러 단계가 각자 0부터 시작해 인스턴스 전체 순서와 동률·충돌이 났다 — 수동 추가는
  // 항상 인스턴스의 현재 최댓값 다음(맨 뒤)에 배치되어야 한다.
  it("수동 추가된 항목은 항상 인스턴스의 현재 최댓값 다음 sortOrder를 받는다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const stepA = await createTestTemplateItem(hall.id, { stepName: "단계A", sortOrder: 1 });
    const stepB = await createTestTemplateItem(hall.id, { stepName: "단계B", sortOrder: 2 });
    // 두 단계 모두 체크리스트 항목의 단계-내 sortOrder가 0부터 시작 — 이 값을 그대로
    // 인스턴스 sortOrder로 쓰면 충돌/동률이 난다는 것이 이 테스트의 핵심 전제.
    const itemA1 = await createTestChecklistItem(hall.id, stepA.id, { title: "A-1", sortOrder: 0 });
    const itemB1 = await createTestChecklistItem(hall.id, stepB.id, { title: "B-1", sortOrder: 0 });

    const addedA = await instanceRepo.addItem(hall.id, instanceId, {
      id: itemA1.id,
      title: itemA1.title,
      description: itemA1.description,
      stepId: stepA.id,
      stepName: stepA.stepName,
    });
    const addedB = await instanceRepo.addItem(hall.id, instanceId, {
      id: itemB1.id,
      title: itemB1.title,
      description: itemB1.description,
      stepId: stepB.id,
      stepName: stepB.stepName,
    });

    expect(addedB.sortOrder).toBeGreaterThan(addedA.sortOrder);
    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.map((i) => i.title)).toEqual(["A-1", "B-1"]);
  });

  // 코덱스 리뷰 5차 P2: 이미 단계A/단계B 항목이 순서대로 있는 인스턴스에 단계A의
  // 다른 항목을 나중에 수동 추가하면, 무조건 맨 뒤에 붙일 경우 A/B/A 순서가 되어
  // 오퍼레이터 화면이 같은 단계를 두 그룹으로 쪼개 보여준다 — 같은 단계의 기존 항목
  // 바로 뒤에 삽입되어(제3의 항목 사이에 끼지 않고) 하나의 연속된 그룹을 이뤄야 한다.
  it("이미 인스턴스에 있는 단계의 항목을 나중에 추가해도 그 단계 항목들과 연속으로 묶인다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const stepA = await createTestTemplateItem(hall.id, { stepName: "단계A", sortOrder: 1 });
    const stepB = await createTestTemplateItem(hall.id, { stepName: "단계B", sortOrder: 2 });
    const itemA1 = await createTestChecklistItem(hall.id, stepA.id, { title: "A-1", sortOrder: 0 });
    const itemA2 = await createTestChecklistItem(hall.id, stepA.id, { title: "A-2", sortOrder: 1 });
    const itemB1 = await createTestChecklistItem(hall.id, stepB.id, { title: "B-1", sortOrder: 0 });

    // 먼저 단계A-1, 단계B-1 순서로 인스턴스에 추가된 상태를 만든다(예: 처음엔
    // 단계A-2가 조건에 안 맞아 제외됐다가, 나중에 관리자가 수동으로 추가하는 시나리오).
    await instanceRepo.addItem(hall.id, instanceId, {
      id: itemA1.id,
      title: itemA1.title,
      description: itemA1.description,
      stepId: stepA.id,
      stepName: stepA.stepName,
    });
    await instanceRepo.addItem(hall.id, instanceId, {
      id: itemB1.id,
      title: itemB1.title,
      description: itemB1.description,
      stepId: stepB.id,
      stepName: stepB.stepName,
    });
    // 단계A의 또 다른 항목을 나중에 추가 — 무조건 맨 뒤(A-1, B-1, A-2)가 아니라
    // 단계A 항목들끼리 연속(A-1, A-2, B-1)이 되어야 한다.
    await instanceRepo.addItem(hall.id, instanceId, {
      id: itemA2.id,
      title: itemA2.title,
      description: itemA2.description,
      stepId: stepA.id,
      stepName: stepA.stepName,
    });

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.map((i) => i.title)).toEqual(["A-1", "A-2", "B-1"]);
  });

  // 코덱스 리뷰 6차 P1: "밀기" UPDATE가 한 문장 안에서 3개 이상의 행을 동시에 +1 하면,
  // (instance_id, sort_order) 제약이 DEFERRABLE이 아닐 때 아직 갱신 전인 행과 일시적으로
  // 충돌한다(예: sortOrder 1→2로 바뀌는 순간 아직 2인 행이 남아있으면 위반) — 2행
  // 스왑만으로는 이 계열의 버그가 드러나지 않아 3행 이상 밀리는 시나리오를 따로 고정한다.
  it("3개 이상의 항목이 한 번에 밀려야 해도 충돌 없이 순서가 맞는다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const stepA = await createTestTemplateItem(hall.id, { stepName: "단계A", sortOrder: 1 });
    const stepC = await createTestTemplateItem(hall.id, { stepName: "단계C", sortOrder: 2 });
    const itemA1 = await createTestChecklistItem(hall.id, stepA.id, { title: "A-1", sortOrder: 0 });
    const itemA2 = await createTestChecklistItem(hall.id, stepA.id, { title: "A-2", sortOrder: 1 });
    const itemsC = await Promise.all(
      ["C-1", "C-2", "C-3"].map((title, i) =>
        createTestChecklistItem(hall.id, stepC.id, { title, sortOrder: i }),
      ),
    );

    await instanceRepo.addItem(hall.id, instanceId, {
      id: itemA1.id,
      title: itemA1.title,
      description: itemA1.description,
      stepId: stepA.id,
      stepName: stepA.stepName,
    });
    for (const item of itemsC) {
      await instanceRepo.addItem(hall.id, instanceId, {
        id: item.id,
        title: item.title,
        description: item.description,
        stepId: stepC.id,
        stepName: stepC.stepName,
      });
    }
    // 단계A-2를 나중에 추가 — 단계C의 3개 행(C-1, C-2, C-3)이 한 문장 안에서 전부
    // sortOrder+1이 되어야 A-2가 A-1 바로 뒤에 끼어들 수 있다.
    await instanceRepo.addItem(hall.id, instanceId, {
      id: itemA2.id,
      title: itemA2.title,
      description: itemA2.description,
      stepId: stepA.id,
      stepName: stepA.stepName,
    });

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.map((i) => i.title)).toEqual(["A-1", "A-2", "C-1", "C-2", "C-3"]);
  });

  it("다른 홀의 instanceId/itemId로는 제거되지 않는다 (홀 스코프 격리)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { instanceId } = await createCeremonyWithNoItems(hallA.id);
    const step = await createTestTemplateItem(hallA.id, { stepName: "A홀 항목" });
    const checklistItem = await createTestChecklistItem(hallA.id, step.id);
    const added = await instanceRepo.addItem(hallA.id, instanceId, {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    });

    // hallB로 hallA의 instance/item을 지우려는 시도 — 조용히 0행 삭제로 끝나야 한다.
    await instanceRepo.removeItem(hallB.id, instanceId, added.id);

    const items = await instanceRepo.listItems(hallA.id, instanceId);
    expect(items).toHaveLength(1);
  });
});

describe("checklistInstanceRepo.addAdHocItem (Story 5.8)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stepId/groupRootId 없이 추가하면 새 ad-hoc 단계로 만들어지고 맨 뒤에 붙는다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "기존 단계" });
    const checklistItem = await createTestChecklistItem(hall.id, step.id, { title: "기존 항목" });
    await instanceRepo.addItem(hall.id, instanceId, {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    });

    const adHoc = await instanceRepo.addAdHocItem(hall.id, instanceId, {
      stepName: "이 예식만의 단계",
      title: "이 예식만의 항목",
      description: null,
      stepId: null,
      groupRootId: null,
    });

    expect(adHoc.templateItemId).toBeNull();
    expect(adHoc.templateItemCheckId).toBeNull();
    expect(adHoc.adHocGroupRootId).toBeTruthy();
    expect(adHoc.stepName).toBe("이 예식만의 단계");
    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.map((i) => i.title)).toEqual(["기존 항목", "이 예식만의 항목"]);
  });

  it("stepId(실제 템플릿 단계)로 추가하면 그 단계 항목 바로 뒤에 삽입된다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const stepA = await createTestTemplateItem(hall.id, { stepName: "단계A", sortOrder: 1 });
    const stepB = await createTestTemplateItem(hall.id, { stepName: "단계B", sortOrder: 2 });
    const itemA1 = await createTestChecklistItem(hall.id, stepA.id, { title: "A-1" });
    const itemB1 = await createTestChecklistItem(hall.id, stepB.id, { title: "B-1" });
    await instanceRepo.addItem(hall.id, instanceId, {
      id: itemA1.id,
      title: itemA1.title,
      description: itemA1.description,
      stepId: stepA.id,
      stepName: stepA.stepName,
    });
    await instanceRepo.addItem(hall.id, instanceId, {
      id: itemB1.id,
      title: itemB1.title,
      description: itemB1.description,
      stepId: stepB.id,
      stepName: stepB.stepName,
    });

    await instanceRepo.addAdHocItem(hall.id, instanceId, {
      stepName: stepA.stepName,
      title: "A만의 자유 항목",
      description: "설명",
      stepId: stepA.id,
      groupRootId: null,
    });

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.map((i) => i.title)).toEqual(["A-1", "A만의 자유 항목", "B-1"]);
  });

  it("groupRootId(기존 ad-hoc 단계)로 추가하면 같은 그룹으로 묶이고 그 단계 바로 뒤에 삽입된다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "다른 단계" });
    const checklistItem = await createTestChecklistItem(hall.id, step.id, { title: "다른 항목" });
    await instanceRepo.addItem(hall.id, instanceId, {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    });
    const firstAdHoc = await instanceRepo.addAdHocItem(hall.id, instanceId, {
      stepName: "새 단계",
      title: "새 단계 첫 항목",
      description: null,
      stepId: null,
      groupRootId: null,
    });

    const secondAdHoc = await instanceRepo.addAdHocItem(hall.id, instanceId, {
      stepName: "새 단계",
      title: "새 단계 두 번째 항목",
      description: null,
      stepId: null,
      groupRootId: firstAdHoc.adHocGroupRootId,
    });

    expect(secondAdHoc.adHocGroupRootId).toBe(firstAdHoc.adHocGroupRootId);
    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.map((i) => i.title)).toEqual([
      "다른 항목",
      "새 단계 첫 항목",
      "새 단계 두 번째 항목",
    ]);
  });
});

describe("checklistInstanceRepo.updateItem (Story 5.8)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("제목/설명을 수정한다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "단계" });
    const checklistItem = await createTestChecklistItem(hall.id, step.id, { title: "원본 제목" });
    const added = await instanceRepo.addItem(hall.id, instanceId, {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    });

    const updated = await instanceRepo.updateItem(hall.id, instanceId, added.id, {
      title: "수정된 제목",
      description: "새 설명",
    });

    expect(updated?.title).toBe("수정된 제목");
    expect(updated?.description).toBe("새 설명");
  });

  it("다른 홀의 항목은 수정되지 않는다(홀 스코프 격리)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { instanceId } = await createCeremonyWithNoItems(hallA.id);
    const step = await createTestTemplateItem(hallA.id, { stepName: "단계" });
    const checklistItem = await createTestChecklistItem(hallA.id, step.id, { title: "원본" });
    const added = await instanceRepo.addItem(hallA.id, instanceId, {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    });

    const result = await instanceRepo.updateItem(hallB.id, instanceId, added.id, {
      title: "해킹 시도",
      description: null,
    });

    expect(result).toBeUndefined();
    const items = await instanceRepo.listItems(hallA.id, instanceId);
    expect(items[0].title).toBe("원본");
  });

  it("존재하지 않는 항목이면 undefined를 반환한다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);

    const result = await instanceRepo.updateItem(
      hall.id,
      instanceId,
      "00000000-0000-0000-0000-000000000000",
      { title: "제목", description: null },
    );

    expect(result).toBeUndefined();
  });
});

describe("checklistInstanceRepo.listCandidateChecklistItems — 홀 스코프 격리, 단계 그룹핑 (AC 4, 7)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("이미 포함된 항목은 후보에서 제외되고, 소속 단계명이 함께 반환된다", async () => {
    const hall = await createTestHall();
    const { instanceId } = await createCeremonyWithNoItems(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "포함 단계", sortOrder: 1 });
    const included = await createTestChecklistItem(hall.id, step.id, {
      title: "포함됨",
      sortOrder: 1,
    });
    const notIncluded = await createTestChecklistItem(hall.id, step.id, {
      title: "미포함",
      sortOrder: 2,
    });
    await instanceRepo.addItem(hall.id, instanceId, {
      id: included.id,
      title: included.title,
      description: included.description,
      stepId: step.id,
      stepName: step.stepName,
    });

    const candidates = await instanceRepo.listCandidateChecklistItems(hall.id, instanceId);

    expect(candidates.map((c) => c.id)).toEqual([notIncluded.id]);
    expect(candidates[0].stepName).toBe("포함 단계");
  });

  it("다른 홀의 체크리스트 항목은 후보로 노출되지 않는다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const stepB = await createTestTemplateItem(hallB.id, { stepName: "B홀 전용 단계" });
    await createTestChecklistItem(hallB.id, stepB.id, { title: "B홀 전용 항목" });
    const { instanceId } = await createCeremonyWithNoItems(hallA.id);

    const candidates = await instanceRepo.listCandidateChecklistItems(hallA.id, instanceId);

    expect(candidates).toHaveLength(0);
  });
});

// Story 3.1 코덱스 리뷰 P2: feedback 서비스가 "이 단계가 이 예식의 실제 체크리스트에
// 포함돼 있는가"를 검증하는 데 쓰는 함수 — 단계가 인스턴스에 조합됐는지(=체크리스트
// 항목이 실제로 있는지)만 확인한다.
describe("checklistInstanceRepo.existsForTemplateItem", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("인스턴스에 조합된 단계면 true를 반환한다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });
    await createTestChecklistItem(hall.id, step.id, { title: "조명 전환" });
    const { instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    await expect(instanceRepo.existsForTemplateItem(instanceId, step.id)).resolves.toBe(true);
  });

  it("체크리스트 항목이 하나도 없어 인스턴스에 조합되지 않은 단계면 false를 반환한다", async () => {
    const hall = await createTestHall();
    const excludedStep = await createTestTemplateItem(hall.id, { stepName: "빈 단계" });
    const { instanceId } = await ceremonyRepo.create(hall.id, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });

    await expect(
      instanceRepo.existsForTemplateItem(instanceId, excludedStep.id),
    ).resolves.toBe(false);
  });
});
