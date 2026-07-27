import { randomUUID } from "crypto";
import { eq, and, asc, notInArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../index";
import {
  checklistInstances,
  checklistInstanceItems,
  checklistTemplateItems,
  checklistTemplateItemChecks,
} from "../schema";

export type ChecklistInstance = typeof checklistInstances.$inferSelect;
export type ChecklistInstanceItem = typeof checklistInstanceItems.$inferSelect;
// Story 5.5: 인스턴스에 추가할 수 있는 "후보"는 이제 체크리스트 항목이다. 관리자 화면이
// 소속 단계로 그룹핑해서 보여줘야 하므로 stepName을 함께 반환한다.
export type CandidateChecklistItem = typeof checklistTemplateItemChecks.$inferSelect & {
  stepName: string;
};

// AD-2: checklist_instances/checklist_instance_items는 홀 종속 엔티티다 — hallId를
// 모든 함수의 첫 인자로 받고, 모든 조회/수정 쿼리는 WHERE hall_id = $hallId를 포함한다.

// template-item.ts::withConcurrencyRetry와 동일한 판별/재시도 로직 — addItem()이
// (instance_id, sort_order) UNIQUE 위반(코덱스 리뷰 4차 P2, 동시에 서로 다른 두 항목을
// 추가하면 둘 다 같은 max(sort_order)+1을 계산할 수 있음)을 겪는 것과 동일한 종류의
// 문제라 로직을 그대로 복제한다.
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

// Story 3.1 코덱스 리뷰 P2: 단계(templateItemId)가 같은 홀 소속이라는 것만으로는
// 그 단계가 "이 예식"의 실제 체크리스트에 포함돼 있음을 보장하지 않는다(AD-9 계약
// 형태 조건부 포함으로 특정 단계가 이 예식의 인스턴스에서 아예 제외될 수 있음) —
// 조작된 요청이 체크리스트에 없는 단계를 가리키며 피드백을 만들 수 있었던 실결함.
export async function existsForTemplateItem(
  instanceId: string,
  templateItemId: string,
): Promise<boolean> {
  const row = await db.query.checklistInstanceItems.findFirst({
    where: and(
      eq(checklistInstanceItems.instanceId, instanceId),
      eq(checklistInstanceItems.templateItemId, templateItemId),
    ),
    columns: { id: true },
  });
  return row !== undefined;
}

// Story 2.1 "실행용 사본" 원칙과 동일 — 체크리스트 항목의 그 시점 값을 스냅샷 복사한다.
// (instance_id, template_item_check_id) UNIQUE 제약(코덱스 리뷰 P2 반영)에
// onConflictDoNothing으로 대응한다 — 재전송/두 탭 동시 제출로 같은 항목을 두 번
// 추가해도 에러 없이 기존 행을 그대로 반환한다(멱등). db.transaction() 없이 단일
// INSERT 문 안에서 처리되므로 Story 1.3의 neon-http 트랜잭션 제약과도 무관하다.
// Story 5.5: 파라미터가 단계(TemplateItem)에서 체크리스트 항목으로 바뀌었다 — 소속
// 단계명(stepName)은 표시용 텍스트, stepId는 그룹핑용 안정적 키로 호출자(서비스)가
// 함께 채워 넘긴다(코덱스 리뷰 3차 P2 — stepName은 유일함이 보장되지 않아 텍스트만으로
// 그룹핑하면 서로 다른 두 단계가 하나로 합쳐질 수 있었다).
//
// 코덱스 리뷰 P1: sortOrder에 체크리스트 항목의 "단계 안" sortOrder(예: 0, 1)를 그대로
// 쓰면, 여러 단계가 각자 0부터 시작하는 sortOrder를 갖고 있어 인스턴스 전체의 평탄화된
// 순서와 충돌·동률이 발생해 오퍼레이터 화면의 단계별 그룹(연속된 stepName 가정, Story 5.5
// checklist-instance-view.tsx groupItemsByStep)이 뒤섞일 수 있었다.
//
// 코덱스 리뷰 5차 P2: 무조건 인스턴스 전체 맨 뒤에 추가하면, 이미 그 단계의 다른
// 항목이 인스턴스 중간에 있는 경우(예: 단계A 항목 → 단계B 항목 → 방금 추가된 단계A
// 항목) 오퍼레이터 화면이 같은 단계를 두 그룹으로 쪼개 보여준다(그룹핑이 "연속된"
// templateItemId만 묶으므로). 그래서 "같은 단계의 기존 항목이 있으면 그 바로 뒤에,
// 없으면 인스턴스 맨 뒤에" 삽입하도록 CTE 하나로 계산한다 — target.base가 "그 단계의
// 마지막 항목 sortOrder"(있으면) 또는 "인스턴스 전체 마지막 sortOrder"(없으면, 즉
// 기존과 동일한 맨 뒤 추가) 중 존재하는 값으로 정해지고, base보다 큰 기존 항목들만
// 한 칸씩 밀어 자리를 만든 뒤 base+1에 삽입한다. 같은 단계 항목이 없을 때는 밀어야 할
// 대상이 애초에 없으므로(정의상 base가 곧 전체 최댓값) UPDATE가 아무 행도 건드리지
// 않는 자연스러운 no-op이 되어, 기존 "맨 뒤 추가" 동작과 완전히 동일하게 수렴한다.
export async function addItem(
  hallId: string,
  instanceId: string,
  checklistItem: {
    id: string;
    title: string;
    description: string | null;
    stepId: string;
    stepName: string;
  },
): Promise<ChecklistInstanceItem> {
  const result = await withConcurrencyRetry(async () =>
    await db.execute<ChecklistInstanceItem>(sql`
      with target as (
        select coalesce(
          (select max(sort_order) from ${checklistInstanceItems}
            where instance_id = ${instanceId} and template_item_id = ${checklistItem.stepId}),
          (select max(sort_order) from ${checklistInstanceItems}
            where instance_id = ${instanceId}),
          -1
        ) as base
      ),
      shifted as (
        update ${checklistInstanceItems}
        set sort_order = sort_order + 1
        where instance_id = ${instanceId}
          and sort_order > (select base from target)
        returning id
      )
      insert into checklist_instance_items
        (hall_id, instance_id, template_item_id, template_item_check_id, step_name, title, description, sort_order)
      select
        ${hallId}, ${instanceId}, ${checklistItem.stepId}, ${checklistItem.id},
        ${checklistItem.stepName}, ${checklistItem.title}, ${checklistItem.description},
        (select base from target) + 1
      -- PostgreSQL은 WITH절의 데이터 변경 CTE라도 어디서도 참조하지 않으면 아예
      -- 실행하지 않는다(직접 재현해 확인한 실제 동작 — "shifted"가 정의만 되고 안 쓰이면
      -- 뒤 항목을 밀지 않은 채 그대로 INSERT해 UNIQUE 위반이 났었다). "shifted"의 결과를
      -- 실제로 참조해야 하지만 행이 0개일 수도 있는(밀 대상이 없는 "맨 뒤 추가" 케이스)
      -- 스칼라 서브쿼리라 INSERT ... SELECT의 카디널리티에 영향을 주지 않으면서 강제로
      -- 실행시키는 표준적인 우회: 항상 참인 조건에 COUNT(*)를 넣는다.
      where (select count(*) from shifted) >= 0
      on conflict (instance_id, template_item_check_id) do nothing
      -- db.execute()의 raw SQL은 drizzle의 camelCase 매핑을 거치지 않으므로(그냥
      -- pg 드라이버가 돌려주는 컬럼명 그대로) ChecklistInstanceItem 타입(camelCase
      -- 필드)과 맞추기 위해 명시적으로 별칭을 준다.
      returning
        id,
        hall_id as "hallId",
        instance_id as "instanceId",
        template_item_id as "templateItemId",
        template_item_check_id as "templateItemCheckId",
        step_name as "stepName",
        title,
        description,
        sort_order as "sortOrder",
        created_at as "createdAt"
    `),
  );
  const inserted = result.rows[0];
  if (inserted) return inserted;

  const existing = await db.query.checklistInstanceItems.findFirst({
    where: and(
      eq(checklistInstanceItems.instanceId, instanceId),
      eq(checklistInstanceItems.templateItemCheckId, checklistItem.id),
    ),
  });
  if (!existing) {
    throw new Error("addItem: 충돌 처리 후에도 기존 행을 찾지 못했습니다");
  }
  return existing;
}

// Story 5.8: "이 예식에만" 존재하는 자유 서술 항목 추가 — 템플릿 카탈로그를 거치지
// 않는다(templateItemCheckId는 항상 null). 기존 단계(실제 템플릿 단계 또는 이미 만들어진
// ad-hoc 단계)에 추가할 때는 stepId(templateItemId) 또는 groupRootId 중 하나를 넘겨
// addItem()과 동일한 "그 단계의 마지막 항목 바로 뒤에 삽입, 없으면 인스턴스 맨 뒤"
// 전략을 그대로 재사용한다. 완전히 새 단계를 만들 때는 둘 다 null로 넘기면 새
// groupRootId를 발급해 맨 뒤에 추가한다(§Dev Notes 참고).
export async function addAdHocItem(
  hallId: string,
  instanceId: string,
  input: {
    stepName: string;
    title: string;
    description: string | null;
    stepId: string | null;
    groupRootId: string | null;
  },
): Promise<ChecklistInstanceItem> {
  const newGroupRootId = input.stepId || input.groupRootId ? null : randomUUID();
  const rowGroupRootId = input.groupRootId ?? newGroupRootId;

  return withConcurrencyRetry(async () => {
    const result = await db.execute<ChecklistInstanceItem>(sql`
      with target as (
        select coalesce(
          ${
            input.stepId
              ? sql`(select max(sort_order) from ${checklistInstanceItems}
                  where instance_id = ${instanceId} and hall_id = ${hallId}
                    and template_item_id = ${input.stepId})`
              : input.groupRootId
                ? sql`(select max(sort_order) from ${checklistInstanceItems}
                    where instance_id = ${instanceId} and hall_id = ${hallId}
                      and ad_hoc_group_root_id = ${input.groupRootId})`
                : sql`null`
          },
          (select max(sort_order) from ${checklistInstanceItems}
            where instance_id = ${instanceId} and hall_id = ${hallId}),
          -1
        ) as base
      ),
      shifted as (
        update ${checklistInstanceItems}
        set sort_order = sort_order + 1
        where instance_id = ${instanceId} and hall_id = ${hallId}
          and sort_order > (select base from target)
        returning id
      )
      insert into checklist_instance_items
        (hall_id, instance_id, template_item_id, template_item_check_id, ad_hoc_group_root_id, step_name, title, description, sort_order)
      select
        ${hallId}, ${instanceId}, ${input.stepId}, null, ${rowGroupRootId},
        ${input.stepName}, ${input.title}, ${input.description},
        (select base from target) + 1
      -- addItem()과 동일한 이유로 shifted를 강제 참조(§addItem 주석 참고).
      where (select count(*) from shifted) >= 0
      returning
        id,
        hall_id as "hallId",
        instance_id as "instanceId",
        template_item_id as "templateItemId",
        template_item_check_id as "templateItemCheckId",
        ad_hoc_group_root_id as "adHocGroupRootId",
        step_name as "stepName",
        title,
        description,
        sort_order as "sortOrder",
        created_at as "createdAt"
    `);
    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error("addAdHocItem: 삽입 후 반환된 행이 없습니다");
    }
    return inserted;
  });
}

