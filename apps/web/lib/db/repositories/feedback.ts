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

// Story 3.1 코덱스 리뷰 P1: "조회 → 없으면 생성" 두 단계로 나뉘어 있으면, 같은
// 예식+단계에 동시에 최초 저장하는 두 요청이 둘 다 조회 시점에 미존재를 확인한 뒤
// INSERT를 시도해 한쪽이 (ceremony_id, template_item_id) UNIQUE 위반으로 500이 될 수
// 있었다 — db.transaction() 없이(neon-http가 throw) 원자성을 얻어야 하므로
// ON CONFLICT DO UPDATE 단일 문으로 대체한다(demo-video.ts::upsertForChecklistItem과
// 동일 패턴). `setWhere`로 기존 행이 draft일 때만 실제로 갱신하고, confirmed면 갱신을
// 건너뛰어(DO NOTHING과 동일 효과) 0행 반환 — 호출부가 이를 "이미 확정됨"으로 해석한다.
export async function upsertDraft(input: {
  hallId: string;
  ceremonyId: string;
  templateItemId: string;
  stepName: string;
  content: string;
}): Promise<Feedback | undefined> {
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
    .onConflictDoUpdate({
      target: [feedback.ceremonyId, feedback.templateItemId],
      set: { content: input.content },
      setWhere: eq(feedback.status, "draft"),
    })
    .returning();
  return row;
}
