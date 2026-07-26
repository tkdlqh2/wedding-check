import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import {
  saveDemoVideo,
  assertTemplateItemOwnedByHall,
  DemoVideoValidationError,
} from "@/lib/services/demo-video";
import { saveLocalVideoFile } from "@/lib/storage/local-video-store";
import {
  ALLOWED_VIDEO_CONTENT_TYPE,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/storage/video-storage";

// Story 1.4 로컬 폴백 업로드 경로 — BLOB_READ_WRITE_TOKEN이 없을 때만 클라이언트가
// 호출한다. Route Handler는 Server Action(기본 1MB 바디 제한)과 달리 기본 바디 크기
// 제한이 없고, 로컬 next dev는 Vercel Functions의 4.5MB 제한(AD-4가 우회하려는 대상)도
// 적용받지 않으므로 이 경로는 AD-4가 막으려는 문제 자체가 로컬에서는 발생하지 않는다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hallId: string; itemId: string }> },
) {
  await requireAdminSession();

  const { hallId, itemId } = await params;
  if (!isValidUuid(hallId) || !isValidUuid(itemId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    await assertTemplateItemOwnedByHall(hallId, itemId);
  } catch (err) {
    if (err instanceof DemoVideoValidationError) {
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

  // 서버 사이드 검증이 실제 안전장치다 — 클라이언트 검증만으로는 불충분(AC 3).
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

  const { url, fileName, sizeBytes } = await saveLocalVideoFile(file);
  await saveDemoVideo(hallId, itemId, {
    videoUrl: url,
    fileName,
    fileSizeBytes: sizeBytes,
    storageProvider: "local",
  });

  revalidatePath(`/admin/templates/${hallId}`);
  return Response.json({ ok: true });
}
