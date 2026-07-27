"use client";

import { useActionState } from "react";
import { addInstanceItemAction, type InstanceItemFormState } from "./actions";

const initialState: InstanceItemFormState = {};

export function AddItemButton({
  hallId,
  ceremonyId,
  checklistItemId,
}: {
  hallId: string;
  ceremonyId: string;
  checklistItemId: string;
}) {
  const [state, formAction, isPending] = useActionState(addInstanceItemAction, initialState);

  return (
    <form action={formAction} className="instance-item-card__add-form">
      <input type="hidden" name="hallId" value={hallId} />
      <input type="hidden" name="ceremonyId" value={ceremonyId} />
      <input type="hidden" name="checklistItemId" value={checklistItemId} />
      <button type="submit" className="btn-secondary" disabled={isPending}>
        {isPending ? "추가 중..." : "추가"}
      </button>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
