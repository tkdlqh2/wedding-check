import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDb,
  createTestHall,
  createTestTemplateItem,
  createTestChecklistItem,
} from "../helpers/db";
import {
  saveDemoVideo,
  DemoVideoValidationError,
  listDemoVideosByItems,
} from "@/lib/services/demo-video";

describe("saveDemoVideo — AD-2 2-hop 재검증", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("checklistItemId가 실제로 그 홀 소속이면 저장된다", async () => {
    const hall = await createTestHall();
    const step = await createTestTemplateItem(hall.id);
    const item = await createTestChecklistItem(hall.id, step.id);

    const video = await saveDemoVideo(hall.id, item.id, {
      videoUrl: "/api/local-videos/test.mp4",
      fileName: "test.mp4",
      fileSizeBytes: 1024,
      storageProvider: "local",
    });

    expect(video.checklistItemId).toBe(item.id);
    const listed = await listDemoVideosByItems(hall.id, [item.id]);
    expect(listed).toHaveLength(1);
  });

  it("다른 홀 소속 checklistItemId를 넣으면 거부된다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const stepInHallB = await createTestTemplateItem(hallB.id);
    const itemInHallB = await createTestChecklistItem(hallB.id, stepInHallB.id);

    await expect(
      saveDemoVideo(hallA.id, itemInHallB.id, {
        videoUrl: "/api/local-videos/test.mp4",
        fileName: "test.mp4",
        fileSizeBytes: 1024,
        storageProvider: "local",
      }),
    ).rejects.toThrow(DemoVideoValidationError);
  });

  it("존재하지 않는 checklistItemId는 거부된다", async () => {
    const hall = await createTestHall();

    await expect(
      saveDemoVideo(hall.id, "00000000-0000-0000-0000-000000000000", {
        videoUrl: "/api/local-videos/test.mp4",
        fileName: "test.mp4",
        fileSizeBytes: 1024,
        storageProvider: "local",
      }),
    ).rejects.toThrow(DemoVideoValidationError);
  });
});
