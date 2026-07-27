/**
 * 실제 큐시트(Cue Sheet 2.7)와 현장 운영 메모를 기반으로 재구성한 예식 진행
 * 체크리스트 12단계를 시드한다(FR-2, checklist_template_items).
 *
 * 모든 활성 홀에 동일하게 적용한다 — 사용자 확인(2026-07-27): 조명/음향 조작법과
 * 진행 단계 자체는 홀마다 달라질 이유가 없고, 실제로 홀마다 다른 것은 시연 영상 정도
 * (FR-3, demo_videos)이므로 그건 이 스크립트 범위 밖으로 남겨둔다. 각 홀에 남아있던
 * 이전 스토리(2.1~2.3) 수동 검증용 더미 항목은 전부 지우고 이 12단계만 남긴다.
 *
 * 실행: npm run seed:ceremony-checklist (package.json이 --env-file=.env.local로 실행한다)
 */
import * as templateItemRepo from "../lib/db/repositories/template-item";
import * as hallRepo from "../lib/db/repositories/hall";

const STEPS: Array<{ stepName: string; description: string }> = [
  {
    stepName: "개식사",
    description:
      "조명: 사회자 조명 준비 · 주의: 조명이 들어가면 개식사부터 진행하도록 사회자에게 사전 안내",
  },
  {
    stepName: "화촉점화",
    description:
      "진행 순서: 화촉입장 대기 → 화촉입장(점화 → 인사 → 착석) · 주의: 타이밍 여부 사전 확인 필수",
  },
  {
    stepName: "뮤지컬 오프닝",
    description:
      '조명: 뮤지컬 대표님과 사전 협의 · "T자 조명"=2번 조명, 신랑신부 앞으로 나올 때 "주례사 조명"으로 전환 · 해당 시에만 진행',
  },
  {
    stepName: "신랑입장",
    description:
      "진행 순서: 신랑입장 대기 → 신랑입장(인사 → 단상인사 → 대기), 신랑은 문 뒤에서 입장 · 조명: 신부입장 대기 조명 상태에서 무전으로 문 열기 → 계단 오를 때 신랑입장 조명으로 전환",
  },
  {
    stepName: "신부입장",
    description:
      "진행 순서: 신부입장 대기 → 문 열고 나와 인사 후 신부입장 조명, 이후 순서 진행 후 맞절 조명으로 전환 · 무대: 신부가 계단 오름과 동시에 꽃 내리기(My 버튼)",
  },
  {
    stepName: "맞절",
    description: "음향: 맞절 음원 바로 재생",
  },
  {
    stepName: "혼인서약",
    description: "조명: 주례사 조명 · 주의: 마주보고 혼인서약을 진행하는 경우 맞절 조명으로 전환",
  },
  {
    stepName: "예동입장",
    description: "조명: 전체 점등 · 주의: 타이밍 여부 사전 확인",
  },
  {
    stepName: "축가·축사·축무",
    description:
      '조명: 축가 1번/축가 2번 조명 준비 · 영상 상영 병행 시: 미리 꽃 올리고 스크린 내리기 → 컴퓨터 영상 준비 → 조명 세팅 → 노트북 → open, 종료 즉시 꽃 다시 내리고 스크린 올리기 · 주의: 다인원 공연은 당일 리허설 후 별도 협의',
  },
  {
    stepName: "인사",
    description: "진행 순서: 신부 혼주님 인사 → 하객 인사(이동 중) → 신랑 혼주님 인사 → 하객 인사",
  },
  {
    stepName: "행진",
    description:
      "진행 순서: 신랑신부 행진 대기 → 행진(1번 지점에서 잠깐 정지 후 진행) · 주의: 잘 안 보이거나 타이밍이 헷갈릴 경우 3걸음마다 조명을 하나씩 순차 재생",
  },
  {
    stepName: "사진촬영",
    description:
      '조명: 행진 후 복귀 시 사진촬영 조명으로 전환 · 주의: 지인촬영(플래시컷) 시 샹들리에 먼저 내린 뒤 "불 꺼주세요" 요청 시 전체소등',
  },
];

async function seedHall(hallId: string, hallName: string) {
  console.log(`\n[${hallName}]`);

  const existing = await templateItemRepo.findAllByHall(hallId);
  for (const item of existing) {
    await templateItemRepo.remove(hallId, item.id);
    console.log(`  삭제됨: ${item.stepName}`);
  }

  for (const step of STEPS) {
    // create()가 INSERT 문 안에서 sortOrder를 계산해 그 홀의 마지막 순서 다음으로
    // 자동 배치한다(template-item.ts) — 여기서 별도로 sortOrder를 지정하지 않는다.
    const created = await templateItemRepo.create(hallId, {
      stepName: step.stepName,
      description: step.description,
    });
    console.log(`  생성됨 (${created.sortOrder}): ${created.stepName}`);
  }
}

async function main() {
  const halls = await hallRepo.findAllActive();
  if (halls.length === 0) {
    console.log("활성 홀이 없습니다 — 먼저 홀을 등록하세요.");
    return;
  }
  for (const hall of halls) {
    await seedHall(hall.id, hall.name);
  }
}

main()
  .then(() => {
    console.log("예식 진행 체크리스트 시드 완료");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
