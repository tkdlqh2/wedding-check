import { notFound } from "next/navigation";
import * as hallRepo from "@/lib/db/repositories/hall";
import { listTemplateItems } from "@/lib/services/template";
import { TemplateItemForm } from "./template-item-form";
import { TemplateItemRow } from "./template-item-row";
import "./templates.css";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = await params;
  const hall = await hallRepo.findById(hallId);
  if (!hall || !hall.isActive) {
    notFound();
  }

  const items = await listTemplateItems(hallId);

  return (
    <section className="templates-page">
      <a href="/admin/halls" className="templates-page__back">
        ← 홀 목록
      </a>
      <h1>{hall.name} 체크리스트 항목</h1>

      <div className="templates-page__form-card">
        <TemplateItemForm hallId={hallId} />
      </div>

      {items.length === 0 ? (
        <p className="templates-page__empty">
          아직 등록된 체크리스트 항목이 없어요. 위에서 첫 항목을 등록해보세요.
        </p>
      ) : (
        <ul className="template-item-list">
          {items.map((item, index) => (
            <TemplateItemRow
              key={item.id}
              hallId={hallId}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
