"use server";

import { revalidatePath } from "next/cache";
import {
  removeInstanceItem,
  addAdHocInstanceItem,
  updateInstanceItem,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";
import { assignOperator, CeremonyValidationError } from "@/lib/services/ceremony";
import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";

export type InstanceItemFormState = { error?: string };

export async function removeInstanceItemAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !isValidUuid(itemId)) return;
  await removeInstanceItem(hallId, ceremonyId, itemId);
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
}

// Story 5.8: "이 예식에만" 자유 서술 항목 추가 — 기존 단계(템플릿 단계 또는 이미 만든
// ad-hoc 단계)에 추가할 때는 templateItemId 또는 groupRootId 중 하나만 채워 넘긴다.
// 완전히 새 단계를 만들 때는 둘 다 비워서 넘긴다(stepName만 사용).
export async function addAdHocItemAction(
  _prevState: InstanceItemFormState,
  formData: FormData,
): Promise<InstanceItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const templateItemIdRaw = String(formData.get("templateItemId") ?? "");
  const groupRootIdRaw = String(formData.get("groupRootId") ?? "");
  if (
    !isValidUuid(hallId) ||
    !isValidUuid(ceremonyId) ||
    (templateItemIdRaw && !isValidUuid(templateItemIdRaw)) ||
    (groupRootIdRaw && !isValidUuid(groupRootIdRaw))
  ) {
    return { error: "잘못된 요청입니다" };
  }
  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  const stepName = String(formData.get("stepName") ?? "");
  try {
    await addAdHocInstanceItem(hallId, ceremonyId, {
      title,
      description: description || null,
      stepName,
      templateItemId: templateItemIdRaw || null,
      groupRootId: groupRootIdRaw || null,
    });
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
  return {};
}

export async function updateInstanceItemAction(
  _prevState: InstanceItemFormState,
  formData: FormData,
): Promise<InstanceItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !isValidUuid(itemId)) {
    return { error: "잘못된 요청입니다" };
  }
  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  try {
    await updateInstanceItem(hallId, ceremonyId, itemId, { title, description: description || null });
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
  return {};
}

export type AssignOperatorFormState = { error?: string };

// Story 5.8 AC 7: operatorId는 better-auth user.id(uuid 형식이 아닌 text)라
// isValidUuid로 검증하지 않는다 — assignOperator 서비스의 memberRepo.findById
// 존재/역할/활성 여부 확인이 실질적인 검증 계층이다(Story 5.7 setMemberRoleAction과
// 동일한 원칙 — 존재 확인을 서비스에 위임).
//
// 코덱스 리뷰 P2: 화면 렌더링과 제출 사이에 그 오퍼레이터가 비활성화/역할 변경되면
// assignOperator가 거부하는데, 예전엔 이 실패를 조용히 삼켜 대화상자가 성공한 것처럼
// 닫혔다 — useActionState로 에러를 반환해 대화상자가 계속 열려 있고 오류가 보이게 한다.
export async function assignOperatorAction(
  _prevState: AssignOperatorFormState,
  formData: FormData,
): Promise<AssignOperatorFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const operatorIdRaw = String(formData.get("operatorId") ?? "");
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId)) {
    return { error: "잘못된 요청입니다" };
  }
  try {
    await assignOperator(hallId, ceremonyId, operatorIdRaw || null);
  } catch (err) {
    if (err instanceof CeremonyValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
  revalidatePath("/admin/ceremonies");
  return {};
}
