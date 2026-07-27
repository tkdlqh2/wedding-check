import * as feedbackRepo from "../db/repositories/feedback";
import * as ceremonyRepo from "../db/repositories/ceremony";
import * as templateItemRepo from "../db/repositories/template-item";
import * as instanceRepo from "../db/repositories/checklist-instance";
import type { Feedback } from "../db/repositories/feedback";
import { getEmbeddingPort, getLLMPort } from "../ai";

export class FeedbackValidationError extends Error {}

const OUTCOME_VALUES = ["well_handled", "mishandled"] as const;
type Outcome = (typeof OUTCOME_VALUES)[number];

function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && (OUTCOME_VALUES as readonly string[]).includes(value);
}

const TAGS_MIN = 1;
const TAGS_MAX = 5;

// 코덱스 리뷰: 프롬프트는 "1~5개"를 요청하지만 구조화 출력 스키마(JSON Schema)는
// minItems/maxItems를 지원하지 않아 LLM이 어겨도 스키마 레벨에서 막히지 않는다 —
// AC 1("5개 필드가 모두 채워진 초안")이 tags도 포함하므로 서비스 레이어에서 개수를
// 강제한다. 오퍼레이터 수동 수정(updateStructuredFields)에도 동일 규칙을 적용해
// LLM 결과와 수동 편집 사이에 다른 기준이 생기지 않게 한다.
function normalizeTags(tags: string[], ErrorClass: new (message: string) => Error = Error): string[] {
  const trimmed = tags.map((t) => t.trim()).filter((t) => t.length > 0);
  if (trimmed.length < TAGS_MIN || trimmed.length > TAGS_MAX) {
    throw new ErrorClass(`태그는 ${TAGS_MIN}~${TAGS_MAX}개여야 합니다`);
  }
  return trimmed;
}

const STRUCTURE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    situation: { type: "string" },
    outcome: { type: "string", enum: [...OUTCOME_VALUES] },
    rationale: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["situation", "outcome", "rationale", "tags"],
  additionalProperties: false,
} as const;

interface StructuredDraft {
  situation: string;
  outcome: Outcome;
  rationale: string;
  tags: string[];
}

// FR-9: LLM 응답(JSON 문자열)을 검증한다. output_config.format(JSON Schema)이 형태를
// 대부분 강제하지만, AD-8 안전 경계 원칙상 서비스 레이어에서 한 번 더 검증한다 —
// LLM이 스키마를 어기거나 빈 문자열을 채워 넣는 경우까지 방어한다.
function parseStructuredDraft(text: string): StructuredDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("구조화 응답이 유효한 JSON이 아닙니다");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("구조화 응답 형식이 올바르지 않습니다");
  }
  const { situation, outcome, rationale, tags } = parsed as Record<string, unknown>;
  if (typeof situation !== "string" || situation.trim().length === 0) {
    throw new Error("구조화 응답의 situation이 비어있습니다");
  }
  if (!isOutcome(outcome)) {
    throw new Error("구조화 응답의 outcome 값이 올바르지 않습니다");
  }
  if (typeof rationale !== "string" || rationale.trim().length === 0) {
    throw new Error("구조화 응답의 rationale이 비어있습니다");
  }
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
    throw new Error("구조화 응답의 tags 형식이 올바르지 않습니다");
  }
  return { situation: situation.trim(), outcome, rationale: rationale.trim(), tags: normalizeTags(tags) };
}

// AD-2 2-hop 재검증: ceremonyRepo/templateItemRepo 둘 다 hallId로 스코프된 조회다 —
// 둘 다 성공해야 예식과 단계가 실제로 같은 홀 소속임이 보장된다
// (checklist-instance.ts::addInstanceItem과 동일 원리).
//
// 코덱스 리뷰 P2: 같은 홀 소속이라는 것만으로는 그 단계가 "이 예식"의 실제
// 체크리스트에 포함돼 있음을 보장하지 않는다(AD-9 계약 형태 조건부 포함으로 특정
// 단계가 이 예식의 인스턴스에서 제외될 수 있음) — instanceRepo.existsForTemplateItem로
// 이 예식의 checklist_instance_items에 실제로 포함된 단계인지까지 검증한다.
async function requireCeremonyAndStep(hallId: string, ceremonyId: string, templateItemId: string) {
  const ceremony = await ceremonyRepo.findById(hallId, ceremonyId);
  if (!ceremony) {
    throw new FeedbackValidationError("존재하지 않는 예식입니다");
  }
  const step = await templateItemRepo.findById(hallId, templateItemId);
  if (!step) {
    throw new FeedbackValidationError("존재하지 않는 단계입니다");
  }
  // 예식이 있으면 인스턴스는 반드시 함께 있어야 한다(Story 2.1의 원자적 생성 불변
  // 조건) — checklist-instance.ts::getCeremonyDetail과 동일한 근거로 시스템 오류 취급.
  const instance = await instanceRepo.findByCeremony(hallId, ceremonyId);
  if (!instance) {
    throw new Error("예식에 연결된 체크리스트 인스턴스가 없습니다");
  }
  const included = await instanceRepo.existsForTemplateItem(instance.id, templateItemId);
  if (!included) {
    throw new FeedbackValidationError("이 예식의 체크리스트에 포함되지 않은 단계입니다");
  }
  return { ceremony, step };
}

