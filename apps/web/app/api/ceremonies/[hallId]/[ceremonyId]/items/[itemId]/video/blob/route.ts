import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import {
  assertInstanceItemEditable,
  setInstanceItemVideo,
} from "@/lib/services/checklist-instance";
import { ALLOWED_VIDEO_CONTENT_TYPE, MAX_VIDEO_SIZE_BYTES } from "@/lib/storage/video-storage";

// 대표 지시(2026-07-28): 예식 상세에서 올린 시연 영상은 이 예식에만 반영된다 —
// 템플릿 경로(/api/templates/.../video/blob)와 동일한 AD-4 구조이되, 저장처가 홀
// 공용 demo_videos가 아니라 인스턴스 항목 행(checklist_instance_items.video_url)이다.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string; itemId: string }> },
) {
  const { hallId, ceremonyId, itemId } = await params;
  const body = (await request.json()) as HandleUploadBody;

  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (_pathname, clientPayload) => {
      // 토큰 발급 이전에 인가/소유권/편집 가능 상태 검증(AD-4 원칙 그대로).
      await requireAdminSession();
      if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !isValidUuid(itemId)) {
        throw new Error("잘못된 요청입니다");
      }
      await assertInstanceItemEditable(hallId, ceremonyId, itemId);

      const fileSize =
        typeof clientPayload === "string"
          ? (JSON.parse(clientPayload) as { fileSize?: number }).fileSize
          : undefined;

      return {
        allowedContentTypes: [ALLOWED_VIDEO_CONTENT_TYPE],
        maximumSizeInBytes: MAX_VIDEO_SIZE_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ hallId, ceremonyId, itemId, fileSize }),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      if (!tokenPayload) return;
      const {
        hallId: payloadHallId,
        ceremonyId: payloadCeremonyId,
        itemId: payloadItemId,
      } = JSON.parse(tokenPayload) as {
        hallId: string;
        ceremonyId: string;
        itemId: string;
        fileSize?: number;
      };

      await setInstanceItemVideo(payloadHallId, payloadCeremonyId, payloadItemId, blob.url);
      revalidatePath(`/admin/ceremonies/${payloadHallId}/${payloadCeremonyId}`);
    },
  });

  return Response.json(jsonResponse);
}
