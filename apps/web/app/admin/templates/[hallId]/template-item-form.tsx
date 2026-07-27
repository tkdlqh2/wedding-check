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
  item?: {
    id: string;
    stepName: string;
    applicableContractConditions?: Record<string, boolean>;
  };
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

      <div className="template-item-form__conditions">
        <label className="template-item-form__checkbox">
          <input
            type="checkbox"
            name="requiresOfficiant"
            defaultChecked={item?.applicableContractConditions?.requiresOfficiant === true}
          />
          주례 관련
        </label>
        <label className="template-item-form__checkbox">
          <input
            type="checkbox"
            name="hasAdditionalEvent"
            defaultChecked={item?.applicableContractConditions?.hasAdditionalEvent === true}
          />
          이벤트 추가 관련
        </label>
      </div>

      <button type="submit" className="btn-primary" disabled={isPending}>
        {isPending ? "저장 중..." : item ? "수정 저장" : "항목 등록하기"}
      </button>
    </form>
  );
}
