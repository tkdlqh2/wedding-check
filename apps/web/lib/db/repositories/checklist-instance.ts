import { eq, and, asc, notInArray, isNotNull } from "drizzle-orm";
import { db } from "../index";
import { checklistInstances, checklistInstanceItems, checklistTemplateItems } from "../schema";
import type { TemplateItem } from "./template-item";

export type ChecklistInstance = typeof checklistInstances.$inferSelect;
export type ChecklistInstanceItem = typeof checklistInstanceItems.$inferSelect;

// AD-2: checklist_instances/checklist_instance_items는 홀 종속 엔티티다 — hallId를
// 모든 함수의 첫 인자로 받고, 모든 조회/수정 쿼리는 WHERE hall_id = $hallId를 포함한다.

export async function findByCeremony(
  hallId: string,
  ceremonyId: string,
): Promise<ChecklistInstance | undefined> {
  return db.query.checklistInstances.findFirst({
    where: and(
      eq(checklistInstances.ceremonyId, ceremonyId),
      eq(checklistInstances.hallId, hallId),
    ),
  });
}

export async function listItems(
  hallId: string,
  instanceId: string,
): Promise<ChecklistInstanceItem[]> {
  return db.query.checklistInstanceItems.findMany({
    where: and(
      eq(checklistInstanceItems.instanceId, instanceId),
      eq(checklistInstanceItems.hallId, hallId),
    ),
    orderBy: asc(checklistInstanceItems.sortOrder),
  });
}

// Story 2.1 "실행용 사본" 원칙과 동일 — templateItem의 그 시점 값을 스냅샷 복사한다.
// (instance_id, template_item_id) UNIQUE 제약(코덱스 리뷰 P2 반영)에 onConflictDoNothing으로
// 대응한다 — 재전송/두 탭 동시 제출로 같은 항목을 두 번 추가해도 에러 없이 기존 행을
// 그대로 반환한다(멱등). db.transaction() 없이 단일 INSERT 문 안에서 처리되므로
// Story 1.3의 neon-http 트랜잭션 제약과도 무관하다.
export async function addItem(
  hallId: string,
  instanceId: string,
  templateItem: Pick<TemplateItem, "id" | "stepName" | "description" | "sortOrder">,
): Promise<ChecklistInstanceItem> {
  const [inserted] = await db
    .insert(checklistInstanceItems)
    .values({
      hallId,
      instanceId,
      templateItemId: templateItem.id,
      stepName: templateItem.stepName,
      description: templateItem.description,
      sortOrder: templateItem.sortOrder,
    })
    .onConflictDoNothing({
      target: [checklistInstanceItems.instanceId, checklistInstanceItems.templateItemId],
    })
    .returning();
  if (inserted) return inserted;

  const existing = await db.query.checklistInstanceItems.findFirst({
    where: and(
      eq(checklistInstanceItems.instanceId, instanceId),
      eq(checklistInstanceItems.templateItemId, templateItem.id),
    ),
  });
  if (!existing) {
    throw new Error("addItem: 충돌 처리 후에도 기존 행을 찾지 못했습니다");
  }
  return existing;
}

// FR-2 삭제 정책과 동일하게 하드 삭제(Story 1.3 Dev Notes "삭제 정책" 참고).
export async function removeItem(
  hallId: string,
  instanceId: string,
  itemId: string,
): Promise<void> {
  await db
    .delete(checklistInstanceItems)
    .where(
      and(
        eq(checklistInstanceItems.id, itemId),
        eq(checklistInstanceItems.instanceId, instanceId),
        eq(checklistInstanceItems.hallId, hallId),
      ),
    );
}

// AC 4: 다른 홀의 템플릿 항목은 절대 후보로 노출되지 않는다 — hallId로만 스코프한다.
export async function listCandidateTemplateItems(
  hallId: string,
  instanceId: string,
): Promise<TemplateItem[]> {
  const included = await db
    .select({ templateItemId: checklistInstanceItems.templateItemId })
    .from(checklistInstanceItems)
    .where(
      and(
        eq(checklistInstanceItems.instanceId, instanceId),
        eq(checklistInstanceItems.hallId, hallId),
        isNotNull(checklistInstanceItems.templateItemId),
      ),
    );
  const includedIds = included.map((row) => row.templateItemId as string);

  return db.query.checklistTemplateItems.findMany({
    where: and(
      eq(checklistTemplateItems.hallId, hallId),
      includedIds.length > 0
        ? notInArray(checklistTemplateItems.id, includedIds)
        : undefined,
    ),
    orderBy: asc(checklistTemplateItems.sortOrder),
  });
}
