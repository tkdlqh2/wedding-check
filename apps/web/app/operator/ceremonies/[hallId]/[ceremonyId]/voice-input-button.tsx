"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface VoiceInputFailure {
  title: string;
  description: string;
  /**
   * 이 실패는 "다시 말하기"가 아니라 로그인이 필요하다 — 부모가 오류 카드에
   * 로그인 링크를 띄우도록 구분한다(3.4가 확립한 "실패 종류마다 다음 행동이 다르다").
   */
  needsLogin?: boolean;
}

// 녹음 자동 종료 상한. 이 화면에서 말하는 건 "주례자가 순서를 갑자기 바꿨어요"
// 수준의 한 문장이라 60초는 넉넉하다 — 버튼에서 손이 미끄러진 채 방치되는 경우에
// 마이크가 계속 열려 있지 않게 하는 안전장치에 가깝다(서버도 바이트 상한을 독립
// 검증한다: lib/services/transcription.ts::MAX_AUDIO_BYTES).
const MAX_RECORDING_MS = 60_000;

// MediaRecorder가 기기마다 다른 컨테이너를 낸다 — 우리가 고르는 게 아니라 기기가
// 지원하는 것 중 서버 허용 목록에 있는 것을 찾는 것이다.
// Chrome/Edge: audio/webm;codecs=opus · Firefox: audio/ogg;codecs=opus ·
// iOS/macOS Safari: audio/mp4
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  // isTypeSupported는 구형 구현에 없을 수 있다 — 없으면 옵션 없이 만들고
  // recorder.mimeType(기기가 실제로 고른 값)을 그대로 쓴다.
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    // 보안 컨텍스트(HTTPS/localhost)가 아니면 mediaDevices 자체가 없다.
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

// 기능 지원 여부는 서버에서 알 수 없다. 마운트 후 setState로 바꾸면 cascading
// render가 되고(eslint react-hooks/set-state-in-effect), 첫 렌더에 이미 정확한 값이
// 필요하다 — useSyncExternalStore가 정확히 이 용도다(브라우저 능력이라는 외부
// 상태를 읽되 변하지 않으므로 구독은 no-op).
const subscribeNever = () => () => {};
// 서버 스냅샷은 true — 하이드레이션 전에 버튼을 비활성으로 그렸다가 활성으로
// 바뀌면 그 사이의 탭이 조용히 무시된다. 지원되지 않는 기기에서는 하이드레이션
// 직후 비활성으로 확정된다.
const supportedOnServer = () => true;

/**
 * 이 기기에서 음성 입력을 쓸 수 있는지.
 *
 * 부모(QueryPanel)도 알아야 한다 — 코덱스 2차 P2: 버튼을 비활성으로만 두면
 * 지원하지 않는 기기의 사용자는 **아무 설명도 받지 못한다**(비활성 버튼은 눌리지
 * 않으므로 start()의 안내가 영영 도달하지 않는다). AC 3이 요구하는 건 "무엇이
 * 막혔고 무엇을 하면 되는지"이므로, 부모가 이 값을 보고 안내를 직접 띄운다.
 */
export function useVoiceInputSupported(): boolean {
  return useSyncExternalStore(subscribeNever, isRecordingSupported, supportedOnServer);
}

const UNSUPPORTED_FAILURE: VoiceInputFailure = {
  title: "이 기기에서는 음성 입력을 쓸 수 없습니다",
  description: "타자로 입력해주세요. 질의 기능은 그대로 사용할 수 있습니다.",
};

const PERMISSION_FAILURE: VoiceInputFailure = {
  title: "마이크 사용이 차단되어 있습니다",
  description:
    "브라우저 설정에서 이 사이트의 마이크를 허용한 뒤 다시 시도해주세요. 그동안은 타자로 질의할 수 있습니다.",
};

const DEVICE_FAILURE: VoiceInputFailure = {
  title: "마이크를 찾을 수 없습니다",
  description: "마이크가 연결되어 있는지 확인해주세요. 타자로도 질의할 수 있습니다.",
};

const RECORDING_FAILURE: VoiceInputFailure = {
  title: "녹음에 실패했습니다",
  description: "다시 눌러서 말해주세요. 타자로도 질의할 수 있습니다.",
};

