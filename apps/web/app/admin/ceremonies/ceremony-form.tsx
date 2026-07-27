"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCeremonyAction, type CeremonyFormState } from "./actions";

const initialState: CeremonyFormState = {};

const CONDITION_OPTIONS: { name: "requiresOfficiant" | "hasAdditionalEvent"; label: string }[] = [
  { name: "requiresOfficiant", label: "주례 있음" },
  { name: "hasAdditionalEvent", label: "이벤트 추가 있음" },
];

export function CeremonyForm({ halls }: { halls: { id: string; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(createCeremonyAction, initialState);
  const [conditions, setConditions] = useState<Record<string, boolean>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      formRef.current?.reset();
      setConditions({});
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
        <label htmlFor="ceremony-date">날짜 · 시간</label>
        <div className="ceremony-form__datetime">
          <input id="ceremony-date" name="ceremonyDate" type="date" className="input" />
          <input id="ceremony-time" name="ceremonyTime" type="time" className="input" />
        </div>
      </div>

      <div className="ceremony-form__couple-row">
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
      </div>

      <div className="ceremony-form__field">
        <label id="ceremony-conditions-label">계약 형태</label>
        <div
          className="ceremony-form__conditions"
          role="group"
          aria-labelledby="ceremony-conditions-label"
        >
          {CONDITION_OPTIONS.map((option) => (
            <button
              key={option.name}
              type="button"
              onClick={() =>
                setConditions((prev) => ({ ...prev, [option.name]: !prev[option.name] }))
              }
              className={
                "ceremony-form__condition-pill" +
                (conditions[option.name] ? " ceremony-form__condition-pill--active" : "")
              }
              aria-pressed={Boolean(conditions[option.name])}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="requiresOfficiant" value={conditions.requiresOfficiant ? "on" : ""} />
        <input
          type="hidden"
          name="hasAdditionalEvent"
          value={conditions.hasAdditionalEvent ? "on" : ""}
        />
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
