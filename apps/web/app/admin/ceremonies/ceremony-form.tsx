"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCeremonyAction, type CeremonyFormState } from "./actions";

const initialState: CeremonyFormState = {};

export function CeremonyForm({ halls }: { halls: { id: string; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(createCeremonyAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      formRef.current?.reset();
    }
    wasPending.current = isPending;
  }, [isPending, state.error]);

  return (
    <form action={formAction} ref={formRef} className="ceremony-form">
      <div className="ceremony-form__field">
        <label htmlFor="ceremony-hall">홀</label>
        <select id="ceremony-hall" name="hallId" className="input" defaultValue="">
          <option value="" disabled>
            홀을 선택하세요
          </option>
          {halls.map((hall) => (
            <option key={hall.id} value={hall.id}>
              {hall.name}
            </option>
          ))}
        </select>
      </div>

      <div className="ceremony-form__field">
        <label htmlFor="ceremony-at">예식 일시</label>
        <input id="ceremony-at" name="ceremonyAt" type="datetime-local" className="input" />
      </div>

      <div className="ceremony-form__field">
        <label htmlFor="ceremony-groom-name">신랑 이름</label>
        <input
          id="ceremony-groom-name"
          name="groomName"
          type="text"
          className={state.errorField === "groomName" ? "input input--error" : "input"}
          aria-invalid={state.errorField === "groomName"}
        />
      </div>

      <div className="ceremony-form__field">
        <label htmlFor="ceremony-bride-name">신부 이름</label>
        <input
          id="ceremony-bride-name"
          name="brideName"
          type="text"
          className={state.errorField === "brideName" ? "input input--error" : "input"}
          aria-invalid={state.errorField === "brideName"}
        />
      </div>

      <div className="ceremony-form__conditions">
        <label className="ceremony-form__checkbox">
          <input type="checkbox" name="requiresOfficiant" />
          주례 있음
        </label>
        <label className="ceremony-form__checkbox">
          <input type="checkbox" name="hasAdditionalEvent" />
          이벤트 추가 있음
        </label>
      </div>

      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={isPending}>
        {isPending ? "저장 중..." : "예식 등록"}
      </button>
    </form>
  );
}
