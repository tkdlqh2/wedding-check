import * as hallRepo from "@/lib/db/repositories/hall";
import { requireSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import { setCeremonyStatus, CeremonyValidationError } from "@/lib/services/ceremony";
import { CEREMONY_STATUSES, type CeremonyStatus } from "@/lib/ceremony-status";

// 오퍼레이터 실행 화면의 예식 시작/종료 버튼(2026-07-27 대표 지시 — 상태는 시간 추정이
// 아니라 오퍼레이터가 직접 변경한다, prototype RunScreen.js). 전환 규칙(upcoming→
// ongoing→done)은 서비스가 검증한다. 세션 가드는 폴링 GET 라우트와 동일 패턴
// (requireSession의 throw를 명시적 401로 번역 — Story 2.3 코덱스 리뷰 2차 P2).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string }> },
) {
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

  const hall = await hallRepo.findById(hallId);
  if (!hall || !hall.isActive) {
    return Response.json(
      { error: { code: "not_found", message: "존재하지 않는 예식입니다" } },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_body", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }
  const status = (body as { status?: unknown })?.status;
  if (
    typeof status !== "string" ||
    !(CEREMONY_STATUSES as readonly string[]).includes(status)
  ) {
    return Response.json(
      { error: { code: "invalid_status", message: "잘못된 상태 값입니다" } },
      { status: 400 },
    );
  }

  try {
    await setCeremonyStatus(hallId, ceremonyId, status as CeremonyStatus);
  } catch (err) {
    if (err instanceof CeremonyValidationError) {
      return Response.json(
        { error: { code: "invalid_transition", message: err.message } },
        { status: 409 },
      );
    }
    throw err;
  }

  return Response.json({ ok: true, status });
}
