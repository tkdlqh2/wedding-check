import { eq, and, inArray } from "drizzle-orm";
import { db } from "../index";
import { demoVideos } from "../schema";

export type DemoVideo = typeof demoVideos.$inferSelect;

export type DemoVideoInput = {
  videoUrl: string;
  fileName: string;
  fileSizeBytes: number;
  storageProvider: "vercel-blob" | "local";
};

// ON CONFLICT는 단일 SQL 문이라 원자적이며 db.transaction() 없이 node-postgres/neon-http
// 양쪽에서 동일하게 동작한다(Story 1.3 코덱스 4차 P1 교훈 — 트랜잭션은 프로덕션 드라이버
// neon-http에서 무조건 throw). 항목당 영상은 1개뿐이라 재시도 래퍼도 불필요.
export async function upsertForTemplateItem(
  hallId: string,
  templateItemId: string,
  input: DemoVideoInput,
): Promise<DemoVideo> {
  const [video] = await db
    .insert(demoVideos)
    .values({ hallId, templateItemId, ...input })
    .onConflictDoUpdate({
      target: demoVideos.templateItemId,
      set: {
        videoUrl: input.videoUrl,
        fileName: input.fileName,
        fileSizeBytes: input.fileSizeBytes,
        storageProvider: input.storageProvider,
        hallId,
      },
    })
    .returning();
  return video;
}

export async function findByTemplateItemIds(
  hallId: string,
  templateItemIds: string[],
): Promise<DemoVideo[]> {
  if (templateItemIds.length === 0) return [];
  return db.query.demoVideos.findMany({
    where: and(
      eq(demoVideos.hallId, hallId),
      inArray(demoVideos.templateItemId, templateItemIds),
    ),
  });
}
