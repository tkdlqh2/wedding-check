"use client";

import { useCallback, useRef, useState } from "react";

import {
  useVoiceInputSupported,
  VoiceInputButton,
  type VoiceInputFailure,
} from "./voice-input-button";

// 서버(lib/services/query.ts::QueryMatch)의 JSON 직렬화 형태 — 필드명 동일 유지
// (Story 2.3 코덱스 리뷰 4차 P1 교훈: 서버·클라이언트 필드명 불일치 금지).
export interface QueryMatchDto {
  id: string;
  stepName: string;
  situation: string;
  outcome: string;
  rationale: string;
  tags: string[];
  hallName: string;
  similarity: number;
  createdAt: string;
}

// Story 3.4(AC 4, UX-DR14, DESIGN.md §14): 실패는 종류마다 "무엇이 실패했고 무엇을
// 하면 되는지"가 다르다 — 한 문구로 뭉개면 예식 중 오퍼레이터가 다음 행동을 고를 수
// 없다. session은 재시도가 아니라 로그인이 필요해 액션 자체가 다르다.
// Story 6.1: "voice"는 음성 입력 자체가 실패한 경우다 — 재시도 액션이 버튼(다시
// 눌러서 말하기)이라 오류 카드에 별도 액션을 두지 않는다.
type QueryErrorKind = "offline" | "session" | "invalid" | "server" | "voice";

interface QueryError {
  kind: QueryErrorKind;
  title: string;
  description: string;
}

const OFFLINE_ERROR: QueryError = {
  kind: "offline",
  title: "네트워크 연결이 끊겼습니다",
  // AD-5: AI 질의만 영향을 받고 예식 진행 자체는 막히지 않는다는 것을 알린다.
  description: "연결이 돌아오면 다시 시도해주세요. 체크리스트는 계속 볼 수 있습니다.",
};

const SESSION_ERROR: QueryError = {
  kind: "session",
  title: "로그인이 만료되었습니다",
  description: "다시 로그인한 뒤 질의해주세요.",
};

const MALFORMED_ERROR: QueryError = {
  kind: "server",
  title: "질의에 실패했습니다",
  description: "응답을 읽지 못했습니다. 다시 시도해주세요.",
};

// 코덱스 리뷰 P2: 2xx인데 본문이 JSON이 아니거나 기대 셰이프가 아니면(프록시가 끼어든
// HTML, 배포 중 구버전 응답 등) 렌더링 중 크래시해 오류 카드조차 뜨지 않는다 — 예식
// 중에는 화면이 죽는 것이 최악이다. checklist-cache.ts가 확립한 검증 방식(최상위만
// 보지 말고 배열 원소 하나하나까지, Story 2.3 코덱스 4차 P2 교훈)을 그대로 따른다.
function isValidMatch(value: unknown): value is QueryMatchDto {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.stepName === "string" &&
    typeof m.situation === "string" &&
    typeof m.outcome === "string" &&
    typeof m.rationale === "string" &&
    Array.isArray(m.tags) &&
    typeof m.hallName === "string" &&
    typeof m.similarity === "number" &&
    Number.isFinite(m.similarity) &&
    typeof m.createdAt === "string"
  );
}

function parseMatches(body: unknown): QueryMatchDto[] | null {
  if (!body || typeof body !== "object") return null;
  const matches = (body as { matches?: unknown }).matches;
  if (!Array.isArray(matches) || !matches.every(isValidMatch)) return null;
  return matches;
}

// 매칭 카드 메타(AC 1): 프로토타입 RunScreen.js 130행 {m.meta} 자리 — 발생 홀을
// 표시용 태그로 붙인다(AD-6 — 검색 자체는 홀 무관 사업체 전체 범위다).
const metaDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

