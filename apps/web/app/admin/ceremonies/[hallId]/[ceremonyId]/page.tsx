import { notFound } from "next/navigation";
import Link from "next/link";
import * as hallRepo from "@/lib/db/repositories/hall";
import { getCeremonyDetail, ChecklistInstanceValidationError } from "@/lib/services/checklist-instance";
import type {
  CandidateChecklistItem,
  ChecklistInstanceItem,
} from "@/lib/db/repositories/checklist-instance";
import { listMembers } from "@/lib/services/member";
import { isValidUuid } from "@/lib/uuid";
import { removeInstanceItemAction, assignOperatorAction } from "./actions";
import { AddItemButton } from "./add-item-button";
import "./ceremony-detail.css";

const ceremonyDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// candidates/items는 이미 리포지토리에서 (단계 순서, 항목 순서)로 정렬되어 온다 — 순서를
// 유지한 채 연속된 같은 그룹 키끼리만 묶는 순차 그룹핑이면 충분하다(재정렬 불필요).
// 코덱스 리뷰 3차 P2(candidates): stepName은 유일함이 보장되지 않는다(관리자가 같은
// 이름의 단계를 두 번 만들 수 있음) — templateItemId(단계 FK)로 묶어 서로 다른 두
// 단계가 이름이 같다는 이유로 하나로 합쳐지지 않게 한다. items의 templateItemId는
// nullable(부모 단계가 나중에 삭제되면 set null)이지만, 순수 JS `===` 비교는
// `null === null`이 true라 문제없이 그룹핑된다(Postgres NULL 비교와 다름).
function groupSequentialByKey<T, K>(items: T[], keyFn: (item: T) => K): [K, T[]][] {
  const groups: [K, T[]][] = [];
  for (const item of items) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0] === keyFn(item)) {
      lastGroup[1].push(item);
    } else {
      groups.push([keyFn(item), [item]]);
    }
  }
  return groups;
}

function groupCandidatesByStep(
  candidates: CandidateChecklistItem[],
): [string, CandidateChecklistItem[]][] {
  return groupSequentialByKey(candidates, (c) => c.templateItemId);
}

function groupItemsByStep(
  items: ChecklistInstanceItem[],
): [string | null, ChecklistInstanceItem[]][] {
  return groupSequentialByKey(items, (i) => i.templateItemId);
}

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
  // Story 5.8 AC 7: 담당자는 활성 오퍼레이터 역할 회원만 배정 대상.
  const eligibleOperators = allMembers.filter((m) => m.role === "operator" && !m.banned);
  const assignedOperatorName = ceremony.assignedOperatorId
    ? (allMembers.find((m) => m.id === ceremony.assignedOperatorId)?.name ?? null)
    : null;

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
        {!assignedOperatorName && (
          <span className="ceremony-detail-page__assignee-unassigned">미배정</span>
        )}
      </div>

      <h2>포함된 항목 ({items.length}개)</h2>
      {items.length === 0 ? (
        <p className="ceremony-detail-page__empty">포함된 항목이 없습니다.</p>
      ) : (
        <div className="instance-candidate-groups">
          {groupItemsByStep(items).map(([templateItemId, stepItems]) => (
            <div key={templateItemId ?? "unlinked"} className="instance-candidate-group">
              <h3 className="instance-candidate-group__step-name">{stepItems[0].stepName}</h3>
              <ul className="instance-item-list">
                {stepItems.map((item) => (
                  <li key={item.id} className="instance-item-card">
                    <span className="instance-item-card__name">{item.title}</span>
                    <form action={removeInstanceItemAction}>
                      <input type="hidden" name="hallId" value={hallId} />
                      <input type="hidden" name="ceremonyId" value={ceremonyId} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button type="submit" className="btn-secondary">
                        제외
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

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
