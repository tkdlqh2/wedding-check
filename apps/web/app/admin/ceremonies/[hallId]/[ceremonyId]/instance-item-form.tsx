"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addAdHocItemAction,
  addAdHocStepAction,
  updateInstanceItemAction,
  type InstanceItemFormState,
} from "./actions";
import { VideoUpload } from "../../../templates/[hallId]/video-upload";
const initialState: InstanceItemFormState = {};

// Story 5.8: apps/web/app/admin/templates/[hallId]/checklist-item-form.tsx와 동일한
// useActionState 패턴 — "이 예식에만" 체크 항목을 추가/수정한다. 세 가지 쓰임:
// (1) item이 있으면 수정 폼(제목+설명+시연 영상). (2) item 없이 stepContext가 있으면
// 기존 단계(템플릿 단계 또는 이미 만든 ad-hoc 단계)에 항목을 추가하는 한 줄 빠른 입력.
// (3) item 없이 isNewStep이면 템플릿 편집기처럼 단계명만으로 새 단계를 만드는 폼
// (대표 지시 2026-07-28 — 항목은 만들어진 단계 카드의 빠른 추가에서 이어서 등록).
export function InstanceItemForm({
  hallId,
  ceremonyId,
  item,
  stepContext,
  isNewStep,
  blobEnabled,
  onSuccess,
  onCancel,
}: {
  hallId: string;
  ceremonyId: string;
  item?: {
    id: string;
    title: string;
    description: string | null;
    templateItemCheckId?: string | null;
    videoUrl?: string | null;
  };
  stepContext?: { templateItemId?: string | null; groupRootId?: string | null };
  isNewStep?: boolean;
  blobEnabled?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const action = item
    ? updateInstanceItemAction
    : isNewStep
      ? addAdHocStepAction
      : addAdHocItemAction;
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

  if (item) {
    const formId = `instance-item-edit-form-${item.id}`;
    return (
      <div className="instance-item-form-panel">
        <form id={formId} ref={formRef} action={formAction} className="instance-item-form">
          <input type="hidden" name="hallId" value={hallId} />
          <input type="hidden" name="ceremonyId" value={ceremonyId} />
          <input type="hidden" name="itemId" value={item.id} />

          <label htmlFor={`instance-item-title-${item.id}`}>제목</label>
          <input
            id={`instance-item-title-${item.id}`}
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

          <label htmlFor={`instance-item-description-${item.id}`}>설명(선택)</label>
          <textarea
            id={`instance-item-description-${item.id}`}
            name="description"
            defaultValue={item.description ?? ""}
            className="input"
            rows={2}
            placeholder="필요하면 자세한 설명을 남기세요"
          />
        </form>

        {/* 템플릿 편집기(checklist-item-form.tsx)와 동일한 시연 영상 섹션 — 재생 +
            업로드/교체. 대표 지시(2026-07-28): 여기서 올린 영상은 이 예식에만 반영된다
            — 인스턴스 항목의 전용 영상(checklist_instance_items.video_url)으로 저장돼
            홀 템플릿의 공용 영상은 바뀌지 않는다(전용 업로드 라우트). 템플릿 영상이
            있는 항목은 교체(오버라이드), ad-hoc 항목은 신규 등록이 된다. */}
        <div className="instance-item-form-panel__video">
          <span className="instance-item-form-panel__video-label">시연 영상</span>
          {item.videoUrl ? (
            <video controls preload="metadata" src={item.videoUrl} />
          ) : (
            <p className="instance-item-form-panel__video-empty">영상 없음</p>
          )}
          <VideoUpload
            hallId={hallId}
            checklistItemId={item.id}
            endpointBase={`/api/ceremonies/${hallId}/${ceremonyId}/items/${item.id}/video`}
            blobEnabled={Boolean(blobEnabled)}
            currentVideoUrl={item.videoUrl ?? undefined}
          />
          <p className="instance-item-form-panel__video-hint">
            여기서 올린 영상은 <strong>이 예식에만</strong> 반영됩니다 — 홀 템플릿의 공용
            영상은 바뀌지 않습니다.
          </p>
        </div>

        <div className="instance-item-form-panel__footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            취소
          </button>
          <button type="submit" form={formId} className="btn-primary" disabled={isPending}>
            {isPending ? "저장 중..." : "수정 저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className={isNewStep ? "instance-item-form--new-step" : "instance-item-form--quick"}
    >
      <input type="hidden" name="hallId" value={hallId} />
      <input type="hidden" name="ceremonyId" value={ceremonyId} />
      {isNewStep ? (
        <input
          name="stepName"
          type="text"
          required
          placeholder="이 예식에만 추가할 단계 (예: 신부 어머니 축사)"
          className={state.error ? "input input--error" : "input"}
        />
      ) : (
        <>
          <input type="hidden" name="templateItemId" value={stepContext?.templateItemId ?? ""} />
          <input type="hidden" name="groupRootId" value={stepContext?.groupRootId ?? ""} />
          <input
            name="title"
            type="text"
            required
            placeholder="이 예식에만 필요한 체크 항목 추가"
            className={state.error ? "input input--error" : "input"}
          />
        </>
      )}
      <button type="submit" className={isNewStep ? "btn-primary" : "btn-secondary"} disabled={isPending}>
        {isPending ? "추가 중..." : isNewStep ? "단계 추가" : "추가"}
      </button>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
