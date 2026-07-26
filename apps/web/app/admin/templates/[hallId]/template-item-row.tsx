"use client";

import { useState } from "react";
import { deleteTemplateItemAction, moveTemplateItemAction } from "./actions";
import { TemplateItemForm } from "./template-item-form";
import { VideoUpload } from "./video-upload";

export function TemplateItemRow({
  hallId,
  item,
  isFirst,
  isLast,
  demoVideo,
  blobEnabled,
}: {
  hallId: string;
  item: { id: string; stepName: string; description: string | null };
  isFirst: boolean;
  isLast: boolean;
  demoVideo?: { videoUrl: string; fileName: string };
  blobEnabled: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="template-item-card template-item-card--editing">
        <TemplateItemForm hallId={hallId} item={item} onSuccess={() => setEditing(false)} />
        <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
          취소
        </button>
      </li>
    );
  }

  return (
    <li className="template-item-card">
      <div className="template-item-card__body">
        <span className="template-item-card__step-name">{item.stepName}</span>
        {item.description && (
          <p className="template-item-card__description">{item.description}</p>
        )}
        <div className="template-item-card__video">
          {demoVideo ? (
            <video controls src={demoVideo.videoUrl} />
          ) : (
            <p className="template-item-card__video-empty">영상 없음</p>
          )}
          <VideoUpload
            hallId={hallId}
            templateItemId={item.id}
            blobEnabled={blobEnabled}
            currentVideoUrl={demoVideo?.videoUrl}
          />
        </div>
      </div>
      <div className="template-item-card__actions">
        <form action={moveTemplateItemAction}>
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" className="btn-secondary" disabled={isFirst} aria-label="위로 이동">
            ↑
          </button>
        </form>
        <form action={moveTemplateItemAction}>
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
          action={deleteTemplateItemAction}
          onSubmit={(e) => {
            if (!confirm(`"${item.stepName}" 항목을 삭제할까요?`)) {
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
