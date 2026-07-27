import { eq, and } from "drizzle-orm";
import { db } from "../index";
import { feedback } from "../schema";

export type Feedback = typeof feedback.$inferSelect;

// AD-2: feedback은 스파인이 명시하는 홀 종속 엔티티 목록에 없다 — 여기엔 hallId 스코프
// 격리 쿼리를 두지 않는다(AD-6: hallId는 표시 태그일 뿐). 예식↔홀 소속 검증은 서비스
// 레이어(lib/services/feedback.ts)가 ceremonyRepo.findById(hallId, ceremonyId)로 한다.

export async function findByCeremonyAndStep(
  ceremonyId: string,
  templateItemId: string,
): Promise<Feedback | undefined> {
  return db.query.feedback.findFirst({
    where: and(eq(feedback.ceremonyId, ceremonyId), eq(feedback.templateItemId, templateItemId)),
  });
}

export async function create(input: {
  hallId: string;
  ceremonyId: string;
  templateItemId: string;
  stepName: string;
  content: string;
}): Promise<Feedback> {
  const [row] = await db
    .insert(feedback)
    .values({
      hallId: input.hallId,
      ceremonyId: input.ceremonyId,
      templateItemId: input.templateItemId,
      stepName: input.stepName,
      content: input.content,
      status: "draft",
    })
    .returning();
  return row;
}

export async function updateContent(id: string, content: string): Promise<Feedback> {
  const [row] = await db.update(feedback).set({ content }).where(eq(feedback.id, id)).returning();
  return row;
}
