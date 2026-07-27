import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import {
  saveDemoVideo,
  assertChecklistItemOwnedByHall,
  DemoVideoValidationError,
} from "@/lib/services/demo-video";
import { saveLocalVideoFile } from "@/lib/storage/local-video-store";
import {
  ALLOWED_VIDEO_CONTENT_TYPE,
  MAX_VIDEO_SIZE_BYTES,
  isBlobStorageConfigured,
} from "@/lib/storage/video-storage";

// Story 1.4 로컬 폴백 업로드 경로 — BLOB_READ_WRITE_TOKEN이 없을 때만 클라이언트가
// 호출한다. Route Handler는 Server Action(기본 1MB 바디 제한)과 달리 기본 바디 크기
// 제한이 없고, 로컬 next dev는 Vercel Functions의 4.5MB 제한(AD-4가 우회하려는 대상)도
// 적용받지 않으므로 이 경로는 AD-4가 막으려는 문제 자체가 로컬에서는 발생하지 않는다.
// Story 5.5: URL의 [itemId]는 이제 "단계 id"가 아니라 "체크리스트 항목 id"를 가리킨다
// (경로 자체는 이미 범용 이름이라 바꾸지 않았다).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hallId: string; itemId: string }> },
) {
  await requireAdminSession();

  // Blob 스토리지가 설정된 환경(프로덕션)에서는 이 경로를 절대 허용하지 않는다 —
  // 서버리스 배포에서 로컬 파일시스템은 인스턴스 간 공유/영속되지 않아 저장 직후
  // URL이 깨진다. 클라이언트는 blobEnabled=true일 때 이 경로를 호출하지 않지만,
  // URL을 직접 두드리는 시도까지 서버가 차단해야 한다(코덱스 리뷰 P1 반영).
  if (isBlobStorageConfigured()) {
    return Response.json(
      { error: { code: "local_upload_disabled", message: "이 환경에서는 사용할 수 없는 업로드 경로입니다" } },
      { status: 404 },
    );
  }

  const { hallId, itemId } = await params;
  if (!isValidUuid(hallId) || !isValidUuid(itemId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  try {
    await assertChecklistItemOwnedByHall(hallId, itemId);
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
