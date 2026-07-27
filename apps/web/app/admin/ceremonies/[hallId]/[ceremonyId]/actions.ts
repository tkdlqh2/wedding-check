"use server";

import { revalidatePath } from "next/cache";
import {
  removeInstanceItem,
  addAdHocInstanceItem,
  updateInstanceItem,
  renameInstanceStep,
  deleteInstanceStep,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";
import type { StepGroupKey } from "@/lib/db/repositories/checklist-instance";
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

// 단계 그룹 키 파싱 — group-by-step.ts 그룹핑과 동일한 3단 위계(템플릿 단계 →
// ad-hoc 단계 → orphan 단일 항목). 셋 다 없거나 형식이 틀리면 null.
function parseStepGroupKey(formData: FormData): StepGroupKey | null {
  const templateItemId = String(formData.get("templateItemId") ?? "");
  const groupRootId = String(formData.get("groupRootId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (templateItemId) return isValidUuid(templateItemId) ? { templateItemId } : null;
  if (groupRootId) return isValidUuid(groupRootId) ? { groupRootId } : null;
  if (itemId) return isValidUuid(itemId) ? { itemId } : null;
  return null;
}

// 프로토타입 WeddingDetailScreen.js 단계 헤더의 "수정" — 이 예식 스냅샷의 단계 이름만
// 바꾼다(템플릿 무관).
export async function renameInstanceStepAction(
  _prevState: InstanceItemFormState,
  formData: FormData,
): Promise<InstanceItemFormState> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const key = parseStepGroupKey(formData);
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !key) {
    return { error: "잘못된 요청입니다" };
  }
  const stepName = String(formData.get("stepName") ?? "");
  try {
    await renameInstanceStep(hallId, ceremonyId, key, stepName);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
  return {};
}

// 프로토타입의 "단계 삭제" — 그 단계에 속한 이 예식의 항목 전체를 삭제한다.
export async function deleteInstanceStepAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyId = String(formData.get("ceremonyId") ?? "");
  const key = parseStepGroupKey(formData);
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !key) return;
  try {
    await deleteInstanceStep(hallId, ceremonyId, key);
  } catch (err) {
    // 이미 삭제된 단계의 재제출 등 — 삭제 목적은 달성된 상태라 조용히 무시한다.
    if (!(err instanceof ChecklistInstanceValidationError)) throw err;
  }
  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
}
