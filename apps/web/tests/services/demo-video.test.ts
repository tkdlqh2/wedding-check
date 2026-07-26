import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import {
  saveDemoVideo,
  DemoVideoValidationError,
  listDemoVideosByItems,
} from "@/lib/services/demo-video";

describe("saveDemoVideo — AD-2 2-hop 재검증", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("templateItemId가 실제로 그 홀 소속이면 저장된다", async () => {
    const hall = await createTestHall();
    const item = await createTestTemplateItem(hall.id);

    const video = await saveDemoVideo(hall.id, item.id, {
      videoUrl: "/api/local-videos/test.mp4",
      fileName: "test.mp4",
      fileSizeBytes: 1024,
      storageProvider: "local",
    });

    expect(video.templateItemId).toBe(item.id);
    const listed = await listDemoVideosByItems(hall.id, [item.id]);
    expect(listed).toHaveLength(1);
  });

  it("다른 홀 소속 templateItemId를 넣으면 거부된다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const itemInHallB = await createTestTemplateItem(hallB.id);

    await expect(
      saveDemoVideo(hallA.id, itemInHallB.id, {
        videoUrl: "/api/local-videos/test.mp4",
        fileName: "test.mp4",
        fileSizeBytes: 1024,
        storageProvider: "local",
      }),
    ).rejects.toThrow(DemoVideoValidationError);
  });

  it("존재하지 않는 templateItemId는 거부된다", async () => {
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
