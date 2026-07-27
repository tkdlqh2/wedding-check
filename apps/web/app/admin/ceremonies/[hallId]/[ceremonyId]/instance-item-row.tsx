"use client";

import { useState } from "react";
import { removeInstanceItemAction } from "./actions";
import { InstanceItemForm } from "./instance-item-form";

// Story 5.8: apps/web/app/admin/templates/[hallId]/checklist-item-row.tsx와 동일한
// 인라인 수정 토글 패턴 — "포함된 항목"을 이 예식 전용으로 직접 수정할 수 있게 한다.
export function InstanceItemRow({
  hallId,
  ceremonyId,
  item,
}: {
  hallId: string;
  ceremonyId: string;
  item: { id: string; title: string; description: string | null };
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="instance-item-card instance-item-card--editing">
        <InstanceItemForm
          hallId={hallId}
          ceremonyId={ceremonyId}
          item={item}
          onSuccess={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="instance-item-card">
      <span className="instance-item-card__name">{item.title}</span>
      <div className="instance-item-card__actions">
        <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
          수정
        </button>
        <form action={removeInstanceItemAction}>
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="ceremonyId" value={ceremonyId} />
          <input type="hidden" name="itemId" value={item.id} />
          <button type="submit" className="btn-secondary">
            제외
          </button>
        </form>
      </div>
    </li>
  );
}
