import { eq, and, sql } from "drizzle-orm";
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

export interface StructuredFields {
  situation: string;
  outcome: string;
  rationale: string;
  tags: string[];
}

// Story 3.2: 구조화 초안 저장(LLM 결과) 및 오퍼레이터의 필드 수정 저장에 공용으로 쓴다.
// confirmed 행은 절대 덮어쓰지 않는다(AD-8) — WHERE status='draft'가 단일 UPDATE 문
// 안에서 원자적으로 이를 보장한다(행이 없으면 0행 반환, 호출부가 "이미 확정됨"으로 해석).
export async function updateStructuredFields(
  id: string,
  fields: StructuredFields,
): Promise<Feedback | undefined> {
  const [row] = await db
    .update(feedback)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(feedback.id, id), eq(feedback.status, "draft")))
    .returning();
  return row;
}

interface FeedbackRow extends Record<string, unknown> {
  id: string;
  hall_id: string;
  ceremony_id: string;
  template_item_id: string | null;
  step_name: string;
  content: string;
  status: string;
  situation: string | null;
  outcome: string | null;
  rationale: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

function mapRow(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    hallId: row.hall_id,
    ceremonyId: row.ceremony_id,
    templateItemId: row.template_item_id,
    stepName: row.step_name,
    content: row.content,
    status: row.status,
    situation: row.situation,
    outcome: row.outcome,
    rationale: row.rationale,
    tags: row.tags,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Story 3.2 AC 3 / AD-8: draft -> confirmed 전환과 variable_case 생성을 하나의 원자적
// 단위로 묶는다. db.transaction()은 프로덕션 드라이버(neon-http)에서 throw하므로
// (Story 1.3/2.1 선례) 여러 INSERT/UPDATE를 체이닝한 단일 CTE 문으로 원자성을 얻는다
// (ceremonyRepo.create()와 동일 원리). confirmed CTE가 WHERE status='draft'로 0행이면
// (이미 confirmed거나 존재하지 않으면) new_case도, 최종 SELECT도 0행 — "confirmed인데
// variable_case가 없는" 반쪽 상태가 절대 만들어지지 않는다. 임베딩은 이 함수 호출 전에
// 이미 계산돼 있어야 한다(외부 API 호출을 SQL 안에 넣을 수 없음 — 서비스 레이어 책임).
export async function confirmAndCreateVariableCase(
  id: string,
  embedding: number[],
): Promise<Feedback | undefined> {
  const embeddingLiteral = JSON.stringify(embedding);
  const result = await db.execute<FeedbackRow>(sql`
    with confirmed as (
      update feedback
      set status = 'confirmed', updated_at = now()
      where id = ${id} and status = 'draft'
      returning *
    ),
    new_case as (
      insert into variable_cases (hall_id, feedback_id, step_name, situation, outcome, rationale, tags, embedding)
      select hall_id, id, step_name, situation, outcome, rationale, tags, ${embeddingLiteral}::vector
      from confirmed
      returning id
    )
    select confirmed.*
    from confirmed
    join new_case on true
  `);
  const row = result.rows[0];
  return row ? mapRow(row) : undefined;
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
      // 코덱스 리뷰 2차 P2: $onUpdate는 일반 db.update()에만 적용되고 onConflictDoUpdate의
      // 명시적 set에는 자동 반영되지 않는다 — updatedAt을 직접 넣지 않으면 재저장해도
      // 최초 생성 시각에 머물러 "언제 마지막으로 이어 썼는지"가 부정확해진다.
      set: { content: input.content, updatedAt: new Date() },
      setWhere: eq(feedback.status, "draft"),
    })
    .returning();
  return row;
}
