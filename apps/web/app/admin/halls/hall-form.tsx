"use client";

import { useActionState, useEffect, useRef } from "react";
import { createHallAction, updateHallAction, type HallFormState } from "./actions";

const initialState: HallFormState = {};

// 대표 피드백(2026-07-27): 홀 입력과 등록 버튼은 한 줄 — 템플릿 편집기의 "새 단계 추가"
// 점선 카드와 동일한 인라인 입력 리듬(templates.css .templates-page__add-step-row).
export function HallForm({
  hall,
  onSuccess,
  onCancel,
}: {
  hall?: { id: string; name: string };
  onSuccess?: () => void;
  // 대표 피드백(2026-07-28): 수정 모드에서 취소와 수정 저장은 같은 줄에 놓는다.
  onCancel?: () => void;
}) {
  const action = hall ? updateHallAction : createHallAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      if (!hall) formRef.current?.reset();
      onSuccess?.();
    }
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess, hall]);

  return (
    <form action={formAction} ref={formRef} className="hall-form">
      {hall && <input type="hidden" name="id" value={hall.id} />}
      <div className="hall-form__row">
        <input
          name="name"
          type="text"
          aria-label="홀명"
          placeholder="새 홀 이름 (예: 그랜드홀)"
          defaultValue={hall?.name}
          className={state.error ? "input input--error" : "input"}
          aria-invalid={Boolean(state.error)}
        />
        {hall && onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "저장 중..." : hall ? "수정 저장" : "등록하기"}
        </button>
      </div>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
