"use server";

import { revalidatePath } from "next/cache";
import { createHall, updateHall, deactivateHall, HallValidationError } from "@/lib/services/hall";
import { requireAdminSession } from "@/lib/auth-guard";

export type HallFormState = { error?: string };

export async function createHallAction(
  _prevState: HallFormState,
  formData: FormData,
): Promise<HallFormState> {
  await requireAdminSession();
  const name = String(formData.get("name") ?? "");
  try {
    await createHall({ name });
  } catch (err) {
    if (err instanceof HallValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/halls");
  return {};
}

export async function updateHallAction(
  _prevState: HallFormState,
  formData: FormData,
): Promise<HallFormState> {
  await requireAdminSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  try {
    await updateHall(id, { name });
  } catch (err) {
    if (err instanceof HallValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/halls");
  return {};
}

export async function deactivateHallAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = String(formData.get("id") ?? "");
  await deactivateHall(id);
  revalidatePath("/admin/halls");
}
