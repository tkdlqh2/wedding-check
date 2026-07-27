"use client";

import { useRef, useState } from "react";

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
}: {
  hallId: string;
  ceremonyId: string;
  templateItemId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [structureState, setStructureState] = useState<StructureState>("idle");
  const [fieldsSaveState, setFieldsSaveState] = useState<SaveState>("idle");
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const [fieldsDirty, setFieldsDirty] = useState(false);
  // 코덱스 리뷰: disabled={confirmState==="confirming"}만으로는 클릭과 리렌더 사이의
  // 짧은 창에서 더블클릭이 fetch를 두 번 보낼 수 있다(DB는 원자적 CTE라 안전하지만
  // Voyage 임베딩 API가 불필요하게 두 번 호출됨) — ref는 동기적으로 즉시 갱신되므로
  // React 상태 업데이트를 기다리지 않고 재진입을 막는다.
  const confirmingRef = useRef(false);

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
    setContent(data?.content ?? "");
    setStatus(data?.status ?? null);
    setSituation(data?.situation ?? "");
    setOutcome((data?.outcome as Outcome) ?? "");
    setRationale(data?.rationale ?? "");
    setTagsText((data?.tags ?? []).join(", "));
    setFieldsDirty(false);
  }

  async function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
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

  function handleContentChange(value: string) {
    setContent(value);
    if (saveState === "saved") setSaveState("idle");
  }

  async function handleSave() {
    setSaveState("saving");
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateItemId, content }),
      });
      if (!res.ok) {
        setSaveState("error");
        return;
      }
      const data: { feedback: FeedbackDto } = await res.json();
      // 구조화(structure)는 서버에 이미 저장된 draft 행이 있어야 의미가 있다 — 아직
      // 저장 전인 textarea 내용만으로 구조화 버튼을 보여주면 실패할 액션을 노출하게
      // 된다. 저장 성공 후 status가 실제로 채워져야 아래 구조화 섹션이 나타난다.
      setStatus(data.feedback.status);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function handleStructure() {
    setStructureState("structuring");
    try {
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
      <button
        type="button"
        className="btn-secondary step-feedback__toggle"
        onClick={handleExpand}
        disabled={fetchState === "loading"}
      >
        {expanded ? "피드백 접기" : "피드백 남기기"}
      </button>

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
              <textarea
                className="input step-feedback__textarea"
                rows={4}
                placeholder="있었던 일을 그대로 적으세요"
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                disabled={fetchState === "loading"}
              />
              <div className="step-feedback__actions">
                <button
                  type="button"
                  className="btn-primary step-feedback__save-btn"
                  onClick={handleSave}
                  disabled={saveState === "saving" || content.trim().length === 0}
                >
                  {saveState === "saving" ? "저장 중…" : "저장"}
                </button>
                {saveState === "saved" ? (
                  <span className="step-feedback__saved-hint" role="status">
                    임시저장됨
                  </span>
                ) : null}
                {saveState === "error" ? (
                  <span className="step-feedback__error" role="status">
                    저장하지 못했습니다 — 다시 시도해주세요.
                  </span>
                ) : null}
              </div>

              {status === "draft" ? (
                <div className="step-feedback__structure-section">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleStructure}
                    disabled={structureState === "structuring" || fieldsDirty}
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
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
