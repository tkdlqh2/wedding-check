import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { halls, checklistTemplateItems, checklistTemplateItemChecks } from "@/lib/db/schema";

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
  await db.execute(
    sql`TRUNCATE TABLE checklist_instance_items, checklist_instances, ceremonies, demo_videos, checklist_template_items, halls, session, account, verification, "user" RESTART IDENTITY CASCADE`,
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
