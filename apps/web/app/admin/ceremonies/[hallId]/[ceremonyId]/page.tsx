import { notFound } from "next/navigation";
import Link from "next/link";
import * as hallRepo from "@/lib/db/repositories/hall";
import { getCeremonyDetail, ChecklistInstanceValidationError } from "@/lib/services/checklist-instance";
import { listCeremonyAssignees } from "@/lib/services/ceremony";
import { isValidUuid } from "@/lib/uuid";
import { InstanceItemRow } from "./instance-item-row";
import { InstanceItemForm } from "./instance-item-form";
import { InstanceStepHeader } from "./instance-step-header";
import { groupItemsByStep } from "./group-by-step";
import { isCeremonyDone } from "@/lib/ceremony-status";
import "./ceremony-detail.css";

// prototype/js/screens/WeddingDetailScreen.js와 동일한 위계 — 시간+신랑신부가
// 제목(28px/700), 그 옆에 상태 배지, 그 아래 날짜·홀·담당 메타 줄, 그 아래
// "이 예식 전용" 안내 박스, 단계 카드 목록(템플릿 편집기와 동일 시각 언어),
// 맨 아래 새 단계 추가 점선 카드.
const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});

export default async function CeremonyDetailPage({
  params,
}: {
  params: Promise<{ hallId: string; ceremonyId: string }>;
}) {
  const { hallId, ceremonyId } = await params;
  // hallId/ceremonyId는 uuid 컬럼과 직접 비교되므로, 형식이 아예 아니면 쿼리를 보내기
  // 전에 걸러야 한다(templates/[hallId]/page.tsx와 동일 패턴, Story 1.3 코덱스 6차 P2).
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId)) {
    notFound();
  }

  const hall = await hallRepo.findById(hallId);
  if (!hall || !hall.isActive) {
    notFound();
  }

  let detail;
  let assignees;
  try {
    [detail, assignees] = await Promise.all([
      getCeremonyDetail(hallId, ceremonyId),
      listCeremonyAssignees(hallId, ceremonyId),
    ]);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) {
      notFound();
    }
    throw err;
  }

  const { ceremony, items } = detail;
  const stepGroups = groupItemsByStep(items);
  const isDone = isCeremonyDone(ceremony.ceremonyAt);

  return (
    <section className="ceremony-detail-page">
      <Link href="/admin/ceremonies" className="ceremony-detail-page__back">
        ← 예식 목록
      </Link>
      <div className="ceremony-detail-page__title-row">
        <h1>
          {timeFormatter.format(ceremony.ceremonyAt)}
          {ceremony.groomName && ceremony.brideName && (
            <span className="ceremony-detail-page__couple-inline">
              {" "}
              {ceremony.groomName} · {ceremony.brideName}
            </span>
          )}
        </h1>
        <span
          className={
            "ceremony-detail-page__status-badge" + (isDone ? " ceremony-detail-page__status-badge--done" : "")
          }
        >
          {isDone ? "완료" : "예정"}
        </span>
      </div>
      {/* 프로토타입 22행 — 담당은 상세에서 읽기 전용, 배정 조작은 예식 목록 카드의 pill. */}
      <p className="ceremony-detail-page__meta">
        {dateFormatter.format(ceremony.ceremonyAt)} · {hall.name} · 담당{" "}
        {assignees.length > 0 ? (
          assignees.map((a) => a.name).join(", ")
        ) : (
          <span className="ceremony-detail-page__meta-unassigned">미배정</span>
        )}
      </p>

      {/* 프로토타입 25행의 경고 톤 안내 박스 — 이 화면의 수정이 템플릿에 영향을 주지
          않는다는 핵심 안내. */}
      <p className="ceremony-detail-page__notice">
        이 예식 전용 체크리스트입니다 — 여기서의 수정은 <strong>이 예식에만</strong> 반영되고
        홀의 체크리스트 템플릿은 바뀌지 않습니다.
      </p>

      {items.length === 0 ? (
        <p className="ceremony-detail-page__empty">등록된 체크리스트 항목이 없습니다.</p>
      ) : (
        <div className="instance-step-list">
          {stepGroups.map(([groupKey, stepItems], index) => {
            const first = stepItems[0];
            const stepKey = first.templateItemId
              ? { templateItemId: first.templateItemId }
              : first.adHocGroupRootId
                ? { groupRootId: first.adHocGroupRootId }
                : { itemId: first.id };
            return (
              <div key={groupKey} className="instance-step-card">
                <InstanceStepHeader
                  hallId={hallId}
                  ceremonyId={ceremonyId}
                  index={index}
                  stepName={first.stepName}
                  itemCount={stepItems.length}
                  stepKey={stepKey}
                />
                <ul className="instance-item-list">
                  {stepItems.map((item) => (
                    <InstanceItemRow key={item.id} hallId={hallId} ceremonyId={ceremonyId} item={item} />
                  ))}
                </ul>
                {/* 원본 템플릿 단계가 삭제된 orphan 항목(templateItemId/adHocGroupRootId
                    둘 다 null)은 "같은 단계에 추가"할 그룹 키가 없다 — 빠른 추가 폼을
                    숨긴다(항상 실패하는 폼을 노출하지 않음, Story 5.8 코덱스 리뷰 P2). */}
                {(first.templateItemId || first.adHocGroupRootId) && (
                  <div className="instance-step-card__quick-add">
                    <InstanceItemForm
                      hallId={hallId}
                      ceremonyId={ceremonyId}
                      stepContext={{
                        templateItemId: first.templateItemId,
                        groupRootId: first.adHocGroupRootId,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="ceremony-detail-page__new-step">
        <InstanceItemForm hallId={hallId} ceremonyId={ceremonyId} isNewStep />
      </div>
    </section>
  );
}
