/**
 * 실제 큐시트(Cue Sheet 2.7)와 현장 운영 메모를 기반으로 재구성한 예식 진행
 * 체크리스트를 시드한다(FR-2/FR-15) — 12개 "단계"(checklist_template_items)와 그
 * 아래 개별 "체크리스트 항목"(checklist_template_item_checks, 제목 필수/설명 선택).
 *
 * Story 5.5: 이전 버전은 각 단계에 "·"로 구분된 여러 사실이 뭉친 description 하나만
 * 있었다 — 이제 그 각각을 독립적으로 체크 가능한 항목으로 쪼갠다.
 *
 * 모든 활성 홀에 동일하게 적용한다 — 사용자 확인(2026-07-27): 조명/음향 조작법과
 * 진행 단계 자체는 홀마다 달라질 이유가 없고, 실제로 홀마다 다른 것은 시연 영상 정도
 * (FR-3, demo_videos)이므로 그건 이 스크립트 범위 밖으로 남겨둔다.
 *
 * 이 스크립트는 아무 것도 삭제하지 않는다(코덱스 리뷰 1·2차 P1, PR #11) — "이 이름들에
 * 없는 기존 항목은 처분 가능"으로 간주해 지우면, 나중에 관리자가 실제로 등록한 커스텀
 * 단계/체크리스트 항목까지 재실행할 때마다 지워버릴 수 있다(게다가
 * demo_videos.checklist_item_id가 ON DELETE CASCADE라 연결된 시연 영상까지 함께
 * 사라진다). 단계(stepName)와 그 안의 체크리스트 항목(title)을 각각 이름 매칭으로
 * upsert하고, 둘 다 "그 범위의 기존 sortOrder 최댓값 + 배열 순서"로 재배치한다
 * (template-item.ts/checklist-item.ts의 setSortOrder 저수준 함수 사용 — 코덱스 2차
 * P2 교훈과 동일하게, 매칭된 기존 항목의 옛 sortOrder를 그대로 두면 재실행해도 선언한
 * 순서로 수렴하지 않는다).
 *
 * db.transaction()은 프로덕션 드라이버(neon-http)가 지원하지 않아 이 저장소 전체가
 * 쓰지 않는다(template-item.ts 주석 참고) — 완전한 원자성 대신, 삭제가 없는 순수
 * upsert 구조 자체가 중간 실패 후 재실행해도 안전하게 같은 최종 상태로 수렴하게 한다.
 *
 * 실행: npm run seed:ceremony-checklist (package.json이 --env-file=.env.local로 실행한다)
 */
import * as templateItemRepo from "../lib/db/repositories/template-item";
import * as checklistItemRepo from "../lib/db/repositories/checklist-item";
import * as hallRepo from "../lib/db/repositories/hall";

type ChecklistItemSeed = { title: string; description?: string };
type StepSeed = { stepName: string; items: ChecklistItemSeed[] };

