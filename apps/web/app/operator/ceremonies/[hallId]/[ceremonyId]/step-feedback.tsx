"use client";

import { useEffect, useRef, useState } from "react";

type FetchState = "idle" | "loading" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";
type StructureState = "idle" | "structuring" | "error";
type ConfirmState = "idle" | "confirming" | "error";

type Outcome = "well_handled" | "mishandled" | "";

interface FeedbackDto {
  content: string;
  status: string;
  situation: string | null;
  outcome: string | null;
  rationale: string | null;
  tags: string[];
}

function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// Story 3.1(FR-8, AC 1/2/3): 단계 그룹마다 인라인으로 붙는 피드백 입력 패널.
// Story 3.2(FR-9, AD-8): draft 저장 이후 자동 구조화 -> 필드 확인/수정 -> 확정까지
// 같은 패널 안에서 이어진다. confirmed 이후에는 모든 필드가 읽기 전용으로 바뀐다
// (AD-8 — 확정된 피드백은 이미 변수 케이스/임베딩이 생성됐으므로 조용히 고칠 수 없다).
// templateItemId가 없으면(원본 단계가 삭제된 뒤 스냅샷만 남은 드문 경우) 저장할 대상이
// 없으므로 호출부가 아예 렌더링하지 않는다(checklist-instance-view.tsx 참고).
export function StepFeedback({
  hallId,
  ceremonyId,
  templateItemId,
  autoExpand,
}: {
  hallId: string;
  ceremonyId: string;
  templateItemId: string;
  // 대표 지시(2026-07-28): 예식 종료 후 피드백 섹션에서는 토글 없이 마운트 즉시
  // 패널을 펼치고 기존 피드백을 불러온다(칩이 곧 토글 역할).
  autoExpand?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(autoExpand));
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [structureState, setStructureState] = useState<StructureState>("idle");
  const [fieldsSaveState, setFieldsSaveState] = useState<SaveState>("idle");
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const [fieldsDirty, setFieldsDirty] = useState(false);
  // 코덱스 리뷰: disabled={confirmState==="confirming"}만으로는 클릭과 리렌더 사이의
  // 짧은 창에서 더블클릭이 fetch를 두 번 보낼 수 있다(DB는 원자적 CTE라 안전하지만
  // 임베딩 API가 불필요하게 두 번 호출됨) — ref는 동기적으로 즉시 갱신되므로
  // React 상태 업데이트를 기다리지 않고 재진입을 막는다.
  const confirmingRef = useRef(false);
  // 서버에 저장돼 있는 것으로 아는 원문. 자동 저장이 "바뀐 게 없는데도 요청을
  // 보내는" 것을 막는 유일한 기준이며, 상태가 아니라 ref인 이유는 blur 핸들러가
  // 리렌더를 기다리지 않고 그 자리에서 판단해야 하기 때문이다.
  const savedContentRef = useRef("");
  // 진행 중인 임시저장. 자동 저장(blur)과 구조화하기(click)가 겹칠 때 두 번째
  // 호출자가 새 요청을 만들지 않고 여기에 합류한다(saveDraft 주석 참고).
  const savingRef = useRef<Promise<boolean> | null>(null);

  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [situation, setSituation] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("");
  const [rationale, setRationale] = useState("");
  const [tagsText, setTagsText] = useState("");

  const apiUrl = `/api/feedback/${hallId}/${ceremonyId}`;
  const confirmed = status === "confirmed";
  const hasStructuredDraft = situation.trim().length > 0 || outcome !== "" || rationale.trim().length > 0;

  function applyFeedback(data: FeedbackDto | null) {
    savedContentRef.current = data?.content ?? "";
    setContent(data?.content ?? "");
    setStatus(data?.status ?? null);
    setSituation(data?.situation ?? "");
    setOutcome((data?.outcome as Outcome) ?? "");
    setRationale(data?.rationale ?? "");
    setTagsText((data?.tags ?? []).join(", "));
    setFieldsDirty(false);
  }

  async function loadFeedback() {
    setFetchState("loading");
    try {
      const res = await fetch(`${apiUrl}?templateItemId=${templateItemId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setFetchState("error");
        return;
      }
      const data: { feedback: FeedbackDto | null } = await res.json();
      applyFeedback(data.feedback);
      setFetchState("idle");
    } catch {
      setFetchState("error");
    }
  }

  async function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    await loadFeedback();
  }

  // autoExpand 마운트 시 즉시 기존 피드백을 불러온다 — queueMicrotask로 렌더 커밋
  // 이후에 상태 갱신을 시작한다(react-hooks/set-state-in-effect 회피, 프로젝트 공통
  // 패턴). templateItemId가 바뀌면 호출부가 key로 리마운트한다.
  useEffect(() => {
    if (!autoExpand) return;
    queueMicrotask(() => {
      void loadFeedback();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 로드 전용
  }, []);

  function handleContentChange(value: string) {
    setContent(value);
    if (saveState === "saved") setSaveState("idle");
  }

  /**
   * 입력에서 포커스가 빠질 때의 조용한 임시저장(저장 버튼 대체).
   *
   * 세 경우에 아무것도 하지 않는다:
   *  - 이미 저장 중 — 같은 내용으로 두 번 보내지 않는다
   *  - 서버에 있는 원문과 같음 — 펼치기만 하고 지나가는 경우가 대부분이다
   *  - 비어 있음 — 서버가 빈 내용을 400으로 막는데(saveDraftFeedback), 손대지도
   *    않은 빈 칸에서 포커스가 빠졌다고 오류를 띄우는 건 사용자를 탓하는 것이다
   *    (DESIGN.md §10). 기존 초안을 통째로 지운 뒤 나가면 서버에는 이전 원문이
   *    남는데, v1에 피드백 삭제 경로가 없으므로 그게 덜 나쁜 쪽이다.
   */
  async function handleAutosave() {
    if (content === savedContentRef.current) return;
    if (content.trim().length === 0) return;
    await saveDraft();
  }

  /**
   * 원문 임시저장. **동시 호출은 새 요청을 만들지 않고 진행 중인 것에 합류한다.**
   *
   * 이게 필요한 이유는 자동 저장과 "구조화하기"가 같은 순간에 겹치기 때문이다 —
   * 입력창에 글을 쓰고 구조화하기를 누르면 브라우저는 click 전에 blur를 먼저
   * 보낸다. 두 저장이 각자 요청을 보내면 응답 순서가 뒤집힐 수 있고, 늦게 도착한
   * 저장 응답의 applyFeedback이 **먼저 도착한 구조화 결과를 덮어쓴다**(구조화 전
   * 상태로 되돌아감). 하나의 promise를 공유하면 그 경합 자체가 없어진다.
   */
  async function saveDraft(): Promise<boolean> {
    if (savingRef.current) return savingRef.current;

    const pending = (async () => {
      setSaveState("saving");
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateItemId, content }),
        });
        if (!res.ok) {
          setSaveState("error");
          return false;
        }
        const data: { feedback: FeedbackDto } = await res.json();
        // 코덱스 리뷰 2라운드: status만 갱신하고 situation/outcome/rationale/tagsText를
        // 그대로 두면, 서버가 content 변경을 감지해 구조화 필드를 무효화(null)했어도
        // 화면은 낡은 값을 계속 보여준다 — 이 상태에서 "필드 저장"을 누르면 그 낡은
        // 값을 새 content 위에 그대로 덮어써 AD-8 위반이 재발한다. applyFeedback으로
        // 서버 응답(무효화됐다면 null, 아니면 보존된 값)을 그대로 반영한다.
        applyFeedback(data.feedback);
        setSaveState("saved");
        return true;
      } catch {
        setSaveState("error");
        return false;
      }
    })();

    savingRef.current = pending;
    try {
      return await pending;
    } finally {
      savingRef.current = null;
    }
  }

  async function handleStructure() {
    setStructureState("structuring");
    try {
      // 구조화는 **서버에 저장된 content**를 읽는다(lib/services/feedback.ts —
      // 화면의 textarea 값이 아니라 DB의 행이 입력이다). 그래서 저장을 먼저 하지
      // 않으면 두 가지가 깨진다:
      //   - 한 번도 저장한 적 없는 단계 → 구조화할 행 자체가 없다
      //   - 저장 뒤 글을 고친 단계 → 화면에 보이는 글이 아니라 **예전 글**이 구조화된다
      // blur 자동 저장이 이미 돌고 있으면 saveDraft가 거기에 합류한다(중복 요청 없음).
      if (!(await saveDraft())) {
        setStructureState("error");
        return;
      }

      const res = await fetch(`${apiUrl}/structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateItemId }),
      });
      if (!res.ok) {
        setStructureState("error");
        return;
      }
      const data: { feedback: FeedbackDto } = await res.json();
      applyFeedback(data.feedback);
      setStructureState("idle");
    } catch {
      setStructureState("error");
    }
  }

  function handleFieldChange<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setFieldsDirty(true);
      if (fieldsSaveState === "saved") setFieldsSaveState("idle");
    };
  }

  async function handleSaveFields() {
    setFieldsSaveState("saving");
    try {
      const res = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateItemId,
          situation,
          outcome,
          rationale,
          tags: parseTags(tagsText),
        }),
      });
      if (!res.ok) {
        setFieldsSaveState("error");
        return;
      }
      setFieldsSaveState("saved");
      setFieldsDirty(false);
    } catch {
      setFieldsSaveState("error");
    }
  }

  async function handleConfirm() {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirmState("confirming");
    try {
      const res = await fetch(`${apiUrl}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateItemId }),
      });
      if (!res.ok) {
        setConfirmState("error");
        return;
      }
      const data: { feedback: FeedbackDto } = await res.json();
      applyFeedback(data.feedback);
      setConfirmState("idle");
    } catch {
      setConfirmState("error");
    } finally {
      confirmingRef.current = false;
    }
  }

  return (
    <div className="step-feedback">
      {!autoExpand && (
        <button
          type="button"
          className="btn-secondary step-feedback__toggle"
          onClick={handleExpand}
          disabled={fetchState === "loading"}
        >
          {expanded ? "피드백 접기" : "피드백 남기기"}
        </button>
      )}

      {expanded ? (
        <div className="step-feedback__panel">
          {fetchState === "error" ? (
            <p className="step-feedback__error" role="status">
              불러오지 못했습니다 — 다시 시도해주세요.
            </p>
          ) : confirmed ? (
            <div className="step-feedback__confirmed">
              <span className="step-feedback__confirmed-badge" role="status">
                확정됨
              </span>
              <dl className="step-feedback__summary">
                <dt>상황 설명</dt>
                <dd>{situation}</dd>
                <dt>대처 결과</dt>
                <dd>{outcome === "well_handled" ? "잘 대처됨" : "잘못 대처됨"}</dd>
                <dt>사후 판단</dt>
                <dd>{rationale}</dd>
                <dt>태그</dt>
                <dd>{tagsText || "—"}</dd>
              </dl>
            </div>
          ) : (
            <>
              {/* 대표 지시(2026-08-03): "저장 버튼 자체가 필요 없다" — 버튼은
                  없앴지만 임시저장 자체는 남긴다(FR-8 "미완료 시 임시 저장되어 이어
                  쓸 수 있음", DESIGN.md §13 김도윤 — "지금 당장은 생각이 잘 안 난다"며
                  나중에 이어 쓴다). 입력에서 포커스가 빠질 때 조용히 저장한다.
                  타이핑 중(디바운스)이 아니라 포커스 아웃 시점인 이유: 예식 후 화면이라
                  글이 길고, 매 타자마다 요청을 보내면 서버가 content 변경을 감지해
                  구조화 필드를 반복 무효화한다(AD-8 경로). */}
              <textarea
                className="input step-feedback__textarea"
                rows={4}
                placeholder="있었던 일을 그대로 적으세요"
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onBlur={handleAutosave}
                disabled={fetchState === "loading"}
              />
              {saveState !== "idle" ? (
                <div className="step-feedback__actions">
                  {/* DESIGN.md §10: 성공은 조용한 확인 — 저장됐다는 사실만 알린다.
                      실패는 반대로 반드시 드러낸다(자동 저장이라 더 그렇다 — 사용자가
                      버튼을 누르지 않았으므로 실패를 알아챌 다른 단서가 없다). */}
                  {saveState === "saving" ? (
                    <span className="step-feedback__saved-hint" role="status">
                      저장 중…
                    </span>
                  ) : null}
                  {saveState === "saved" ? (
                    <span className="step-feedback__saved-hint" role="status">
                      임시저장됨
                    </span>
                  ) : null}
                  {saveState === "error" ? (
                    <span className="step-feedback__error" role="status">
                      저장하지 못했습니다 — 내용을 고치면 다시 저장합니다.
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* 대표 지적(2026-08-03): 이 섹션이 status === "draft" 게이트 안에
                  있었다. 아직 한 번도 저장하지 않은 단계는 status가 null이라
                  구조화하기 버튼이 **아예 렌더되지 않았고**, 저장을 먼저 눌러야
                  나타난다는 사실이 화면 어디에도 안내되지 않았다. 실제로 저장 이력이
                  있던 단계 하나에서만 버튼이 보여 "첫 단계만 된다"처럼 보였다.
                  이제 확정 전에는 항상 노출하고, 저장 선행 요구는 버튼이 스스로
                  처리한다(handleStructure가 저장 후 구조화). */}
              <div className="step-feedback__structure-section">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleStructure}
                  // saveState === "saving"을 넣지 않는다: blur 자동 저장이 click보다
                  // 먼저 발생하므로, 저장 중이라고 여기서 막으면 방금 글을 쓴 사용자의
                  // 첫 클릭이 그대로 무시된다. 중복 저장은 saveDraft가 promise 공유로
                  // 이미 막는다.
                  disabled={
                    structureState === "structuring" ||
                    fieldsDirty ||
                    content.trim().length === 0
                  }
                  title={fieldsDirty ? "필드 저장 후 다시 구조화할 수 있습니다" : undefined}
                >
                  {structureState === "structuring" ? "구조화 중…" : "구조화하기"}
                </button>
                  {structureState === "error" ? (
                    <span className="step-feedback__error" role="status">
                      구조화하지 못했습니다 — 다시 시도해주세요.
                    </span>
                  ) : null}

                  {hasStructuredDraft ? (
                    <div className="step-feedback__fields">
                      <label className="step-feedback__field-label" htmlFor={`situation-${templateItemId}`}>
                        상황 설명
                      </label>
                      <textarea
                        id={`situation-${templateItemId}`}
                        className="input step-feedback__textarea"
                        rows={3}
                        value={situation}
                        onChange={(e) => handleFieldChange(setSituation)(e.target.value)}
                      />

                      <span className="step-feedback__field-label">대처 결과</span>
                      <div className="step-feedback__outcome-toggle">
                        <button
                          type="button"
                          className={`step-feedback__outcome-option${
                            outcome === "well_handled" ? " step-feedback__outcome-option--selected" : ""
                          }`}
                          onClick={() => handleFieldChange(setOutcome)("well_handled")}
                        >
                          잘 대처됨
                        </button>
                        <button
                          type="button"
                          className={`step-feedback__outcome-option${
                            outcome === "mishandled" ? " step-feedback__outcome-option--selected" : ""
                          }`}
                          onClick={() => handleFieldChange(setOutcome)("mishandled")}
                        >
                          잘못 대처됨
                        </button>
                      </div>

                      <label className="step-feedback__field-label" htmlFor={`rationale-${templateItemId}`}>
                        사후 판단
                      </label>
                      <textarea
                        id={`rationale-${templateItemId}`}
                        className="input step-feedback__textarea"
                        rows={3}
                        value={rationale}
                        onChange={(e) => handleFieldChange(setRationale)(e.target.value)}
                      />

                      <label className="step-feedback__field-label" htmlFor={`tags-${templateItemId}`}>
                        태그(콤마로 구분)
                      </label>
                      <input
                        id={`tags-${templateItemId}`}
                        className="input"
                        value={tagsText}
                        onChange={(e) => handleFieldChange(setTagsText)(e.target.value)}
                      />

                      <div className="step-feedback__actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleSaveFields}
                          disabled={fieldsSaveState === "saving"}
                        >
                          {fieldsSaveState === "saving" ? "저장 중…" : "필드 저장"}
                        </button>
                        {fieldsSaveState === "saved" ? (
                          <span className="step-feedback__saved-hint" role="status">
                            임시저장됨
                          </span>
                        ) : null}
                        {fieldsSaveState === "error" ? (
                          <span className="step-feedback__error" role="status">
                            저장하지 못했습니다 — 다시 시도해주세요.
                          </span>
                        ) : null}

                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleConfirm}
                          disabled={
                            confirmState === "confirming" ||
                            fieldsDirty ||
                            situation.trim().length === 0 ||
                            outcome === "" ||
                            rationale.trim().length === 0 ||
                            parseTags(tagsText).length === 0
                          }
                        >
                          {confirmState === "confirming" ? "확정 중…" : "확정"}
                        </button>
                        {confirmState === "error" ? (
                          <span className="step-feedback__error" role="status">
                            확정하지 못했습니다 — 다시 시도해주세요.
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
