import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { db } from "../index";
import { checklistTemplateItemChecks } from "../schema";

export type ChecklistItem = typeof checklistTemplateItemChecks.$inferSelect;

// Story 5.5(FR-15): checklist_template_item_checks("체크리스트 항목")는 단계
// (checklist_template_items)에 종속된 홀 종속 엔티티다(AD-2) — hallId를 모든 함수의
// 첫 인자로 받고, 모든 쿼리는 WHERE hall_id = $hallId를 포함한다. sort_order는
// hallId 전체가 아니라 templateItemId(그 단계 안) 범위로 스코프된다는 점만
// template-item.ts와 다르다 — 나머지 동시성/재시도 기법은 그대로 재사용한다.

// template-item.ts와 동일한 재시도 판별/래퍼 — 두 파일이 완전히 같은 동시성 문제(같은
// sort_order 계산 경쟁, deferrable unique 위반)를 겪으므로 로직을 그대로 복제한다.
// 공유 유틸로 뽑지 않은 이유: 두 리포지토리의 스코프 컬럼이 다르고(hall_id vs
// template_item_id), 얕은 추상화가 오히려 읽기 어려워진다는 판단(Story 5.5 Dev Notes).
function isRetryableConcurrencyError(err: unknown): boolean {
  for (let e = err; e; e = (e as { cause?: unknown }).cause) {
    if (typeof e !== "object" || e === null) continue;
    const code = (e as { code?: unknown }).code;
    if (code === "23505" || code === "40P01") return true;
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string" && /duplicate key|unique constraint|deadlock detected/i.test(message)) {
      return true;
    }
  }
  return false;
}

const CONCURRENCY_MAX_ATTEMPTS = 5;

async function withConcurrencyRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= CONCURRENCY_MAX_ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (isRetryableConcurrencyError(err) && attempt < CONCURRENCY_MAX_ATTEMPTS) continue;
      throw err;
    }
  }
  throw new Error("unreachable");
}

export async function create(
  hallId: string,
  templateItemId: string,
  input: { title: string; description?: string | null },
): Promise<ChecklistItem> {
  return withConcurrencyRetry(async () => {
    const [item] = await db
      .insert(checklistTemplateItemChecks)
      .values({
        hallId,
        templateItemId,
        title: input.title,
        description: input.description ?? null,
        sortOrder: sql<number>`coalesce((select max(${checklistTemplateItemChecks.sortOrder}) from ${checklistTemplateItemChecks} where ${checklistTemplateItemChecks.templateItemId} = ${templateItemId}), -1) + 1`,
      })
      .returning();
    return item;
  });
}

export async function findAllByTemplateItem(
  hallId: string,
  templateItemId: string,
): Promise<ChecklistItem[]> {
  return db.query.checklistTemplateItemChecks.findMany({
    where: and(
      eq(checklistTemplateItemChecks.hallId, hallId),
      eq(checklistTemplateItemChecks.templateItemId, templateItemId),
    ),
    orderBy: asc(checklistTemplateItemChecks.sortOrder),
  });
}

// 어드민 템플릿 페이지가 단계마다 개별 조회하는 N+1을 피하기 위한 배치 조회
// (listDemoVideosByItems가 이미 쓰는 것과 동일한 패턴).
export async function findAllByTemplateItems(
  hallId: string,
  templateItemIds: string[],
): Promise<ChecklistItem[]> {
  if (templateItemIds.length === 0) return [];
  return db.query.checklistTemplateItemChecks.findMany({
    where: and(
      eq(checklistTemplateItemChecks.hallId, hallId),
      inArray(checklistTemplateItemChecks.templateItemId, templateItemIds),
    ),
    orderBy: asc(checklistTemplateItemChecks.sortOrder),
  });
}

export async function findById(hallId: string, id: string): Promise<ChecklistItem | undefined> {
  return db.query.checklistTemplateItemChecks.findFirst({
    where: and(eq(checklistTemplateItemChecks.id, id), eq(checklistTemplateItemChecks.hallId, hallId)),
  });
}

export async function update(
  hallId: string,
  id: string,
  input: { title: string; description?: string | null },
): Promise<ChecklistItem> {
  const [item] = await db
    .update(checklistTemplateItemChecks)
    .set({
      title: input.title,
      description: input.description ?? null,
    })
    .where(and(eq(checklistTemplateItemChecks.id, id), eq(checklistTemplateItemChecks.hallId, hallId)))
    .returning();
  return item;
}

// FR-2 삭제 정책과 동일하게 하드 삭제 — 연결된 demo_videos 행은 onDelete cascade로
// 함께 정리된다.
export async function remove(hallId: string, id: string): Promise<void> {
  await db
    .delete(checklistTemplateItemChecks)
    .where(and(eq(checklistTemplateItemChecks.id, id), eq(checklistTemplateItemChecks.hallId, hallId)));
}

// template-item.ts의 moveAdjacent와 동일한 CTE 스왑 기법이되, 인접 항목 탐색 범위가
// hallId 전체가 아니라 "같은 단계 안"(template_item_id 일치)으로 좁혀진다 — 다른
// 단계의 체크리스트 항목과는 절대 순서가 섞이지 않는다.
export async function moveAdjacent(
  hallId: string,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const comparator = direction === "up" ? sql`<` : sql`>`;
  const neighborOrder = direction === "up" ? sql`desc` : sql`asc`;

  await withConcurrencyRetry(async () => {
    await db.execute(sql`
      with target as (
        select id, template_item_id, sort_order from ${checklistTemplateItemChecks}
        where id = ${id} and hall_id = ${hallId}
      ),
      neighbor as (
        select id, sort_order from ${checklistTemplateItemChecks}
        where hall_id = ${hallId}
          and template_item_id = (select template_item_id from target)
          and sort_order ${comparator} (select sort_order from target)
        order by sort_order ${neighborOrder}
        limit 1
      )
      update ${checklistTemplateItemChecks} as t
      set sort_order = case
        when t.id = (select id from target) then (select sort_order from neighbor)
        when t.id = (select id from neighbor) then (select sort_order from target)
      end
      where exists (select 1 from neighbor)
        and t.id in (select id from target union select id from neighbor)
    `);
  });
}
