import { requireSessionOr401 } from "@/lib/auth-guard";
import { queryVariableCases, QueryValidationError } from "@/lib/services/query";

// Story 3.3(FR-6): 실행 중 자연어 상황 질의 Route Handler — 스파인 Structural
// Seed/Capability Map이 확정한 경로(api/query). AD-3: 질의는 오퍼레이터 기능이지만
// 실행 화면은 admin도 열 수 있으므로 feedback 라우트와 동일하게 로그인만 확인한다.
// AD-6: 검색이 사업체 전체 범위라 hallId/ceremonyId 파라미터를 받지 않는다.
// AD-5: AI 질의는 온라인 전용 — 실패는 조용한 재시도 없이 즉시 오류로 드러낸다.

export async function POST(request: Request) {
  const unauthorized = await requireSessionOr401();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : null;
  if (text === null) {
    return Response.json(
      { error: { code: "invalid_input", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    const matches = await queryVariableCases(text);
    return Response.json({ matches });
  } catch (err) {
    if (err instanceof QueryValidationError) {
      return Response.json(
        { error: { code: "invalid_input", message: err.message } },
        { status: 400 },
      );
    }
    // AD-10 관측성: 임베딩 API 오류 등 예상 밖 실패를 로그 없이 502로만 뭉개면 실제
    // 버그와 일시적 장애를 구분할 수 없다(3.2 confirm 라우트와 동일 원칙). 이벤트
    // 타입을 남겨 질의 실패를 구조화 로그로 구분 가능하게 한다.
    console.error(JSON.stringify({ event: "query_failed" }), err);
    return Response.json(
      { error: { code: "query_failed", message: "질의에 실패했습니다. 다시 시도해주세요" } },
      { status: 502 },
    );
  }
}
