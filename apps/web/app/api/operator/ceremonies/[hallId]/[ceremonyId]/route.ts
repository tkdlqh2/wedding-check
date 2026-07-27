import { requireSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import {
  getOperatorInstanceView,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";

// Story 2.3 AD-5: 클라이언트의 60초 stale-while-revalidate 폴링 전용 엔드포인트.
// 최초 로드는 app/operator/ceremonies/[hallId]/[ceremonyId]/page.tsx(Server Component)가
// 서비스 함수를 직접 호출하므로 이 라우트를 거치지 않는다 — 같은 요청을 두 번 만들지 않는다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string }> },
) {
  await requireSession();

  const { hallId, ceremonyId } = await params;
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    const view = await getOperatorInstanceView(hallId, ceremonyId);
    return Response.json(view);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) {
      return Response.json(
        { error: { code: "not_found", message: err.message } },
        { status: 404 },
      );
    }
    throw err;
  }
}
