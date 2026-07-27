"use server";

import { revalidatePath } from "next/cache";
import {
  addInstanceItem,
  removeInstanceItem,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";
import { assignOperator, CeremonyValidationError } from "@/lib/services/ceremony";
import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";

export type InstanceItemFormState = { error?: string };

export async function addInstanceItemAction(
  _prevState: InstanceItemFormState,
  formData: FormData,
): Promise<InstanceItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const checklistItemId = String(formData.get("checklistItemId") ?? "");
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !isValidUuid(checklistItemId)) {
    return { error: "잘못된 요청입니다" };
  }
  try {
    await addInstanceItem(hallId, ceremonyId, checklistItemId);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
  return {};
}

export async function removeInstanceItemAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !isValidUuid(itemId)) return;
  await removeInstanceItem(hallId, ceremonyId, itemId);
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
}

// Story 5.8 AC 7: operatorId는 better-auth user.id(uuid 형식이 아닌 text)라
// isValidUuid로 검증하지 않는다 — assignOperator 서비스의 memberRepo.findById
// 존재/역할/활성 여부 확인이 실질적인 검증 계층이다(Story 5.7 setMemberRoleAction과
// 동일한 원칙 — 존재 확인을 서비스에 위임).
export async function assignOperatorAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const operatorIdRaw = String(formData.get("operatorId") ?? "");
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId)) return;
  try {
    await assignOperator(hallId, ceremonyId, operatorIdRaw || null);
  } catch (err) {
    if (err instanceof CeremonyValidationError) return;
    throw err;
  }
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
  revalidatePath("/admin/ceremonies");
}
