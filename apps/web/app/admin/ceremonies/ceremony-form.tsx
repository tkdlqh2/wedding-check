"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCeremonyAction, type CeremonyFormState } from "./actions";

const initialState: CeremonyFormState = {};

const CONDITION_OPTIONS: { name: "requiresOfficiant" | "hasAdditionalEvent"; label: string }[] = [
  { name: "requiresOfficiant", label: "주례 있음" },
  { name: "hasAdditionalEvent", label: "이벤트 추가 있음" },
];

// prototype/js/screens/WeddingScreen.js 44~75행 그대로 — 작은 필드 라벨(12px/700 muted),
// 날짜+시각 한 줄, 홀은 셀렉트 대신 pill 토글, 담당 배정 안내 박스, 전체 폭 CTA.
export function CeremonyForm({ halls }: { halls: { id: string; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(createCeremonyAction, initialState);
  const [conditions, setConditions] = useState<Record<string, boolean>>({});
  const [selectedHallId, setSelectedHallId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      formRef.current?.reset();
      setConditions({});
      setSelectedHallId("");
    }
    wasPending.current = isPending;
  }, [isPending, state.error]);

  return (
    <form action={formAction} ref={formRef} className="ceremony-form">
      <span className="ceremony-form__label" id="ceremony-datetime-label">
        날짜 · 시간
      </span>
      <div
        className="ceremony-form__datetime"
        role="group"
        aria-labelledby="ceremony-datetime-label"
      >
        <input aria-label="예식 날짜" name="ceremonyDate" type="date" className="input" />
        <input aria-label="예식 시각" name="ceremonyTime" type="time" className="input" />
      </div>

      <span className="ceremony-form__label" id="ceremony-hall-label">
        홀
      </span>
      <div className="ceremony-form__pills" role="group" aria-labelledby="ceremony-hall-label">
        {halls.map((hall) => (
          <button
            key={hall.id}
            type="button"
            onClick={() => setSelectedHallId(hall.id)}
            className={
              "ceremony-form__pill" +
              (selectedHallId === hall.id ? " ceremony-form__pill--active" : "")
            }
            aria-pressed={selectedHallId === hall.id}
          >
            {hall.name}
          </button>
        ))}
      </div>
      <input type="hidden" name="hallId" value={selectedHallId} />

      <p className="ceremony-form__notice">
        담당 오퍼레이터는 등록 후 예식 목록의 예식 카드에서 배정합니다.
      </p>

      <span className="ceremony-form__label">신랑 · 신부</span>
      <div className="ceremony-form__couple-row">
        <input
          aria-label="신랑 이름"
          name="groomName"
          type="text"
          placeholder="신랑 이름"
          className={state.errorField === "groomName" ? "input input--error" : "input"}
          aria-invalid={state.errorField === "groomName"}
        />
        <input
          aria-label="신부 이름"
          name="brideName"
          type="text"
          placeholder="신부 이름"
          className={state.errorField === "brideName" ? "input input--error" : "input"}
          aria-invalid={state.errorField === "brideName"}
        />
      </div>

      <span className="ceremony-form__label" id="ceremony-conditions-label">
        계약 형태
      </span>
      <div
        className="ceremony-form__pills"
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
              "ceremony-form__pill" +
              (conditions[option.name] ? " ceremony-form__pill--active" : "")
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

      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn-primary ceremony-form__submit" disabled={isPending}>
        {isPending ? "저장 중..." : "예식 등록하기"}
      </button>
    </form>
  );
}