// AC 1/2: 예식+단계 조합에 draft 피드백을 새로 만들거나(최초 저장) 이어 쓴다(재저장).
// AC 4/NFR-5: 사용자 식별자를 받지도, 저장하지도 않는다 — "이어 쓰기"는 예식+단계
// 단위로만 이어진다.
//
// 코덱스 리뷰 P1: "조회 → 없으면 생성" 두 단계로 나뉘어 있으면 동시 최초 저장(같은
// 예식+단계, 두 탭/재시도)이 UNIQUE 위반 500으로 이어질 수 있었다 — feedbackRepo가
// ON CONFLICT DO UPDATE 단일 문으로 원자적으로 처리한다(setWhere로 draft일 때만
// 실제 갱신, confirmed면 0행 반환).
export async function saveDraftFeedback(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
  content: string,
): Promise<Feedback> {
  const { step } = await requireCeremonyAndStep(hallId, ceremonyId, templateItemId);

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new FeedbackValidationError("내용을 입력하세요");
  }

  const result = await feedbackRepo.upsertDraft({
    hallId,
    ceremonyId,
    templateItemId,
    stepName: step.stepName,
    content: trimmed,
  });
  if (!result) {
    // 이 스토리 범위에서는 도달 불가능하다(confirmed로 바꾸는 코드가 아직 없음,
    // Story 3.2에서 생김) — 그래도 스키마가 이미 status를 지원하므로 지금 막아둔다.
    // 나중에 3.2가 확정 기능을 추가했을 때 이 화면(피드백 재입력 패널)을 통해
    // 확정된 피드백이 조용히 덮어써지는 안전 결함을 원천 차단하기 위한 방어적
    // 코딩(AD-8).
    throw new FeedbackValidationError("이미 확정된 피드백은 수정할 수 없습니다");
  }
  return result;
}

// AC 2: 이전에 저장한 draft를 프리필하기 위한 조회.
export async function getDraftFeedback(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
): Promise<Feedback | undefined> {
  await requireCeremonyAndStep(hallId, ceremonyId, templateItemId);
  return feedbackRepo.findByCeremonyAndStep(ceremonyId, templateItemId);
}

async function requireDraftFeedback(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
): Promise<Feedback> {
  await requireCeremonyAndStep(hallId, ceremonyId, templateItemId);
  const existing = await feedbackRepo.findByCeremonyAndStep(ceremonyId, templateItemId);
  if (!existing) {
    throw new FeedbackValidationError("임시저장된 피드백이 없습니다");
  }
  if (existing.status !== "draft") {
    throw new FeedbackValidationError("이미 확정된 피드백입니다");
  }
  return existing;
}

