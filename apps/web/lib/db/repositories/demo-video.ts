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
// Story 5.5: 연결 대상이 단계(template_item_id)에서 체크리스트 항목(checklist_item_id)으로
// 바뀌었다 — 영상은 이제 개별 체크리스트 항목에 붙는다.
export async function upsertForChecklistItem(
  hallId: string,
  checklistItemId: string,
  input: DemoVideoInput,
): Promise<DemoVideo> {
  const [video] = await db
    .insert(demoVideos)
    .values({ hallId, checklistItemId, ...input })
    .onConflictDoUpdate({
      target: demoVideos.checklistItemId,
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

export async function findByChecklistItemIds(
  hallId: string,
  checklistItemIds: string[],
): Promise<DemoVideo[]> {
  if (checklistItemIds.length === 0) return [];
  return db.query.demoVideos.findMany({
    where: and(
      eq(demoVideos.hallId, hallId),
      inArray(demoVideos.checklistItemId, checklistItemIds),
    ),
  });
}
