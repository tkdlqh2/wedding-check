import { requireSessionOr401 } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import { confirmFeedback, FeedbackValidationError } from "@/lib/services/feedback";

// Story 3.2(AC 3, AD-8): draft -> confirmed 전환 + variable_case 생성. 실패(임베딩 API
// 오류 등)는 구조화와 마찬가지로 502로 명확히 드러낸다(조용한 실패 금지, DESIGN.md §14).

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
    const result = await confirmFeedback(hallId, ceremonyId, templateItemId);
    return Response.json({ feedback: result });
  } catch (err) {
    if (err instanceof FeedbackValidationError) {
      return Response.json(
        { error: { code: "invalid_input", message: err.message } },
        { status: 400 },
      );
    }
    // 코덱스 리뷰: 임베딩 API 예외 등 예상 밖 오류를 로그 없이 502로만 뭉개면 실제
    // 버그와 일시적 장애를 구분할 수 없다(AD-10 원칙과 동일).
    console.error("[api/feedback/confirm] 확정 실패", err);
    return Response.json(
      { error: { code: "confirm_failed", message: "확정에 실패했습니다. 다시 시도해주세요" } },
      { status: 502 },
    );
  }
}