// Story 5.8: 인스턴스 항목의 제목/설명 수정(기존에는 추가/제외만 가능했다). 존재하지
// 않으면 undefined를 반환해 서비스가 사용자 오류로 번역할 수 있게 한다.
export async function updateItem(
  hallId: string,
  instanceId: string,
  itemId: string,
  input: { title: string; description: string | null },
): Promise<ChecklistInstanceItem | undefined> {
  const [updated] = await db
    .update(checklistInstanceItems)
    .set({ title: input.title, description: input.description })
    .where(
      and(
        eq(checklistInstanceItems.id, itemId),
        eq(checklistInstanceItems.instanceId, instanceId),
        eq(checklistInstanceItems.hallId, hallId),
      ),
    )
    .returning();
  return updated;
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

// AC 4(Story 2.2)/AC 7(Story 5.5): 다른 홀의 체크리스트 항목은 절대 후보로 노출되지
// 않는다 — hallId로만 스코프한다. 소속 단계명(stepName)을 JOIN으로 함께 가져와
// 관리자 화면이 단계별로 그룹핑해서 보여줄 수 있게 한다.
export async function listCandidateChecklistItems(
  hallId: string,
  instanceId: string,
): Promise<CandidateChecklistItem[]> {
  const included = await db
    .select({ templateItemCheckId: checklistInstanceItems.templateItemCheckId })
    .from(checklistInstanceItems)
    .where(
      and(
        eq(checklistInstanceItems.instanceId, instanceId),
        eq(checklistInstanceItems.hallId, hallId),
        isNotNull(checklistInstanceItems.templateItemCheckId),
      ),
    );
  const includedIds = included.map((row) => row.templateItemCheckId as string);

  const rows = await db
    .select({ check: checklistTemplateItemChecks, stepName: checklistTemplateItems.stepName })
    .from(checklistTemplateItemChecks)
    .innerJoin(
      checklistTemplateItems,
      eq(checklistTemplateItems.id, checklistTemplateItemChecks.templateItemId),
    )
    .where(
      and(
        eq(checklistTemplateItemChecks.hallId, hallId),
        includedIds.length > 0
          ? notInArray(checklistTemplateItemChecks.id, includedIds)
          : undefined,
      ),
    )
    .orderBy(asc(checklistTemplateItems.sortOrder), asc(checklistTemplateItemChecks.sortOrder));

  return rows.map((row) => ({ ...row.check, stepName: row.stepName }));
}
