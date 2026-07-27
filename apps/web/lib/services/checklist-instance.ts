import * as instanceRepo from "../db/repositories/checklist-instance";
import * as templateItemRepo from "../db/repositories/template-item";
import * as ceremonyRepo from "../db/repositories/ceremony";
import type { Ceremony } from "../db/repositories/ceremony";
import type { ChecklistInstance, ChecklistInstanceItem } from "../db/repositories/checklist-instance";
import type { TemplateItem } from "../db/repositories/template-item";

export class ChecklistInstanceValidationError extends Error {}

export type CeremonyDetail = {
  ceremony: Ceremony;
  instance: ChecklistInstance;
  items: ChecklistInstanceItem[];
  candidates: TemplateItem[];
};

async function requireInstance(hallId: string, ceremonyId: string): Promise<ChecklistInstance> {
  const instance = await instanceRepo.findByCeremony(hallId, ceremonyId);
  if (!instance) {
    throw new ChecklistInstanceValidationError("존재하지 않는 예식입니다");
  }
  return instance;
}

export async function getCeremonyDetail(hallId: string, ceremonyId: string): Promise<CeremonyDetail> {
  const ceremony = await ceremonyRepo.findById(hallId, ceremonyId);
  if (!ceremony) {
    throw new ChecklistInstanceValidationError("존재하지 않는 예식입니다");
  }
  // 예식이 있으면 인스턴스는 반드시 함께 있어야 한다(Story 2.1의 원자적 생성 불변 조건) —
  // 없다면 데이터 정합성이 깨진 것이므로 사용자 오류가 아니라 시스템 오류로 취급한다.
  const instance = await instanceRepo.findByCeremony(hallId, ceremonyId);
  if (!instance) {
    throw new Error("예식에 연결된 체크리스트 인스턴스가 없습니다");
  }
  const [items, candidates] = await Promise.all([
    instanceRepo.listItems(hallId, instance.id),
    instanceRepo.listCandidateTemplateItems(hallId, instance.id),
  ]);
  return { ceremony, instance, items, candidates };
}

// AD-2 2-hop 재검증: instanceId만으로 항목 추가를 허용하지 않는다. instance와
// templateItem을 각각 신뢰된 hallId 파라미터로 스코프해서 조회하고, 둘 다 조회에
// 성공해야만 진행한다 — 두 조회 모두 통과해야 instance.hall_id === hallId ===
// template_item.hall_id가 성립한다(Story 1.4 assertTemplateItemOwnedByHall과 동일 원리).
export async function addInstanceItem(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
): Promise<ChecklistInstanceItem> {
  const instance = await requireInstance(hallId, ceremonyId);
  const templateItem = await templateItemRepo.findById(hallId, templateItemId);
  if (!templateItem) {
    throw new ChecklistInstanceValidationError("존재하지 않는 체크리스트 항목입니다");
  }
  return instanceRepo.addItem(hallId, instance.id, templateItem);
}

export async function removeInstanceItem(
  hallId: string,
  ceremonyId: string,
  itemId: string,
): Promise<void> {
  const instance = await requireInstance(hallId, ceremonyId);
  await instanceRepo.removeItem(hallId, instance.id, itemId);
}
