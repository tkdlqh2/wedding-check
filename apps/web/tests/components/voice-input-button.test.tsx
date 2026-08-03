import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryPanel } from "@/app/operator/ceremonies/[hallId]/[ceremonyId]/query-panel";

// Story 6.1(FR-19): push-to-talk 음성 입력. jsdom에는 MediaRecorder도
// navigator.mediaDevices도 없으므로 둘 다 세워 놓고, "누른다 → 말한다 → 뗀다"를
// 실제 이벤트 순서로 재현한다.

const INPUT_PLACEHOLDER = "지금 상황을 그대로 적어보세요";
const VOICE_LABEL = "누르고 말하기";

interface MockTrack {
  stop: ReturnType<typeof vi.fn>;
}

let recorderInstances: MockMediaRecorder[] = [];
let tracks: MockTrack[] = [];
let getUserMediaMock: ReturnType<typeof vi.fn>;

class MockMediaRecorder {
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    recorderInstances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    // 실제 MediaRecorder와 같은 순서 — 데이터가 먼저, 그다음 stop.
    this.ondataavailable?.({
      data: new Blob([new Uint8Array(4096)], { type: this.mimeType }),
    });
    this.onstop?.();
  }

  /** 아무것도 녹음되지 않은 채 끝난 경우(버튼을 스치듯 누름). */
  emitEmptyStop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

function makeStream() {
  const track: MockTrack = { stop: vi.fn() };
  tracks.push(track);
  return { getTracks: () => [track] };
}

function transcribeResponse(text: unknown) {
  return { ok: true, json: async () => ({ text }) };
}

/** 누르고 → 말하고 → 뗀다. */
function pressAndRelease(button: HTMLElement) {
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
}

