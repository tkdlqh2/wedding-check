import { notFound } from "next/navigation";
import Link from "next/link";
import * as hallRepo from "@/lib/db/repositories/hall";
import { getCeremonyDetail, ChecklistInstanceValidationError } from "@/lib/services/checklist-instance";
import type { CandidateChecklistItem } from "@/lib/db/repositories/checklist-instance";
import { isValidUuid } from "@/lib/uuid";
import { removeInstanceItemAction } from "./actions";
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

// candidates는 이미 리포지토리에서 (단계 순서, 항목 순서)로 정렬되어 온다 — 순서를
// 유지한 채 연속된 같은 단계 id끼리만 묶는 순차 그룹핑이면 충분하다(재정렬 불필요).
// 코덱스 리뷰 3차 P2: stepName은 유일함이 보장되지 않는다(관리자가 같은 이름의 단계를
// 두 번 만들 수 있음) — candidate.templateItemId(실제 단계 FK, 라이브 데이터라 항상
// 존재)로 묶어 서로 다른 두 단계가 이름이 같다는 이유로 하나로 합쳐지지 않게 한다.
function groupCandidatesByStep(
  candidates: CandidateChecklistItem[],
): [string, CandidateChecklistItem[]][] {
  const groups: [string, CandidateChecklistItem[]][] = [];
  for (const candidate of candidates) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0] === candidate.templateItemId) {
      lastGroup[1].push(candidate);
    } else {
      groups.push([candidate.templateItemId, [candidate]]);
    }
  }
  return groups;
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
  try {
    detail = await getCeremonyDetail(hallId, ceremonyId);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) {
      notFound();
    }
    throw err;
  }

  const { ceremony, items, candidates } = detail;

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

      <h2>포함된 항목 ({items.length}개)</h2>
      {items.length === 0 ? (
        <p className="ceremony-detail-page__empty">포함된 항목이 없습니다.</p>
      ) : (
        <ul className="instance-item-list">
          {items.map((item) => (
            <li key={item.id} className="instance-item-card">
              <span className="instance-item-card__name">
                {item.stepName} · {item.title}
              </span>
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
