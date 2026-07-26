import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createTestHall, createTestTemplateItem } from "../helpers/db";
import * as demoVideoRepo from "@/lib/db/repositories/demo-video";

describe("upsertForTemplateItem — 항목당 1개, 재업로드는 교체([ASSUMPTION])", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("같은 templateItemId로 두 번 저장하면 최신 값으로 교체되고 행은 1개만 유지된다", async () => {
    const hall = await createTestHall();
    const item = await createTestTemplateItem(hall.id);

    await demoVideoRepo.upsertForTemplateItem(hall.id, item.id, {
      videoUrl: "/api/local-videos/first.mp4",
      fileName: "first.mp4",
      fileSizeBytes: 100,
      storageProvider: "local",
    });

    const second = await demoVideoRepo.upsertForTemplateItem(hall.id, item.id, {
      videoUrl: "/api/local-videos/second.mp4",
      fileName: "second.mp4",
      fileSizeBytes: 200,
      storageProvider: "local",
    });

    const all = await demoVideoRepo.findByTemplateItemIds(hall.id, [item.id]);
    expect(all).toHaveLength(1);
    expect(all[0].videoUrl).toBe("/api/local-videos/second.mp4");
    expect(second.videoUrl).toBe("/api/local-videos/second.mp4");
  });

  it("findByTemplateItemIds는 다른 홀의 영상을 섞어 반환하지 않는다", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    const itemA = await createTestTemplateItem(hallA.id);
    const itemB = await createTestTemplateItem(hallB.id);

    await demoVideoRepo.upsertForTemplateItem(hallA.id, itemA.id, {
      videoUrl: "/api/local-videos/a.mp4",
      fileName: "a.mp4",
      fileSizeBytes: 100,
      storageProvider: "local",
    });
    await demoVideoRepo.upsertForTemplateItem(hallB.id, itemB.id, {
      videoUrl: "/api/local-videos/b.mp4",
      fileName: "b.mp4",
      fileSizeBytes: 100,
      storageProvider: "local",
    });

    const resultForA = await demoVideoRepo.findByTemplateItemIds(hallA.id, [
      itemA.id,
      itemB.id,
    ]);
    expect(resultForA).toHaveLength(1);
    expect(resultForA[0].videoUrl).toBe("/api/local-videos/a.mp4");
  });
});
