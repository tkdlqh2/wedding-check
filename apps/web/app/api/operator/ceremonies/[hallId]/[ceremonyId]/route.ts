import * as hallRepo from "@/lib/db/repositories/hall";
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
  // 코덱스 리뷰 2차 P2: requireSession()이 그냥 throw하면 Next.js가 500으로 응답해
  // 클라이언트의 `res.status === 401` 리다이렉트 분기가 절대 실행되지 않는다 — 세션
  // 만료를 명시적으로 401로 응답해야 한다.
  try {
    await requireSession();
  } catch {
    return Response.json(
      { error: { code: "unauthorized", message: "로그인이 필요합니다" } },
      { status: 401 },
    );
  }

  const { hallId, ceremonyId } = await params;
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  // 코덱스 리뷰 2차 P2: page.tsx(최초 로드)는 hall.isActive를 확인하고 notFound()로
  // 막는데, 이 폴링 라우트는 그 검증을 건너뛰고 있었다 — 홀이 비활성화된 뒤에도 계속
  // 데이터를 내려주거나, 다른 비활성 홀의 예식을 직접 조회당할 수 있었다.
  const hall = await hallRepo.findById(hallId);
  if (!hall || !hall.isActive) {
    return Response.json(
      { error: { code: "not_found", message: "존재하지 않는 예식입니다" } },
      { status: 404 },
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
