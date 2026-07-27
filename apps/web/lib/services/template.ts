import * as templateItemRepo from "../db/repositories/template-item";
import * as hallRepo from "../db/repositories/hall";
import type { TemplateItem } from "../db/repositories/template-item";

export type { TemplateItem };

export class TemplateItemValidationError extends Error {}

function assertValidStepName(stepName: string): string {
  const trimmed = stepName.trim();
  if (!trimmed) {
    // AC 2: 서버 사이드 검증이 실제 안전장치다 — 클라이언트 검증만으로는 불충분.
    throw new TemplateItemValidationError("단계명은 필수입니다");
  }
  return trimmed;
}

async function assertHallExists(hallId: string): Promise<void> {
  const hall = await hallRepo.findById(hallId);
  if (!hall || !hall.isActive) {
    throw new TemplateItemValidationError("존재하지 않는 홀입니다");
  }
}

export async function createTemplateItem(
  hallId: string,
  input: {
    stepName: string;
    description?: string | null;
    applicableContractConditions?: Record<string, boolean>;
  },
): Promise<TemplateItem> {
  await assertHallExists(hallId);
  const stepName = assertValidStepName(input.stepName);
  return templateItemRepo.create(hallId, {
    stepName,
    description: input.description,
    applicableContractConditions: input.applicableContractConditions,
  });
}

export async function listTemplateItems(hallId: string): Promise<TemplateItem[]> {
  return templateItemRepo.findAllByHall(hallId);
}

export async function updateTemplateItem(
  hallId: string,
  id: string,
  input: {
    stepName: string;
    description?: string | null;
    applicableContractConditions?: Record<string, boolean>;
  },
): Promise<TemplateItem> {
  // 비활성화된 홀은 관리 화면(notFound())에서 더 이상 접근할 수 없지만, 이미 열려있던
  // 페이지나 재전송된 Server Action 요청으로는 여전히 수정이 시도될 수 있다 — 생성뿐
  // 아니라 모든 쓰기 작업에서 활성 홀인지 검증한다(코덱스 리뷰 P2 반영).
  await assertHallExists(hallId);
  const stepName = assertValidStepName(input.stepName);
  return templateItemRepo.update(hallId, id, {
    stepName,
    description: input.description,
    applicableContractConditions: input.applicableContractConditions,
  });
}

export async function deleteTemplateItem(hallId: string, id: string): Promise<void> {
  await assertHallExists(hallId);
  await templateItemRepo.remove(hallId, id);
}

// AC 3: 위/아래 버튼으로 인접 항목과 순서를 바꾼다. 맨 위에서 up, 맨 아래에서 down은
// 조용히 무시한다(범위 밖 이동 없음). 조회·스왑·저장은 리포지토리의 `moveAdjacent`가
// 하나의 잠긴 트랜잭션 안에서 원자적으로 수행한다(동시 이동 요청 간 유실 방지).
export async function moveTemplateItem(
  hallId: string,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await assertHallExists(hallId);
  await templateItemRepo.moveAdjacent(hallId, id, direction);
}
