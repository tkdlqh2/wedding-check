import { timingSafeEqual } from "node:crypto";
import { InsightLockedError, recomputeInsights } from "@/lib/services/insight";

// Story 4.1(FR-10, AD-10): 인사이트 재계산 배치의 실행 진입점.
//
// AD-10이 실행 방식을 지정한다 — "Vercel Cron Job이 공유 시크릿 헤더로 보호된 Route
// Handler를 호출하는 방식으로 구현한다(장기 실행 워커 금지 — 서버리스 배포 모델과
// 불일치)".
//
// 스케줄은 vercel.json의 `crons`에 있다(JSON이라 주석을 달 수 없어 여기 남긴다):
// `0 20 * * *` — **Vercel Cron 표현식은 UTC 기준**이라 이건 05:00 KST다(프로토타입
// InsightScreen.js의 "매일 새벽 1회 갱신 · 마지막 갱신 오늘 05:00"과 맞춘 값).
//
// Vercel Cron은 GET으로 호출하고 `Authorization: Bearer $CRON_SECRET`을 붙인다.

// 클러스터 수만큼 LLM 라벨 호출이 이어질 수 있어 기본 실행 시간으로는 부족하다.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // fail closed — 시크릿이 설정되지 않은 환경에서 보호 없이 열리는 경로를 만들지 않는다.
  // (호출부가 이 경우를 401이 아닌 503으로 구분해 응답한다.)
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  // timingSafeEqual은 길이가 다르면 throw하므로 먼저 거른다. 길이 자체는 비밀이 아니다.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error(JSON.stringify({ event: "insight_recompute_unconfigured" }));
    return Response.json(
      {
        error: {
          code: "cron_not_configured",
          message: "CRON_SECRET이 설정되지 않아 배치를 실행할 수 없습니다",
        },
      },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return Response.json(
      { error: { code: "unauthorized", message: "인증되지 않은 요청입니다" } },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  try {
    const { clusterCount, caseCount } = await recomputeInsights();
    // AD-10 관측성. 피드백 원문·상황 설명·라벨은 넣지 않는다(NFR-5) — 집계 수치만.
    console.info(
      JSON.stringify({
        event: "insight_recompute_done",
        clusterCount,
        caseCount,
        durationMs: Date.now() - startedAt,
      }),
    );
    return Response.json({ clusterCount, caseCount });
  } catch (err) {
    if (err instanceof InsightLockedError) {
      // AC 3 — 실패가 아니라 "이미 실행 중"이다. 재계산이 두 번 도는 것을 막는 것이
      // 이 응답의 목적이므로 500이 아니라 409로 구분한다(AD-7).
      console.info(JSON.stringify({ event: "insight_recompute_locked" }));
      return Response.json(
        { error: { code: "already_running", message: "재계산이 이미 실행 중입니다" } },
        { status: 409 },
      );
    }
    console.error(JSON.stringify({ event: "insight_recompute_failed" }), err);
    return Response.json(
      { error: { code: "recompute_failed", message: "인사이트 재계산에 실패했습니다" } },
      { status: 500 },
    );
  }
}
