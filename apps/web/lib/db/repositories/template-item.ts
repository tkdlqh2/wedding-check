import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "../index";
import { checklistTemplateItems } from "../schema";

export type TemplateItem = typeof checklistTemplateItems.$inferSelect;

// AD-2: checklist_template_items는 홀 종속 엔티티다 — hallId를 모든 함수의 첫 인자로
//받고, 모든 조회/수정 쿼리는 WHERE hall_id = $hallId를 포함한다.

export async function create(
  hallId: string,
  input: { stepName: string; description?: string | null },
): Promise<TemplateItem> {
  const [{ nextOrder }] = await db
    .select({
      nextOrder: sql<number>`coalesce(max(${checklistTemplateItems.sortOrder}), -1) + 1`,
    })
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.hallId, hallId));

  const [item] = await db
    .insert(checklistTemplateItems)
    .values({
      hallId,
      stepName: input.stepName,
      description: input.description ?? null,
      sortOrder: nextOrder,
    })
    .returning();
  return item;
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

// AC 3: 순서 변경. orderedIds의 배열 인덱스를 새 sortOrder로 쓴다. 각 UPDATE의 WHERE 절에
// hallId를 포함해, orderedIds에 다른 홀 소속 id가 섞여 들어와도 그 행은 갱신되지 않는다(AD-2).
export async function reorderAll(hallId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(checklistTemplateItems)
        .set({ sortOrder: index })
        .where(and(eq(checklistTemplateItems.id, id), eq(checklistTemplateItems.hallId, hallId)));
    }
  });
}
