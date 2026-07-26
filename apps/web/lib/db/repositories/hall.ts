import { eq, desc } from "drizzle-orm";
import { db } from "../index";
import { halls } from "../schema";

export type Hall = typeof halls.$inferSelect;

// halls는 홀 종속 엔티티가 아니라 홀 격리의 기준이 되는 루트 엔티티이므로
// AD-2의 hallId 필수 첫 인자 규칙은 이 리포지토리에는 적용되지 않는다.
export async function create(input: { name: string }): Promise<Hall> {
  const [hall] = await db.insert(halls).values({ name: input.name }).returning();
  return hall;
}

export async function findAllActive(): Promise<Hall[]> {
  return db.query.halls.findMany({
    where: eq(halls.isActive, true),
    orderBy: desc(halls.createdAt),
  });
}

export async function findById(id: string): Promise<Hall | undefined> {
  return db.query.halls.findFirst({ where: eq(halls.id, id) });
}

export async function update(id: string, input: { name: string }): Promise<Hall> {
  const [hall] = await db
    .update(halls)
    .set({ name: input.name })
    .where(eq(halls.id, id))
    .returning();
  return hall;
}

// AC 3: 연결 데이터 유무와 무관하게 항상 비활성화 처리한다(하드 삭제 없음).
export async function deactivate(id: string): Promise<void> {
  await db.update(halls).set({ isActive: false }).where(eq(halls.id, id));
}