function formatMatchMeta(match: QueryMatchDto): string {
  const parts: string[] = [];
  const createdAt = new Date(match.createdAt);
  // 파싱 불가한 값이 "Invalid Date"로 예식 중 화면에 노출되는 것을 막는다 — 날짜
  // 조각만 생략하고 홀·단계는 그대로 보여준다(Story 2.3 캐시 날짜 검증 교훈).
  if (!Number.isNaN(createdAt.getTime())) {
    parts.push(metaDateFormatter.format(createdAt));
  }
  parts.push(match.hallName);
  parts.push(`${match.stepName} 단계`);
  return parts.join(" · ");
}

// 실패 응답을 종류별 오류로 번역한다. 봉투 파싱은 방어적으로 — 바디가 비었거나
// JSON이 아닐 수 있다(프록시가 502를 대신 반환하는 경우 등).
async function toResponseError(res: Response): Promise<QueryError> {
  if (res.status === 401) return SESSION_ERROR;

  const body: unknown = await res.json().catch(() => null);
  const rawMessage =
    typeof body === "object" && body !== null
      ? (body as { error?: { message?: unknown } }).error?.message
      : undefined;
  const message = typeof rawMessage === "string" && rawMessage ? rawMessage : null;

  if (res.status === 400) {
    return {
      kind: "invalid",
      title: "질의를 보낼 수 없습니다",
      description: message ?? "입력을 확인하고 다시 시도해주세요.",
    };
  }
  return {
    kind: "server",
    title: "질의에 실패했습니다",
    description: message ?? "잠시 후 다시 시도해주세요.",
  };
}

