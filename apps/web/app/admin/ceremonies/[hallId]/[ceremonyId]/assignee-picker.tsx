"use client";

import { useEffect, useRef, useState } from "react";
import { assignOperatorAction } from "./actions";

// Story 5.8 AC 7 + 대표 피드백(2026-07-27): 오퍼레이터가 많을 때를 대비해 검색
// 가능한 대화상자로 배정한다 — apps/web/app/admin/account-menu.tsx의 모달 패턴
// (오버레이+Escape 닫기+motion-slow 진입 애니메이션)을 그대로 재사용.
export function AssigneePicker({
  hallId,
  ceremonyId,
  eligibleOperators,
  assignedOperatorId,
  assignedOperatorName,
  isAssignedOperatorEligible,
}: {
  hallId: string;
  ceremonyId: string;
  eligibleOperators: { id: string; name: string }[];
  assignedOperatorId: string | null;
  assignedOperatorName: string | null;
  isAssignedOperatorEligible: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const filtered = eligibleOperators.filter((op) =>
    op.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="ceremony-detail-page__assignee-section">
      <span className="ceremony-detail-page__assignee-label">담당</span>

      {assignedOperatorName ? (
        <form action={assignOperatorAction} onSubmit={() => setOpen(false)}>
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="ceremonyId" value={ceremonyId} />
          <input type="hidden" name="operatorId" value="" />
          <button
            type="submit"
            className={
              "ceremony-detail-page__assignee-pill ceremony-detail-page__assignee-pill--active" +
              (!isAssignedOperatorEligible ? " ceremony-detail-page__assignee-pill--stale" : "")
            }
            title="클릭하면 배정이 해제됩니다"
          >
            {assignedOperatorName} ✕
          </button>
        </form>
      ) : (
        <span className="ceremony-detail-page__assignee-unassigned">미배정</span>
      )}

      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        담당자 {assignedOperatorName ? "변경" : "지정"}
      </button>

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
            <input
              ref={inputRef}
              type="search"
              className="input"
              placeholder="이름으로 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className="assignee-modal__list">
              {filtered.length === 0 ? (
                <li className="assignee-modal__empty">일치하는 오퍼레이터가 없습니다.</li>
              ) : (
                filtered.map((operator) => (
                  <li key={operator.id}>
                    <form action={assignOperatorAction} onSubmit={() => setOpen(false)}>
                      <input type="hidden" name="hallId" value={hallId} />
                      <input type="hidden" name="ceremonyId" value={ceremonyId} />
                      <input type="hidden" name="operatorId" value={operator.id} />
                      <button type="submit" className="assignee-modal__option">
                        {operator.name}
                        {operator.id === assignedOperatorId && (
                          <span className="assignee-modal__option-check">✓</span>
                        )}
                      </button>
                    </form>
                  </li>
                ))
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
