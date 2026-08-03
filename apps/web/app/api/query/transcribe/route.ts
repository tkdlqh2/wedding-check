import { requireSessionOr401 } from "@/lib/auth-guard";
import {
  MAX_AUDIO_BYTES,
  transcribeQueryAudio,
  TranscriptionValidationError,
} from "@/lib/services/transcription";
import { toSafeErrorLabel } from "@/lib/safe-error";

// Story 6.1(FR-19): 실행 중 질의의 음성 입력 — 녹음된 오디오를 텍스트로 전사해
// 돌려준다. **질의를 실행하지는 않는다**(D-3): 오퍼레이터가 인식 결과를 확인하고
// 직접 /api/query를 호출한다. 오인식된 질의가 "관련 사례 없음"으로 돌아오면 신입은
// 실제로 사례가 없다고 믿게 되고, 그건 안전장치가 거짓 신호를 내는 것이다.
//
// AD-3: /api/query와 동일하게 로그인만 확인한다(실행 화면은 admin도 열 수 있다).
// NFR-5: 오디오도 전사 텍스트도 저장하지 않는다 — 로그에도 남기지 않는다.

// 실행 시간 상한(초). 최대 60초짜리 오디오 업로드 + 벤더 왕복이라 다른 라우트보다
// 오래 걸릴 수 있다 — 플랫폼 기본값에서 잘리면 오퍼레이터에게는 원인 없는 실패로
// 보인다. 무한정 늘리지는 않는다(예식 중 30초 넘게 기다릴 일은 없다).
export const maxDuration = 30;

export async function POST(request: Request) {
  const unauthorized = await requireSessionOr401();
  if (unauthorized) return unauthorized;

  // 멀티파트 파싱 자체가 실패할 수 있다(잘린 바디, 잘못된 경계) — 500으로 흘리지
  // 않고 400으로 명확히 구분한다.
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json(
      { error: { code: "invalid_input", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  // 바이트를 메모리에 올리기 **전에** 크기를 본다 — 상한을 넘는 업로드를 굳이
  // 전부 읽어들일 이유가 없다. 서비스도 독립적으로 다시 검증한다(이중 방어).
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: { code: "invalid_input", message: "녹음이 너무 깁니다. 짧게 다시 말해주세요" } },
      { status: 413 },
    );
  }

  try {
    const text = await transcribeQueryAudio(await audio.arrayBuffer(), audio.type);
    return Response.json({ text });
  } catch (err) {
    if (err instanceof TranscriptionValidationError) {
      return Response.json(
        { error: { code: "invalid_input", message: err.message } },
        { status: 400 },
      );
    }
    // AD-10 관측성: query_failed와 같은 이유로 실패를 구조화 로그로 남기되,
    // raw err는 넘기지 않는다 — 어댑터가 벤더 오류 본문을 메시지에 싣고, 그 본문에
    // 발화 내용이 포함될 수 있다(NFR-5, Story 4.1 코덱스 1차 P1과 같은 계열).
    console.error(JSON.stringify({ event: "transcribe_failed", error: toSafeErrorLabel(err) }));
    return Response.json(
      { error: { code: "transcribe_failed", message: "음성 인식에 실패했습니다. 다시 시도해주세요" } },
      { status: 502 },
    );
  }
}
