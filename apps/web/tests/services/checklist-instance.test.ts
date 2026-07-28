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
  addAdHocInstanceStep,
  updateInstanceItem,
  renameInstanceStep,
  deleteInstanceStep,
  moveInstanceStep,
  setInstanceItemVideo,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";
import { saveDemoVideo, listDemoVideosByItems } from "@/lib/services/demo-video";

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
    if (!added) throw new Error("추가 실패 — 예정 예식이라 항상 성공해야 한다");

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

describe("addAdHocInstanceStep (2026-07-28 대표 지시) — 단계명만으로 새 단계 추가", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("title IS NULL 자리표시 행으로 새 단계가 만들어지고, 이후 groupRootId로 항목을 붙일 수 있다", async () => {
    const hall = await createTestHall();
    const { ceremonyId, instanceId } = await createCeremony(hall.id);

    const marker = await addAdHocInstanceStep(hall.id, ceremonyId, "신부 어머니 축사");

    expect(marker.stepName).toBe("신부 어머니 축사");
    expect(marker.title).toBeNull();
    expect(marker.templateItemId).toBeNull();
    expect(marker.adHocGroupRootId).toBeTruthy();

    const item = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "마이크 준비",
      description: null,
      stepName: "",
      groupRootId: marker.adHocGroupRootId,
    });
    expect(item.stepName).toBe("신부 어머니 축사");
    expect(item.adHocGroupRootId).toBe(marker.adHocGroupRootId);
    expect(item.sortOrder).toBe(marker.sortOrder + 1);

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(2);
  });

  it("자리표시 행은 오퍼레이터 조회에서 제외된다(항목이 생기면 그 항목만 보인다)", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const marker = await addAdHocInstanceStep(hall.id, ceremonyId, "빈 단계");
    await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "실제 항목",
      description: null,
      stepName: "",
      groupRootId: marker.adHocGroupRootId,
    });

    const view = await getOperatorInstanceView(hall.id, ceremonyId);

    expect(view.items).toHaveLength(1);
    expect(view.items[0].title).toBe("실제 항목");
  });

  it("단계 이름이 비어있으면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(addAdHocInstanceStep(hall.id, ceremonyId, "  ")).rejects.toThrow(
      ChecklistInstanceValidationError,
    );
  });

  it("빈 단계도 이름 변경/삭제(groupRootId 키)가 동작한다", async () => {
    const hall = await createTestHall();
    const { ceremonyId, instanceId } = await createCeremony(hall.id);
    const marker = await addAdHocInstanceStep(hall.id, ceremonyId, "임시 단계");
    if (!marker.adHocGroupRootId) throw new Error("groupRootId가 없다");

    await renameInstanceStep(
      hall.id,
      ceremonyId,
      { groupRootId: marker.adHocGroupRootId },
      "바뀐 단계",
    );
    let items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items[0].stepName).toBe("바뀐 단계");

    await deleteInstanceStep(hall.id, ceremonyId, { groupRootId: marker.adHocGroupRootId });
    items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(0);
  });

  it("예정이 아닌 예식에는 단계를 추가할 수 없다(원자적 가드)", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    await ceremonyRepo.updateStatus(hall.id, ceremonyId, "upcoming", "ongoing");

    await expect(addAdHocInstanceStep(hall.id, ceremonyId, "늦은 단계")).rejects.toThrow(
      ChecklistInstanceValidationError,
    );
  });
});

describe("setInstanceItemVideo (2026-07-28 대표 지시) — 예식 전용 시연 영상", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("인스턴스 영상이 템플릿 공용 영상을 오버라이드하고, 템플릿 영상은 바뀌지 않는다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const step = await createTestTemplateItem(hall.id, { stepName: "축가" });
    const checklistItem = await createTestChecklistItem(hall.id, step.id, { title: "음향 큐" });
    await saveDemoVideo(hall.id, checklistItem.id, {
      videoUrl: "/api/local-videos/template.mp4",
      fileName: "template.mp4",
      fileSizeBytes: 1000,
      storageProvider: "local",
    });
    const added = await addInstanceItem(hall.id, ceremonyId, checklistItem.id);

    // 오버라이드 전 — 템플릿 공용 영상이 보인다.
    let view = await getOperatorInstanceView(hall.id, ceremonyId);
    expect(view.items[0].videoUrl).toBe("/api/local-videos/template.mp4");

    await setInstanceItemVideo(hall.id, ceremonyId, added.id, "/api/local-videos/only-this.mp4");

    // 오버라이드 후 — 이 예식은 전용 영상, 템플릿 공용 영상은 그대로.
    view = await getOperatorInstanceView(hall.id, ceremonyId);
    expect(view.items[0].videoUrl).toBe("/api/local-videos/only-this.mp4");
    const [templateVideo] = await listDemoVideosByItems(hall.id, [checklistItem.id]);
    expect(templateVideo.videoUrl).toBe("/api/local-videos/template.mp4");
  });

  it("이 예식에만 추가된 ad-hoc 항목에도 전용 영상을 붙일 수 있다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const item = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "임시 항목",
      description: null,
      stepName: "임시 단계",
    });

    await setInstanceItemVideo(hall.id, ceremonyId, item.id, "/api/local-videos/adhoc.mp4");

    const view = await getOperatorInstanceView(hall.id, ceremonyId);
    expect(view.items[0].videoUrl).toBe("/api/local-videos/adhoc.mp4");
  });

  it("예정이 아닌 예식에는 영상을 등록/교체할 수 없다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const item = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "항목",
      description: null,
      stepName: "단계",
    });
    await ceremonyRepo.updateStatus(hall.id, ceremonyId, "upcoming", "ongoing");

    await expect(
      setInstanceItemVideo(hall.id, ceremonyId, item.id, "/api/local-videos/late.mp4"),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });
});

