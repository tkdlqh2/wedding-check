"use client";

import { useActionState, useEffect, useRef } from "react";
import { createMemberAction, type MemberFormState } from "./actions";

const initialState: MemberFormState = {};

export function MemberForm() {
  const [state, formAction, isPending] = useActionState(createMemberAction, initialState);
  const wasPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      formRef.current?.reset();
    }
    wasPending.current = isPending;
  }, [isPending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="member-form">
      <label htmlFor="member-name">이름</label>
      <input
        id="member-name"
        name="name"
        type="text"
        placeholder="예: 홍길동"
        className={state.error ? "input input--error" : "input"}
        aria-invalid={Boolean(state.error)}
      />
      <label htmlFor="member-phone">전화번호</label>
      <input
        id="member-phone"
        name="phoneNumber"
        type="tel"
        inputMode="numeric"
        placeholder="01012345678"
        className={state.error ? "input input--error" : "input"}
        aria-invalid={Boolean(state.error)}
      />
      <label htmlFor="member-password">초기 비밀번호</label>
      <input
        id="member-password"
        name="password"
        type="password"
        className={state.error ? "input input--error" : "input"}
        aria-invalid={Boolean(state.error)}
      />
      <p className="member-form__hint">
        오퍼레이터 계정으로 등록됩니다. 등록 후 이 전화번호와 비밀번호로 바로 로그인할 수 있습니다.
      </p>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={isPending}>
        {isPending ? "등록 중..." : "회원 등록하기"}
      </button>
    </form>
  );
}
