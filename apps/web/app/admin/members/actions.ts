"use server";

import { revalidatePath } from "next/cache";
import {
  createMember,
  deactivateMember,
  reactivateMember,
  MemberValidationError,
} from "@/lib/services/member";
import { requireAdminSession } from "@/lib/auth-guard";

export type MemberFormState = { error?: string };

export async function createMemberAction(
  _prevState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  await requireAdminSession();
  const name = String(formData.get("name") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await createMember({ name, phoneNumber, password });
  } catch (err) {
    if (err instanceof MemberValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/members");
  return {};
}

export async function deactivateMemberAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = String(formData.get("id") ?? "");
  await deactivateMember(id);
  revalidatePath("/admin/members");
}

export async function reactivateMemberAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = String(formData.get("id") ?? "");
  await reactivateMember(id);
  revalidatePath("/admin/members");
}
