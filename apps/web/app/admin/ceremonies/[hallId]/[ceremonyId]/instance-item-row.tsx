"use client";

import { useState } from "react";
import { removeInstanceItemAction, moveInstanceItemAction } from "./actions";
import { InstanceItemForm } from "./instance-item-form";

export type InstanceItemRowItem = {
  id: string;
  title: string;
  description: string | null;
  templateItemCheckId: string | null;
  videoUrl: string | null;
};

// apps/web/app/admin/templates/[hallId]/checklist-item-row.tsx와 동일한 구성 — 목록에
// 있을 때는 제목 + "긴 설명"/"▶ 시연 영상" 태그만 보여주고, 설명 전문과 영상 재생/
// 업로드는 "수정"을 눌러야만 나타난다(템플릿 편집기의 대표 피드백 원칙 그대로).
// 대표 지시(2026-07-28): 단계 헤더와 마찬가지로 항목도 ↑↓ 화살표로 단계 안 순서를
// 바꾼다(템플릿 편집기 checklist-item-row.tsx와 동일 UX).
export function InstanceItemRow({
  hallId,
  ceremonyId,
  item,
  blobEnabled,
  isFirst,
  isLast,
  readOnly,
}: {
  hallId: string;
  ceremonyId: string;
  item: InstanceItemRowItem;
  blobEnabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  // 종료된 예식(2026-07-27 대표 지시) — 수정/삭제 버튼을 숨긴다(서비스도 거부).
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="instance-item-card instance-item-card--editing">
        <InstanceItemForm
          hallId={hallId}
          ceremonyId={ceremonyId}
          item={item}
          blobEnabled={blobEnabled}
          onSuccess={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="instance-item-card">
      <div className="instance-item-card__body">
        <span className="instance-item-card__name">{item.title}</span>
        {item.description && <span className="instance-item-card__tag">긴 설명</span>}
        {item.videoUrl && (
          <span className="instance-item-card__tag instance-item-card__tag--video">
            ▶ 시연 영상
          </span>
        )}
      </div>
      {readOnly ? null : (
      <div className="instance-item-card__actions">
        <form action={moveInstanceItemAction}>
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="ceremonyId" value={ceremonyId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" className="btn-secondary" disabled={isFirst} aria-label="위로 이동">
            ↑
          </button>
        </form>
        <form action={moveInstanceItemAction}>
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="ceremonyId" value={ceremonyId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" className="btn-secondary" disabled={isLast} aria-label="아래로 이동">
            ↓
          </button>
        </form>
        <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
          수정
        </button>
        <form
          action={removeInstanceItemAction}
          onSubmit={(e) => {
            if (!confirm(`"${item.title}" 항목을 이 예식에서 삭제할까요?`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="ceremonyId" value={ceremonyId} />
          <input type="hidden" name="itemId" value={item.id} />
          <button type="submit" className="btn-secondary">
            삭제
          </button>
        </form>
      </div>
      )}
    </li>
  );
}