describe("moveInstanceStep (2026-07-28 대표 지시) — 화살표 단계 순서 변경", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function createTwoAdHocSteps(hallId: string, ceremonyId: string) {
    const first = await addAdHocInstanceItem(hallId, ceremonyId, {
      title: "A 항목",
      description: null,
      stepName: "단계 A",
    });
    const second = await addAdHocInstanceItem(hallId, ceremonyId, {
      title: "B 항목",
      description: null,
      stepName: "단계 B",
    });
    return { first, second };
  }

  it("아래 단계를 위로 올리면 두 단계 블록의 순서가 통째로 바뀐다", async () => {
    const hall = await createTestHall();
    const { ceremonyId, instanceId } = await createCeremony(hall.id);
    const { second } = await createTwoAdHocSteps(hall.id, ceremonyId);
    // 단계 A에 항목을 하나 더 붙여 블록 크기가 달라도 스왑되는지 확인.
    const firstRoot = (await instanceRepo.listItems(hall.id, instanceId))[0].adHocGroupRootId;
    await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "A 둘째 항목",
      description: null,
      stepName: "",
      groupRootId: firstRoot,
    });

    await moveInstanceStep(
      hall.id,
      ceremonyId,
      { groupRootId: second.adHocGroupRootId as string },
      "up",
    );

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.map((i) => i.stepName)).toEqual(["단계 B", "단계 A", "단계 A"]);
    // sortOrder도 연속으로 재부여된다(그룹핑이 연속 블록 전제를 유지).
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
  });

  it("맨 위 단계를 위로 올리는 요청은 조용히 무시된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId, instanceId } = await createCeremony(hall.id);
    const { first } = await createTwoAdHocSteps(hall.id, ceremonyId);

    await moveInstanceStep(
      hall.id,
      ceremonyId,
      { groupRootId: first.adHocGroupRootId as string },
      "up",
    );

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.map((i) => i.stepName)).toEqual(["단계 A", "단계 B"]);
  });

  it("예정이 아닌 예식에서는 단계 순서를 바꿀 수 없다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);
    const { second } = await createTwoAdHocSteps(hall.id, ceremonyId);
    await ceremonyRepo.updateStatus(hall.id, ceremonyId, "upcoming", "ongoing");

    await expect(
      moveInstanceStep(
        hall.id,
        ceremonyId,
        { groupRootId: second.adHocGroupRootId as string },
        "up",
      ),
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

describe("renameInstanceStep / deleteInstanceStep — 이 예식 스냅샷의 단계 수정/삭제", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("템플릿 단계 그룹의 이름을 바꾸면 그 단계 소속 항목 전체의 stepName이 바뀐다(템플릿은 그대로)", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id, { stepName: "신랑입장" });
    await createTestChecklistItem(hall.id, step.id, { title: "조명 전환", sortOrder: 1 });
    await createTestChecklistItem(hall.id, step.id, { title: "음악 큐", sortOrder: 2 });
    const { ceremonyId, instanceId } = await createCeremony(hall.id);

    await renameInstanceStep(hall.id, ceremonyId, { templateItemId: step.id }, "신랑 입장(변경)");

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.stepName === "신랑 입장(변경)")).toBe(true);
    // 템플릿 원본은 바뀌지 않는다 — 실행용 사본만 수정된다.
    const templateItemRepo = await import("@/lib/db/repositories/template-item");
    const original = await templateItemRepo.findById(hall.id, step.id);
    expect(original?.stepName).toBe("신랑입장");
  });

  it("ad-hoc 단계 그룹도 groupRootId로 이름을 바꿀 수 있다", async () => {
    const hall = await createTestHall();
    const { ceremonyId, instanceId } = await createCeremony(hall.id);
    const first = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "첫 항목",
      description: null,
      stepName: "깜짝 이벤트",
    });
    await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "둘째 항목",
      description: null,
      stepName: "",
      groupRootId: first.adHocGroupRootId,
    });

    await renameInstanceStep(
      hall.id,
      ceremonyId,
      { groupRootId: first.adHocGroupRootId as string },
      "깜짝 이벤트(수정)",
    );

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items.every((i) => i.stepName === "깜짝 이벤트(수정)")).toBe(true);
  });

  it("빈 이름으로 바꾸려 하면 거부된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id, { stepName: "축가" });
    await createTestChecklistItem(hall.id, step.id);
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      renameInstanceStep(hall.id, ceremonyId, { templateItemId: step.id }, "   "),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("존재하지 않는 단계 그룹이면 거부된다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createCeremony(hall.id);

    await expect(
      renameInstanceStep(
        hall.id,
        ceremonyId,
        { templateItemId: "00000000-0000-0000-0000-000000000000" },
        "새 이름",
      ),
    ).rejects.toThrow(ChecklistInstanceValidationError);
  });

  it("단계 삭제는 그 단계 소속 항목 전체를 삭제하고 다른 단계는 남긴다", async () => {
    const hall = await createTestHall();
    const stepA = await createTestTemplateItem(hall.id, { stepName: "개식사", sortOrder: 1 });
    await createTestChecklistItem(hall.id, stepA.id, { title: "A-1", sortOrder: 1 });
    await createTestChecklistItem(hall.id, stepA.id, { title: "A-2", sortOrder: 2 });
    const stepB = await createTestTemplateItem(hall.id, { stepName: "축가", sortOrder: 2 });
    await createTestChecklistItem(hall.id, stepB.id, { title: "B-1" });
    const { ceremonyId, instanceId } = await createCeremony(hall.id);

    await deleteInstanceStep(hall.id, ceremonyId, { templateItemId: stepA.id });

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("B-1");
  });

  it("다른 홀 hallId로는 단계를 삭제할 수 없다(AD-2)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const step = await createTestTemplateItem(hallA.id, { stepName: "개식사" });
    await createTestChecklistItem(hallA.id, step.id);
    const { ceremonyId, instanceId } = await createCeremony(hallA.id);

    // hallB 스코프로는 인스턴스 자체가 조회되지 않아 거부된다.
    await expect(
      deleteInstanceStep(hallB.id, ceremonyId, { templateItemId: step.id }),
    ).rejects.toThrow(ChecklistInstanceValidationError);

    const items = await instanceRepo.listItems(hallA.id, instanceId);
    expect(items).toHaveLength(1);
  });

  it("orphan 단일 항목 단계는 itemId 키로 삭제할 수 있다", async () => {
    const hall = await createTestHall();
    const { ceremonyId, instanceId } = await createCeremony(hall.id);
    const item = await addAdHocInstanceItem(hall.id, ceremonyId, {
      title: "홀로 남은 항목",
      description: null,
      stepName: "임시 단계",
    });

    await deleteInstanceStep(hall.id, ceremonyId, { itemId: item.id });

    const items = await instanceRepo.listItems(hall.id, instanceId);
    expect(items).toHaveLength(0);
  });
});

