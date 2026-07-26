"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createTemplateItemAction,
  updateTemplateItemAction,
  type TemplateItemFormState,
} from "./actions";

const initialState: TemplateItemFormState = {};

export function TemplateItemForm({
  hallId,
  item,
  onSuccess,
}: {
  hallId: string;
  item?: { id: string; stepName: string; description: string | null };
  onSuccess?: () => void;
}) {
  const action = item ? updateTemplateItemAction : createTemplateItemAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      onSuccess?.();
    }
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  const idSuffix = item?.id ?? "new";

  return (
    <form action={formAction} className="template-item-form">
      <input type="hidden" name="hallId" value={hallId} />
      {item && <input type="hidden" name="id" value={item.id} />}

      <label htmlFor={`step-name-${idSuffix}`}>단계명</label>
      <input
        id={`step-name-${idSuffix}`}
        name="stepName"
        type="text"
        defaultValue={item?.stepName}
        className={state.error ? "input input--error" : "input"}
        aria-invalid={Boolean(state.error)}
      />
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}

      <label htmlFor={`description-${idSuffix}`}>설명</label>
      <textarea
        id={`description-${idSuffix}`}
        name="description"
        defaultValue={item?.description ?? ""}
        className="input"
        rows={3}
        placeholder="이 단계에서 해야 할 일을 설명하세요"
      />

      <button type="submit" className="btn-primary" disabled={isPending}>
        {isPending ? "저장 중..." : item ? "수정 저장" : "항목 등록하기"}
      </button>
    </form>
  );
}