const STEPS: StepSeed[] = [
  {
    stepName: "개식사",
    items: [
      { title: "사회자 조명 준비" },
      {
        title: "조명 진입 시 개식사 진행 안내",
        description: "조명이 들어가면 개식사부터 진행하도록 사회자에게 사전 안내",
      },
    ],
  },
  {
    stepName: "화촉점화",
    items: [
      {
        title: "화촉입장 진행",
        description: "화촉입장 대기 → 화촉입장(점화 → 인사 → 착석)",
      },
      { title: "타이밍 사전 확인", description: "타이밍 여부 사전 확인 필수" },
    ],
  },
  {
    stepName: "뮤지컬 오프닝",
    items: [
      { title: "뮤지컬 대표님과 조명 사전 협의" },
      {
        title: "조명 전환 규칙",
        description: '"T자 조명"=2번 조명, 신랑신부 앞으로 나올 때 "주례사 조명"으로 전환',
      },
      { title: "해당 시에만 진행" },
    ],
  },
  {
    stepName: "신랑입장",
    items: [
      {
        title: "신랑입장 진행",
        description: "신랑입장 대기 → 신랑입장(인사 → 단상인사 → 대기), 신랑은 문 뒤에서 입장",
      },
      {
        title: "신랑입장 조명 전환",
        description: "신부입장 대기 조명 상태에서 무전으로 문 열기 → 계단 오를 때 신랑입장 조명으로 전환",
      },
    ],
  },
  {
    stepName: "신부입장",
    items: [
      {
        title: "신부입장 진행",
        description:
          "신부입장 대기 → 문 열고 나와 인사 후 신부입장 조명, 이후 순서 진행 후 맞절 조명으로 전환",
      },
      {
        title: "꽃 내리기(무대)",
        description: "신부가 계단 오름과 동시에 꽃 내리기(My 버튼)",
      },
    ],
  },
  {
    stepName: "맞절",
    items: [{ title: "맞절 음원 바로 재생" }],
  },
  {
    stepName: "혼인서약",
    items: [
      { title: "주례사 조명" },
      {
        title: "혼인서약 시 조명 전환 주의",
        description: "마주보고 혼인서약을 진행하는 경우 맞절 조명으로 전환",
      },
    ],
  },
  {
    stepName: "예동입장",
    items: [{ title: "전체 점등" }, { title: "타이밍 사전 확인" }],
  },
  {
    stepName: "축가·축사·축무",
    items: [
      { title: "축가 조명 준비", description: "축가 1번/축가 2번 조명 준비" },
      {
        title: "영상 상영 병행 절차",
        description:
          "영상 상영 병행 시: 미리 꽃 올리고 스크린 내리기 → 컴퓨터 영상 준비 → 조명 세팅 → 노트북 → open, 종료 즉시 꽃 다시 내리고 스크린 올리기",
      },
      { title: "다인원 공연 사전 협의", description: "다인원 공연은 당일 리허설 후 별도 협의" },
    ],
  },
  {
    stepName: "인사",
    items: [
      {
        title: "인사 진행 순서",
        description: "신부 혼주님 인사 → 하객 인사(이동 중) → 신랑 혼주님 인사 → 하객 인사",
      },
    ],
  },
  {
    stepName: "행진",
    items: [
      {
        title: "행진 진행",
        description: "신랑신부 행진 대기 → 행진(1번 지점에서 잠깐 정지 후 진행)",
      },
      {
        title: "행진 조명 보정",
        description: "잘 안 보이거나 타이밍이 헷갈릴 경우 3걸음마다 조명을 하나씩 순차 재생",
      },
    ],
  },
  {
    stepName: "사진촬영",
    items: [
      { title: "사진촬영 조명 전환", description: "행진 후 복귀 시 사진촬영 조명으로 전환" },
      {
        title: "지인촬영 시 조명 처리",
        description: '지인촬영(플래시컷) 시 샹들리에 먼저 내린 뒤 "불 꺼주세요" 요청 시 전체소등',
      },
    ],
  },
];

// 한 단계 안의 체크리스트 항목들을 title 매칭으로 upsert하고, 그 단계 범위의 "이
// 시드가 다루지 않는(=관리자가 직접 추가한 커스텀)" 항목들의 sortOrder 최댓값 + 배열
// 순서로 재배치한다 — seedHall의 단계 upsert와 완전히 동일한 기법을 한 단계 아래
// 범위(hallId 전체가 아니라 templateItemId 안)에 적용한다.
//
// 코덱스 리뷰 2차 P2: 매칭된(=이번에 재배치할) 항목 자신의 옛 sortOrder까지 기준값
// 계산에 포함하면, 재실행할 때마다 그 옛 값이 다시 새 기준값이 되어 절대값이 끝없이
// 커진다(수렴하지 않음 — 상대 순서는 맞아도 idempotent하지 않음). 이 시드가 다루는
// title 집합을 기준값 계산에서 제외해 커스텀 항목의 최댓값만 기준으로 삼으면, 커스텀
// 항목이 추가/삭제되지 않는 한 재실행해도 절대값 자체가 완전히 동일하게 수렴한다.
// 코덱스 리뷰 4차 P2: 관리자가 시드가 다루는 항목들의 순서를 화면에서 직접 바꾼(위/아래
// 버튼) 뒤 이 스크립트를 재실행하면, 첫 setSortOrder가 "아직 이번 루프에서 갱신되지
// 않은 다른 시드 항목이 현재 점유 중인" 목표값으로 이동하려다 (template_item_id,
// sort_order) UNIQUE 위반으로 즉시 실패할 수 있다(예: 관리자가 순서를 뒤집어놔서 이번
// 실행에서 항목A가 이전에 항목B가 쓰던 sortOrder를 원해야 하는데, 항목B가 아직 그
// 자리를 비우지 않은 경우). db.transaction()을 못 쓰므로(neon-http 제약), "전부 먼저
// 확실히 안 겹치는 임시값(음수, 실제 sortOrder는 항상 0 이상이라 절대 충돌하지 않음)
// 으로 옮긴 뒤 → 그다음에 최종값을 부여"하는 2단계로 이 충돌을 원천 차단한다.
async function seedChecklistItems(hallId: string, templateItemId: string, items: ChecklistItemSeed[]) {
  const existing = await checklistItemRepo.findAllByTemplateItem(hallId, templateItemId);
  const existingByTitle = new Map(existing.map((item) => [item.title, item]));
  const seedTitles = new Set(items.map((seed) => seed.title));
  const currentMax = existing.reduce(
    (max, item) => (seedTitles.has(item.title) ? max : Math.max(max, item.sortOrder)),
    -1,
  );

  const matchedItems = items
    .map((seed) => existingByTitle.get(seed.title))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  for (const [i, match] of matchedItems.entries()) {
    await checklistItemRepo.setSortOrder(hallId, match.id, -(i + 1));
  }

  for (const [index, seed] of items.entries()) {
    const targetSortOrder = currentMax + 1 + index;
    const match = existingByTitle.get(seed.title);
    if (match) {
      await checklistItemRepo.update(hallId, match.id, {
        title: seed.title,
        description: seed.description ?? null,
      });
      await checklistItemRepo.setSortOrder(hallId, match.id, targetSortOrder);
      console.log(`    갱신됨 (${targetSortOrder}): ${seed.title}`);
      continue;
    }
    const created = await checklistItemRepo.create(hallId, templateItemId, {
      title: seed.title,
      description: seed.description ?? null,
    });
    await checklistItemRepo.setSortOrder(hallId, created.id, targetSortOrder);
    console.log(`    생성됨 (${targetSortOrder}): ${created.title}`);
  }
}

