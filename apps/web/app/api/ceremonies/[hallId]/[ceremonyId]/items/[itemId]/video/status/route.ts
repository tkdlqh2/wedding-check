import { requireAdminSession } from "@/lib/auth-guard";
import { isValidUuid } from "@/lib/uuid";
import * as instanceRepo from "@/lib/db/repositories/checklist-instance";

// 템플릿 경로의 status 라우트와 동일한 역할 — blob 업로드의 onUploadCompleted 웹훅이
// 인스턴스 행(video_url)에 실제로 반영됐는지 클라이언트가 폴링으로 확인한다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ hallId: string; ceremonyId: string; itemId: string }> },
) {
  await requireAdminSession();

  const { hallId, ceremonyId, itemId } = await params;
  if (!isValidUuid(hallId) || !isValidUuid(ceremonyId) || !isValidUuid(itemId)) {
    return Response.json(
      { error: { code: "invalid_id", message: "잘못된 요청입니다" } },
      { status: 400 },
    );
  }

  const instance = await instanceRepo.findByCeremony(hallId, ceremonyId);
  if (!instance) {
    return Response.json({ videoUrl: null });
  }
  const items = await instanceRepo.listItems(hallId, instance.id);
  const item = items.find((row) => row.id === itemId);
  return Response.json({ videoUrl: item?.videoUrl ?? null });
}
