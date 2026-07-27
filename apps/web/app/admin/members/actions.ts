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
  // 코덱스 리뷰 P2: 필드가 없으면(구버전 폼 등) operator 기본값으로 두되, 조작된 요청이
  // "admin"/"operator" 외의 값(예: role=owner)을 보내면 조용히 operator로 흡수하지 않고
  // 명시적으로 거부한다.
  const roleInput = formData.get("role");
  let role: "operator" | "admin" = "operator";
  if (roleInput !== null) {
    if (roleInput !== "operator" && roleInput !== "admin") {
      return { error: "잘못된 역할입니다" };
    }
    role = roleInput;
  }
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