// AC 1: draft 피드백의 원본 자연어(content)를 5필드(단계는 이미 앎) 중 4개
// (situation/outcome/rationale/tags)로 자동 구조화한 초안을 만들어 저장한다.
// NFR-1: temperature=0(어댑터 기본값)으로 결정성을 최대화하되, 재구조화는 기존 초안을
// 덮어쓴다 — 오퍼레이터가 다시 구조화를 눌렀다는 것은 이전 초안을 버리겠다는 의도다.
export async function structureFeedback(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
): Promise<Feedback> {
  const existing = await requireDraftFeedback(hallId, ceremonyId, templateItemId);

  const prompt = `당신은 웨딩홀 예식 진행 중 발생한 변수 상황 피드백을 구조화하는 보조 도구입니다.
다음은 오퍼레이터가 "${existing.stepName}" 단계에서 자유롭게 작성한 피드백입니다.

"""
${existing.content}
"""

이 내용을 바탕으로 아래 필드를 채워주세요.
- situation: 어떤 상황이 있었는지 객관적으로 요약한 설명
- outcome: 이 상황에 잘 대처했는지 여부 (well_handled 또는 mishandled 중 하나)
- rationale: 사후에 돌아봤을 때의 판단(왜 그렇게 대처했는지, 다음엔 어떻게 해야 하는지)
- tags: 이 상황을 분류할 수 있는 키워드 1~5개`;

  const result = await getLLMPort().generate({ prompt, responseSchema: STRUCTURE_RESPONSE_SCHEMA });
  const draft = parseStructuredDraft(result.text);

  const updated = await feedbackRepo.updateStructuredFields(existing.id, draft);
  if (!updated) {
    throw new FeedbackValidationError("이미 확정된 피드백은 수정할 수 없습니다");
  }
  return updated;
}

// AC 2: 오퍼레이터가 구조화 초안의 4개 필드를 직접 고쳐 저장한다.
export async function updateStructuredFields(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
  fields: { situation: string; outcome: string; rationale: string; tags: string[] },
): Promise<Feedback> {
  const existing = await requireDraftFeedback(hallId, ceremonyId, templateItemId);

  const situation = fields.situation.trim();
  const rationale = fields.rationale.trim();
  if (situation.length === 0) {
    throw new FeedbackValidationError("상황 설명을 입력하세요");
  }
  if (!isOutcome(fields.outcome)) {
    throw new FeedbackValidationError("대처 결과 값이 올바르지 않습니다");
  }
  if (rationale.length === 0) {
    throw new FeedbackValidationError("사후 판단을 입력하세요");
  }
  if (!Array.isArray(fields.tags) || !fields.tags.every((t) => typeof t === "string")) {
    throw new FeedbackValidationError("태그 형식이 올바르지 않습니다");
  }
  const tags = normalizeTags(fields.tags, FeedbackValidationError);

  const updated = await feedbackRepo.updateStructuredFields(existing.id, {
    situation,
    outcome: fields.outcome,
    rationale,
    tags,
  });
  if (!updated) {
    throw new FeedbackValidationError("이미 확정된 피드백은 수정할 수 없습니다");
  }
  return updated;
}

// AC 3 / AD-8: 5필드가 모두 채워진 draft만 confirmed로 전환하고, 그 시점에만
// variable_case를 생성·임베딩한다. 임베딩(외부 API 호출)은 DB 원자적 쓰기 전에 미리
// 완료해둔다 — 실패하면 feedback은 draft로 그대로 남는다(트랜잭션에 진입조차 하지
// 않았으므로 "confirmed인데 variable_case 없음" 상태가 관측될 수 없다, AD-8).
export async function confirmFeedback(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
): Promise<Feedback> {
  const existing = await requireDraftFeedback(hallId, ceremonyId, templateItemId);

  // AC 1/3: "5필드 모두 채워짐"이 확정 조건이다 — tags도 그 5개 중 하나이므로
  // situation/outcome/rationale과 동일하게 완결성 체크에 포함한다(코덱스 리뷰).
  // outcome은 enum 멤버십까지, tags는 개수 상한(normalizeTags와 동일 기준)까지
  // 재확인한다(진입 경로가 늘어나도 이 시점에 한 번 더 방어 — DB에 CHECK 제약이
  // 없으므로. 코덱스 리뷰 2라운드: tags 하한만 보고 상한을 안 봐 outcome 검증과
  // 비대칭이었다).
  if (
    !existing.situation ||
    existing.situation.trim().length === 0 ||
    !isOutcome(existing.outcome) ||
    !existing.rationale ||
    existing.rationale.trim().length === 0 ||
    existing.tags.length < TAGS_MIN ||
    existing.tags.length > TAGS_MAX
  ) {
    throw new FeedbackValidationError("구조화를 먼저 완료하세요");
  }

  const [embedding] = await getEmbeddingPort().embed([`${existing.situation} ${existing.rationale}`]);
  const confirmed = await feedbackRepo.confirmAndCreateVariableCase(existing.id, embedding);
  if (!confirmed) {
    throw new FeedbackValidationError("이미 확정된 피드백입니다");
  }
  return confirmed;
}
