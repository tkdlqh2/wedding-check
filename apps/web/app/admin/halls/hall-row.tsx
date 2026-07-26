"use client";

import { useState } from "react";
import { deactivateHallAction } from "./actions";
import { HallForm } from "./hall-form";

export function HallRow({ hall }: { hall: { id: string; name: string } }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="hall-row hall-row--editing">
        <HallForm hall={hall} onSuccess={() => setEditing(false)} />
        <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
          취소
        </button>
      </li>
    );
  }

  return (
    <li className="hall-row">
      <span className="hall-row__name">{hall.name}</span>
      <div className="hall-row__actions">
        <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
          수정
        </button>
        <form
          action={deactivateHallAction}
          onSubmit={(e) => {
            if (!confirm(`"${hall.name}" 홀을 비활성화할까요? 목록에서 사라집니다.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={hall.id} />
          <button type="submit" className="btn-secondary">
            삭제
          </button>
        </form>
      </div>
    </li>
  );
}
