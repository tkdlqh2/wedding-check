import { requireSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import {
  saveDraftFeedback,
  getDraftFeedback,
  updateStructuredFields,
  FeedbackValidationError,
} from "@/lib/services/feedback";

// Story 3.1(FR-8): 스파인 Structural Seed `api/feedback/` + Capability Map "FR-8/9
// 피드백·구조화 → api/feedback/route.ts"를 따라 Server Action이 아니라 Route
// Handler로 구현한다. AD-3: 피드백 입력은 operator/admin 둘 다 접근 가능한 화면
// 기능이라 requireAdminSession()이 아니라 requireSession()을 쓴다.
async function requireSessionOr401() {
  try {
    await requireSession();
    return null;
  } catch {
    return Response.json(
      { error: { code: "unauthorized", message: "로그인이 필요합니다" } },
      { status: 401 },
    );
  }
}

function parseParams(hallId: string, ceremonyId: string) {
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string }> },
) {
  const unauthorized = await requireSessionOr401();
  if (unauthorized) return unauthorized;

  const { hallId, ceremonyId } = await params;
  const invalid = parseParams(hallId, ceremonyId);
  if (invalid) return invalid;

  const templateItemId = new URL(request.url).searchParams.get("templateItemId");
  if (!templateItemId || !isValidUuid(templateItemId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    const result = await getDraftFeedback(hallId, ceremonyId, templateItemId);
    return Response.json({ feedback: result ?? null });
  } catch (err) {
    if (err instanceof FeedbackValidationError) {
      return Response.json(
        { error: { code: "not_found", message: err.message } },
        { status: 404 },
      );
    }
    throw err;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string }> },
) {
  const unauthorized = await requireSessionOr401();
  if (unauthorized) return unauthorized;

  const { hallId, ceremonyId } = await params;
  const invalid = parseParams(hallId, ceremonyId);
  if (invalid) return invalid;

  const body = await request.json().catch(() => null);
  const templateItemId = typeof body?.templateItemId === "string" ? body.templateItemId : null;
  const content = typeof body?.content === "string" ? body.content : null;
  if (!templateItemId || !isValidUuid(templateItemId) || content === null) {
    return Response.json(
      { error: { code: "invalid_input", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    const result = await saveDraftFeedback(hallId, ceremonyId, templateItemId, content);
    return Response.json({ feedback: result });
  } catch (err) {
    if (err instanceof FeedbackValidationError) {
      return Response.json(
        { error: { code: "invalid_input", message: err.message } },
        { status: 400 },
      );
    }
    throw err;
  }
}

// Story 3.2 AC 2: 오퍼레이터가 구조화 초안(situation/outcome/rationale/tags)을 직접
// 고쳐 저장한다. draft 저장(POST, 원본 자연어)과는 별개 필드를 다루는 다른 액션이라
// 메서드를 분리한다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string }> },
) {
  const unauthorized = await requireSessionOr401();
  if (unauthorized) return unauthorized;

  const { hallId, ceremonyId } = await params;
  const invalid = parseParams(hallId, ceremonyId);
  if (invalid) return invalid;

  const body = await request.json().catch(() => null);
  const templateItemId = typeof body?.templateItemId === "string" ? body.templateItemId : null;
  const situation = typeof body?.situation === "string" ? body.situation : null;
  const outcome = typeof body?.outcome === "string" ? body.outcome : null;
  const rationale = typeof body?.rationale === "string" ? body.rationale : null;
  const tags = Array.isArray(body?.tags) ? body.tags : null;
  if (
    !templateItemId ||
    !isValidUuid(templateItemId) ||
    situation === null ||
    outcome === null ||
    rationale === null ||
    tags === null ||
    !tags.every((t: unknown) => typeof t === "string")
  ) {
    return Response.json(
      { error: { code: "invalid_input", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    const result = await updateStructuredFields(hallId, ceremonyId, templateItemId, {
      situation,
      outcome,
      rationale,
      tags,
    });
    return Response.json({ feedback: result });
  } catch (err) {
    if (err instanceof FeedbackValidationError) {
      return Response.json(
        { error: { code: "invalid_input", message: err.message } },
        { status: 400 },
      );
    }
    throw err;
  }
}
