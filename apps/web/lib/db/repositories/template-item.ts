import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "../index";
import { checklistTemplateItems } from "../schema";

export type TemplateItem = typeof checklistTemplateItems.$inferSelect;

// AD-2: checklist_template_items는 홀 종속 엔티티다 — hallId를 모든 함수의 첫 인자로
//받고, 모든 조회/수정 쿼리는 WHERE hall_id = $hallId를 포함한다.

// 주의: 프로덕션 DB는 drizzle-orm/neon-http를 쓰는데 이 드라이버는 db.transaction()을
// 지원하지 않고 항상 throw한다(코덱스 리뷰 P1로 발견 — 로컬 node-postgres에서는 통과하지만
// 실제 Neon 환경에서는 생성/순서변경이 전부 깨졌을 것). 그래서 동시성 안전장치는 여러 SQL문을
// 감싼 JS 트랜잭션이 아니라, Postgres가 자체적으로 원자적으로 실행하는 "문장 하나"로만 구현한다.

export async function create(
  hallId: string,
  input: { stepName: string; description?: string | null },
): Promise<TemplateItem> {
  const [item] = await db
    .insert(checklistTemplateItems)
    .values({
      hallId,
      stepName: input.stepName,
      description: input.description ?? null,
      // INSERT 문 하나 안에서 sortOrder를 계산한다 — 별도 SELECT 후 INSERT하는 두 번의
      // 왕복이 아니므로 그 사이에 다른 요청이 끼어들 틈이 없다.
      sortOrder: sql<number>`coalesce((select max(${checklistTemplateItems.sortOrder}) from ${checklistTemplateItems} where ${checklistTemplateItems.hallId} = ${hallId}), -1) + 1`,
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

// AC 3: 대상 항목을 인접 항목(같은 홀 안에서 sort_order 기준 바로 앞/뒤)과 스왑한다.
// "조회 → 계산 → 저장"을 여러 왕복으로 나누지 않고, CTE를 쓴 UPDATE 문 하나로 표현해
// Postgres가 그 자체로 원자적으로 실행하게 한다 — target/neighbor 중 하나라도 없으면
// (맨 위에서 up, 맨 아래에서 down 등) neighbor가 빈 결과가 되어 자연히 0행 갱신으로 끝난다.
export async function moveAdjacent(
  hallId: string,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  const comparator = direction === "up" ? sql`<` : sql`>`;
  const neighborOrder = direction === "up" ? sql`desc` : sql`asc`;

  await db.execute(sql`
    with target as (
      select id, sort_order from ${checklistTemplateItems}
      where id = ${id} and hall_id = ${hallId}
    ),
    neighbor as (
      select id, sort_order from ${checklistTemplateItems}
      where hall_id = ${hallId}
        and sort_order ${comparator} (select sort_order from target)
      order by sort_order ${neighborOrder}
      limit 1
    )
    update ${checklistTemplateItems} as t
    set sort_order = case
      when t.id = (select id from target) then (select sort_order from neighbor)
      when t.id = (select id from neighbor) then (select sort_order from target)
    end
    where exists (select 1 from neighbor)
      and t.id in (select id from target union select id from neighbor)
  `);
}