// Story 3.3(FR-6): 실행 중 조회 화면 하단 자연어 질의 패널 —
// prototype/js/screens/RunScreen.js 106~152행 이식.
// Story 3.4(FR-7): 발생 홀 메타 태그(AC 1), "관련 사례 없음" #2B82E0 정식
// 카드(AC 3), 실패 종류별 오류 카드 + 재시도(AC 4).
// AD-5: AI 질의는 온라인 전용 — 오프라인이면 버튼을 비활성화한다.
export function QueryPanel({ isOffline }: { isOffline: boolean }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<QueryMatchDto[] | null>(null);
  const [error, setError] = useState<QueryError | null>(null);
  // AC 3(3.3): disabled 리렌더 전의 더블클릭/Enter 재진입을 동기적으로 차단한다
  // (step-feedback.tsx의 confirmingRef와 동일한 이유 — 임베딩 API 중복 호출 방지).
  const pendingRef = useRef(false);
  // Story 6.1: 녹음/전사가 진행 중인 동안 — 질의 제출과 입력창을 함께 잠근다.
  // 인식 결과가 도착해 입력창을 채우는 사이에 타자가 섞이면 어느 쪽이 제출되는지
  // 모호해진다(3.3이 in-flight 입력 잠금으로 해결한 것과 같은 계열의 문제).
  const [voiceBusy, setVoiceBusy] = useState(false);
  const voiceSupported = useVoiceInputSupported();

  const disabled = loading || voiceBusy || isOffline || text.trim().length === 0;

  async function runQuery() {
    if (pendingRef.current || isOffline) return;
    if (text.trim().length === 0) return;
    pendingRef.current = true;
    setLoading(true);
    setError(null);
    // 코덱스 리뷰 P2(3.3): 이전 질의의 매칭 카드를 지우지 않으면 새 질의를 기다리는
    // 동안 다른 상황에 대한 낡은 판단이 새 질문의 근거처럼 계속 노출된다("근거는
    // 신성하다" 위반 소지) — 질의 시작 시점에 즉시 비운다.
    setMatches(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError(await toResponseError(res));
        return;
      }
      // 본문 파싱 실패를 try의 catch로 흘려보내면 연결이 멀쩡한데도 "네트워크 연결이
      // 끊겼습니다"로 잘못 안내된다 — 여기서 직접 받아 서버 오류로 구분한다.
      const body: unknown = await res.json().catch(() => null);
      const parsed = parseMatches(body);
      if (parsed === null) {
        setError(MALFORMED_ERROR);
        return;
      }
      setMatches(parsed);
    } catch {
      // fetch 자체가 throw하는 경우만 실제 연결 실패다(Story 2.3 폴링과 동일 판별).
      // AD-5/DESIGN.md §14: 질의 실패는 조용한 재시도 없이 즉시 드러낸다.
      setError(OFFLINE_ERROR);
    } finally {
      pendingRef.current = false;
      setLoading(false);
    }
  }

  // Story 6.1 AC 1(D-3): 인식 결과는 입력창에 **채우기만** 한다 — 자동 제출하지
  // 않는다. 오인식된 질의는 "관련 사례 없음"으로 돌아오고, 그러면 신입은 실제로
  // 사례가 없다고 믿는다(안전장치가 거짓 신호를 내는 것 — §12-4 "근거는 신성하다").
  const handleVoiceResult = useCallback((recognized: string) => {
    setText(recognized);
    setError(null);
  }, []);

  const handleVoiceFailure = useCallback((failure: VoiceInputFailure) => {
    setError({
      kind: failure.needsLogin ? "session" : "voice",
      title: failure.title,
      description: failure.description,
    });
  }, []);

  return (
    <section className="run-query" aria-label="자연어 상황 질의">
      <h2 className="run-query__title">지금 이런 상황인데 어떡하죠?</h2>
      <p className="run-query__helper" id="run-query-voice-help">
        상황을 그대로 적으면 과거 유사 사례를 근거와 함께 찾아드립니다.{" "}
        {voiceSupported ? (
          <>
            손이 바쁘면 마이크 버튼을 <strong>누르고 있는 동안</strong> 말하세요 — 인식된
            문장은 입력창에 채워지고, 확인 후 직접 질의하시면 됩니다.
          </>
        ) : (
          // 코덱스 2차 P2 / AC 3: 비활성 버튼은 눌리지 않으므로 안내가 도달하지
          // 못한다. 지원하지 않는 기기에서는 여기서 바로 이유와 대안을 말한다 —
          // 질의 기능 자체는 멀쩡하다는 사실이 핵심이다(탓하지 않는 톤, §10).
          <span className="run-query__voice-unsupported">
            이 기기에서는 음성 입력을 쓸 수 없습니다 — 타자로 입력해주세요.
          </span>
        )}
      </p>
      <div className="run-query__form">
        {/* 사용자 지침(2026-07-28) + 코덱스 리뷰 2~3차 P2: 요청이 in-flight인 동안
            입력창도 함께 잠근다 — 대기 중 입력이 바뀌면 도착한 응답(성공/실패)이
            제출한 적 없는 새 입력의 결과처럼 보이는 계열 결함을 단순 차단으로
            원천 제거한다(요청 순번 추적/응답 무효화 같은 추가 장치 불필요). */}
        <input
          className="input run-query__input"
          type="text"
          value={text}
          placeholder="지금 상황을 그대로 적어보세요"
          onChange={(e) => {
            setText(e.target.value);
            // 오류 카드에는 "다시 시도" 액션이 있어서, 카드가 가리키는 질의와
            // 입력창 내용이 어긋나면 무엇을 재시도하는지 모호해진다 — 입력이 바뀌면
            // 즉시 비운다. 반면 매칭/없음 카드는 액션이 없어 그런 모호함이 생기지
            // 않고, 후속 질문을 타이핑하면서 방금 받은 근거를 계속 읽을 수 있어야
            // 하므로 그대로 둔다(3.3에서 확정된 동작 유지).
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading && !voiceBusy) runQuery();
          }}
          disabled={loading || voiceBusy}
        />
        {/* 지원하지 않는 기기에서는 눌리지 않는 버튼을 남겨두지 않는다 — 위 안내가
            이유와 대안을 이미 말한다. */}
        {voiceSupported ? (
          <VoiceInputButton
            disabled={loading || isOffline}
            isOffline={isOffline}
            onResult={handleVoiceResult}
            onFailure={handleVoiceFailure}
            onBusyChange={setVoiceBusy}
          />
        ) : null}
        <button
          type="button"
          className={"run-query__submit" + (loading ? " run-query__submit--loading" : "")}
          onClick={runQuery}
          disabled={disabled}
        >
          {loading ? (
            <span className="run-query__spinner" role="status" aria-label="질의 중" />
          ) : (
            "질의하기"
          )}
        </button>
      </div>

      {error !== null ? (
        // UX-DR14/DESIGN.md §14: 조용한 토스트가 아니라 인라인 카드로 상시 노출한다.
        <div className="run-query__error" role="alert">
          <span className="run-query__error-badge">
            {error.kind === "voice" ? "음성 입력 실패" : "질의 실패"}
          </span>
          <p className="run-query__error-title">{error.title}</p>
          <p className="run-query__error-description">{error.description}</p>
          {error.kind === "voice" ? (
            // 액션 버튼을 두지 않는다 — 이 실패의 재시도는 바로 위 마이크 버튼을
            // 다시 누르는 것이고, "다시 시도"가 질의를 실행하면 무엇을 재시도하는지
            // 어긋난다(3.4가 오류 카드 액션을 종류별로 나눈 것과 같은 이유).
            null
          ) : error.kind === "session" ? (
            <a className="btn-secondary run-query__error-action" href="/login">
              로그인하러 가기
            </a>
          ) : (
            // 새 제출 경로를 만들지 않는다 — 기존 runQuery()를 그대로 호출해
            // pendingRef 이중 제출 가드를 그대로 상속한다.
            <button
              type="button"
              className="btn-secondary run-query__error-action"
              onClick={runQuery}
              disabled={loading || isOffline}
            >
              다시 시도
            </button>
          )}
        </div>
      ) : null}

      {matches !== null && error === null ? (
        matches.length > 0 ? (
          <div className="run-query__results">
            {matches.map((match, index) => {
              const wellHandled = match.outcome === "well_handled";
              return (
                <article key={match.id} className="run-query__match">
                  <div className="run-query__match-badges">
                    <span className="run-query__match-rank">
                      유사도 {index + 1}위 · {Math.round(match.similarity * 100)}%
                    </span>
                    <span
                      className={
                        "run-query__match-outcome run-query__match-outcome--" +
                        (wellHandled ? "well" : "mis")
                      }
                    >
                      {wellHandled ? "잘 대처됨" : "잘못 대처됨"}
                    </span>
                    <span className="run-query__match-meta">{formatMatchMeta(match)}</span>
                  </div>
                  <p className="run-query__match-situation">{match.situation}</p>
                  <div className="run-query__match-judgment">
                    <div className="run-query__match-judgment-label">
                      사후 판단 — 이렇게 하세요
                    </div>
                    <div className="run-query__match-judgment-text">{match.rationale}</div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          // AC 3(NFR-7, SM-2, UX-DR15): 이건 에러가 아니라 안전장치다 — #2B82E0 톤을
          // 쓰고 오류 색(#E0353B)을 섞지 않는다. 억지 매칭 대신 "없음"을 명시한다.
          <div className="run-query__none" role="status">
            <span className="run-query__none-badge">관련 사례 없음</span>
            <p className="run-query__none-title">관련 사례 없음 — 선임에게 연락하세요</p>
            <p className="run-query__none-description">
              비슷하지 않은 사례를 억지로 보여드리지 않습니다. 지금 바로{" "}
              <strong>담당 선임에게 연락</strong>하세요. 이 상황은 예식 종료 후 피드백으로
              남겨두면 다음부터 검색됩니다.
            </p>
          </div>
        )
      ) : null}
    </section>
  );
}
