import { eq, and, gte, lt, sql } from "drizzle-orm";
import { db } from "../index";
import { ceremonies, checklistInstances, checklistInstanceItems } from "../schema";

export type Ceremony = typeof ceremonies.$inferSelect;
export type CeremonyWithItemCount = Ceremony & { itemCount: number };

// AD-2: ceremonies/checklist_instances/checklist_instance_items는 홀 종속 엔티티다 —
// hallId를 모든 함수의 첫 인자로 받고, 모든 조회/수정 쿼리는 WHERE hall_id = $hallId를
// 포함한다.

// db.transaction()은 프로덕션 드라이버(neon-http)에서 무조건 throw하므로(Story 1.3 P1)
// ceremony + instance + N개의 instance_items를 하나의 요청 안에서 원자적으로 만들려면
// 여러 INSERT를 체이닝한 단일 SQL 문(CTE)을 쓴다. AD-9 부분집합 매칭: 아래 JOIN은
// ceremony.contract_conditions가 template_item.applicable_contract_conditions를
// JSONB `@>`(포함)하는 단계만 골라낸다 — 단계의 모든 조건 key-value가 예식 쪽에도
// 있어야 포함된다(반대 방향으로 쓰면 의미가 뒤집힌다, Story 2.2 Dev Notes 참고).
// Story 5.5: 인스턴스 항목의 최소 단위가 "단계"에서 "체크리스트 항목"으로 내려갔다 —
// 계약 형태로 필터링된 단계마다 그 소속 체크리스트 항목 전체를 checklist_template_item_checks
// JOIN으로 전개하고, row_number()로 (단계 순서, 항목 순서)를 평탄화한 단일 sort_order를
// 계산한다. 체크리스트 항목이 하나도 없는 단계는 INNER JOIN 특성상 자연히 인스턴스에서
// 빠진다(빈 단계는 오퍼레이터가 체크할 것이 없으므로 의도된 동작).
export async function create(
  hallId: string,
  input: { ceremonyAt: Date; contractConditions: Record<string, boolean> },
): Promise<{ ceremonyId: string; instanceId: string }> {
  // 주의: JS Date 객체를 raw sql 파라미터로 그대로 넘기면 node-postgres가 클라이언트/세션
  // 타임존(KST, +9h)을 거쳐 timestamp(without time zone) 컬럼에 값을 써버려, 저장된
  // 시각이 의도한 UTC 시각에서 9시간 밀린다(로컬 DB로 직접 실행해 확인한 실제 버그 —
  // 05:00Z를 넣었는데 14:00으로 저장됨). drizzle의 timestamp 컬럼 자체는
  // mapToDriverValue에서 `.toISOString()`을, mapFromDriverValue에서 `문자열+"+0000"`을
  // 쓴다 — 즉 "컬럼에 저장된 숫자를 항상 UTC로 취급한다"는 규약이다. raw SQL도 이 규약을
  // 그대로 따라야 하므로 Date를 넘기지 않고, ISO 문자열에서 "Z"만 제거해 세션 타임존
  // 변환이 끼어들 여지를 없앤 뒤 ::timestamp로 캐스팅한다.
  const ceremonyAtLiteral = input.ceremonyAt.toISOString().replace("Z", "");
  const result = await db.execute<{ ceremony_id: string; instance_id: string }>(sql`
    with new_ceremony as (
      insert into ceremonies (hall_id, ceremony_at, contract_conditions)
      values (${hallId}, ${ceremonyAtLiteral}::timestamp, ${JSON.stringify(input.contractConditions)}::jsonb)
      returning id, hall_id, contract_conditions
    ),
    new_instance as (
      insert into checklist_instances (hall_id, ceremony_id)
      select hall_id, id from new_ceremony
      returning id, hall_id, ceremony_id
    ),
    new_items as (
      insert into checklist_instance_items
        (hall_id, instance_id, template_item_check_id, step_name, title, description, sort_order)
      select ni.hall_id, ni.id, tic.id, ti.step_name, tic.title, tic.description,
        row_number() over (order by ti.sort_order, tic.sort_order)
      from new_instance ni
      join new_ceremony nc on nc.id = ni.ceremony_id
      join checklist_template_items ti
        on ti.hall_id = ni.hall_id
        and nc.contract_conditions @> ti.applicable_contract_conditions
      join checklist_template_item_checks tic
        on tic.template_item_id = ti.id
      returning id
    )
    select
      (select id from new_ceremony) as ceremony_id,
      (select id from new_instance) as instance_id
  `);
  // 주의: db.execute()는 pg의 QueryResult({rows, rowCount, ...})를 그대로 반환한다 —
  // .insert().returning()처럼 배열을 바로 주지 않는다. 배열 구조분해(`const [row] = ...`)를
  // 쓰면 undefined가 나온다(node-postgres/neon-http 양쪽 직접 실행해 확인).
  const row = result.rows[0];
  return { ceremonyId: row.ceremony_id, instanceId: row.instance_id };
}

export async function findByHallForDateRange(
  hallId: string,
  start: Date,
  end: Date,
): Promise<CeremonyWithItemCount[]> {
  const rows = await db
    .select({
      ceremony: ceremonies,
      itemCount: sql<number>`count(${checklistInstanceItems.id})`.mapWith(Number),
    })
    .from(ceremonies)
    .leftJoin(checklistInstances, eq(checklistInstances.ceremonyId, ceremonies.id))
    .leftJoin(
      checklistInstanceItems,
      eq(checklistInstanceItems.instanceId, checklistInstances.id),
    )
    .where(
      and(
        eq(ceremonies.hallId, hallId),
        gte(ceremonies.ceremonyAt, start),
        lt(ceremonies.ceremonyAt, end),
      ),
    )
    .groupBy(ceremonies.id);

  return rows.map((row) => ({ ...row.ceremony, itemCount: row.itemCount }));
}

export async function findById(hallId: string, id: string): Promise<Ceremony | undefined> {
  return db.query.ceremonies.findFirst({
    where: and(eq(ceremonies.id, id), eq(ceremonies.hallId, hallId)),
  });
}