async function seedHall(hallId: string, hallName: string) {
  console.log(`\n[${hallName}]`);

  const existing = await templateItemRepo.findAllByHall(hallId);
  const existingByStepName = new Map(existing.map((item) => [item.stepName, item]));
  // 이 홀의 커스텀(=STEPS에 없는) 단계들의 sortOrder 최댓값을 미리 한 번만 계산해둔다
  // — 이후 이 12단계를 (currentMax+1)부터 STEPS 순서 그대로 배치하면, 다른 기존
  // 항목의 sortOrder와 절대 겹치지 않는다(모든 대상 값이 원래 최댓값보다 크므로).
  // 코덱스 리뷰 2차 P2: STEPS 자신의 옛 sortOrder를 기준값에 포함하면 재실행마다
  // 절대값이 끝없이 커져 idempotent하지 않다 — STEPS 이름 집합을 기준값 계산에서
  // 제외해, 커스텀 단계가 없는 한 재실행해도 절대값이 완전히 동일하게 수렴하게 한다.
  const seedStepNames = new Set(STEPS.map((step) => step.stepName));
  const currentMax = existing.reduce(
    (max, item) => (seedStepNames.has(item.stepName) ? max : Math.max(max, item.sortOrder)),
    -1,
  );

  // 코덱스 리뷰 4차 P2: seedChecklistItems와 동일한 이유로, 단계들도 먼저 전부 임시
  // 음수값으로 옮긴 뒤에 최종 목표값을 부여한다 — 관리자가 순서를 바꿔놓은 뒤
  // 재실행해도 (hall_id, sort_order) UNIQUE 위반 없이 항상 안전하게 수렴한다.
  const matchedSteps = STEPS.map((step) => existingByStepName.get(step.stepName)).filter(
    (item): item is NonNullable<typeof item> => item !== undefined,
  );
  for (const [i, match] of matchedSteps.entries()) {
    await templateItemRepo.setSortOrder(hallId, match.id, -(i + 1));
  }

  for (const [index, step] of STEPS.entries()) {
    const targetSortOrder = currentMax + 1 + index;
    const match = existingByStepName.get(step.stepName);
    if (match) {
      // applicableContractConditions를 생략하면 repository update()가 {}로 덮어쓴다
      // — 관리자가 이 단계에 걸어둔 계약 형태 조건(AD-9, 예: "주례 관련")이 재실행할
      // 때마다 조용히 초기화될 수 있었다(코덱스 리뷰 3차 P2). 기존 값을 그대로 넘겨
      // 보존한다 — 이 스크립트는 stepName 자체와 소속 체크리스트 항목만 갱신한다.
      await templateItemRepo.update(hallId, match.id, {
        stepName: step.stepName,
        applicableContractConditions: match.applicableContractConditions,
      });
      await templateItemRepo.setSortOrder(hallId, match.id, targetSortOrder);
      console.log(`  갱신됨 (${targetSortOrder}): ${step.stepName}`);
      await seedChecklistItems(hallId, match.id, step.items);
      continue;
    }
    const created = await templateItemRepo.create(hallId, { stepName: step.stepName });
    await templateItemRepo.setSortOrder(hallId, created.id, targetSortOrder);
    console.log(`  생성됨 (${targetSortOrder}): ${created.stepName}`);
    await seedChecklistItems(hallId, created.id, step.items);
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