const OFFLINE_FAILURE: VoiceInputFailure = {
  title: "네트워크 연결이 끊겼습니다",
  description: "음성 인식은 연결이 필요합니다. 연결이 돌아오면 다시 시도해주세요.",
};

const MALFORMED_FAILURE: VoiceInputFailure = {
  title: "음성 인식에 실패했습니다",
  description: "응답을 읽지 못했습니다. 다시 눌러서 말해주세요.",
};

const SESSION_FAILURE: VoiceInputFailure = {
  title: "로그인이 만료되었습니다",
  description: "다시 로그인한 뒤 이용해주세요.",
  needsLogin: true,
};

function toGetUserMediaFailure(err: unknown): VoiceInputFailure {
  const name = err instanceof Error ? err.name : "";
  // 권한 거부는 "실패"가 아니라 사용자의 선택이다 — 탓하지 않고, 되돌리는 방법과
  // 그동안 쓸 수 있는 경로(타자)를 함께 알린다(DESIGN.md §10 에러 톤).
  if (name === "NotAllowedError" || name === "SecurityError") return PERMISSION_FAILURE;
  if (name === "NotFoundError" || name === "OverconstrainedError") return DEVICE_FAILURE;
  return RECORDING_FAILURE;
}

async function toTranscribeFailure(res: Response): Promise<VoiceInputFailure> {
  if (res.status === 401) return SESSION_FAILURE;
  const body: unknown = await res.json().catch(() => null);
  const rawMessage =
    typeof body === "object" && body !== null
      ? (body as { error?: { message?: unknown } }).error?.message
      : undefined;
  const message = typeof rawMessage === "string" && rawMessage ? rawMessage : null;
  return {
    title: "음성 인식에 실패했습니다",
    description: message ?? "다시 눌러서 말해주세요.",
  };
}

type Phase = "idle" | "arming" | "recording" | "uploading";

interface VoiceInputButtonProps {
  /** 오프라인 등 외부 사유로 사용 불가 — 질의 버튼과 동일 규칙(AD-5). */
  disabled: boolean;
  isOffline: boolean;
  /** 전사 성공. 입력창을 채우기만 하고 제출하지 않는다(D-3). */
  onResult: (text: string) => void;
  onFailure: (failure: VoiceInputFailure) => void;
  /** 녹음/업로드 중임을 부모에 알린다 — 그동안 질의 입력창을 잠근다. */
  onBusyChange: (busy: boolean) => void;
}

/**
 * Story 6.1(FR-19): push-to-talk 음성 입력 버튼.
 *
 * **누르고 있는 동안 녹음, 떼면 종료**(D-2). 무음 자동 감지를 쓰지 않는 이유는
 * 예식장 부스가 음악·사회자 음성이 상시로 깔린 환경이라, 무음 판정이 (a) 영원히
 * 끝나지 않거나 (b) 말 중간에 끊기 때문이다. 손을 떼는 순간이라는 명시적 신호는
 * 소음 수준과 무관하게 정확하다.
 */
