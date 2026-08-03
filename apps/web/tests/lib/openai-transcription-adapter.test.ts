import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { OpenAITranscriptionAdapter, baseMimeType } from "@/lib/ai/adapters/openai";
import type { TranscriptionPort } from "@/lib/ai/ports";

// 실제 OpenAI API를 호출하지 않는다(다른 어댑터 테스트와 동일 원칙 — 벤더 계약
// 테스트는 범위 밖). 요청 조립과 응답 검증만 고정한다.
describe("OpenAITranscriptionAdapter", () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  function audio(bytes = 2048): ArrayBuffer {
    return new ArrayBuffer(bytes);
  }

  function okResponse(text: unknown) {
    return { ok: true, json: async () => ({ text }) };
  }

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = originalEnv;
  });

  it("전사 텍스트를 그대로 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("주례자가 순서를 바꿨어요")));

    const port: TranscriptionPort = new OpenAITranscriptionAdapter();
    const result = await port.transcribe({ audio: audio(), mimeType: "audio/webm" });

    expect(result).toBe("주례자가 순서를 바꿨어요");
  });

  // 이 어댑터의 핵심 계약: 벤더가 **파일명 확장자로 컨테이너를 판별**한다.
  // MIME만 맞고 확장자가 틀리면 지원 형식인데도 400이 떨어진다.
  it.each([
    ["audio/webm;codecs=opus", "audio.webm"],
    ["audio/mp4", "audio.mp4"],
    ["audio/ogg;codecs=opus", "audio.ogg"],
    ["audio/mpeg", "audio.mp3"],
    ["audio/wav", "audio.wav"],
  ])("%s → 파일명 %s로 업로드한다", async (mimeType, expectedFilename) => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("텍스트"));
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAITranscriptionAdapter().transcribe({ audio: audio(), mimeType });

    const form = fetchMock.mock.calls[0][1].body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe(expectedFilename);
  });

  it("model과 language를 요청에 싣는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("텍스트"));
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAITranscriptionAdapter().transcribe({
      audio: audio(),
      mimeType: "audio/webm",
      language: "ko",
    });

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("language")).toBe("ko");
  });

  it("language가 없으면 요청에 넣지 않는다(벤더 자동 판별)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("텍스트"));
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAITranscriptionAdapter().transcribe({ audio: audio(), mimeType: "audio/webm" });

    expect((fetchMock.mock.calls[0][1].body as FormData).get("language")).toBeNull();
  });

  // Content-Type을 직접 지정하면 multipart 경계가 빠져 벤더가 본문을 못 읽는다.
  it("Content-Type 헤더를 직접 지정하지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("텍스트"));
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAITranscriptionAdapter().transcribe({ audio: audio(), mimeType: "audio/webm" });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("벤더가 모르는 형식은 네트워크 호출 전에 막는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new OpenAITranscriptionAdapter().transcribe({ audio: audio(), mimeType: "audio/aac" }),
    ).rejects.toThrow(/지원하지 않는 오디오 형식/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("HTTP 실패를 에러로 드러낸다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" }),
    );

    await expect(
      new OpenAITranscriptionAdapter().transcribe({ audio: audio(), mimeType: "audio/webm" }),
    ).rejects.toThrow(/429/);
  });

  // 2xx인데 셰이프가 어긋나면 조용히 빈 문자열로 흘러 "말한 내용이 사라진" 것처럼
  // 보인다 — 원인이 드러나지 않는 실패가 예식 중에는 최악이다.
  it.each([[undefined], [null], [42], [{ nested: "text" }]])(
    "text가 문자열이 아니면(%s) 에러로 드러낸다",
    async (text) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(text)));

      await expect(
        new OpenAITranscriptionAdapter().transcribe({ audio: audio(), mimeType: "audio/webm" }),
      ).rejects.toThrow(/text가 없습니다/);
    },
  );

  it("API 키가 없으면 명확한 에러를 던진다", async () => {
    delete process.env.OPENAI_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      new OpenAITranscriptionAdapter().transcribe({ audio: audio(), mimeType: "audio/webm" }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("baseMimeType은 codecs 파라미터와 대소문자를 정규화한다", () => {
    expect(baseMimeType("audio/WEBM;codecs=opus")).toBe("audio/webm");
    expect(baseMimeType(" audio/mp4 ")).toBe("audio/mp4");
  });
});
