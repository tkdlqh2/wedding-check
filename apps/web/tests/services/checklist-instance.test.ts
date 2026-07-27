import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb,
  createTestHall,
  createTestTemplateItem,
  createTestChecklistItem,
} from "../helpers/db";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as instanceRepo from "@/lib/db/repositories/checklist-instance";
import {
  getCeremonyDetail,
  getOperatorInstanceView,
  addInstanceItem,
  removeInstanceItem,
  addAdHocInstanceItem,
  updateInstanceItem,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";

async function createCeremony(hallId: string) {
  return ceremonyRepo.create(hallId, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
}

describe("addInstanceItem — AD-2 2-hop 재검증 (AC 3, Story 5.5 체크리스트 항목 단위)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("같은 홀의 checklistItemId면 추가된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });
    const checklistItem = await createTestChecklistItem(hall.id, step.id, { title: "조명 전환" });

    const item = await addInstanceItem(hall.id, ceremonyId, checklistItem.id);

    expect(item.stepName).toBe("신랑입장");
    expect(item.title).toBe("조명 전환");
  });

  it("다른 홀의 checklistItemId로 추가를 시도하면 거부된다 — 핵심 케이스", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { ceremonyId } = await createCeremony(hallA.id);
    const stepInHallB = await createTestTemplateItem(hallB.id, { stepName: "B홀 전용 단계" });
    const checklistItemInHallB = await createTestChecklistItem(hallB.id, stepInHallB.id, {
      title: "B홀 전용 항목",
    });

    await expect(
      addInstanceItem(hallA.id, ceremonyId, checklistItemInHallB.id),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("존재하지 않는 ceremonyId면 거부된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);
    const checklistItem = await createTestChecklistItem(hall.id, step.id);

    await expect(
      addInstanceItem(hall.id, "00000000-0000-0000-0000-000000000000", checklistItem.id),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("존재하지 않는 checklistItemId면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      addInstanceItem(hall.id, ceremonyId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});

describe("removeInstanceItem", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("정상적으로 항목을 제거한다", async () => {
    const hall = await createTestHall();
    const { ceremonyId, instanceId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "축가" });
    const checklistItem = await createTestChecklistItem(hall.id, step.id);
    const added = await instanceRepo.addItem(hall.id, instanceId, {
      id: checklistItem.id,
      title: checklistItem.title,
      description: checklistItem.description,
      stepId: step.id,
      stepName: step.stepName,
    });

    await removeInstanceItem(hall.id, ceremonyId, added.id);

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(0);
  });

  it("존재하지 않는 ceremonyId면 거부된다", async () => {
    const hall = await createTestHall();

    await expect(
      removeInstanceItem(hall.id, "00000000-0000-0000-0000-000000000000", "some-id"),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});

describe("addAdHocInstanceItem (Story 5.8) — '이 예식에만' 자유 서술 항목", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("완전히 새 단계를 만들면 stepName이 그대로 저장되고 인스턴스 맨 뒤에 추가된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    const item = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "새 항목",
      description: null,
      stepName: "새 단계",
    });

    expect(item.stepName).toBe("새 단계");
    expect(item.templateItemId).toBeNull();
    expect(item.adHocGroupRootId).toBeTruthy();
  });

  it("templateItemId를 넘기면 그 실제 템플릿 단계 소속으로 추가되고, stepName은 서버가 검증된 값으로 덮어쓴다", async () => {
    const hall = await createTestHall();
    // 단계+체크리스트 항목을 예식 생성보다 먼저 만들어야 ceremonyRepo.create()의 자동
    // 조합으로 이 단계가 실제 인스턴스에 포함된다(existsForTemplateItem 검증을 통과하려면
    // 필수 — 예식 생성 후에 만든 단계는 이 예식 체크리스트에 없는 것으로 취급된다).
    const step = await createTestTemplateItem(hall.id, { stepName: "실제 단계" });
    await createTestChecklistItem(hall.id, step.id, { title: "기존 항목" });
    const { ceremonyId } = await createCeremony(hall.id);

    const item = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "이 단계의 자유 항목",
      description: null,
      // 클라이언트가 stepName을 조작해 보내도 실제 단계의 stepName으로 덮어써야 한다.
      stepName: "조작된 이름",
      templateItemId: step.id,
    });

    expect(item.templateItemId).toBe(step.id);
    expect(item.stepName).toBe("실제 단계");
  });

  it("다른 홀의 templateItemId면 거부된다 (AD-2 2-hop 재검증)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { ceremonyId } = await createCeremony(hallA.id);
    const stepInHallB = await createTestTemplateItem(hallB.id, { stepName: "B홀 단계" });

    await expect(
      addAdHocInstanceItem(hallA.id, ceremonyId, {
        title: "항목",
        description: null,
        stepName: "무관",
        templateItemId: stepInHallB.id,
      }),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("같은 홀이어도 이 예식의 체크리스트에 포함되지 않은 단계면 거부된다 (코덱스 리뷰 P2)", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    // 예식 생성 이후에 만든 단계 — 자동 조합 시점에 존재하지 않았으므로 이 예식
    // 인스턴스에는 포함되지 않는다. 조작된 요청이 이 단계를 지정해도 거부되어야 한다.
    const stepNotInThisCeremony = await createTestTemplateItem(hall.id, { stepName: "나중에 만든 단계" });

    await expect(
      addAdHocInstanceItem(hall.id, ceremonyId, {
        title: "항목",
        description: null,
        stepName: "무관",
        templateItemId: stepNotInThisCeremony.id,
      }),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("groupRootId를 넘기면 같은 ad-hoc 그룹으로 묶인다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const first = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "첫 항목",
      description: null,
      stepName: "새 단계",
    });

    const second = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "두 번째 항목",
      description: null,
      stepName: "무시됨",
      groupRootId: first.adHocGroupRootId ?? undefined,
    });

    expect(second.adHocGroupRootId).toBe(first.adHocGroupRootId);
    expect(second.stepName).toBe("새 단계");
  });

  it("존재하지 않는 groupRootId면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      addAdHocInstanceItem(hall.id, ceremonyId, {
        title: "항목",
        description: null,
        stepName: "무관",
        groupRootId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("제목이 비어있으면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      addAdHocInstanceItem(hall.id, ceremonyId, { title: "  ", description: null, stepName: "단계" }),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("새 단계인데 단계 이름이 비어있으면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      addAdHocInstanceItem(hall.id, ceremonyId, { title: "제목", description: null, stepName: "  " }),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});

describe("updateInstanceItem (Story 5.8)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("제목/설명을 수정한다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const added = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "원본",
      description: null,
      stepName: "단계",
    });

    const updated = await updateInstanceItem(hall.id, ceremonyId, added.id, {
      title: "수정됨",
      description: "설명 추가",
    });

    expect(updated.title).toBe("수정됨");
    expect(updated.description).toBe("설명 추가");
  });

  it("제목이 비어있으면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const added = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "원본",
      description: null,
      stepName: "단계",
    });

    await expect(
      updateInstanceItem(hall.id, ceremonyId, added.id, { title: "  ", description: null }),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("존재하지 않는 항목이면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      updateInstanceItem(hall.id, ceremonyId, "00000000-0000-0000-0000-000000000000", {
        title: "제목",
        description: null,
      }),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});