describe("VoiceInputButton (Story 6.1)", () => {
  beforeEach(() => {
    recorderInstances = [];
    tracks = [];
    // 호출될 때 스트림을 만든다 — 미리 만들어 두면 호출되지 않은 테스트에서도
    // tracks에 항목이 생겨 인덱스가 어긋난다.
    getUserMediaMock = vi.fn().mockImplementation(async () => makeStream());
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    vi.stubGlobal("navigator", {
      ...window.navigator,
      mediaDevices: { getUserMedia: getUserMediaMock },
    });
    // 길게 누르기 동안 포인터를 붙잡는 API — jsdom에 없다.
    Element.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("질의창에 음성 입력 버튼이 있다", () => {
    render(<QueryPanel isOffline={false} />);
    expect(screen.getByRole("button", { name: VOICE_LABEL })).toBeEnabled();
  });

  // AC 1의 핵심 — 인식 결과는 입력창에 **채우기만** 한다.
  it("인식된 문장을 입력창에 채우고, 질의를 자동 실행하지 않는다 (AC 1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(transcribeResponse("주례자가 순서를 바꿨어요"));
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    fireEvent.pointerUp(button);

    const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("주례자가 순서를 바꿨어요"));

    // 전사 요청 1건뿐 — /api/query는 호출되지 않았다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/query/transcribe");
    expect(fetchMock.mock.calls.some((call) => call[0] === "/api/query")).toBe(false);
    // 채워졌으니 이제 오퍼레이터가 직접 누를 수 있다.
    expect(screen.getByRole("button", { name: "질의하기" })).toBeEnabled();
  });

  it("전사 요청은 녹음된 오디오를 multipart로 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(transcribeResponse("텍스트"));
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    fireEvent.pointerUp(button);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    const blob = (init.body as FormData).get("audio") as Blob;
    // 기기가 실제로 고른 컨테이너가 실려야 서버가 형식을 판별할 수 있다.
    expect(blob.type).toBe("audio/webm;codecs=opus");
    expect(blob.size).toBeGreaterThan(0);
  });

  // AC 2: 누른 즉시(0ms) — getUserMedia 응답을 기다리지 않는다.
  it("누르는 즉시 녹음 상태가 드러난다 (AC 2)", () => {
    // 영원히 대기하는 getUserMedia — 응답 전에도 상태가 바뀌어야 한다.
    getUserMediaMock.mockReturnValue(new Promise(() => {}));

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);

    expect(screen.getByRole("button", { name: "녹음 중 — 손을 떼면 인식합니다" })).toHaveClass(
      "run-query__voice--recording",
    );
  });

  // AC 3: 실패해도 타자 경로는 살아 있어야 한다.
  it("마이크 권한이 거부되면 안내하고, 타자 입력은 그대로 살아 있다 (AC 3)", async () => {
    const denied = new Error("denied");
    denied.name = "NotAllowedError";
    getUserMediaMock.mockRejectedValue(denied);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    pressAndRelease(screen.getByRole("button", { name: VOICE_LABEL }));

    expect(await screen.findByText("마이크 사용이 차단되어 있습니다")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER) as HTMLInputElement;
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "타자로 입력" } });
    expect(screen.getByRole("button", { name: "질의하기" })).toBeEnabled();
  });

  it("마이크가 없으면 장치 문제로 구분해 안내한다", async () => {
    const missing = new Error("no device");
    missing.name = "NotFoundError";
    getUserMediaMock.mockRejectedValue(missing);

    render(<QueryPanel isOffline={false} />);
    pressAndRelease(screen.getByRole("button", { name: VOICE_LABEL }));

    expect(await screen.findByText("마이크를 찾을 수 없습니다")).toBeInTheDocument();
  });

  it("녹음을 지원하지 않는 기기에서는 버튼이 비활성화된다 (AC 3)", () => {
    vi.stubGlobal("MediaRecorder", undefined);

    render(<QueryPanel isOffline={false} />);
    expect(screen.getByRole("button", { name: VOICE_LABEL })).toBeDisabled();
    // 질의 자체는 막히지 않는다.
    fireEvent.change(screen.getByPlaceholderText(INPUT_PLACEHOLDER), {
      target: { value: "타자로 입력" },
    });
    expect(screen.getByRole("button", { name: "질의하기" })).toBeEnabled();
  });

  it("오프라인이면 음성 버튼도 함께 비활성화된다 (AD-5)", () => {
    render(<QueryPanel isOffline />);
    expect(screen.getByRole("button", { name: VOICE_LABEL })).toBeDisabled();
  });

  // AC 4: 실패가 입력창을 지워버리면 방금 말한 내용이 사라진 것처럼 보인다.
  it("전사가 실패해도 입력창의 기존 내용을 덮어쓰지 않는다 (AC 4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: { code: "transcribe_failed", message: "음성 인식 실패" } }),
      }),
    );

    render(<QueryPanel isOffline={false} />);
    const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "미리 적어둔 상황" } });

    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    fireEvent.pointerUp(button);

    expect(await screen.findByText("음성 인식에 실패했습니다")).toBeInTheDocument();
    expect(input.value).toBe("미리 적어둔 상황");
  });

  it.each([[""], ["   "], [null], [42]])(
    "인식 결과가 %j면 입력창을 비우지 않고 실패로 알린다 (AC 4)",
    async (text) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(transcribeResponse(text)));

      render(<QueryPanel isOffline={false} />);
      const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "미리 적어둔 상황" } });

      const button = screen.getByRole("button", { name: VOICE_LABEL });
      fireEvent.pointerDown(button);
      await waitFor(() => expect(recorderInstances).toHaveLength(1));
      fireEvent.pointerUp(button);

      expect(await screen.findByText("음성 인식에 실패했습니다")).toBeInTheDocument();
      expect(input.value).toBe("미리 적어둔 상황");
    },
  );

  // 음성 실패의 재시도는 마이크 버튼을 다시 누르는 것이다 — "다시 시도"가 질의를
  // 실행하면 무엇을 재시도하는지 어긋난다.
  it("음성 실패 카드에는 '다시 시도' 버튼을 두지 않는다", async () => {
    const denied = new Error("denied");
    denied.name = "NotAllowedError";
    getUserMediaMock.mockRejectedValue(denied);

    render(<QueryPanel isOffline={false} />);
    pressAndRelease(screen.getByRole("button", { name: VOICE_LABEL }));

    expect(await screen.findByText("음성 입력 실패")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("세션이 만료되면 로그인 링크를 안내한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    fireEvent.pointerUp(button);

    expect(await screen.findByText("로그인이 만료되었습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인하러 가기" })).toBeInTheDocument();
  });

  // AC 5: 전사 중 중복 요청 방지.
  it("전사 중에는 음성 버튼과 질의 입력이 잠긴다 (AC 5)", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve))),
    );

    render(<QueryPanel isOffline={false} />);
    const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: "미리 적어둔 상황" } });

    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    fireEvent.pointerUp(button);

    await waitFor(() => expect(screen.getByLabelText("음성 인식 중")).toBeInTheDocument());
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "질의하기" })).toBeDisabled();

    resolveFetch(transcribeResponse("인식된 문장"));
    await waitFor(() => expect(input).toBeEnabled());
  });

  // 마이크를 놓지 않으면 기기의 녹음 표시가 계속 켜져 있다.
  it("녹음이 끝나면 마이크 트랙을 해제한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(transcribeResponse("텍스트")));

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    fireEvent.pointerUp(button);

    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
  });

  // 권한 대화상자를 기다리는 사이에 손을 떼는 일은 실제로 생긴다.
  it("권한 응답 전에 손을 떼면 녹음을 시작하지 않고 마이크를 즉시 닫는다", async () => {
    let grant: (value: unknown) => void = () => {};
    getUserMediaMock.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);

    grant(makeStream());

    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
    expect(recorderInstances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 코덱스 리뷰 P2: MediaRecorder는 오류가 나도 error 이후 dataavailable·stop을
  // 이어서 발생시킬 수 있다. 플래그가 없으면 onstop이 빈 Blob을 업로드해 쓸모없는
  // 요청 + 두 번째 실패 알림이 뜬다.
  it("녹음 오류 후 stop이 이어져도 업로드하지 않고 한 번만 알린다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));

    const recorder = recorderInstances[0];
    recorder.onerror?.();
    // 실제 기기가 하듯 error 뒤에 데이터와 stop이 이어진다.
    recorder.stop();

    expect(await screen.findByText("녹음에 실패했습니다")).toBeInTheDocument();
    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
    // 오류 카드는 하나뿐 — 같은 실패를 두 번 알리지 않는다.
    expect(screen.getAllByText("녹음에 실패했습니다")).toHaveLength(1);
  });

  // 코덱스 리뷰 P2: 생성은 됐는데 start()가 동기 throw하는 기기가 있다. 처리하지
  // 않으면 마이크가 열린 채 UI가 "녹음 중"에 고정된다.
  it("MediaRecorder.start()가 실패하면 마이크를 닫고 실패를 알린다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const startSpy = vi
      .spyOn(MockMediaRecorder.prototype, "start")
      .mockImplementation(() => {
        throw new Error("InvalidStateError");
      });

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);

    expect(await screen.findByText("녹음에 실패했습니다")).toBeInTheDocument();
    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
    // arming에 고정되지 않고 다시 누를 수 있는 상태로 돌아온다.
    expect(screen.getByRole("button", { name: VOICE_LABEL })).toBeEnabled();
    startSpy.mockRestore();
  });

  it("녹음된 바이트가 없으면 업로드하지 않고 실패를 알린다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    // 버튼을 스치듯 눌러 아무것도 녹음되지 않은 경우.
    recorderInstances[0].emitEmptyStop();

    expect(await screen.findByText("녹음에 실패했습니다")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("포인터가 취소되어도(스크롤 등) 녹음이 종료된다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(transcribeResponse("텍스트")));

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.pointerDown(button);
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    fireEvent.pointerCancel(button);

    await waitFor(() => expect(recorderInstances[0].state).toBe("inactive"));
  });

  it("키보드(스페이스)로도 누르고 말하기가 동작한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(transcribeResponse("키보드로 말한 문장")));

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.keyDown(button, { key: " " });
    await waitFor(() => expect(recorderInstances).toHaveLength(1));
    fireEvent.keyUp(button, { key: " " });

    const input = screen.getByPlaceholderText(INPUT_PLACEHOLDER) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("키보드로 말한 문장"));
  });

  it("키를 누르고 있어 keydown이 반복돼도 녹음은 한 번만 시작된다", async () => {
    getUserMediaMock.mockReturnValue(new Promise(() => {}));

    render(<QueryPanel isOffline={false} />);
    const button = screen.getByRole("button", { name: VOICE_LABEL });
    fireEvent.keyDown(button, { key: " " });
    fireEvent.keyDown(button, { key: " ", repeat: true });
    fireEvent.keyDown(button, { key: " ", repeat: true });

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
  });
});
