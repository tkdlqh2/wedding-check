import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "../index";
import { checklistTemplateItems } from "../schema";

export type TemplateItem = typeof checklistTemplateItems.$inferSelect;

// AD-2: checklist_template_items는 홀 종속 엔티티다 — hallId를 모든 함수의 첫 인자로
//받고, 모든 조회/수정 쿼리는 WHERE hall_id = $hallId를 포함한다.

// 주의: 프로덕션 DB는 drizzle-orm/neon-http를 쓰는데 이 드라이버는 db.transaction()을
// 지원하지 않고 항상 throw한다(코덱스 리뷰 P1로 발견 — 로컬 node-postgres에서는 통과하지만
// 실제 Neon 환경에서는 생성/순서변경이 전부 깨졌을 것). 그래서 동시성 안전장치는 여러 SQL문을
// 감싼 JS 트랜잭션이 아니라, Postgres가 자체적으로 원자적으로 실행하는 "문장 하나" + DB 제약
// 조건(schema.ts의 (hall_id, sort_order) UNIQUE)으로 구현한다.

// drizzle-orm은 드라이버가 던진 원본 Postgres 에러를 자체 에러의 `cause`로 감싼다
// (23505 같은 code는 최상위 에러가 아니라 err.cause에 있다 — 처음엔 이걸 놓쳐서 재시도가
// 전혀 안 걸리고 8개 동시 생성 중 2개가 그대로 500으로 실패하는 걸 직접 재현해서 확인함).
// 40P01(deadlock_detected)도 같은 방식으로 재시도 대상이다 — 두 스왑이 서로 다른 순서로
// 같은 두 행을 잠그려 하면 발생할 수 있다.
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

// 동시 요청끼리 서로의 sort_order 계산을 밟고 지나가 (hall_id, sort_order) UNIQUE
// 제약을 건드리면(코덱스 리뷰 5·7차 P2/P1), 문장을 처음부터 다시 실행해 그 시점의 최신
// 데이터로 재계산한다 — db.transaction()을 못 쓰는 neon-http 제약(위 주석) 안에서 이
// 재시도가 사실상의 직렬화 역할을 한다.
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
  input: {
    stepName: string;
    description?: string | null;
    applicableContractConditions?: Record<string, boolean>;
  },
): Promise<TemplateItem> {
  // INSERT 문 하나 안에서 sortOrder를 계산해 별도 SELECT 후 INSERT하는 두 번의 왕복(그
  // 사이에 다른 요청이 끼어들 틈)을 없앤다. 그래도 두 INSERT가 동시에 같은 max(sort_order)를
  // 읽을 가능성 자체는 이 문장 하나만으로는 막을 수 없으므로(코덱스 리뷰 5차 P1), 최종
  // 방어선은 (hall_id, sort_order) UNIQUE 제약이다 — 위반 시 재계산해서 재시도한다.
  return withConcurrencyRetry(async () => {
    const [item] = await db
      .insert(checklistTemplateItems)
      .values({
        hallId,
        stepName: input.stepName,
        description: input.description ?? null,
        applicableContractConditions: input.applicableContractConditions ?? {},
        sortOrder: sql<number>`coalesce((select max(${checklistTemplateItems.sortOrder}) from ${checklistTemplateItems} where ${checklistTemplateItems.hallId} = ${hallId}), -1) + 1`,
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
  input: {
    stepName: string;
    description?: string | null;
    applicableContractConditions?: Record<string, boolean>;
  },
): Promise<TemplateItem> {
  const [item] = await db
    .update(checklistTemplateItems)
    .set({
      stepName: input.stepName,
      description: input.description ?? null,
      applicableContractConditions: input.applicableContractConditions ?? {},
    })
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
// 그래도 두 이동 요청이 겹치는 항목을 동시에 건드리면 각자 커밋 전 스냅샷으로 neighbor를
// 골라 (hall_id, sort_order) UNIQUE 위반이 날 수 있다(코덱스 리뷰 7차 P2) — create와 같은
// 재시도 래퍼로 감싸, 위반 시 최신 상태로 문장을 처음부터 다시 실행한다.
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
  });
}
