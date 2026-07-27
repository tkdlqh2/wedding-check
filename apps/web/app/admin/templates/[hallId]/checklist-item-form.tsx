"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createChecklistItemAction,
  updateChecklistItemAction,
  type ChecklistItemFormState,
} from "./actions";

const initialState: ChecklistItemFormState = {};

// Story 5.5: template-item-form.tsx와 동일한 useActionState 패턴 — 단계 폼과 달리
// 이 폼은 templateItemId(소속 단계)를 hidden input으로 함께 넘긴다.
export function ChecklistItemForm({
  hallId,
  templateItemId,
  item,
  onSuccess,
}: {
  hallId: string;
  templateItemId: string;
  item?: {
    id: string;
    title: string;
    description: string | null;
  };
  onSuccess?: () => void;
}) {
  const action = item ? updateChecklistItemAction : createChecklistItemAction;
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
    <form action={formAction} className="checklist-item-form">
      <input type="hidden" name="hallId" value={hallId} />
      <input type="hidden" name="templateItemId" value={templateItemId} />
      {item && <input type="hidden" name="id" value={item.id} />}

      <label htmlFor={`checklist-item-title-${idSuffix}`}>제목</label>
      <input
        id={`checklist-item-title-${idSuffix}`}
        name="title"
        type="text"
        required
        defaultValue={item?.title}
        className={state.error ? "input input--error" : "input"}
        aria-invalid={Boolean(state.error)}
      />
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}

      <label htmlFor={`checklist-item-description-${idSuffix}`}>설명(선택)</label>
      <textarea
        id={`checklist-item-description-${idSuffix}`}
        name="description"
        defaultValue={item?.description ?? ""}
        className="input"
        rows={2}
        placeholder="필요하면 자세한 설명을 남기세요"
      />

      <button type="submit" className="btn-primary" disabled={isPending}>
        {isPending ? "저장 중..." : item ? "수정 저장" : "체크리스트 항목 등록하기"}
      </button>
    </form>
  );
}
