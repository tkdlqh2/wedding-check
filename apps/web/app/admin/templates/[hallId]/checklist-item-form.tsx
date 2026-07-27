"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createChecklistItemAction,
  updateChecklistItemAction,
  type ChecklistItemFormState,
} from "./actions";
import { VideoUpload } from "./video-upload";

const initialState: ChecklistItemFormState = {};

// Story 5.5: template-item-form.tsx와 동일한 useActionState 패턴 — 단계 폼과 달리
// 이 폼은 templateItemId(소속 단계)를 hidden input으로 함께 넘긴다.
//
// 신규 등록(item 없음)은 prototype/js/screens/TemplateScreen.js의 "빠른 추가"를 그대로
// 이식했다 — 제목(요약)만 입력하는 점선 인라인 입력, 설명은 나중에 "수정"에서 추가
// (DESIGN.md §10 "정해진 형식 없이" 톤과 같은 원칙: 처음부터 무거운 폼을 들이밀지 않는다).
// 수정(item 있음)은 제목+설명에 더해 영상 재생/업로드까지 함께 편집하는 전체 폼이다
// — 대표 피드백(2026-07-27): 목록에 있을 때는 "영상 있음" 태그만 보이고, 실제 영상
// 재생/업로드는 "수정"을 눌러야만 나타나야 한다(ChecklistItemRow는 태그만 표시).
export function ChecklistItemForm({
  hallId,
  templateItemId,
  item,
  demoVideo,
  blobEnabled,
  onSuccess,
  onCancel,
}: {
  hallId: string;
  templateItemId: string;
  item?: {
    id: string;
    title: string;
    description: string | null;
  };
  demoVideo?: { videoUrl: string; fileName: string };
  blobEnabled?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const action = item ? updateChecklistItemAction : createChecklistItemAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      if (!item) formRef.current?.reset();
      onSuccess?.();
    }
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess, item]);

  const idSuffix = item?.id ?? "new";

  if (!item) {
    return (
      <form action={formAction} ref={formRef} className="checklist-item-form--quick">
        <input type="hidden" name="hallId" value={hallId} />
        <input type="hidden" name="templateItemId" value={templateItemId} />
        <input
          name="title"
          type="text"
          required
          placeholder="이 단계에 체크 항목 추가 — 요약만 필수, 긴 설명·영상은 나중에"
          className={state.error ? "input input--error" : "input"}
          aria-invalid={Boolean(state.error)}
        />
        <button type="submit" className="btn-secondary" disabled={isPending}>
          {isPending ? "추가 중..." : "추가"}
        </button>
        {state.error && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="checklist-item-form-panel">
      <form
        id={`checklist-item-edit-form-${idSuffix}`}
        action={formAction}
        className="checklist-item-form"
      >
        <input type="hidden" name="hallId" value={hallId} />
        <input type="hidden" name="templateItemId" value={templateItemId} />
        <input type="hidden" name="id" value={item.id} />

        <label htmlFor={`checklist-item-title-${idSuffix}`}>제목</label>
        <input
          id={`checklist-item-title-${idSuffix}`}
          name="title"
          type="text"
          required
          defaultValue={item.title}
          className={state.error ? "input input--error" : "input"}
          aria-invalid={Boolean(state.error)}
        />
        {state.error && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}

        <label htmlFor={`checklist-item-description-${idSuffix}`}>설명(선택)</label>
        <textarea
          id={`checklist-item-description-${idSuffix}`}
          name="description"
          defaultValue={item.description ?? ""}
          className="input"
          rows={2}
          placeholder="필요하면 자세한 설명을 남기세요"
        />

      </form>

      {/* VideoUpload는 자체 <form>을 렌더링하므로(중첩 <form> 방지) 위 편집 폼 밖에 둔다. */}
      <div className="checklist-item-card__video">
        <span className="checklist-item-form-panel__video-label">시연 영상</span>
        {demoVideo ? (
          <video controls src={demoVideo.videoUrl} />
        ) : (
          <p className="checklist-item-card__video-empty">영상 없음</p>
        )}
        <VideoUpload
          hallId={hallId}
          checklistItemId={item.id}
          blobEnabled={Boolean(blobEnabled)}
          currentVideoUrl={demoVideo?.videoUrl}
        />
      </div>

      <div className="checklist-item-form-panel__footer">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          취소
        </button>
        <button type="submit" form={`checklist-item-edit-form-${idSuffix}`} className="btn-primary" disabled={isPending}>
          {isPending ? "저장 중..." : "수정 저장"}
        </button>
      </div>
    </div>
  );
}