describe("예정이 아닌 예식 수정 금지 (2026-07-27 대표 지시)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  // 상태는 시간 추정이 아니라 저장 필드다 — 오퍼레이터의 예식 시작/종료 전환을 거쳐
  // done 상태를 만든다(upcoming→ongoing→done 한 방향 전환 규칙 그대로).
  async function createDoneCeremony(hallId: string) {
    const created = await ceremonyRepo.create(hallId, {
      ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
      contractConditions: {},
    });
    await ceremonyRepo.updateStatus(hallId, created.ceremonyId, "upcoming", "ongoing");
    await ceremonyRepo.updateStatus(hallId, created.ceremonyId, "ongoing", "done");
    return created;
  }

  it("종료된 예식에는 ad-hoc 항목을 추가할 수 없다", async () => {
    const hall = await createTestHall();
    const { ceremonyId } = await createDoneCeremony(hall.id);

    await expect(
      addAdHocInstanceItem(hall.id, ceremonyId, {
        title: "항목",
        description: null,
        stepName: "새 단계",
      }),
    ).rejects.toThrow("진행 중이거나 종료된 예식은 수정할 수 없습니다");
  });

  it("종료된 예식의 항목은 수정/삭제할 수 없다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id, { stepName: "개식사" });
    await createTestChecklistItem(hall.id, step.id, { title: "조명" });
    const { ceremonyId, instanceId } = await createDoneCeremony(hall.id);
    const [item] = await instanceRepo.listItems(hall.id, instanceId);

    await expect(
      updateInstanceItem(hall.id, ceremonyId, item.id, { title: "변경", description: null }),
    ).rejects.toThrow("진행 중이거나 종료된 예식은 수정할 수 없습니다");
    await expect(removeInstanceItem(hall.id, ceremonyId, item.id)).rejects.toThrow(
      "진행 중이거나 종료된 예식은 수정할 수 없습니다",
    );
  });

  it("종료된 예식의 단계는 이름 변경/삭제할 수 없다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id, { stepName: "개식사" });
    await createTestChecklistItem(hall.id, step.id, { title: "조명" });
    const { ceremonyId } = await createDoneCeremony(hall.id);

    await expect(
      renameInstanceStep(hall.id, ceremonyId, { templateItemId: step.id }, "새 이름"),
    ).rejects.toThrow("진행 중이거나 종료된 예식은 수정할 수 없습니다");
    await expect(
      deleteInstanceStep(hall.id, ceremonyId, { templateItemId: step.id }),
    ).rejects.toThrow("진행 중이거나 종료된 예식은 수정할 수 없습니다");
  });
});
