import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth-guard";
import * as hallRepo from "@/lib/db/repositories/hall";
import { listTemplateItems } from "@/lib/services/template";
import { listChecklistItemsByTemplateItems } from "@/lib/services/checklist-item";
import { listDemoVideosByItems } from "@/lib/services/demo-video";
import { isBlobStorageConfigured } from "@/lib/storage/video-storage";
import { isValidUuid } from "@/lib/uuid";
import { TemplateItemForm } from "./template-item-form";
import { TemplateItemRow } from "./template-item-row";
import "./templates.css";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  // 레이아웃 가드만으로는 soft navigation을 막지 못한다(lib/auth-guard.ts 주석, AD-3).
  await requireAdminPage();

  const { hallId } = await params;
  // hallId는 uuid 컬럼과 직접 비교되므로, 형식이 아예 아니면 쿼리를 보내기 전에 걸러야
  // "invalid input syntax for type uuid" DB 에러가 500으로 새는 것을 막을 수 있다
  // (코덱스 리뷰 6차 P2 반영).
  if (!isValidUuid(hallId)) {
    notFound();
  }

  const hall = await hallRepo.findById(hallId);
  if (!hall || !hall.isActive) {
    notFound();
  }

  const items = await listTemplateItems(hallId);
  const templateItemIds = items.map((item) => item.id);
  // Story 5.5: 단계마다 개별 조회하는 N+1을 피하기 위해 모든 단계의 체크리스트 항목을
  // 한 번에 배치 조회(listDemoVideosByItems가 이미 쓰던 것과 동일한 패턴)한다.
  const checklistItems = await listChecklistItemsByTemplateItems(hallId, templateItemIds);
  const checklistItemsByTemplateItemId = new Map<
    string,
    { id: string; title: string; description: string | null }[]
  >();
  for (const templateItemId of templateItemIds) {
    checklistItemsByTemplateItemId.set(templateItemId, []);
  }
  for (const checklistItem of checklistItems) {
    checklistItemsByTemplateItemId.get(checklistItem.templateItemId)?.push(checklistItem);
  }

  const demoVideos = await listDemoVideosByItems(
    hallId,
    checklistItems.map((checklistItem) => checklistItem.id),
  );
  const videoByChecklistItemId = new Map(demoVideos.map((video) => [video.checklistItemId, video]));
  // 토큰 값 자체는 클라이언트로 넘기지 않고 boolean 결과만 prop으로 전달한다.
  const blobEnabled = isBlobStorageConfigured();

  return (
    <section className="templates-page">
      <a href="/admin/halls" className="templates-page__back">
        ← 홀 목록
      </a>
      <h1>체크리스트 템플릿</h1>
      <p className="templates-page__subtitle">
        {hall.name} · 단계마다 복수의 체크 항목을 등록합니다. 변경은 이후 생성되는 예식부터 반영됩니다.
      </p>

      {items.length === 0 ? (
        <p className="templates-page__empty">
          아직 등록된 단계가 없어요. 아래에서 첫 단계를 등록해보세요.
        </p>
      ) : (
        <ul className="template-item-list">
          {items.map((item, index) => (
            <TemplateItemRow
              key={item.id}
              hallId={hallId}
              index={index}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              checklistItems={checklistItemsByTemplateItemId.get(item.id) ?? []}
              demoVideosByChecklistItemId={videoByChecklistItemId}
              blobEnabled={blobEnabled}
            />
          ))}
        </ul>
      )}

      <div className="templates-page__add-step">
        <TemplateItemForm hallId={hallId} />
      </div>
    </section>
  );
}
