import { notFound } from "next/navigation";
import Link from "next/link";
import * as hallRepo from "@/lib/db/repositories/hall";
import { getCeremonyDetail, ChecklistInstanceValidationError } from "@/lib/services/checklist-instance";
import { listMembers } from "@/lib/services/member";
import { isValidUuid } from "@/lib/uuid";
import { assignOperatorAction } from "./actions";
import { AddItemButton } from "./add-item-button";
import { InstanceItemRow } from "./instance-item-row";
import { InstanceItemForm } from "./instance-item-form";
import { groupCandidatesByStep, groupItemsByStep } from "./group-by-step";
import "./ceremony-detail.css";

const ceremonyDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
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
  let allMembers;
  try {
    [detail, allMembers] = await Promise.all([getCeremonyDetail(hallId, ceremonyId), listMembers()]);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) {
      notFound();
    }
    throw err;
  }

  const { ceremony, items, candidates } = detail;
  // Story 5.8 AC 7: 담당자는 활성 오퍼레이터 역할 회원만 새로 배정 가능.
  const eligibleOperators = allMembers.filter((m) => m.role === "operator" && !m.banned);
  const assignedOperatorName = ceremony.assignedOperatorId
    ? (allMembers.find((m) => m.id === ceremony.assignedOperatorId)?.name ?? null)
    : null;
  // 코덱스 리뷰 P2: 배정된 담당자가 이후 비활성화/역할 변경으로 eligibleOperators에서
  // 빠지면, 그 담당자의 pill 자체가 사라져 해제(operatorId="") 수단이 없어져 배정이
  // 계속 남아있게 된다 — eligibleOperators 목록과 별개로 항상 해제 가능한 컨트롤을
  // 하나 더 둔다.
  const isAssignedOperatorEligible = eligibleOperators.some(
    (m) => m.id === ceremony.assignedOperatorId,
  );

  return (
    <section className="ceremony-detail-page">
      <Link href="/admin/ceremonies" className="ceremony-detail-page__back">
        ← 예식 목록
      </Link>
      <h1>
        {hall.name} · {ceremonyDateFormatter.format(ceremony.ceremonyAt)}
      </h1>
      {ceremony.groomName && ceremony.brideName && (
        <p className="ceremony-detail-page__couple">
          {ceremony.groomName} · {ceremony.brideName} 예식
        </p>
      )}

      <div className="ceremony-detail-page__assignee-section">
        <span className="ceremony-detail-page__assignee-label">담당</span>
        {eligibleOperators.length === 0 ? (
          <span className="ceremony-detail-page__empty">등록된 활성 오퍼레이터가 없습니다.</span>
        ) : (
          eligibleOperators.map((operator) => {
            const isAssigned = operator.id === ceremony.assignedOperatorId;
            return (
              <form key={operator.id} action={assignOperatorAction}>
                <input type="hidden" name="hallId" value={hallId} />
                <input type="hidden" name="ceremonyId" value={ceremonyId} />
                <input type="hidden" name="operatorId" value={isAssigned ? "" : operator.id} />
                <button
                  type="submit"
                  className={
                    "ceremony-detail-page__assignee-pill" +
                    (isAssigned ? " ceremony-detail-page__assignee-pill--active" : "")
                  }
                  aria-pressed={isAssigned}
                >
                  {operator.name}
                </button>
              </form>
            );
          })
        )}
        {ceremony.assignedOperatorId && !isAssignedOperatorEligible && (
          <form action={assignOperatorAction}>
            <input type="hidden" name="hallId" value={hallId} />
            <input type="hidden" name="ceremonyId" value={ceremonyId} />
            <input type="hidden" name="operatorId" value="" />
            <button
              type="submit"
              className="ceremony-detail-page__assignee-pill ceremony-detail-page__assignee-pill--stale"
            >
              {assignedOperatorName ?? "알 수 없는 회원"} · 배정 해제
            </button>
          </form>
        )}
        {!assignedOperatorName && (
          <span className="ceremony-detail-page__assignee-unassigned">미배정</span>
        )}
      </div>

      <h2>포함된 항목 ({items.length}개)</h2>
      <p className="ceremony-detail-page__hint">
        여기서 추가·수정·제외한 내용은 이 예식에만 반영되고 템플릿은 바뀌지 않습니다.
      </p>
      {items.length === 0 ? (
        <p className="ceremony-detail-page__empty">포함된 항목이 없습니다.</p>
      ) : (
        <div className="instance-candidate-groups">
          {groupItemsByStep(items).map(([groupKey, stepItems]) => (
            <div key={groupKey} className="instance-candidate-group">
              <h3 className="instance-candidate-group__step-name">{stepItems[0].stepName}</h3>
              <ul className="instance-item-list">
                {stepItems.map((item) => (
                  <InstanceItemRow key={item.id} hallId={hallId} ceremonyId={ceremonyId} item={item} />
                ))}
              </ul>
              <div className="instance-candidate-group__quick-add">
                <InstanceItemForm
                  hallId={hallId}
                  ceremonyId={ceremonyId}
                  stepContext={{
                    templateItemId: stepItems[0].templateItemId,
                    groupRootId: stepItems[0].adHocGroupRootId,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ceremony-detail-page__new-step">
        <InstanceItemForm hallId={hallId} ceremonyId={ceremonyId} isNewStep />
      </div>

      <h2>추가 가능한 항목</h2>
      {candidates.length === 0 ? (
        <p className="ceremony-detail-page__empty">추가할 수 있는 항목이 없습니다.</p>
      ) : (
        <div className="instance-candidate-groups">
          {groupCandidatesByStep(candidates).map(([templateItemId, stepCandidates]) => (
            <div key={templateItemId} className="instance-candidate-group">
              <h3 className="instance-candidate-group__step-name">{stepCandidates[0].stepName}</h3>
              <ul className="instance-item-list">
                {stepCandidates.map((item) => (
                  <li key={item.id} className="instance-item-card">
                    <span className="instance-item-card__name">{item.title}</span>
                    <AddItemButton hallId={hallId} ceremonyId={ceremonyId} checklistItemId={item.id} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
