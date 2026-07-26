import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "../index";
import { checklistTemplateItems } from "../schema";

export type TemplateItem = typeof checklistTemplateItems.$inferSelect;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// AD-2: checklist_template_items는 홀 종속 엔티티다 — hallId를 모든 함수의 첫 인자로
//받고, 모든 조회/수정 쿼리는 WHERE hall_id = $hallId를 포함한다.

// 같은 홀에 대한 동시 쓰기(생성/순서변경)가 서로의 중간 상태를 밟고 지나가지 않도록
// 홀 단위로 직렬화한다(코덱스 리뷰 P2 반영 2건 — 트랜잭션 종료 시 자동 해제).
async function lockHall(tx: Tx, hallId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${hallId}))`);
}

export async function create(
  hallId: string,
  input: { stepName: string; description?: string | null },
): Promise<TemplateItem> {
  return db.transaction(async (tx) => {
    await lockHall(tx, hallId);

    const [{ nextOrder }] = await tx
      .select({
        nextOrder: sql<number>`coalesce(max(${checklistTemplateItems.sortOrder}), -1) + 1`,
      })
      .from(checklistTemplateItems)
      .where(eq(checklistTemplateItems.hallId, hallId));

    const [item] = await tx
      .insert(checklistTemplateItems)
      .values({
        hallId,
        stepName: input.stepName,
        description: input.description ?? null,
        sortOrder: nextOrder,
      })
      .returning();
    return item;
  });
}

export async function findAllByHall(hallId: string): Promise<TemplateItem[]> {
  return db.query.checklistTemplateItems.findMany({
    where: eq(checklistTemplateItems.hallId, hallId),
    orderBy: asc(checklistTemplateItems.sortOrder),
  });
}

export async function findById(hallId: string, id: string): Promise<TemplateItem | undefined> {
  return db.query.checklistTemplateItems.findFirst({
    where: and(eq(checklistTemplateItems.id, id), eq(checklistTemplateItems.hallId, hallId)),
  });
}

export async function update(
  hallId: string,
  id: string,
  input: { stepName: string; description?: string | null },
): Promise<TemplateItem> {
  const [item] = await db
    .update(checklistTemplateItems)
    .set({ stepName: input.stepName, description: input.description ?? null })
    .where(and(eq(checklistTemplateItems.id, id), eq(checklistTemplateItems.hallId, hallId)))
    .returning();
  return item;
}

// FR-2 문구 그대로 하드 삭제한다 — halls와 달리 이 시점엔 참조하는 테이블이 없다
// (Story 1.3 Dev Notes "삭제 정책" 참고).
export async function remove(hallId: string, id: string): Promise<void> {
  await db
    .delete(checklistTemplateItems)
    .where(and(eq(checklistTemplateItems.id, id), eq(checklistTemplateItems.hallId, hallId)));
}

// AC 3: 대상 항목을 인접 항목과 스왑한다. 목록 조회 → 스왑 계산 → 저장을 lockHall로
// 잠근 같은 트랜잭션 안에서 전부 수행해, 동시에 들어온 두 번째 이동 요청이 첫 번째
// 요청의 결과를 덮어써 유실시키는 것을 막는다(코덱스 리뷰 2차 P2 반영).
export async function moveAdjacent(
  hallId: string,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockHall(tx, hallId);

    const items = await tx.query.checklistTemplateItems.findMany({
      where: eq(checklistTemplateItems.hallId, hallId),
      orderBy: asc(checklistTemplateItems.sortOrder),
    });

    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const orderedIds = items.map((item) => item.id);
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];

    for (const [newIndex, itemId] of orderedIds.entries()) {
      await tx
        .update(checklistTemplateItems)
        .set({ sortOrder: newIndex })
        .where(and(eq(checklistTemplateItems.id, itemId), eq(checklistTemplateItems.hallId, hallId)));
    }
  });
}
