import { requireSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import { structureFeedback, FeedbackValidationError } from "@/lib/services/feedback";

// Story 3.2(FR-9): draft 피드백의 원본 자연어를 LLM으로 자동 구조화한다. 3.1의
// route.ts와 동일한 인증/에러 봉투 관례를 따르되, 구조화는 별도 하위 경로로 분리한다
// (draft 저장 POST와 의미가 다른 액션 — 스파인이 세부 경로를 못박지 않아 dev가 결정).
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string }> },
) {
  const unauthorized = await requireSessionOr401();
  if (unauthorized) return unauthorized;

  const { hallId, ceremonyId } = await params;
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const templateItemId = typeof body?.templateItemId === "string" ? body.templateItemId : null;
  if (!templateItemId || !isValidUuid(templateItemId)) {
    return Response.json(
      { error: { code: "invalid_input", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    const result = await structureFeedback(hallId, ceremonyId, templateItemId);
    return Response.json({ feedback: result });
  } catch (err) {
    if (err instanceof FeedbackValidationError) {
      return Response.json(
        { error: { code: "invalid_input", message: err.message } },
        { status: 400 },
      );
    }
    return Response.json(
      { error: { code: "structure_failed", message: "구조화에 실패했습니다. 다시 시도해주세요" } },
      { status: 502 },
    );
  }
}
