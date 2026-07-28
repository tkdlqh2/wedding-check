"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  renameInstanceStepAction,
  deleteInstanceStepAction,
  moveInstanceStepAction,
  type InstanceItemFormState,
} from "./actions";

const initialState: InstanceItemFormState = {};

// prototype/js/screens/WeddingDetailScreen.js 40~50행 + 템플릿 편집기
// (templates/[hallId]/template-item-row.tsx)의 단계 헤더와 동일한 구성 — 번호 배지 +
// 단계명 + 항목 수 + 수정/단계 삭제. "수정"은 인라인 이름 변경 폼으로 전환된다.
// stepKey는 group-by-step.ts의 그룹핑 키와 동일한 3단 위계로 서버 액션에 전달된다.
export function InstanceStepHeader({
  hallId,
  ceremonyId,
  index,
  stepName,
  itemCount,
  stepKey,
  isFirst,
  isLast,
  readOnly,
}: {
  hallId: string;
  ceremonyId: string;
  index: number;
  stepName: string;
  itemCount: number;
  stepKey: { templateItemId?: string | null; groupRootId?: string | null; itemId?: string | null };
  // 대표 지시(2026-07-28): 템플릿 편집기처럼 화살표로 단계 순서를 바꾼다.
  isFirst?: boolean;
  isLast?: boolean;
  // 종료된 예식(2026-07-27 대표 지시) — 수정/단계 삭제 버튼을 숨긴다(서비스도 거부).
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(renameInstanceStepAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      setEditing(false);
    }
    wasPending.current = isPending;
  }, [isPending, state.error]);

  const keyInputs = (
    <>
      <input type="hidden" name="hallId" value={hallId} />
      <input type="hidden" name="ceremonyId" value={ceremonyId} />
      <input type="hidden" name="templateItemId" value={stepKey.templateItemId ?? ""} />
      <input type="hidden" name="groupRootId" value={stepKey.groupRootId ?? ""} />
      <input type="hidden" name="itemId" value={stepKey.itemId ?? ""} />
    </>
  );

  if (editing) {
    return (
      <div className="instance-step-card__header instance-step-card__header--editing">
        <span className="instance-step-card__index">{index + 1}</span>
        <form action={formAction} className="instance-step-card__rename-form">
          {keyInputs}
          <input
            name="stepName"
            type="text"
            required
            defaultValue={stepName}
            aria-label="단계 이름"
            className={state.error ? "input input--error" : "input"}
          />
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
            취소
          </button>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? "저장 중..." : "저장"}
          </button>
          {state.error && (
            <p className="field-error" role="alert">
              {state.error}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="instance-step-card__header">
      <span className="instance-step-card__index">{index + 1}</span>
      <span className="instance-step-card__name">{stepName}</span>
      <span className="instance-step-card__item-count">항목 {itemCount}개</span>
      {readOnly ? null : (
      <div className="instance-step-card__actions">
        <form action={moveInstanceStepAction}>
          {keyInputs}
          <input type="hidden" name="direction" value="up" />
          <button type="submit" className="btn-secondary" disabled={isFirst} aria-label="단계 위로 이동">
            ↑
          </button>
        </form>
        <form action={moveInstanceStepAction}>
          {keyInputs}
          <input type="hidden" name="direction" value="down" />
          <button type="submit" className="btn-secondary" disabled={isLast} aria-label="단계 아래로 이동">
            ↓
          </button>
        </form>
        <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
          수정
        </button>
        <form
          action={deleteInstanceStepAction}
          onSubmit={(e) => {
            if (
              !confirm(
                `"${stepName}" 단계를 이 예식에서 삭제할까요? 소속 체크 항목 ${itemCount}개도 함께 삭제됩니다. (홀의 템플릿은 바뀌지 않습니다)`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          {keyInputs}
          <button type="submit" className="btn-secondary">
            단계 삭제
          </button>
        </form>
      </div>
      )}
    </div>
  );
}
