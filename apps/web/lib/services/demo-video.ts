import * as demoVideoRepo from "../db/repositories/demo-video";
import * as checklistItemRepo from "../db/repositories/checklist-item";
import type { DemoVideo, DemoVideoInput } from "../db/repositories/demo-video";

export type { DemoVideo, DemoVideoInput };

export class DemoVideoValidationError extends Error {}

// AD-2 2-hop 재검증: checklistItemId만으로 신뢰하지 않고, 그 항목이 실제 hallId 소속인지
// 서버가 직접 재확인한다(다른 홀의 checklistItemId를 넣어 그 홀 항목에 영상을 심는 것을 차단).
// Story 5.5: 대상이 단계(templateItem)에서 체크리스트 항목(checklistItem)으로 바뀌었다.
async function assertChecklistItemOwnedByHall(
  hallId: string,
  checklistItemId: string,
): Promise<void> {
  const item = await checklistItemRepo.findById(hallId, checklistItemId);
  if (!item) {
    throw new DemoVideoValidationError("존재하지 않는 체크리스트 항목입니다");
  }
}

// 파일 형식/크기 서버 검증은 이 함수의 책임이 아니다 — local/blob 두 업로드 경로가
// 저장 방식이 근본적으로 다르므로 각 Route Handler가 자신의 경로에 맞는 방식으로
// 검증한다. 이 함수는 이미 검증·저장 완료된 파일의 메타데이터를 DB에 기록만 한다.
export async function saveDemoVideo(
  hallId: string,
  checklistItemId: string,
  input: DemoVideoInput,
): Promise<DemoVideo> {
  await assertChecklistItemOwnedByHall(hallId, checklistItemId);
  return demoVideoRepo.upsertForChecklistItem(hallId, checklistItemId, input);
}

export async function listDemoVideosByItems(
  hallId: string,
  checklistItemIds: string[],
): Promise<DemoVideo[]> {
  return demoVideoRepo.findByChecklistItemIds(hallId, checklistItemIds);
}

export { assertChecklistItemOwnedByHall };
