"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  addAdHocItemAction,
  updateInstanceItemAction,
  type InstanceItemFormState,
} from "./actions";
const initialState: InstanceItemFormState = {};

// Story 5.8: apps/web/app/admin/templates/[hallId]/checklist-item-form.tsx와 동일한
// useActionState 패턴 — "이 예식에만" 체크 항목을 추가/수정한다. 세 가지 쓰임:
// (1) item이 있으면 수정 폼(제목+설명). (2) item 없이 stepContext가 있으면 기존 단계
// (템플릿 단계 또는 이미 만든 ad-hoc 단계)에 항목을 추가하는 한 줄 빠른 입력.
// (3) item 없이 isNewStep이면 완전히 새 단계 + 그 단계의 첫 항목을 함께 만드는 폼.
export function InstanceItemForm({
  hallId,
  ceremonyId,
  item,
  stepContext,
  isNewStep,
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
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const action = item ? updateInstanceItemAction : addAdHocItemAction;
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

        {/* 템플릿 편집기(checklist-item-form.tsx)와 동일한 시연 영상 섹션 — 영상은
            템플릿의 체크리스트 항목(demo_videos)에 붙는 공용 자산이라, 이 화면("이
            예식에만 반영" 약속)에서 업로드/교체를 노출하면 모든 예식의 영상이 조용히
            바뀐다(코덱스 리뷰 P1) — 여기서는 재생만 제공하고, 등록/교체는 홀 템플릿
            편집기로 안내한다. */}
        <div className="instance-item-form-panel__video">
          <span className="instance-item-form-panel__video-label">시연 영상</span>
          {item.videoUrl ? (
            <video controls preload="metadata" src={item.videoUrl} />
          ) : (
            <p className="instance-item-form-panel__video-empty">
              {item.templateItemCheckId
                ? "영상 없음"
                : "영상 없음 — 이 예식에만 추가된 항목은 시연 영상을 붙일 수 없습니다"}
            </p>
          )}
          {item.templateItemCheckId && (
            <p className="instance-item-form-panel__video-hint">
              영상은 홀 공용 자산이라 여기서는 재생만 됩니다 — 등록/교체는{" "}
              <a href={`/admin/templates/${hallId}`}>홀 체크리스트 템플릿</a>에서 하세요
              (모든 예식에 함께 반영됩니다).
            </p>
          )}
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
        </>
      )}
      <input
        name="title"
        type="text"
        required
        placeholder={isNewStep ? "이 단계의 첫 체크 항목" : "이 예식에만 필요한 체크 항목 추가"}
        className={!isNewStep && state.error ? "input input--error" : "input"}
      />
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
