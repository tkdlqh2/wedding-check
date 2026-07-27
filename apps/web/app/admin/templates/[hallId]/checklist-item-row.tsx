"use client";

import { useState } from "react";
import { deleteChecklistItemAction, moveChecklistItemAction } from "./actions";
import { ChecklistItemForm } from "./checklist-item-form";
import { VideoUpload } from "./video-upload";

// Story 5.5: template-item-row.tsx의 기존 영상 블록(<video>/업로드 폼)을 그대로
// 옮겨왔다 — 시연 영상은 이제 단계가 아니라 체크리스트 항목에 붙는다.
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
          onSuccess={() => setEditing(false)}
        />
        <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
          취소
        </button>
      </li>
    );
  }

  return (
    <li className="checklist-item-card">
      <div className="checklist-item-card__body">
        <span className="checklist-item-card__title">{item.title}</span>
        {item.description && <p className="checklist-item-card__description">{item.description}</p>}
        <div className="checklist-item-card__video">
          {demoVideo ? (
            <video controls src={demoVideo.videoUrl} />
          ) : (
            <p className="checklist-item-card__video-empty">영상 없음</p>
          )}
          <VideoUpload
            hallId={hallId}
            checklistItemId={item.id}
            blobEnabled={blobEnabled}
            currentVideoUrl={demoVideo?.videoUrl}
          />
        </div>
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
