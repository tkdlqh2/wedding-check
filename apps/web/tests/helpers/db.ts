import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { halls, checklistTemplateItems } from "@/lib/db/schema";

// 통합 테스트는 항상 wedding_check_test DB(.env.test)를 대상으로 한다 — 개발 DB를
// 건드리지 않는다. lib/db/index.ts의 dev-driver 분기를 그대로 재사용한다.
export async function resetDb() {
  await db.execute(
    sql`TRUNCATE TABLE demo_videos, checklist_template_items, halls, session, account, verification, "user" RESTART IDENTITY CASCADE`,
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
  overrides: Partial<{ stepName: string; sortOrder: number }> = {},
) {
  const [item] = await db
    .insert(checklistTemplateItems)
    .values({
      hallId,
      stepName: overrides.stepName ?? "테스트 항목",
      sortOrder: overrides.sortOrder ?? 1,
    })
    .returning();
  return item;
}
