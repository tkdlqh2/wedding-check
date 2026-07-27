import * as checklistItemRepo from "../db/repositories/checklist-item";
import * as templateItemRepo from "../db/repositories/template-item";
import type { ChecklistItem } from "../db/repositories/checklist-item";

export type { ChecklistItem };

export class ChecklistItemValidationError extends Error {}

function assertValidTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    // AC 4: 서버 사이드 검증이 실제 안전장치다(template.ts::assertValidStepName과 동일 원칙).
    throw new ChecklistItemValidationError("제목은 필수입니다");
  }
  return trimmed;
}

// AD-2 2-hop 재검증: templateItemId만으로 신뢰하지 않고, 그 단계가 실제 hallId 소속인지
// 서버가 직접 재확인한다(demo-video.ts::assertTemplateItemOwnedByHall과 동일 원리 —
// 다른 홀의 templateItemId로 체크리스트 항목을 심는 것을 차단).
async function assertTemplateItemOwnedByHall(hallId: string, templateItemId: string): Promise<void> {
  const step = await templateItemRepo.findById(hallId, templateItemId);
  if (!step) {
    throw new ChecklistItemValidationError("존재하지 않는 단계입니다");
  }
}

export async function createChecklistItem(
  hallId: string,
  templateItemId: string,
  input: { title: string; description?: string | null },
): Promise<ChecklistItem> {
  await assertTemplateItemOwnedByHall(hallId, templateItemId);
  const title = assertValidTitle(input.title);
  return checklistItemRepo.create(hallId, templateItemId, {
    title,
    description: input.description,
  });
}

export async function listChecklistItems(
  hallId: string,
  templateItemId: string,
): Promise<ChecklistItem[]> {
  return checklistItemRepo.findAllByTemplateItem(hallId, templateItemId);
}

export async function listChecklistItemsByTemplateItems(
  hallId: string,
  templateItemIds: string[],
): Promise<ChecklistItem[]> {
  return checklistItemRepo.findAllByTemplateItems(hallId, templateItemIds);
}

export async function updateChecklistItem(
  hallId: string,
  id: string,
  input: { title: string; description?: string | null },
): Promise<ChecklistItem> {
  const title = assertValidTitle(input.title);
  return checklistItemRepo.update(hallId, id, {
    title,
    description: input.description,
  });
}

export async function deleteChecklistItem(hallId: string, id: string): Promise<void> {
  await checklistItemRepo.remove(hallId, id);
}

export async function moveChecklistItem(
  hallId: string,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await checklistItemRepo.moveAdjacent(hallId, id, direction);
}
