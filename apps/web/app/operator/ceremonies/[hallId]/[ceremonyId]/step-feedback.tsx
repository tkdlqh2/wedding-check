"use client";

import { useState } from "react";

type FetchState = "idle" | "loading" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

// Story 3.1(FR-8, AC 1/2/3): 단계 그룹마다 인라인으로 붙는 피드백 입력 패널.
// [ASSUMPTION] 별도 페이지/폼 대신 인라인으로 둔다 — URL이 이미 예식을 특정하고
// 그룹이 이미 단계를 특정하므로 "예식/단계 선택"(AC 1)이 화면 이동 없이 충족된다.
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
  const [content, setContent] = useState("");

  const apiUrl = `/api/feedback/${hallId}/${ceremonyId}`;

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
      const data: { feedback: { content: string } | null } = await res.json();
      setContent(data.feedback?.content ?? "");
      setFetchState("idle");
    } catch {
      setFetchState("error");
    }
  }

  function handleChange(value: string) {
    setContent(value);
    // 저장 후 다시 편집을 시작하면 "임시저장됨" 표시가 최신 상태를 오해하게 두지
    // 않는다 — 편집이 시작되는 즉시 표시를 지운다.
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
      setSaveState("saved");
    } catch {
      setSaveState("error");
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
          ) : (
            <>
              <textarea
                className="input step-feedback__textarea"
                rows={4}
                placeholder="있었던 일을 그대로 적으세요"
                value={content}
                onChange={(e) => handleChange(e.target.value)}
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
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
