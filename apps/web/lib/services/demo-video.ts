import * as demoVideoRepo from "../db/repositories/demo-video";
import * as templateItemRepo from "../db/repositories/template-item";
import type { DemoVideo, DemoVideoInput } from "../db/repositories/demo-video";

export type { DemoVideo, DemoVideoInput };

export class DemoVideoValidationError extends Error {}

// AD-2 2-hop 재검증: templateItemId만으로 신뢰하지 않고, 그 항목이 실제 hallId 소속인지
// 서버가 직접 재확인한다(다른 홀의 templateItemId를 넣어 그 홀 항목에 영상을 심는 것을 차단).
async function assertTemplateItemOwnedByHall(
  hallId: string,
  templateItemId: string,
): Promise<void> {
  const item = await templateItemRepo.findById(hallId, templateItemId);
  if (!item) {
    throw new DemoVideoValidationError("존재하지 않는 체크리스트 항목입니다");
  }
}

// 파일 형식/크기 서버 검증은 이 함수의 책임이 아니다 — local/blob 두 업로드 경로가
// 저장 방식이 근본적으로 다르므로 각 Route Handler가 자신의 경로에 맞는 방식으로
// 검증한다. 이 함수는 이미 검증·저장 완료된 파일의 메타데이터를 DB에 기록만 한다.
export async function saveDemoVideo(
  hallId: string,
  templateItemId: string,
  input: DemoVideoInput,
): Promise<DemoVideo> {
  await assertTemplateItemOwnedByHall(hallId, templateItemId);
  return demoVideoRepo.upsertForTemplateItem(hallId, templateItemId, input);
}

export async function listDemoVideosByItems(
  hallId: string,
  templateItemIds: string[],
): Promise<DemoVideo[]> {
  return demoVideoRepo.findByTemplateItemIds(hallId, templateItemIds);
}

export { assertTemplateItemOwnedByHall };
