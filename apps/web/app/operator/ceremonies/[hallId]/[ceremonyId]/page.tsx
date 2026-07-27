import { notFound } from "next/navigation";
import Link from "next/link";
import * as hallRepo from "@/lib/db/repositories/hall";
import {
  getOperatorInstanceView,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";
import { isValidUuid } from "@/lib/uuid";
import { ChecklistInstanceView } from "./checklist-instance-view";
import "./checklist-instance-view.css";

// admin/ceremonies/[hallId]/[ceremonyId]/page.tsx와 동일한 가드 패턴(Story 2.2).
export default async function OperatorCeremonyPage({
  params,
}: {
  params: Promise<{ hallId: string; ceremonyId: string }>;
}) {
  const { hallId, ceremonyId } = await params;
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId)) {
    notFound();
  }

  const hall = await hallRepo.findById(hallId);
  if (!hall || !hall.isActive) {
    notFound();
  }

  let view;
  try {
    view = await getOperatorInstanceView(hallId, ceremonyId);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) {
      notFound();
    }
    throw err;
  }

  return (
    <section className="operator-instance-page">
      <Link href="/operator" className="operator-instance-page__back">
        ← 담당 예식 일정
      </Link>
      <ChecklistInstanceView
        hallId={hallId}
        ceremonyId={ceremonyId}
        hallName={hall.name}
        initialCeremony={{
          id: view.ceremony.id,
          ceremonyAt: view.ceremony.ceremonyAt.toISOString(),
          contractConditions: view.ceremony.contractConditions,
          groomName: view.ceremony.groomName,
          brideName: view.ceremony.brideName,
        }}
        initialItems={view.items.map((item) => ({
          id: item.id,
          templateItemId: item.templateItemId,
          adHocGroupRootId: item.adHocGroupRootId,
          stepName: item.stepName,
          title: item.title,
          description: item.description,
          sortOrder: item.sortOrder,
          videoUrl: item.videoUrl,
        }))}
      />
    </section>
  );
}
