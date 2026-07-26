"use server";

import { revalidatePath } from "next/cache";
import { createCeremony, CeremonyValidationError } from "@/lib/services/ceremony";
import { requireAdminSession } from "@/lib/auth-guard";

export type CeremonyFormState = { error?: string };

// datetime-local 입력값("YYYY-MM-DDTHH:mm")은 타임존 정보가 없다 — 이 제품은 국내 단일
// 웨딩홀 대상(KST 전용)이므로 입력값을 KST 벽시계 시각으로 해석해 정확한 UTC 인스턴트로
// 변환한다. 오프셋을 붙이지 않으면 Node 서버 프로세스의 로컬 타임존에 따라 결과가
// 달라지는 환경 의존적 버그가 생긴다(로컬 개발 환경이 우연히 KST라 숨겨질 수 있음).
function parseCeremonyAtInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createCeremonyAction(
  _prevState: CeremonyFormState,
  formData: FormData,
): Promise<CeremonyFormState> {
  await requireAdminSession();

  const hallId = String(formData.get("hallId") ?? "");
  const ceremonyAt = parseCeremonyAtInput(String(formData.get("ceremonyAt") ?? ""));
  if (!ceremonyAt) {
    return { error: "예식 일시를 입력해주세요" };
  }

  const contractConditions = {
    requiresOfficiant: formData.get("requiresOfficiant") === "on",
    hasAdditionalEvent: formData.get("hasAdditionalEvent") === "on",
  };

  try {
    await createCeremony({ hallId, ceremonyAt, contractConditions });
  } catch (err) {
    if (err instanceof CeremonyValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/ceremonies");
  return {};
}
