"use server";

import { revalidatePath } from "next/cache";
import {
  createTemplateItem,
  updateTemplateItem,
  deleteTemplateItem,
  moveTemplateItem,
  TemplateItemValidationError,
} from "@/lib/services/template";
import { requireAdminSession } from "@/lib/auth-guard";

export type TemplateItemFormState = { error?: string };

export async function createTemplateItemAction(
  _prevState: TemplateItemFormState,
  formData: FormData,
): Promise<TemplateItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const stepName = String(formData.get("stepName") ?? "");
  const description = String(formData.get("description") ?? "");
  try {
    await createTemplateItem(hallId, { stepName, description: description || null });
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
  const description = String(formData.get("description") ?? "");
  try {
    await updateTemplateItem(hallId, id, { stepName, description: description || null });
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
  await deleteTemplateItem(hallId, id);
  revalidatePath(`/admin/templates/${hallId}`);
}

export async function moveTemplateItemAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") return;
  await moveTemplateItem(hallId, id, direction);
  revalidatePath(`/admin/templates/${hallId}`);
}
