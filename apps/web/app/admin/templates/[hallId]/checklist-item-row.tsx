"use client";

import { useState } from "react";
import { deleteChecklistItemAction, moveChecklistItemAction } from "./actions";
import { ChecklistItemForm } from "./checklist-item-form";

// Story 5.5(대표 피드백 반영, prototype/js/screens/TemplateScreen.js와 동일 원칙):
// 목록에 있을 때는 "긴 설명"/"▶ 시연 영상" 여부만 태그로 보여주고, 실제 설명 전문과
// 영상 재생/업로드 UI는 "수정"을 눌러야만 나타난다(ChecklistItemForm 편집 모드).
export function ChecklistItemRow({
  hallId,
  templateItemId,
  item,
  isFirst,
  isLast,
  demoVideo,
  blobEnabled,
}: {
  hallId: string;
  templateItemId: string;
  item: {
    id: string;
    title: string;
    description: string | null;
  };
  isFirst: boolean;
  isLast: boolean;
  demoVideo?: { videoUrl: string; fileName: string };
  blobEnabled: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="checklist-item-card checklist-item-card--editing">
        <ChecklistItemForm
          hallId={hallId}
          templateItemId={templateItemId}
          item={item}
          demoVideo={demoVideo}
          blobEnabled={blobEnabled}
          onSuccess={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="checklist-item-card">
      <div className="checklist-item-card__body">
        <span className="checklist-item-card__title">{item.title}</span>
        {item.description && <span className="checklist-item-card__tag">긴 설명</span>}
        {demoVideo && <span className="checklist-item-card__tag checklist-item-card__tag--video">▶ 시연 영상</span>}
      </div>
      <div className="checklist-item-card__actions">
        <form action={moveChecklistItemAction}>
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" className="btn-secondary" disabled={isFirst} aria-label="위로 이동">
            ↑
          </button>
        </form>
        <form action={moveChecklistItemAction}>
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" className="btn-secondary" disabled={isLast} aria-label="아래로 이동">
            ↓
          </button>
        </form>
        <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
          수정
        </button>
        <form
          action={deleteChecklistItemAction}
          onSubmit={(e) => {
            if (!confirm(`"${item.title}" 체크리스트 항목을 삭제할까요?`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="id" value={item.id} />
          <button type="submit" className="btn-secondary">
            삭제
          </button>
        </form>
      </div>
    </li>
  );
}
