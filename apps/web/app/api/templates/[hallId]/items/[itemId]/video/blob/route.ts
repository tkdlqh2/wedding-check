import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import { saveDemoVideo, assertChecklistItemOwnedByHall } from "@/lib/services/demo-video";
import { ALLOWED_VIDEO_CONTENT_TYPE, MAX_VIDEO_SIZE_BYTES } from "@/lib/storage/video-storage";

// Story 1.4 AD-4 경로 — BLOB_READ_WRITE_TOKEN이 설정된 환경(프로덕션)에서만 클라이언트가
// 호출한다. 로컬에서는 Vercel Blob이 localhost에 도달할 수 없어 onUploadCompleted가
// 호출되지 않는다(ngrok 등 터널링 없이는) — 이 경로의 종단 검증은 배포 이후로 인계한다.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ hallId: string; itemId: string }> },
) {
  const { hallId, itemId } = await params;
  const body = (await request.json()) as HandleUploadBody;

  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (_pathname, clientPayload) => {
      // 토큰 발급 이전에 반드시 인가/소유권 검증을 통과해야 한다 — AD-4가 명시하는
      // "신뢰할 수 없는 클라이언트 입력으로 홀 격리를 우회"를 막는 지점이 바로 여기.
      await requireAdminSession();
      if (!isValidUuid(hallId) || !isValidUuid(itemId)) {
        throw new Error("잘못된 요청입니다");
      }
      await assertChecklistItemOwnedByHall(hallId, itemId);

      const fileSize =
        typeof clientPayload === "string"
          ? (JSON.parse(clientPayload) as { fileSize?: number }).fileSize
          : undefined;

      return {
        allowedContentTypes: [ALLOWED_VIDEO_CONTENT_TYPE],
        maximumSizeInBytes: MAX_VIDEO_SIZE_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ hallId, checklistItemId: itemId, fileSize }),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      if (!tokenPayload) return;
      const { hallId: payloadHallId, checklistItemId } = JSON.parse(tokenPayload) as {
        hallId: string;
        checklistItemId: string;
        fileSize?: number;
      };

      // 클라이언트가 clientPayload로 보고한 크기를 그대로 신뢰하지 않고, 업로드된 blob을
      // 서버가 직접 재조회해 검증된 크기를 저장한다(AD-4의 "클라이언트 보고값을 그대로
      // 믿지 않는다" 원칙을 크기 필드에도 동일 적용 — PutBlobResult에는 size가 없다).
      const verified = await head(blob.url);

      await saveDemoVideo(payloadHallId, checklistItemId, {
        videoUrl: blob.url,
        fileName: blob.pathname,
        fileSizeBytes: verified.size,
        storageProvider: "vercel-blob",
      });
      revalidatePath(`/admin/templates/${payloadHallId}`);
    },
  });

  return Response.json(jsonResponse);
}
