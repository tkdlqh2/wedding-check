"use client";

import { useRef, useState } from "react";

type QueryState = "idle" | "loading" | "error";

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

// Story 3.3(FR-6): 실행 중 조회 화면 하단 자연어 질의 패널 —
// prototype/js/screens/RunScreen.js 106~154행 이식. 매칭 카드의 발생 홀 태그 표시,
// "관련 사례 없음" #2B82E0 정식 카드, 재시도 문구는 Story 3.4 범위(스토리 경계 표).
// AD-5: AI 질의는 온라인 전용 — 오프라인이면 버튼을 비활성화한다.
export function QueryPanel({ isOffline }: { isOffline: boolean }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<QueryState>("idle");
  const [matches, setMatches] = useState<QueryMatchDto[] | null>(null);
  // 코덱스 리뷰 2차 P2: 결과는 "그 결과를 만든 질의 텍스트"에 묶여야 한다 — 대기 중
  // 또는 도착 후에 입력을 다른 상황으로 바꾸면, 화면의 입력과 매칭 카드가 서로 다른
  // 질의를 가리키게 되어 잘못된 근거 연결이 생긴다("근거는 신성하다"). 제출 시점의
  // 텍스트를 보존하고, 현재 입력이 그것과 일치할 때만 결과를 렌더링한다(입력을
  // 되돌리면 다시 보인다 — 응답 자체는 폐기하지 않음).
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  // AC 3: disabled 리렌더 전의 더블클릭/Enter 재진입을 동기적으로 차단한다
  // (step-feedback.tsx의 confirmingRef와 동일한 이유 — 임베딩 API 중복 호출 방지).
  const pendingRef = useRef(false);

  const loading = state === "loading";
  const disabled = loading || isOffline || text.trim().length === 0;

  async function runQuery() {
    if (pendingRef.current || isOffline) return;
    if (text.trim().length === 0) return;
    pendingRef.current = true;
    setState("loading");
    // 코덱스 리뷰 P2: 이전 질의의 매칭 카드를 지우지 않으면 새 질의를 기다리는 동안
    // 다른 상황에 대한 낡은 판단이 새 질문의 근거처럼 계속 노출된다("근거는
    // 신성하다" 위반 소지) — 질의 시작 시점에 즉시 비운다. 오류 후 재질의(오류
    // 상태로 숨겨져 있던 이전 결과가 로딩 전환 순간 되살아나는 경로)도 같은
    // 계열이라 함께 막힌다.
    setMatches(null);
    setSubmittedText(text);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      const data: { matches: QueryMatchDto[] } = await res.json();
      setMatches(data.matches);
      setState("idle");
    } catch {
      // AD-5/DESIGN.md §14: 질의 실패는 조용한 재시도 없이 즉시 드러낸다.
      setState("error");
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <section className="run-query" aria-label="자연어 상황 질의">
      <h2 className="run-query__title">지금 이런 상황인데 어떡하죠?</h2>
      <p className="run-query__helper">
        상황을 그대로 적으면 과거 유사 사례를 근거와 함께 찾아드립니다. 예: &quot;주례자가
        순서를 갑자기 바꿨어요&quot;
      </p>
      <div className="run-query__form">
        <input
          className="input run-query__input"
          type="text"
          value={text}
          placeholder="지금 상황을 그대로 적어보세요"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) runQuery();
          }}
        />
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

      {/* 코덱스 리뷰 3차 P2: 오류 피드백도 성공 결과와 동일하게 제출 텍스트와
          결합한다 — 대기 중 입력을 B로 바꾼 뒤 A 요청이 실패하면, 결합 없이
          state만 보고 렌더링할 경우 제출한 적 없는 B가 실패한 것처럼 보인다. */}
      {state === "error" && text === submittedText ? (
        <p className="run-query__error" role="status">
          질의에 실패했습니다 — 다시 시도해주세요.
        </p>
      ) : null}

      {matches !== null && state !== "error" && text === submittedText ? (
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
          // 조용히 아무것도 안 보여주는 것은 금지 — 3.4가 #2B82E0 정식 카드로 교체한다
          // (스토리 3.4 경계 표).
          <p className="run-query__none" role="status">
            관련 사례 없음 — 선임에게 연락하세요
          </p>
        )
      ) : null}
    </section>
  );
}
