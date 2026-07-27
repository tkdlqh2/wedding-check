"use client";

import { useActionState } from "react";
import { toggleAssigneeAction, type ToggleAssigneeFormState } from "./actions";

const initialState: ToggleAssigneeFormState = {};

// prototype/js/screens/WeddingScreen.js 121~130행 그대로 — 예식 카드 안에서 활성
// 오퍼레이터 전원을 pill로 보여주고, 클릭으로 배정/해제를 토글한다(다중 배정).
// 배정된 뒤 비활성화/역할 변경으로 활성 목록에서 빠진 담당자(stale)도 pill로 계속
// 보여줘 클릭으로 해제할 수 있게 한다(해제 수단 보존 — Story 5.8 코덱스 리뷰 원칙).
export function AssigneePills({
  hallId,
  ceremonyId,
  activeOperators,
  assignees,
}: {
  hallId: string;
  ceremonyId: string;
  activeOperators: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(toggleAssigneeAction, initialState);
  const assignedIds = new Set(assignees.map((a) => a.id));
  const staleAssignees = assignees.filter(
    (a) => !activeOperators.some((op) => op.id === a.id),
  );

  const renderPill = (operator: { id: string; name: string }, stale: boolean) => {
    const assigned = assignedIds.has(operator.id);
    return (
      <form action={formAction} key={operator.id}>
        <input type="hidden" name="hallId" value={hallId} />
        <input type="hidden" name="ceremonyId" value={ceremonyId} />
        <input type="hidden" name="operatorId" value={operator.id} />
        <button
          type="submit"
          className={
            "assignee-pill" +
            (assigned ? " assignee-pill--active" : "") +
            (stale ? " assignee-pill--stale" : "")
          }
          disabled={isPending}
          aria-pressed={assigned}
          title={assigned ? "클릭하면 배정이 해제됩니다" : "클릭하면 담당으로 배정됩니다"}
        >
          {operator.name}
        </button>
      </form>
    );
  };

  return (
    <div className="ceremony-card__assignees">
      <span className="ceremony-card__assignees-label">담당</span>
      {activeOperators.map((operator) => renderPill(operator, false))}
      {staleAssignees.map((operator) => renderPill(operator, true))}
      {assignees.length === 0 && (
        <span className="ceremony-card__assignees-unassigned">미배정</span>
      )}
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
