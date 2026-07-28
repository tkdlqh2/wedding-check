import { requireSessionOr401 } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import { structureFeedback, FeedbackValidationError } from "@/lib/services/feedback";
import { toSafeErrorLabel } from "@/lib/safe-error";

// Story 3.2(FR-9): draft 피드백의 원본 자연어를 LLM으로 자동 구조화한다. 3.1의
// route.ts와 동일한 인증/에러 봉투 관례를 따르되, 구조화는 별도 하위 경로로 분리한다
// (draft 저장 POST와 의미가 다른 액션 — 스파인이 세부 경로를 못박지 않아 dev가 결정).

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
    // 코덱스 리뷰: LLM SDK 예외/JSON 파싱 실패 등 예상 밖 오류가 로그 없이 502로만
    // 뭉개지면, 실제 버그(예: 잘못된 요청 shape)와 일시적 네트워크 장애를 프로덕션에서
    // 구분할 수 없다(AD-10 "AI 질의 실패는 구조화된 JSON 로그로 남긴다"와 동일 원칙).
    // raw err를 넘기지 않는다(Story 4.1 코덱스 1차 P1과 같은 계열): 이 경로는
    // 피드백 원문을 LLM에 보내고 결과를 feedback에 UPDATE하므로, 벤더 오류 본문이나
    // drizzle 파라미터를 통해 원문이 로그로 샐 수 있다 — NFR-5(lib/safe-error.ts).
    console.error(
      JSON.stringify({ event: "feedback_structure_failed", error: toSafeErrorLabel(err) }),
    );
    return Response.json(
      { error: { code: "structure_failed", message: "구조화에 실패했습니다. 다시 시도해주세요" } },
      { status: 502 },
    );
  }
}
