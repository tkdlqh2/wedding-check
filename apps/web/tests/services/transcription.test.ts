import { describe, it, expect, beforeEach, vi } from "vitest";

// 조립 지점(@/lib/ai)만 모킹하는 기존 패턴 — 서비스는 벤더를 모른다(AD-1).
const transcribeMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  getLLMPort: () => ({ generate: vi.fn(), generateStream: vi.fn() }),
  getEmbeddingPort: () => ({ embed: vi.fn() }),
  getTranscriptionPort: () => ({ transcribe: transcribeMock }),
}));

import {
  transcribeQueryAudio,
  TranscriptionValidationError,
  MAX_AUDIO_BYTES,
} from "@/lib/services/transcription";

function audio(bytes: number): ArrayBuffer {
  return new ArrayBuffer(bytes);
}

describe("transcribeQueryAudio", () => {
  beforeEach(() => {
    transcribeMock.mockReset();
    transcribeMock.mockResolvedValue("주례자가 순서를 갑자기 바꿨어요");
  });

  it("전사 텍스트를 다듬어 반환한다", async () => {
    transcribeMock.mockResolvedValue("  주례자가 순서를 갑자기 바꿨어요  \n");

    await expect(transcribeQueryAudio(audio(4096), "audio/webm")).resolves.toBe(
      "주례자가 순서를 갑자기 바꿨어요",
    );
  });

  it("한국어로 고정해 포트를 호출한다(짧은 발화의 언어 오판 방지)", async () => {
    await transcribeQueryAudio(audio(4096), "audio/webm;codecs=opus");

    expect(transcribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "audio/webm", language: "ko" }),
    );
  });

  it.each(["audio/webm;codecs=opus", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav"])(
    "MediaRecorder가 내는 형식 %s를 받아들인다",
    async (mimeType) => {
      await expect(transcribeQueryAudio(audio(4096), mimeType)).resolves.toBeTruthy();
    },
  );

  it.each(["audio/aac", "video/mp4", "application/octet-stream", ""])(
    "허용 목록에 없는 %s는 벤더 호출 전에 거부한다",
    async (mimeType) => {
      await expect(transcribeQueryAudio(audio(4096), mimeType)).rejects.toBeInstanceOf(
        TranscriptionValidationError,
      );
      expect(transcribeMock).not.toHaveBeenCalled();
    },
  );

  // 클라이언트도 60초에서 자동 종료하지만 그 검증만 믿지 않는다.
  it("상한을 넘는 오디오는 벤더 호출 전에 거부한다", async () => {
    await expect(
      transcribeQueryAudio(audio(MAX_AUDIO_BYTES + 1), "audio/webm"),
    ).rejects.toThrow(/너무 깁니다/);
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("상한 경계값은 통과시킨다", async () => {
    await expect(
      transcribeQueryAudio(audio(MAX_AUDIO_BYTES), "audio/webm"),
    ).resolves.toBeTruthy();
  });

  // 버튼을 스치듯 눌렀을 때 왕복 1~3초를 쓰고 빈 결과를 받느니 즉시 알린다.
  it("너무 짧은 녹음은 벤더 호출 전에 거부한다", async () => {
    await expect(transcribeQueryAudio(audio(64), "audio/webm")).rejects.toThrow(/너무 짧습니다/);
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  // AC 4: 빈 결과를 성공으로 흘리면 클라이언트가 입력창을 빈 문자열로 덮어써
  // "말한 내용이 조용히 사라진" 것처럼 보인다.
  it.each(["", "   ", "\n\t"])("인식 결과가 비어 있으면(%j) 실패로 바꾼다", async (text) => {
    transcribeMock.mockResolvedValue(text);

    await expect(transcribeQueryAudio(audio(4096), "audio/webm")).rejects.toBeInstanceOf(
      TranscriptionValidationError,
    );
  });

  it("벤더 실패는 검증 오류로 감추지 않고 그대로 올린다", async () => {
    transcribeMock.mockRejectedValue(new Error("OpenAI 전사 API 실패: 500"));

    const error = await transcribeQueryAudio(audio(4096), "audio/webm").catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TranscriptionValidationError);
  });
});
