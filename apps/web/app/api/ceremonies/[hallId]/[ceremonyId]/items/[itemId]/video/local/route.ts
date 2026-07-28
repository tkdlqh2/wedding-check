import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import {
  assertInstanceItemEditable,
  setInstanceItemVideo,
  ChecklistInstanceValidationError,
} from "@/lib/services/checklist-instance";
import { saveLocalVideoFile } from "@/lib/storage/local-video-store";
import {
  ALLOWED_VIDEO_CONTENT_TYPE,
  MAX_VIDEO_SIZE_BYTES,
  isBlobStorageConfigured,
} from "@/lib/storage/video-storage";

// 대표 지시(2026-07-28): 예식 전용 시연 영상의 로컬 폴백 업로드 —
// /api/templates/.../video/local과 동일한 구조/검증이되 저장처만 인스턴스 항목이다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string; itemId: string }> },
) {
  await requireAdminSession();

  // Blob 스토리지가 설정된 환경(프로덕션)에서는 로컬 파일시스템 경로를 차단한다
  // (템플릿 로컬 경로의 코덱스 리뷰 P1과 동일 근거).
  if (isBlobStorageConfigured()) {
    return Response.json(
      { error: { code: "local_upload_disabled", message: "이 환경에서는 사용할 수 없는 업로드 경로입니다" } },
      { status: 404 },
    );
  }

  const { hallId, ceremonyId, itemId } = await params;
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !isValidUuid(itemId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    await assertInstanceItemEditable(hallId, ceremonyId, itemId);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) {
      return Response.json(
        { error: { code: "not_found", message: err.message } },
        { status: 404 },
      );
    }
    throw err;
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: { code: "missing_file", message: "업로드할 파일이 없습니다" } },
      { status: 400 },
    );
  }

  // 서버 사이드 검증이 실제 안전장치다 — 클라이언트 검증만으로는 불충분.
  if (file.type !== ALLOWED_VIDEO_CONTENT_TYPE) {
    return Response.json(
      { error: { code: "invalid_type", message: "mp4 형식의 영상만 업로드할 수 있어요" } },
      { status: 400 },
    );
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return Response.json(
      { error: { code: "too_large", message: "500MB 이하의 파일만 업로드할 수 있어요" } },
      { status: 400 },
    );
  }

  const { url } = await saveLocalVideoFile(file);
  try {
    await setInstanceItemVideo(hallId, ceremonyId, itemId, url);
  } catch (err) {
    if (err instanceof ChecklistInstanceValidationError) {
      return Response.json(
        { error: { code: "not_found", message: err.message } },
        { status: 404 },
      );
    }
    throw err;
  }

  revalidatePath(`/admin/ceremonies/${hallId}/${ceremonyId}`);
  return Response.json({ ok: true });
}
