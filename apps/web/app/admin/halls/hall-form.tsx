"use client";

import { useActionState, useEffect, useRef } from "react";
import { createHallAction, updateHallAction, type HallFormState } from "./actions";

const initialState: HallFormState = {};

export function HallForm({
  hall,
  onSuccess,
}: {
  hall?: { id: string; name: string };
  onSuccess?: () => void;
}) {
  const action = hall ? updateHallAction : createHallAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      onSuccess?.();
    }
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="hall-form">
      {hall && <input type="hidden" name="id" value={hall.id} />}
      <label htmlFor={`hall-name-${hall?.id ?? "new"}`}>홀명</label>
      <input
        id={`hall-name-${hall?.id ?? "new"}`}
        name="name"
        type="text"
        defaultValue={hall?.name}
        className={state.error ? "input input--error" : "input"}
        aria-invalid={Boolean(state.error)}
      />
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={isPending}>
        {isPending ? "저장 중..." : hall ? "수정 저장" : "홀 등록하기"}
      </button>
    </form>
  );
}
