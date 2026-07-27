"use server";

import { revalidatePath } from "next/cache";
import {
  createMember,
  deactivateMember,
  reactivateMember,
  setMemberRole,
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
  const roleInput = formData.get("role");
  const role = roleInput === "admin" ? "admin" : "operator";
  try {
    await createMember({ name, phoneNumber, password, role });
  } catch (err) {
    if (err instanceof MemberValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/members");
  return {};
}

export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  await setMemberRole(session.user.id, id, role);
  revalidatePath("/admin/members");
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