describe("getCeremonyDetail", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("예식+인스턴스+항목+후보 목록을 함께 반환한다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "미포함 단계" });
    const candidate = await createTestChecklistItem(hall.id, step.id, { title: "미포함 항목" });

    const detail = await getCeremonyDetail(hall.id, ceremonyId);

    expect(detail.ceremony.id).toBe(ceremonyId);
    expect(detail.items).toHaveLength(0);
    expect(detail.candidates.map((c) => c.id)).toEqual([candidate.id]);
    expect(detail.candidates[0].stepName).toBe("미포함 단계");
  });

  it("존재하지 않는 예식이면 거부된다", async () => {
    const hall = await createTestHall();

    await expect(
      getCeremonyDetail(hall.id, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});

describe("getOperatorInstanceView — 오퍼레이터 읽기 전용 조회 (AC 1, 2, 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("예식+항목 목록을 반환한다(후보 목록은 포함하지 않는다)", async () => {
    const hall = await createTestHall();
    // 인스턴스 자동 조합(ceremonyRepo.create의 CTE)은 예식 생성 시점에 존재하는
    // 체크리스트 항목만 스냅샷으로 복사한다 — 항목을 예식보다 먼저 만들어야 채워진다.
    const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });
    await createTestChecklistItem(hall.id, step.id, { title: "조명 전환" });
    const { ceremonyId } = await createCeremony(hall.id);

    const view = await getOperatorInstanceView(hall.id, ceremonyId);

    expect(view.ceremony.id).toBe(ceremonyId);
    expect(view.items).toHaveLength(1);
    expect(view.items[0].stepName).toBe("신랑입장");
    expect(view.items[0].title).toBe("조명 전환");
    expect(view).not.toHaveProperty("candidates");
  });

  it("존재하지 않는 ceremonyId면 거부된다", async () => {
    const hall = await createTestHall();

    await expect(
      getOperatorInstanceView(hall.id, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("다른 홀의 hallId로 조회하면 거부된다 (AD-2 격리)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const { ceremonyId } = await createCeremony(hallA.id);

    await expect(getOperatorInstanceView(hallB.id, ceremonyId)).rejects.toThrow(
      ChecklistInstanceValidationError,
    );
  });
});
