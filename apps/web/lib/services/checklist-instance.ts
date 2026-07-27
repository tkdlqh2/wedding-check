import * as instanceRepo from "../db/repositories/checklist-instance";
import * as templateItemRepo from "../db/repositories/template-item";
import * as checklistItemRepo from "../db/repositories/checklist-item";
import * as ceremonyRepo from "../db/repositories/ceremony";
import * as demoVideoRepo from "../db/repositories/demo-video";
import type { Ceremony } from "../db/repositories/ceremony";
import type {
  ChecklistInstance,
  ChecklistInstanceItem,
  CandidateChecklistItem,
} from "../db/repositories/checklist-instance";

export class ChecklistInstanceValidationError extends Error {}

export type CeremonyDetail = {
  ceremony: Ceremony;
  instance: ChecklistInstance;
  items: ChecklistInstanceItem[];
  candidates: CandidateChecklistItem[];
};

async function requireInstance(hallId: string, ceremonyId: string): Promise<ChecklistInstance> {
  const instance = await instanceRepo.findByCeremony(hallId, ceremonyId);
  if (!instance) {
    throw new ChecklistInstanceValidationError("존재하지 않는 예식입니다");
  }
  return instance;
}

export type OperatorInstanceItem = ChecklistInstanceItem & {
  // 실행 화면 "상세" 펼침에서 재생할 시연 영상(FR-3) — 인스턴스 항목의
  // templateItemCheckId(원본 체크리스트 항목 소프트 참조)로 demo_videos를 조회해
  // 병합한다. 원본이 삭제됐거나 영상이 없으면 null.
  videoUrl: string | null;
};

export type OperatorInstanceView = {
  ceremony: Ceremony;
  items: OperatorInstanceItem[];
};

// getCeremonyDetail과 달리 listCandidateChecklistItems를 호출하지 않는다 — 오퍼레이터
// 화면은 후보 목록이 필요 없고, 이 함수는 클라이언트가 60초마다 폴링하므로 불필요한
// 템플릿 항목 쿼리를 매번 추가하지 않는다(Story 2.3).
export async function getOperatorInstanceView(
  hallId: string,
  ceremonyId: string,
): Promise<OperatorInstanceView> {
  const ceremony = await ceremonyRepo.findById(hallId, ceremonyId);
  if (!ceremony) {
    throw new ChecklistInstanceValidationError("존재하지 않는 예식입니다");
  }
  const instance = await requireInstance(hallId, ceremonyId);
  const items = await instanceRepo.listItems(hallId, instance.id);
  const checkIds = items
    .map((item) => item.templateItemCheckId)
    .filter((id): id is string => id !== null);
  const videos = await demoVideoRepo.findByChecklistItemIds(hallId, checkIds);
  const videoByCheckId = new Map(videos.map((v) => [v.checklistItemId, v.videoUrl]));
  return {
    ceremony,
    items: items.map((item) => ({
      ...item,
      videoUrl: item.templateItemCheckId
        ? (videoByCheckId.get(item.templateItemCheckId) ?? null)
        : null,
    })),
  };
}

export async function getCeremonyDetail(hallId: string, ceremonyId: string): Promise<CeremonyDetail> {
  const ceremony = await ceremonyRepo.findById(hallId, ceremonyId);
  if (!ceremony) {
    throw new ChecklistInstanceValidationError("존재하지 않는 예식입니다");
  }
  // 예식이 있으면 인스턴스는 반드시 함께 있어야 한다(Story 2.1의 원자적 생성 불변 조건) —
  // 없다면 데이터 정합성이 깨진 것이므로 사용자 오류가 아니라 시스템 오류로 취급한다.
  const instance = await instanceRepo.findByCeremony(hallId, ceremonyId);
  if (!instance) {
    throw new Error("예식에 연결된 체크리스트 인스턴스가 없습니다");
  }
  const [items, candidates] = await Promise.all([
    instanceRepo.listItems(hallId, instance.id),
    instanceRepo.listCandidateChecklistItems(hallId, instance.id),
  ]);
  return { ceremony, instance, items, candidates };
}

// AD-2 2-hop 재검증: instanceId만으로 항목 추가를 허용하지 않는다. instance와
// checklistItem을 각각 신뢰된 hallId 파라미터로 스코프해서 조회하고, 둘 다 조회에
// 성공해야만 진행한다 — 두 조회 모두 통과해야 instance.hall_id === hallId ===
// checklist_item.hall_id가 성립한다(demo-video.ts::assertChecklistItemOwnedByHall과
// 동일 원리). Story 5.5: 대상이 단계(templateItem)에서 체크리스트 항목으로 바뀌었다 —
// 인스턴스 스냅샷에 필요한 소속 단계명(stepName)은 checklistItem.templateItemId로
// 부모 단계를 조회해 채운다.
export async function addInstanceItem(
  hallId: string,
  ceremonyId: string,
  checklistItemId: string,
): Promise<ChecklistInstanceItem> {
  const instance = await requireInstance(hallId, ceremonyId);
  const checklistItem = await checklistItemRepo.findById(hallId, checklistItemId);
  if (!checklistItem) {
    throw new ChecklistInstanceValidationError("존재하지 않는 체크리스트 항목입니다");
  }
  const step = await templateItemRepo.findById(hallId, checklistItem.templateItemId);
  if (!step) {
    throw new ChecklistInstanceValidationError("존재하지 않는 단계입니다");
  }
  return instanceRepo.addItem(hallId, instance.id, {
    id: checklistItem.id,
    title: checklistItem.title,
    description: checklistItem.description,
    stepId: step.id,
    stepName: step.stepName,
  });
}

