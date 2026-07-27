"use server";

import { revalidatePath } from "next/cache";
import { createCeremony, CeremonyValidationError } from "@/lib/services/ceremony";
import { requireAdminSession } from "@/lib/auth-guard";

export type CeremonyFormState = { error?: string; errorField?: "groomName" | "brideName" };

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
  // Story 5.8 AC 1: 날짜/시각 입력란이 분리됐다 — parseCeremonyAtInput의 KST 오프셋
  // 파싱 로직(9~17행)은 그대로 두고, 두 값을 datetime-local과 동일한 형태
  // ("YYYY-MM-DDTHH:mm")로 합쳐서 넘긴다.
  const ceremonyDate = String(formData.get("ceremonyDate") ?? "");
  const ceremonyTime = String(formData.get("ceremonyTime") ?? "");
  const ceremonyAt =
    ceremonyDate && ceremonyTime
      ? parseCeremonyAtInput(`${ceremonyDate}T${ceremonyTime}`)
      : null;
  if (!ceremonyAt) {
    return { error: "예식 일시를 입력해주세요" };
  }

  const groomName = String(formData.get("groomName") ?? "").trim();
  const brideName = String(formData.get("brideName") ?? "").trim();
  if (!groomName) {
    return { error: "신랑 이름을 입력해주세요", errorField: "groomName" };
  }
  if (!brideName) {
    return { error: "신부 이름을 입력해주세요", errorField: "brideName" };
  }

  const contractConditions = {
    requiresOfficiant: formData.get("requiresOfficiant") === "on",
    hasAdditionalEvent: formData.get("hasAdditionalEvent") === "on",
  };

  try {
    await createCeremony({ hallId, ceremonyAt, contractConditions, groomName, brideName });
  } catch (err) {
    if (err instanceof CeremonyValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/ceremonies");
  return {};
}
