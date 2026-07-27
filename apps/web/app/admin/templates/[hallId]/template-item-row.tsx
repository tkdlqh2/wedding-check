"use client";

import { useState } from "react";
import { deleteTemplateItemAction, moveTemplateItemAction } from "./actions";
import { TemplateItemForm } from "./template-item-form";
import { ChecklistItemForm } from "./checklist-item-form";
import { ChecklistItemRow } from "./checklist-item-row";

// Story 5.5: 단계는 이름만 갖는다(설명·영상 제거, 체크리스트 항목으로 이동) — 그
// 대신 이 행 안에 소속 체크리스트 항목 목록 + 새 항목 등록 폼을 중첩 렌더링한다.
// 헤더 행(번호 배지+단계명+조건 태그+항목 수+액션)은 prototype/js/screens/TemplateScreen.js
// 구조를 그대로 이식했다.
export function TemplateItemRow({
  hallId,
  index,
  item,
  isFirst,
  isLast,
  checklistItems,
  demoVideosByChecklistItemId,
  blobEnabled,
}: {
  hallId: string;
  index: number;
  item: {
    id: string;
    stepName: string;
    applicableContractConditions?: Record<string, boolean>;
  };
  isFirst: boolean;
  isLast: boolean;
  checklistItems: { id: string; title: string; description: string | null }[];
  demoVideosByChecklistItemId: Map<string, { videoUrl: string; fileName: string }>;
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
        <span className="template-item-card__index">{index + 1}</span>
        <span className="template-item-card__step-name">{item.stepName}</span>
        {(item.applicableContractConditions?.requiresOfficiant ||
          item.applicableContractConditions?.hasAdditionalEvent) && (
          <div className="template-item-card__conditions">
            {item.applicableContractConditions?.requiresOfficiant && (
              <span className="condition-tag">주례 관련</span>
            )}
            {item.applicableContractConditions?.hasAdditionalEvent && (
              <span className="condition-tag">이벤트 추가 관련</span>
            )}
          </div>
        )}
        <span className="template-item-card__item-count">항목 {checklistItems.length}개</span>
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
              if (!confirm(`"${item.stepName}" 단계를 삭제할까요? 소속 체크리스트 항목도 함께 삭제됩니다.`)) {
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
      </div>

      <div className="template-item-card__checklist">
        {checklistItems.length === 0 ? (
          <p className="template-item-card__checklist-empty">
            아직 등록된 체크리스트 항목이 없어요.
          </p>
        ) : (
          <ul className="checklist-item-list">
            {checklistItems.map((checklistItem, itemIndex) => (
              <ChecklistItemRow
                key={checklistItem.id}
                hallId={hallId}
                templateItemId={item.id}
                item={checklistItem}
                isFirst={itemIndex === 0}
                isLast={itemIndex === checklistItems.length - 1}
                demoVideo={demoVideosByChecklistItemId.get(checklistItem.id)}
                blobEnabled={blobEnabled}
              />
            ))}
          </ul>
        )}
        <div className="template-item-card__checklist-form">
          <ChecklistItemForm hallId={hallId} templateItemId={item.id} />
        </div>
      </div>
    </li>
  );
}
