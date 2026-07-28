"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toggleAssigneeAction, type ToggleAssigneeFormState } from "../../actions";

const initialState: ToggleAssigneeFormState = {};

// 대표 피드백(2026-07-27): 담당 배정은 검색 가능한 대화상자에서 체크박스로 여러 명을
// 추가/삭제한다 — 목록/상세의 본문에는 배정된 이름만 읽기 전용으로 보인다.
// 모달 패턴은 account-menu.tsx(오버레이+Escape 닫기+motion-slow 진입)를 재사용한다.
// 체크박스 행을 누르면 즉시 토글(서버 액션)되고, 여러 명을 연달아 고를 수 있도록
// 대화상자는 닫히지 않는다 — 실패(예: 렌더링과 제출 사이 오퍼레이터 비활성화)는
// 대화상자 안에 그대로 표시된다(조용히 삼키지 않음, Story 5.8 코덱스 리뷰 원칙).
export function AssigneePicker({
  hallId,
  ceremonyId,
  activeOperators,
  assignees,
  readOnly,
}: {
  hallId: string;
  ceremonyId: string;
  activeOperators: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(toggleAssigneeAction, initialState);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const assignedIds = new Set(assignees.map((a) => a.id));
  // 배정된 뒤 비활성화/역할 변경으로 활성 목록에서 빠진 담당자(stale)도 대화상자에
  // 계속 노출해 체크 해제로 정리할 수 있게 한다(해제 수단 보존).
  const staleAssignees = assignees.filter(
    (a) => !activeOperators.some((op) => op.id === a.id),
  );
  const candidates = [
    ...activeOperators.map((op) => ({ ...op, stale: false })),
    ...staleAssignees.map((op) => ({ ...op, stale: true })),
  ];
  const filtered = candidates.filter((op) =>
    op.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="assignee-section">
      <span className="assignee-section__label">담당</span>
      {assignees.length > 0 ? (
        <span className="assignee-section__names">
          {assignees.map((a) => a.name).join(", ")}
        </span>
      ) : (
        <span className="assignee-section__unassigned">미배정</span>
      )}
      {!readOnly && (
        <button type="button" className="btn-secondary assignee-section__open" onClick={() => setOpen(true)}>
          담당자 지정
        </button>
      )}

      {open && (
        <div className="assignee-modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="assignee-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assignee-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="assignee-modal-title">담당 오퍼레이터 지정</h2>
            <p className="assignee-modal__hint">
              체크하면 배정, 해제하면 제외됩니다. 여러 명을 배정할 수 있어요.
            </p>
            <input
              ref={inputRef}
              type="search"
              className="input"
              placeholder="이름으로 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {state.error && (
              <p className="field-error" role="alert">
                {state.error}
              </p>
            )}
            <ul className="assignee-modal__list">
              {filtered.length === 0 ? (
                <li className="assignee-modal__empty">일치하는 오퍼레이터가 없습니다.</li>
              ) : (
                filtered.map((operator) => {
                  const assigned = assignedIds.has(operator.id);
                  return (
                    <li key={operator.id}>
                      <form action={formAction}>
                        <input type="hidden" name="hallId" value={hallId} />
                        <input type="hidden" name="ceremonyId" value={ceremonyId} />
                        <input type="hidden" name="operatorId" value={operator.id} />
                        <button
                          type="submit"
                          className={
                            "assignee-modal__option" +
                            (assigned ? " assignee-modal__option--checked" : "")
                          }
                          disabled={isPending}
                          role="checkbox"
                          aria-checked={assigned}
                        >
                          <span
                            className={
                              "assignee-modal__checkbox" +
                              (assigned ? " assignee-modal__checkbox--checked" : "")
                            }
                            aria-hidden
                          >
                            {assigned ? "✓" : ""}
                          </span>
                          <span className="assignee-modal__name">{operator.name}</span>
                          {operator.stale && (
                            <span className="assignee-modal__stale-tag">비활성 계정</span>
                          )}
                        </button>
                      </form>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="assignee-modal__footer">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
