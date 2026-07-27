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

// Story 5.2: 비활성화된 홀도 연결 데이터(과거/예정 예식)는 보존된다(AC 3, deactivate()
// 참고 — 하드 삭제 없음). 예식 등록 폼의 홀 선택지처럼 "지금 예식을 걸 수 있는 홀"이
// 필요한 곳은 findAllActive()를 쓰고, 과거 이력을 조회/집계하는 화면은 이 함수로 비활성
// 홀의 예식도 함께 봐야 한다(코덱스 리뷰 P2 — findAllActive()만 쓰면 홀을 비활성화하는
// 순간 그 홀의 모든 과거 예식이 목록/캘린더에서 사라짐).
export async function findAll(): Promise<Hall[]> {
  return db.query.halls.findMany({ orderBy: desc(halls.createdAt) });
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
