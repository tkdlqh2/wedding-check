"use server";

import { revalidatePath } from "next/cache";
import {
  addInstanceItem,
  removeInstanceItem,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";
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
