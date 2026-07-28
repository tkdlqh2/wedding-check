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

      {state === "error" ? (
        <p className="run-query__error" role="status">
          질의에 실패했습니다 — 다시 시도해주세요.
        </p>
      ) : null}

      {matches !== null && state !== "error" ? (
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
