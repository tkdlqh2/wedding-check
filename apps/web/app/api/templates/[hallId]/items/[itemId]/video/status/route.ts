import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import { listDemoVideosByItems } from "@/lib/services/demo-video";

// Story 1.4 코덱스 리뷰 3차(P2) 반영 — blob 경로에서 onUploadCompleted 웹훅이 DB에
// 반영됐는지 클라이언트가 확인할 수 있는 유일한 방법. 고정 시간만큼 새로고침하고
// 끝내는 대신, 이 엔드포인트를 폴링해 실제로 반영된 시점에만 새로고침한다.
export async function GET(
  request: Request,
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

  const [video] = await listDemoVideosByItems(hallId, [itemId]);
  return Response.json({ videoUrl: video?.videoUrl ?? null });
}