export async function removeInstanceItem(
  hallId: string,
  ceremonyId: string,
  itemId: string,
): Promise<void> {
  const instance = await requireInstance(hallId, ceremonyId);
  await instanceRepo.removeItem(hallId, instance.id, itemId);
}

// Story 5.8: "이 예식에만" 자유 서술 체크 항목 추가 — 템플릿 카탈로그를 거치지 않는다.
// 기존 단계에 추가할 때는 templateItemId(실제 템플릿 단계) 또는 groupRootId(이미 만든
// ad-hoc 단계)를 받아 그 단계 소속임을 서버가 직접 재검증하고, stepName은 클라이언트
// 입력을 신뢰하지 않고 검증된 단계에서 그대로 가져온다(위조 방지) — 완전히 새 단계를
// 만들 때만 클라이언트가 보낸 stepName을 쓴다.
export async function addAdHocInstanceItem(
  hallId: string,
  ceremonyId: string,
  input: {
    title: string;
    description: string | null;
    stepName: string;
    templateItemId?: string | null;
    groupRootId?: string | null;
  },
): Promise<ChecklistInstanceItem> {
  const title = input.title.trim();
  if (!title) {
    throw new ChecklistInstanceValidationError("체크 항목 제목을 입력해주세요");
  }
  const description = input.description?.trim() || null;

  const instance = await requireInstance(hallId, ceremonyId);

  let stepId: string | null = null;
  let groupRootId: string | null = null;
  let stepName = input.stepName.trim();

  if (input.templateItemId) {
    const step = await templateItemRepo.findById(hallId, input.templateItemId);
    if (!step) {
      throw new ChecklistInstanceValidationError("존재하지 않는 단계입니다");
    }
    // 코덱스 리뷰 P2: templateItemId가 같은 홀에 존재한다는 것만으로는 그 단계가 "이
    // 예식"의 실제 체크리스트에 포함돼 있음을 보장하지 않는다(AD-9 계약 형태 조건부
    // 포함으로 특정 단계가 이 예식 인스턴스에서 애초에 제외될 수 있음) — 조작된 요청이
    // 체크리스트에 없던 단계를 다시 만들어 인스턴스 스냅샷 불변조건을 깰 수 있었다.
    // Story 3.1이 동일한 목적으로 이미 추가한 existsForTemplateItem을 그대로 재사용.
    const isIncluded = await instanceRepo.existsForTemplateItem(instance.id, step.id);
    if (!isIncluded) {
      throw new ChecklistInstanceValidationError("이 예식의 체크리스트에 포함되지 않은 단계입니다");
    }
    stepId = step.id;
    stepName = step.stepName;
  } else if (input.groupRootId) {
    const existingItems = await instanceRepo.listItems(hallId, instance.id);
    const anchor = existingItems.find((item) => item.adHocGroupRootId === input.groupRootId);
    if (!anchor || !anchor.adHocGroupRootId) {
      throw new ChecklistInstanceValidationError("존재하지 않는 단계입니다");
    }
    groupRootId = anchor.adHocGroupRootId;
    stepName = anchor.stepName;
  } else if (!stepName) {
    throw new ChecklistInstanceValidationError("단계 이름을 입력해주세요");
  }

  return instanceRepo.addAdHocItem(hallId, instance.id, {
    stepName,
    title,
    description,
    stepId,
    groupRootId,
  });
}

// 프로토타입 WeddingDetailScreen.js 단계 헤더의 "수정"/"단계 삭제" — 이 예식 스냅샷의
// 단계 이름 변경/단계 통째 삭제. 그룹 키는 group-by-step.ts의 그룹핑과 동일한 3단
// 위계(템플릿 단계 → ad-hoc 단계 → orphan 단일 항목)를 액션 레이어에서 받아 그대로
// 리포지토리에 넘긴다. 갱신/삭제된 행이 0이면 존재하지 않는 단계로 취급한다.
export async function renameInstanceStep(
  hallId: string,
  ceremonyId: string,
  key: instanceRepo.StepGroupKey,
  stepName: string,
): Promise<void> {
  const trimmed = stepName.trim();
  if (!trimmed) {
    throw new ChecklistInstanceValidationError("단계 이름을 입력해주세요");
  }
  const instance = await requireInstance(hallId, ceremonyId);
  const updated = await instanceRepo.renameStepGroup(hallId, instance.id, key, trimmed);
  if (updated === 0) {
    throw new ChecklistInstanceValidationError("존재하지 않는 단계입니다");
  }
}

export async function deleteInstanceStep(
  hallId: string,
  ceremonyId: string,
  key: instanceRepo.StepGroupKey,
): Promise<void> {
  const instance = await requireInstance(hallId, ceremonyId);
  const deleted = await instanceRepo.deleteStepGroup(hallId, instance.id, key);
  if (deleted === 0) {
    throw new ChecklistInstanceValidationError("존재하지 않는 단계입니다");
  }
}

// Story 5.8: 인스턴스 항목의 제목/설명 수정(기존에는 추가/제외만 가능했다).
export async function updateInstanceItem(
  hallId: string,
  ceremonyId: string,
  itemId: string,
  input: { title: string; description: string | null },
): Promise<ChecklistInstanceItem> {
  const title = input.title.trim();
  if (!title) {
    throw new ChecklistInstanceValidationError("체크 항목 제목을 입력해주세요");
  }
  const description = input.description?.trim() || null;

  const instance = await requireInstance(hallId, ceremonyId);
  const updated = await instanceRepo.updateItem(hallId, instance.id, itemId, { title, description });
  if (!updated) {
    throw new ChecklistInstanceValidationError("존재하지 않는 체크리스트 항목입니다");
  }
  return updated;
}