export function VoiceInputButton({
  disabled,
  isOffline,
  onResult,
  onFailure,
  onBusyChange,
}: VoiceInputButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const supported = useVoiceInputSupported();

  /**
   * 단계 전환의 **유일한 통로**. 부모에게 알리는 busy 신호를 여기서 함께 낸다.
   *
   * 코덱스 3차 P2: busy를 업로드 단계에서만 켰더니 권한 대기·녹음 중에는 부모가
   * idle로 알고 있었다 — 그 사이 타자로 질의를 제출하면 질의 요청과 전사 요청이
   * 동시에 돌고, 뒤늦게 도착한 인식 결과가 **이미 제출한 입력을 덮어쓴다**(3.3이
   * in-flight 입력 잠금으로 닫았던 것과 같은 계열). 전환 지점이 10곳이라 각자
   * 켜고 끄면 언젠가 한 곳을 빠뜨린다 — 통로를 하나로 만들어 구조적으로 막는다.
   */
  const changePhase = useCallback(
    (next: Phase) => {
      setPhase(next);
      onBusyChange(next !== "idle");
    },
    [onBusyChange],
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 버튼을 누른 상태인지 — getUserMedia가 비동기라, 권한 대화상자가 뜨거나 장치가
  // 열리는 사이에 손을 떼는 일이 실제로 생긴다. 그때 녹음이 시작되고 나서
  // "아무도 멈추지 않는" 상태가 되지 않도록 동기 플래그로 추적한다.
  const pressedRef = useRef(false);
  // 마운트 해제 후 setState를 막고, 취소된 세션의 결과를 무시한다.
  const activeRef = useRef(true);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      // 마이크를 놓지 않고 화면을 벗어나면 기기의 녹음 표시가 계속 켜져 있다.
      releaseStream();
    };
  }, [releaseStream]);

  const upload = useCallback(
    async (blob: Blob) => {
      if (!activeRef.current) return;
      changePhase("uploading");
      try {
        const form = new FormData();
        // 파일명은 서버가 쓰지 않는다(형식 판별은 Blob.type) — 멀티파트 파트를
        // 파일로 만들기 위한 자리 표시일 뿐이다.
        form.append("audio", blob, "audio");
        const res = await fetch("/api/query/transcribe", { method: "POST", body: form });
        if (!res.ok) {
          onFailure(await toTranscribeFailure(res));
          return;
        }
        const body: unknown = await res.json().catch(() => null);
        const text = (body as { text?: unknown } | null)?.text;
        // AC 4: 셰이프가 어긋나면 빈 문자열로 흘리지 않는다 — 입력창을 지워버리면
        // 방금 말한 내용이 조용히 사라진 것처럼 보인다.
        if (typeof text !== "string" || text.trim().length === 0) {
          onFailure(MALFORMED_FAILURE);
          return;
        }
        onResult(text);
      } catch {
        // fetch 자체가 throw하는 경우만 실제 연결 실패다(query-panel과 동일 판별).
        onFailure(OFFLINE_FAILURE);
      } finally {
        // changePhase가 busy 해제까지 함께 낸다 — 별도 onBusyChange 호출을 두지
        // 않는 것이 요점이다(신호가 두 통로로 나가면 한쪽만 갱신되는 상태가 생긴다).
        if (activeRef.current) changePhase("idle");
      }
    },
    [changePhase, onFailure, onResult],
  );

  const stop = useCallback(() => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      // onstop 핸들러가 업로드까지 이어받는다.
      recorder.stop();
      return;
    }
    // 아직 녹음이 시작되지 않았다(권한 대화상자 대기 중 손을 뗀 경우 등) —
    // start() 쪽이 pressedRef를 보고 스스로 정리한다.
    if (!recorder) {
      changePhase("idle");
    }
  }, [changePhase]);

  const start = useCallback(async () => {
    if (pressedRef.current || phase !== "idle") return;
    // 버튼은 이미 비활성이지만(supported=false), 하이드레이션 직전의 탭이나
    // 키보드 경로가 여기 닿을 수 있다 — 조용히 아무 일도 안 일어나는 대신
    // 무엇이 막혔는지 알린다.
    if (!isRecordingSupported()) {
      onFailure(UNSUPPORTED_FAILURE);
      return;
    }
    if (isOffline) {
      onFailure(OFFLINE_FAILURE);
      return;
    }

    pressedRef.current = true;
    // AC 2: 누른 즉시(0ms) 상태가 바뀐다 — getUserMedia 응답을 기다리지 않는다.
    changePhase("arming");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      pressedRef.current = false;
      if (activeRef.current) changePhase("idle");
      onFailure(toGetUserMediaFailure(err));
      return;
    }

    // 권한 대화상자를 기다리는 사이에 손을 뗐거나 화면을 벗어났다 — 열린 장치를
    // 즉시 닫고 아무것도 녹음하지 않는다.
    if (!pressedRef.current || !activeRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      if (activeRef.current) changePhase("idle");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    // 이 녹음 세션이 오류로 끝났는지. 코덱스 리뷰 P2: MediaRecorder는 오류가 나도
    // error 이후에 dataavailable·stop을 **이어서** 발생시킬 수 있다. 플래그가 없으면
    // onstop이 빈 Blob을 그대로 업로드해 쓸모없는 요청 + 두 번째 실패 알림이 뜬다.
    // 세션마다 새로 만드는 클로저 변수라 다음 녹음에 영향을 주지 않는다.
    let errored = false;

    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        // 기기가 실제로 고른 컨테이너를 쓴다 — 우리가 요청한 값과 다를 수 있고,
        // 서버는 이 값으로 형식을 판별한다.
        const type = recorder.mimeType || chunksRef.current[0]?.type || "";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        releaseStream();
        // onerror가 이미 알렸다 — 여기서 또 업로드하거나 알리지 않는다.
        if (errored) return;
        // 녹음된 바이트가 하나도 없으면(버튼을 스치듯 누른 경우 등) 왕복을 아낀다.
        // 서버도 같은 판정을 하지만, 예식 중에는 1~3초가 그대로 손해다.
        if (blob.size === 0) {
          if (activeRef.current) changePhase("idle");
          onFailure(RECORDING_FAILURE);
          return;
        }
        void upload(blob);
      };
      recorder.onerror = () => {
        errored = true;
        pressedRef.current = false;
        chunksRef.current = [];
        releaseStream();
        if (activeRef.current) changePhase("idle");
        onFailure(RECORDING_FAILURE);
      };

      recorderRef.current = recorder;
      // 코덱스 리뷰 P2: start()도 try 안에 있어야 한다. 생성은 됐는데 start()가
      // 동기적으로 throw하는 기기(비활성 트랙 등)에서는 이 async 함수의 rejection이
      // 처리되지 않고, 마이크가 열린 채 pressedRef가 남고 UI가 arming에 고정된다.
      recorder.start();
    } catch {
      pressedRef.current = false;
      releaseStream();
      if (activeRef.current) changePhase("idle");
      onFailure(RECORDING_FAILURE);
      return;
    }

    if (activeRef.current) changePhase("recording");

    timerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") stop();
    }, MAX_RECORDING_MS);
  }, [changePhase, isOffline, onFailure, phase, releaseStream, stop, upload]);

  const busy = phase === "uploading";
  const active = phase === "arming" || phase === "recording";
  const blocked = disabled || !supported;

  return (
    <button
      type="button"
      className={
        "run-query__voice" +
        (active ? " run-query__voice--recording" : "") +
        (busy ? " run-query__voice--busy" : "")
      }
      // 길게 누르기가 텍스트 선택/컨텍스트 메뉴/스크롤로 새지 않게 한다.
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (blocked || busy) return;
        // 버튼 밖에서 손을 떼도 pointerup이 이 요소로 오게 한다 — 캡처가 없으면
        // 손가락이 조금만 밀려도 녹음이 끝나지 않는다. 캡처 실패(InvalidPointerId
        // 등)는 녹음을 막을 이유가 아니다 — 손이 밀렸을 때만 아쉬울 뿐이다.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 캡처 없이 진행 */
        }
        void start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      // 키보드 사용자(데스크톱)를 위한 동일 매핑. repeat는 무시한다 —
      // 키를 누르고 있으면 keydown이 반복 발생한다.
      onKeyDown={(e) => {
        if (blocked || busy || e.repeat) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          void start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") stop();
      }}
      // 브라우저 기본 click(키보드 Enter/Space가 합성)이 다시 start를 부르지 않도록
      // 한다 — 위 keydown/keyup이 이미 담당한다.
      onClick={(e) => e.preventDefault()}
      disabled={blocked || busy}
      aria-label={active ? "녹음 중 — 손을 떼면 인식합니다" : "누르고 말하기"}
      aria-describedby="run-query-voice-help"
    >
      {busy ? (
        <span className="run-query__spinner" role="status" aria-label="음성 인식 중" />
      ) : (
        <span aria-hidden="true" className="run-query__voice-icon">
          {/* 마이크 — 이모지 대신 인라인 SVG(currentColor로 상태색을 따른다). */}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor">
            <rect x="9" y="3" width="6" height="11" rx="3" strokeWidth="2" />
            <path
              d="M5 11a7 7 0 0 0 14 0M12 18v3"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </button>
  );
}
