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
// checklist-instance-view.tsx groupItemsByStep)이 뒤섞일 수 있었다. 수동 추가 항목은
// 항상 그 인스턴스의 현재 최댓값 다음(맨 뒤)에 배치한다 — ceremonyRepo.create()의
// row_number() 평탄화 계산과 별개로, 이 함수는 "당일 변경"이라 맨 뒤에 추가되는 것이
// 자연스럽다(대표가 원래 템플릿 순서 중간에 끼워 넣고 싶다면 이후 순서 편집 기능에서
// 다룰 문제 — 이 스토리 범위 밖).
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
  const [inserted] = await withConcurrencyRetry(() =>
    db
      .insert(checklistInstanceItems)
      .values({
        hallId,
        instanceId,
        templateItemId: checklistItem.stepId,
        templateItemCheckId: checklistItem.id,
        stepName: checklistItem.stepName,
        title: checklistItem.title,
        description: checklistItem.description,
        sortOrder: sql<number>`coalesce((select max(${checklistInstanceItems.sortOrder}) from ${checklistInstanceItems} where ${checklistInstanceItems.instanceId} = ${instanceId}), -1) + 1`,
      })
      .onConflictDoNothing({
        target: [checklistInstanceItems.instanceId, checklistInstanceItems.templateItemCheckId],
      })
      .returning(),
  );
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
