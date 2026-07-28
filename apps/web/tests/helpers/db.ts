import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  halls,
  checklistTemplateItems,
  checklistTemplateItemChecks,
  variableCases,
} from "@/lib/db/schema";
import * as ceremonyRepo from "@/lib/db/repositories/ceremony";
import * as feedbackRepo from "@/lib/db/repositories/feedback";

// .env.test가 로드되지 않았는데 셸에 개발용 DATABASE_URL이 남아있으면 이 함수가
// 개발 DB를 통째로 지울 수 있다(코덱스 리뷰 P1) — DB 이름을 확인해 wedding_check_test가
// 아니면 무조건 막는다.
function assertUsingTestDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/wedding_check_test(\?|$)/.test(url)) {
    throw new Error(
      `resetDb()는 wedding_check_test DB에서만 실행할 수 있습니다. 현재 DATABASE_URL: "${url || "(설정 안 됨)"}" — .env.test가 로드됐는지 확인하세요.`,
    );
  }
}

// 통합 테스트는 항상 wedding_check_test DB(.env.test)를 대상으로 한다 — 개발 DB를
// 건드리지 않는다. lib/db/index.ts의 dev-driver 분기를 그대로 재사용한다.
export async function resetDb() {
  assertUsingTestDatabase();
  // insight_clusters는 variable_cases FK 때문에 CASCADE로도 비워지지만, 어떤 테이블이
  // 초기화 대상인지 목록에 명시적으로 남긴다(Story 4.1).
  await db.execute(
    sql`TRUNCATE TABLE insight_clusters, variable_cases, feedback, checklist_instance_items, checklist_instances, ceremonies, demo_videos, checklist_template_items, halls, session, account, verification, "user" RESTART IDENTITY CASCADE`,
  );
  // insight_recompute_state는 **TRUNCATE 대상이 아니다** — 'singleton' 행은 마이그레이션이
  // 시드한 것이고, 그 행이 사라지면 acquireLock의 조건부 UPDATE가 영원히 0행을 반환해
  // 배치가 절대 실행되지 않는다. 락 상태만 초기값으로 되돌린다.
  await db.execute(
    sql`INSERT INTO insight_recompute_state (id) VALUES ('singleton')
        ON CONFLICT (id) DO UPDATE SET
          running_since = NULL, lock_expires_at = NULL,
          last_completed_at = NULL, last_error = NULL`,
  );
}

export async function createTestHall(
  overrides: Partial<{ name: string; isActive: boolean }> = {},
) {
  const [hall] = await db
    .insert(halls)
    .values({
      name: overrides.name ?? "테스트 웨딩홀",
      isActive: overrides.isActive ?? true,
    })
    .returning();
  return hall;
}

export async function createTestTemplateItem(
  hallId: string,
  overrides: Partial<{
    stepName: string;
    sortOrder: number;
    applicableContractConditions: Record<string, boolean>;
  }> = {},
) {
  const [item] = await db
    .insert(checklistTemplateItems)
    .values({
      hallId,
      stepName: overrides.stepName ?? "테스트 항목",
      sortOrder: overrides.sortOrder ?? 1,
      applicableContractConditions: overrides.applicableContractConditions ?? {},
    })
    .returning();
  return item;
}

// Story 5.5: 단계(checklistTemplateItems) 아래 체크리스트 항목. ceremonyRepo.create()의
// new_items CTE가 checklist_template_item_checks를 INNER JOIN하므로, 인스턴스에
// 포함되길 기대하는 단계는 테스트에서도 이 헬퍼로 체크리스트 항목을 최소 1개 만들어야 한다.
// Story 4.1: 확정된 변수 케이스 1건을 정규 경로로 만든다. variable_case는
// confirmAndCreateVariableCase 단일 경로로만 생성된다(AD-8, Story 3.2 결정) —
// 테스트도 그 경로를 그대로 쓴다(직접 INSERT 우회 금지).
//
// feedback의 (ceremony_id, template_item_id) UNIQUE 때문에 케이스마다 자기 단계와
// 자기 예식을 새로 만든다 — 같은 예식·단계에 두 건을 만들면 제약에 걸린다.
export async function createConfirmedVariableCase(
  hallId: string,
  embedding: number[],
  fields: Partial<{
    situation: string;
    rationale: string;
    outcome: string;
    stepName: string;
  }> = {},
) {
  const stepName = fields.stepName ?? "신랑입장";
  const step = await createTestTemplateItem(hallId, {
    stepName,
    sortOrder: Math.floor(Math.random() * 1_000_000),
  });
  const { ceremonyId } = await ceremonyRepo.create(hallId, {
    ceremonyAt: new Date("2026-08-01T05:00:00.000Z"),
    contractConditions: {},
  });
  const created = await feedbackRepo.create({
    hallId,
    ceremonyId,
    templateItemId: step.id,
    stepName,
    content: "원본 내용",
  });
  await feedbackRepo.updateStructuredFields(created.id, {
    situation: fields.situation ?? "상황 설명",
    outcome: fields.outcome ?? "well_handled",
    rationale: fields.rationale ?? "사후 판단",
    tags: ["태그1"],
  });
  const confirmed = await feedbackRepo.confirmAndCreateVariableCase(created.id, embedding);
  if (!confirmed) throw new Error("테스트 셋업 실패: 확정되지 않음");
  const [row] = await db
    .select()
    .from(variableCases)
    .where(eq(variableCases.feedbackId, created.id));
  return row;
}

export async function createTestChecklistItem(
  hallId: string,
  templateItemId: string,
  overrides: Partial<{ title: string; description: string | null; sortOrder: number }> = {},
) {
  const [item] = await db
    .insert(checklistTemplateItemChecks)
    .values({
      hallId,
      templateItemId,
      title: overrides.title ?? "테스트 체크리스트 항목",
      description: overrides.description ?? null,
      sortOrder: overrides.sortOrder ?? 1,
    })
    .returning();
  return item;
}
