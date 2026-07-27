import * as feedbackRepo from "../db/repositories/feedback";
import * as ceremonyRepo from "../db/repositories/ceremony";
import * as templateItemRepo from "../db/repositories/template-item";
import * as instanceRepo from "../db/repositories/checklist-instance";
import type { Feedback } from "../db/repositories/feedback";

export class FeedbackValidationError extends Error {}

// AD-2 2-hop 재검증: ceremonyRepo/templateItemRepo 둘 다 hallId로 스코프된 조회다 —
// 둘 다 성공해야 예식과 단계가 실제로 같은 홀 소속임이 보장된다
// (checklist-instance.ts::addInstanceItem과 동일 원리).
//
// 코덱스 리뷰 P2: 같은 홀 소속이라는 것만으로는 그 단계가 "이 예식"의 실제
// 체크리스트에 포함돼 있음을 보장하지 않는다(AD-9 계약 형태 조건부 포함으로 특정
// 단계가 이 예식의 인스턴스에서 제외될 수 있음) — instanceRepo.existsForTemplateItem로
// 이 예식의 checklist_instance_items에 실제로 포함된 단계인지까지 검증한다.
async function requireCeremonyAndStep(hallId: string, ceremonyId: string, templateItemId: string) {
  const ceremony = await ceremonyRepo.findById(hallId, ceremonyId);
  if (!ceremony) {
    throw new FeedbackValidationError("존재하지 않는 예식입니다");
  }
  const step = await templateItemRepo.findById(hallId, templateItemId);
  if (!step) {
    throw new FeedbackValidationError("존재하지 않는 단계입니다");
  }
  // 예식이 있으면 인스턴스는 반드시 함께 있어야 한다(Story 2.1의 원자적 생성 불변
  // 조건) — checklist-instance.ts::getCeremonyDetail과 동일한 근거로 시스템 오류 취급.
  const instance = await instanceRepo.findByCeremony(hallId, ceremonyId);
  if (!instance) {
    throw new Error("예식에 연결된 체크리스트 인스턴스가 없습니다");
  }
  const included = await instanceRepo.existsForTemplateItem(instance.id, templateItemId);
  if (!included) {
    throw new FeedbackValidationError("이 예식의 체크리스트에 포함되지 않은 단계입니다");
  }
  return { ceremony, step };
}

// AC 1/2: 예식+단계 조합에 draft 피드백을 새로 만들거나(최초 저장) 이어 쓴다(재저장).
// AC 4/NFR-5: 사용자 식별자를 받지도, 저장하지도 않는다 — "이어 쓰기"는 예식+단계
// 단위로만 이어진다.
//
// 코덱스 리뷰 P1: "조회 → 없으면 생성" 두 단계로 나뉘어 있으면 동시 최초 저장(같은
// 예식+단계, 두 탭/재시도)이 UNIQUE 위반 500으로 이어질 수 있었다 — feedbackRepo가
// ON CONFLICT DO UPDATE 단일 문으로 원자적으로 처리한다(setWhere로 draft일 때만
// 실제 갱신, confirmed면 0행 반환).
export async function saveDraftFeedback(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
  content: string,
): Promise<Feedback> {
  const { step } = await requireCeremonyAndStep(hallId, ceremonyId, templateItemId);

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new FeedbackValidationError("내용을 입력하세요");
  }

  const result = await feedbackRepo.upsertDraft({
    hallId,
    ceremonyId,
    templateItemId,
    stepName: step.stepName,
    content: trimmed,
  });
  if (!result) {
    // 이 스토리 범위에서는 도달 불가능하다(confirmed로 바꾸는 코드가 아직 없음,
    // Story 3.2에서 생김) — 그래도 스키마가 이미 status를 지원하므로 지금 막아둔다.
    // 나중에 3.2가 확정 기능을 추가했을 때 이 화면(피드백 재입력 패널)을 통해
    // 확정된 피드백이 조용히 덮어써지는 안전 결함을 원천 차단하기 위한 방어적
    // 코딩(AD-8).
    throw new FeedbackValidationError("이미 확정된 피드백은 수정할 수 없습니다");
  }
  return result;
}

// AC 2: 이전에 저장한 draft를 프리필하기 위한 조회.
export async function getDraftFeedback(
  hallId: string,
  ceremonyId: string,
  templateItemId: string,
): Promise<Feedback | undefined> {
  await requireCeremonyAndStep(hallId, ceremonyId, templateItemId);
  return feedbackRepo.findByCeremonyAndStep(ceremonyId, templateItemId);
}
