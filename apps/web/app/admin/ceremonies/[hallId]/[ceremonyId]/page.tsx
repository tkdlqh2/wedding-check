import { notFound } from "next/navigation";
import Link from "next/link";
import * as hallRepo from "@/lib/db/repositories/hall";
import { getCeremonyDetail, ChecklistInstanceValidationError } from "@/lib/services/checklist-instance";
import { listCeremonyAssignees } from "@/lib/services/ceremony";
import { listMembers } from "@/lib/services/member";
import { isBlobStorageConfigured } from "@/lib/storage/video-storage";
import { isValidUuid } from "@/lib/uuid";
import { InstanceItemRow } from "./instance-item-row";
import { InstanceItemForm } from "./instance-item-form";
import { InstanceStepHeader } from "./instance-step-header";
import { AssigneePicker } from "./assignee-picker";
import { groupItemsByStep } from "./group-by-step";
import { asCeremonyStatus, CEREMONY_STATUS_LABELS } from "@/lib/ceremony-status";
import "./ceremony-detail.css";

// prototype/js/screens/WeddingDetailScreen.js와 동일한 위계 — 시간+신랑신부가
// 제목(28px/700), 그 옆에 상태 배지, 그 아래 날짜·홀 메타 줄과 담당자 섹션(배정은
// 검색+체크박스 대화상자), 그 아래 "이 예식 전용" 안내 박스, 단계 카드 목록(템플릿
// 편집기와 동일 시각 언어), 맨 아래 새 단계 추가 점선 카드. 종료된 예식은 전체가
// 읽기 전용이다(editable = status !== 'done' 원칙, 서비스 레이어도 동일 가드).
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
  let allMembers;
  try {
    [detail, assignees, allMembers] = await Promise.all([
      getCeremonyDetail(hallId, ceremonyId),
      listCeremonyAssignees(hallId, ceremonyId),
      listMembers(),
    ]);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) {
      notFound();
    }
    throw err;
  }

  const { ceremony, items } = detail;
  const activeOperators = allMembers
    .filter((m) => m.role === "operator" && !m.banned)
    .map((m) => ({ id: m.id, name: m.name }));
  const stepGroups = groupItemsByStep(items);
  const status = asCeremonyStatus(ceremony.status);
  // 토큰 값 자체는 클라이언트로 넘기지 않고 boolean 결과만 prop으로 전달한다(템플릿
  // 편집기와 동일 — 예식 상세의 항목 수정 폼에서도 시연 영상 업로드를 지원한다).
  const blobEnabled = isBlobStorageConfigured();
  // 대표 지시(2026-07-27): 예정이 아닌 예식(진행중·종료)은 전체 읽기 전용.
  const readOnly = status !== "upcoming";

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
            "ceremony-detail-page__status-badge ceremony-detail-page__status-badge--" + status
          }
        >
          {CEREMONY_STATUS_LABELS[status]}
        </span>
      </div>
      <p className="ceremony-detail-page__meta">
        {dateFormatter.format(ceremony.ceremonyAt)} · {hall.name}
      </p>

      <AssigneePicker
        hallId={hallId}
        ceremonyId={ceremonyId}
        activeOperators={activeOperators}
        assignees={assignees}
        readOnly={readOnly}
      />

      {/* 프로토타입 24~28행 — 진행 전에는 warning 톤 "이 예식에만 반영" 안내, 진행중/종료
          후에는 중립 톤 읽기 전용 안내. */}
      {readOnly ? (
        <p className="ceremony-detail-page__notice ceremony-detail-page__notice--readonly">
          진행 중이거나 종료된 예식은 체크리스트를 수정할 수 없습니다 — 읽기 전용.
        </p>
      ) : (
        <p className="ceremony-detail-page__notice">
          이 예식 전용 체크리스트입니다 — 여기서의 수정은 <strong>이 예식에만</strong> 반영되고
          홀의 체크리스트 템플릿은 바뀌지 않습니다.
        </p>
      )}

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
            // title IS NULL 행은 "단계만 추가"의 자리표시 마커(0022) — 단계 카드의
            // 존재/이름/키만 제공하고 항목 목록에는 노출하지 않는다.
            const visibleItems = stepItems.filter(
              (item): item is (typeof stepItems)[number] & { title: string } =>
                item.title !== null,
            );
            return (
              <div key={groupKey} className="instance-step-card">
                <InstanceStepHeader
                  hallId={hallId}
                  ceremonyId={ceremonyId}
                  index={index}
                  stepName={first.stepName}
                  itemCount={visibleItems.length}
                  stepKey={stepKey}
                  isFirst={index === 0}
                  isLast={index === stepGroups.length - 1}
                  readOnly={readOnly}
                />
                {visibleItems.length === 0 ? (
                  <p className="instance-step-card__empty">
                    아직 체크 항목이 없습니다{readOnly ? "." : " — 아래에서 추가하세요."}
                  </p>
                ) : (
                  <ul className="instance-item-list">
                    {visibleItems.map((item, itemIndex) => (
                      <InstanceItemRow
                        key={item.id}
                        hallId={hallId}
                        ceremonyId={ceremonyId}
                        item={item}
                        blobEnabled={blobEnabled}
                        isFirst={itemIndex === 0}
                        isLast={itemIndex === visibleItems.length - 1}
                        readOnly={readOnly}
                      />
                    ))}
                  </ul>
                )}
                {/* 원본 템플릿 단계가 삭제된 orphan 항목(templateItemId/adHocGroupRootId
                    둘 다 null)은 "같은 단계에 추가"할 그룹 키가 없다 — 빠른 추가 폼을
                    숨긴다(항상 실패하는 폼을 노출하지 않음, Story 5.8 코덱스 리뷰 P2). */}
                {!readOnly && (first.templateItemId || first.adHocGroupRootId) && (
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

      {!readOnly && (
        <div className="ceremony-detail-page__new-step">
          <InstanceItemForm hallId={hallId} ceremonyId={ceremonyId} isNewStep />
        </div>
      )}
    </section>
  );
}
