import { getTranscriptionPort } from "../ai";

export class TranscriptionValidationError extends Error {}

/**
 * 브라우저에서 받아들이는 오디오 컨테이너 허용 목록(정책 — 서비스 소유).
 *
 * 어댑터에도 확장자 표가 있지만 관심사가 다르다: 여기는 "우리가 받기로 한 형식이
 * 맞는가"(검증), 어댑터는 "이 형식을 벤더가 어떤 이름으로 아는가"(변환)다. 표가
 * 겹치는 건 우연이며, 벤더가 바뀌면 어댑터 표만 바뀐다.
 *
 * MediaRecorder가 실제로 내는 값만 담는다 — iOS/macOS Safari `audio/mp4`,
 * Chrome/Edge `audio/webm`, Firefox `audio/ogg`.
 */
const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
]);

/**
 * 업로드 바이트 상한.
 *
 * Vercel Functions의 요청 바디 상한(4.5MB)에 그냥 부딪히면 **원인이 드러나지 않는
 * 실패**가 된다 — 플랫폼이 우리 코드에 닿기 전에 잘라내므로 오퍼레이터는 "왜 안
 * 되는지" 알 수 없다. 그보다 아래에서 우리가 먼저, 명확한 문구로 막는다.
 *
 * 클라이언트도 60초에서 녹음을 자동 종료하지만 그 검증만 믿지 않는다(클라이언트
 * 검증은 우회 가능하다는 이 코드베이스의 기존 관례).
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * 너무 짧은 녹음은 벤더에 보내지 않는다 — 버튼을 실수로 스치듯 눌렀을 때
 * (수십 밀리초짜리 빈 오디오) 왕복 1~3초를 쓰고 빈 결과를 받느니, 즉시
 * "다시 말해주세요"가 낫다. 예식 중에는 그 왕복이 그대로 손해다.
 */
const MIN_AUDIO_BYTES = 1024;

// DESIGN.md §12-6(한국어 1순위) + 단일 홀 파일럿 — 언어 자동 판별에 맡기면 짧은
// 발화에서 엉뚱한 언어로 인식될 수 있어 고정한다.
const LANGUAGE = "ko";

/**
 * Story 6.1(FR-19): 음성 → 질의 텍스트.
 *
 * 이 함수는 **아무것도 저장하지 않는다**(NFR-5, D-5). 오디오는 요청 수명 안에서만
 * 존재하고, 전사 텍스트도 반환값으로 나갈 뿐 DB·로그 어디에도 남기지 않는다.
 */
export async function transcribeQueryAudio(
  audio: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(base)) {
    throw new TranscriptionValidationError("지원하지 않는 오디오 형식입니다");
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new TranscriptionValidationError("녹음이 너무 깁니다. 짧게 다시 말해주세요");
  }
  if (audio.byteLength < MIN_AUDIO_BYTES) {
    throw new TranscriptionValidationError("녹음이 너무 짧습니다. 다시 말해주세요");
  }

  const text = await getTranscriptionPort().transcribe({
    audio,
    mimeType: base,
    language: LANGUAGE,
  });

  // 인식된 말이 없으면 빈 문자열이 온다(소음만 녹음된 경우 등). 이걸 그대로
  // 성공으로 흘리면 클라이언트가 입력창을 빈 문자열로 덮어써 **말한 내용이 조용히
  // 사라진 것처럼** 보인다(AC 4) — 여기서 명시적 실패로 바꾼다.
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new TranscriptionValidationError("말소리를 알아듣지 못했습니다. 다시 말해주세요");
  }
  return trimmed;
}
