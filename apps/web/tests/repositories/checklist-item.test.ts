import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb,
  createTestHall,
  createTestTemplateItem,
  createTestChecklistItem,
} from "../helpers/db";
import * as checklistItemRepo from "@/lib/db/repositories/checklist-item";
import * as demoVideoRepo from "@/lib/db/repositories/demo-video";

describe("checklistItemRepo.create — sortOrder 자동 계산(단계 범위)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("같은 단계 안에서 순차적으로 sortOrder를 부여한다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);

    const first = await checklistItemRepo.create(hall.id, step.id, { title: "첫 번째" });
    const second = await checklistItemRepo.create(hall.id, step.id, { title: "두 번째" });

    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);
  });

  it("다른 단계의 sortOrder와는 독립적이다", async () => {
    const hall = await createTestHall();
    const stepA = await createTestTemplateItem(hall.id, { stepName: "단계A", sortOrder: 1 });
    const stepB = await createTestTemplateItem(hall.id, { stepName: "단계B", sortOrder: 2 });
    await checklistItemRepo.create(hall.id, stepA.id, { title: "A-1" });
    await checklistItemRepo.create(hall.id, stepA.id, { title: "A-2" });

    const firstInB = await checklistItemRepo.create(hall.id, stepB.id, { title: "B-1" });

    expect(firstInB.sortOrder).toBe(0);
  });
});

describe("checklistItemRepo.findAllByTemplateItem — 정렬/조회", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("sortOrder 순으로 반환한다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);
    await createTestChecklistItem(hall.id, step.id, { title: "나중", sortOrder: 2 });
    await createTestChecklistItem(hall.id, step.id, { title: "먼저", sortOrder: 1 });

    const items = await checklistItemRepo.findAllByTemplateItem(hall.id, step.id);

    expect(items.map((i) => i.title)).toEqual(["먼저", "나중"]);
  });
});

describe("checklistItemRepo.remove — 하드 삭제, 연결 영상 cascade", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("삭제하면 연결된 demo_videos 행도 함께 삭제된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);
    const item = await createTestChecklistItem(hall.id, step.id);
    await demoVideoRepo.upsertForChecklistItem(hall.id, item.id, {
      videoUrl: "/api/local-videos/test.mp4",
      fileName: "test.mp4",
      fileSizeBytes: 100,
      storageProvider: "local",
    });

    await checklistItemRepo.remove(hall.id, item.id);

    const videos = await demoVideoRepo.findByChecklistItemIds(hall.id, [item.id]);
    expect(videos).toHaveLength(0);
  });
});

describe("checklistItemRepo.moveAdjacent — 같은 단계 안에서만 스왑", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("인접 항목과 순서를 바꾼다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);
    const first = await createTestChecklistItem(hall.id, step.id, { title: "첫 번째", sortOrder: 0 });
    const second = await createTestChecklistItem(hall.id, step.id, {
      title: "두 번째",
      sortOrder: 1,
    });

    await checklistItemRepo.moveAdjacent(hall.id, second.id, "up");

    const items = await checklistItemRepo.findAllByTemplateItem(hall.id, step.id);
    expect(items.map((i) => i.id)).toEqual([second.id, first.id]);
  });

  it("다른 단계의 항목과는 절대 순서가 섞이지 않는다", async () => {
    const hall = await createTestHall();
    const stepA = await createTestTemplateItem(hall.id, { stepName: "단계A", sortOrder: 1 });
    const stepB = await createTestTemplateItem(hall.id, { stepName: "단계B", sortOrder: 2 });
    const onlyItemInA = await createTestChecklistItem(hall.id, stepA.id, {
      title: "A 유일 항목",
      sortOrder: 0,
    });
    await createTestChecklistItem(hall.id, stepB.id, { title: "B 항목", sortOrder: 0 });

    // 단계A에는 인접 항목이 없으므로(맨 위/아래) 스왑 대상이 없어 조용히 무시되어야 한다
    // — 단계B의 항목을 잘못 끌어와 섞이면 안 된다.
    await checklistItemRepo.moveAdjacent(hall.id, onlyItemInA.id, "up");
    await checklistItemRepo.moveAdjacent(hall.id, onlyItemInA.id, "down");

    const itemsInA = await checklistItemRepo.findAllByTemplateItem(hall.id, stepA.id);
    expect(itemsInA.map((i) => i.id)).toEqual([onlyItemInA.id]);
    expect(itemsInA[0].sortOrder).toBe(0);
  });
});

describe("checklistItemRepo — 홀 스코프 격리", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("findById는 다른 홀의 항목을 반환하지 않는다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const stepA = await createTestTemplateItem(hallA.id);
    const item = await createTestChecklistItem(hallA.id, stepA.id);

    const result = await checklistItemRepo.findById(hallB.id, item.id);

    expect(result).toBeUndefined();
  });
});
