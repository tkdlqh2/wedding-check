"use server";

import { revalidatePath } from "next/cache";
import {
  createTemplateItem,
  updateTemplateItem,
  deleteTemplateItem,
  moveTemplateItem,
  TemplateItemValidationError,
} from "@/lib/services/template";
import {
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  moveChecklistItem,
  ChecklistItemValidationError,
} from "@/lib/services/checklist-item";
import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import { readContractConditions } from "./contract-conditions";

export type TemplateItemFormState = { error?: string };
export type ChecklistItemFormState = { error?: string };

// hallId/id는 결국 uuid 컬럼과 비교되므로, 형식이 아닌 값이 여기를 통과하면 DB가
// "invalid input syntax for type uuid"로 죽어 500이 노출된다 — 재전송된 요청 등으로
// 조작된 값이 들어와도 여기서 조용히 걸러지게 한다(코덱스 리뷰 6차 P2 반영).
function isMalformedId(...ids: string[]): boolean {
  return ids.some((id) => !isValidUuid(id));
}

export async function createTemplateItemAction(
  _prevState: TemplateItemFormState,
  formData: FormData,
): Promise<TemplateItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const stepName = String(formData.get("stepName") ?? "");
  if (isMalformedId(hallId)) return { error: "잘못된 요청입니다" };
  try {
    await createTemplateItem(hallId, {
      stepName,
      applicableContractConditions: readContractConditions(formData),
    });
  } catch (err) {
    if (err instanceof TemplateItemValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/templates/${hallId}`);
  return {};
}

export async function updateTemplateItemAction(
  _prevState: TemplateItemFormState,
  formData: FormData,
): Promise<TemplateItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const id = String(formData.get("id") ?? "");
  const stepName = String(formData.get("stepName") ?? "");
  if (isMalformedId(hallId, id)) return { error: "잘못된 요청입니다" };
  try {
    await updateTemplateItem(hallId, id, {
      stepName,
      applicableContractConditions: readContractConditions(formData),
    });
  } catch (err) {
    if (err instanceof TemplateItemValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/templates/${hallId}`);
  return {};
}

export async function deleteTemplateItemAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (isMalformedId(hallId, id)) return;
  await deleteTemplateItem(hallId, id);
  revalidatePath(`/admin/templates/${hallId}`);
}

export async function moveTemplateItemAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return;
  if (isMalformedId(hallId, id)) return;
  await moveTemplateItem(hallId, id, direction);
  revalidatePath(`/admin/templates/${hallId}`);
}

// Story 5.5: 단계 아래 체크리스트 항목(제목 필수, 설명 선택) CRUD/재정렬 — 위 단계
// 액션들과 동일한 isMalformedId 가드 패턴을 그대로 따른다.
export async function createChecklistItemAction(
  _prevState: ChecklistItemFormState,
  formData: FormData,
): Promise<ChecklistItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const templateItemId = String(formData.get("templateItemId") ?? "");
  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  if (isMalformedId(hallId, templateItemId)) return { error: "잘못된 요청입니다" };
  try {
    await createChecklistItem(hallId, templateItemId, {
      title,
      description: description || null,
    });
  } catch (err) {
    if (err instanceof ChecklistItemValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/templates/${hallId}`);
  return {};
}

export async function updateChecklistItemAction(
  _prevState: ChecklistItemFormState,
  formData: FormData,
): Promise<ChecklistItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  if (isMalformedId(hallId, id)) return { error: "잘못된 요청입니다" };
  try {
    await updateChecklistItem(hallId, id, {
      title,
      description: description || null,
    });
  } catch (err) {
    if (err instanceof ChecklistItemValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/templates/${hallId}`);
  return {};
}

export async function deleteChecklistItemAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (isMalformedId(hallId, id)) return;
  await deleteChecklistItem(hallId, id);
  revalidatePath(`/admin/templates/${hallId}`);
}

export async function moveChecklistItemAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return;
  if (isMalformedId(hallId, id)) return;
  await moveChecklistItem(hallId, id, direction);
  revalidatePath(`/admin/templates/${hallId}`);
}
