---
baseline_commit: 1d1f0b5e48d454acdfa1aab7809ca8628209f694
---

# Story 2.2: 계약 형태 기반 인스턴스 자동 조합

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 예식 등록 시 계약 형태에 맞는 항목만 자동으로 조합되기를,
so that 불필요한 단계가 인스턴스에 섞이지 않는다.

## Acceptance Criteria

1. **Given** "주례 없음"으로 예식을 등록했을 때 **When** 인스턴스가 생성되면 **Then** 주례 관련 항목이 제외된다(AD-9 `applicable_contract_conditions` 부분집합 매칭).
2. **Given** 인스턴스가 생성된 후 **When** 관리자가 항목을 수동 추가/제외하면 **Then** 같은 홀의 템플릿 항목 범위 내에서만 허용된다(`[ASSUMPTION]` 다른 홀 항목 임시 차용 v1 미지원).
3. **Given** 항목 추가 요청이 들어오면 **When** 시스템이 처리하면 **Then** `instance.hall_id = template_item.hall_id` 재검증을 통과한 경우에만 추가된다(AD-2 2-hop 재검증, 위반 시 요청 거부).
4. **Given** 다른 홀의 템플릿 항목이 존재할 때 **When** 조합 후보 목록을 조회하면 **Then** 다른 홀의 항목은 노출되지 않는다.

## Tasks / Subtasks

- [x] Task 1: 템플릿 항목에 계약 형태 조건 태깅 UI 추가 (AC: 1)
  - [x] `lib/db/repositories/template-item.ts`의 `create`/`update`에 `applicableContractConditions?: Record<string, boolean>` 입력 추가(컬럼은 Story 1.3에서 이미 존재 — `default({})`, 마이그레이션 불필요). 미지정 시 `{}` 유지.
  - [x] `lib/services/template.ts`의 `createTemplateItem`/`updateTemplateItem`에 같은 필드 전달
  - [x] `app/admin/templates/[hallId]/actions.ts`의 `createTemplateItemAction`/`updateTemplateItemAction`에서 `requiresOfficiant`/`hasAdditionalEvent` 체크박스 값을 읽어 전달(ceremony-form.tsx와 동일한 두 키, Dev Notes "계약 형태 키 대칭" 참고)
  - [x] `template-item-form.tsx`에 체크박스 2개 추가("주례 관련", "이벤트 추가 관련")
  - [x] `template-item-row.tsx`에 태깅된 조건을 작은 배지로 표시(선택 안 됨=배지 없음)

- [x] Task 2: 인스턴스 생성 시 부분집합 매칭 적용 (AC: 1)
  - [x] `lib/db/repositories/ceremony.ts`의 `create()` CTE를 정확히 Dev Notes "CTE 수정" 섹션대로 수정 — **재작성 금지, JOIN 조건 추가만**(이미 해결된 raw SQL 타임존 처리를 건드리지 않는다)

- [x] Task 3: 체크리스트 인스턴스 리포지토리 — `lib/db/repositories/checklist-instance.ts` (AC: 2, 3, 4)
  - [x] `findByCeremony(hallId, ceremonyId)`: 홀 스코프 인스턴스 단건 조회
  - [x] `listItems(hallId, instanceId)`: 인스턴스에 포함된 항목 목록(sortOrder 순)
  - [x] `addItem(hallId, instanceId, templateItem)`: 스냅샷 복사로 항목 추가(Story 2.1의 "실행용 사본" 원칙과 동일 — stepName/description/sortOrder를 그 시점 값으로 복사)
  - [x] `removeItem(hallId, instanceId, itemId)`: 항목 하드 삭제(Story 1.3 템플릿 항목 삭제 정책과 동일)
  - [x] `listCandidateTemplateItems(hallId, instanceId)`: 그 홀의 템플릿 항목 중 아직 인스턴스에 없는 것만(AC 4 — 다른 홀 항목 노출 금지)

- [x] Task 4: 서비스 — `lib/services/checklist-instance.ts` (AC: 2, 3, 4)
  - [x] `ChecklistInstanceValidationError` 클래스
  - [x] `getCeremonyDetail(hallId, ceremonyId)`: 예식+인스턴스+항목+후보 목록을 한 번에 반환(상세 페이지용)
  - [x] `addInstanceItem(hallId, ceremonyId, templateItemId)`: **AD-2 2-hop 재검증** — 인스턴스와 템플릿 항목을 각각 `hallId`로 스코프 조회해 둘 다 통과해야 추가(Dev Notes "2-hop 재검증 구현" 참고, Story 1.4 `assertTemplateItemOwnedByHall`과 동일 원리)
  - [x] `removeInstanceItem(hallId, ceremonyId, itemId)`: 인스턴스를 `hallId`로 스코프 조회 후 삭제

- [x] Task 5: Server Actions — `app/admin/ceremonies/[hallId]/[ceremonyId]/actions.ts` (AC: 2, 3)
  - [x] `addInstanceItemAction`/`removeInstanceItemAction`: 첫 줄 `requireAdminSession()`(AD-3), `hallId`/`ceremonyId`/`templateItemId`(or `itemId`) 전부 `isValidUuid()` 검증(Story 1.3 코덱스 6차 P2 패턴) 후 서비스 호출, 성공 시 `revalidatePath`

- [x] Task 6: 예식 상세 페이지 UI — `app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx` (AC: 2, 3, 4)
  - [x] 현재 인스턴스 항목 목록(각 항목에 "제외" 버튼)
  - [x] 후보 항목 목록(그 홀의 미포함 템플릿 항목, 각각 "추가" 버튼) — `templates/[hallId]/page.tsx`의 `isValidUuid` + `notFound()` 가드 패턴 그대로 따름
  - [x] `app/admin/ceremonies/ceremony-row.tsx`를 `/admin/ceremonies/${hallId}/${ceremony.id}`로 링크(현재는 링크 없음)

- [x] Task 7: 테스트 (AC: 1, 2, 3, 4)
  - [x] `tests/repositories/ceremony.test.ts`(기존 파일에 추가): 계약 형태에 안 맞는 항목이 생성 시 실제로 제외되는지, 조건 없는 항목(`{}`)은 항상 포함되는지
  - [x] `tests/repositories/checklist-instance.test.ts`(신규): addItem/removeItem/listCandidateTemplateItems 홀 스코프 격리(다른 홀 항목이 후보로 새지 않는지, AC 4)
  - [x] `tests/services/checklist-instance.test.ts`(신규): 다른 홀의 templateItemId로 추가 시도 시 거부(AC 3, 2-hop 재검증 핵심 케이스), 존재하지 않는 ceremonyId 거부
  - [x] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인

- [x] Task 8: 수동 검증
  - [x] 템플릿 항목 하나를 "주례 관련"으로 태깅 → "주례 없음"으로 예식 등록 → 인스턴스에서 그 항목이 빠졌는지 실제 확인(AC 1)
  - [x] 상세 페이지에서 후보 항목 추가/기존 항목 제외 실제 확인(AC 2)
  - [x] 다른 홀의 templateItemId를 직접 조작해 추가 시도 → 거부되는지 확인(AC 3, node fetch 스크립트로 폼 필드 조작)

## Dev Notes

### 계약 형태 키 대칭 (가장 중요한 설계 전제)

Story 2.1에서 `ceremonies.contract_conditions`에 `{ requiresOfficiant: boolean; hasAdditionalEvent: boolean }` 두 키를 **항상 둘 다** 명시적으로 채워 저장하도록 만들어뒀다(체크 안 하면 `false`, 생략 안 함 — `app/admin/ceremonies/actions.ts` 참고). `checklist_template_items.applicable_contract_conditions`도 **정확히 같은 두 키 이름**을 쓴다. 부분집합 매칭은 Postgres JSONB `@>`(contains) 연산자로 구현한다:

```
ceremony.contract_conditions @> template_item.applicable_contract_conditions
```

"예식의 계약 형태 JSONB가 항목의 요구 조건 JSONB를 포함한다"는 뜻 — 항목의 모든 key-value 쌍이 예식 쪽에도 동일하게 있어야 참이다.

- 항목이 `{}`(기본값)면 → 무엇에도 포함되므로(빈 객체는 항상 부분집합) 항상 인스턴스에 포함된다.
- 항목이 `{requiresOfficiant: true}`면 → 예식이 `{requiresOfficiant: true, ...}`일 때만 포함, 예식이 `{requiresOfficiant: false, ...}`면 제외된다(둘 다 키가 항상 채워지므로 `false`와 `true`가 정확히 구분된다 — 키 누락에 의존하지 않는다).
- **반대 방향(`template_item.applicable_contract_conditions @> ceremony.contract_conditions`)으로 쓰면 의미가 뒤집힌다 — 반드시 위 방향 그대로 쓸 것.**

### CTE 수정 (`lib/db/repositories/ceremony.ts`) — 재작성 금지, 정확히 이 diff만

현재 파일의 `create()` 함수는 이미 구현돼 있고(Story 2.1), raw SQL 타임존 처리(`ceremonyAtLiteral`)가 이미 해결돼 있다 — 그 부분은 그대로 두고 **CTE 본문만** 아래처럼 바꾼다:

```ts
const result = await db.execute<{ ceremony_id: string; instance_id: string }>(sql`
  with new_ceremony as (
    insert into ceremonies (hall_id, ceremony_at, contract_conditions)
    values (${hallId}, ${ceremonyAtLiteral}::timestamp, ${JSON.stringify(input.contractConditions)}::jsonb)
    returning id, hall_id, contract_conditions
  ),
  new_instance as (
    insert into checklist_instances (hall_id, ceremony_id)
    select hall_id, id from new_ceremony
    returning id, hall_id, ceremony_id
  ),
  new_items as (
    insert into checklist_instance_items
      (hall_id, instance_id, template_item_id, step_name, description, sort_order)
    select ni.hall_id, ni.id, ti.id, ti.step_name, ti.description, ti.sort_order
    from new_instance ni
    join new_ceremony nc on nc.id = ni.ceremony_id
    join checklist_template_items ti
      on ti.hall_id = ni.hall_id
      and nc.contract_conditions @> ti.applicable_contract_conditions
    returning id
  )
  select
    (select id from new_ceremony) as ceremony_id,
    (select id from new_instance) as instance_id
`);
```

바뀐 부분 요약: (1) `new_ceremony`의 `returning`에 `contract_conditions` 추가, (2) `new_instance`의 `returning`에 `ceremony_id` 추가, (3) `new_items`의 `from`절에 `join new_ceremony nc on nc.id = ni.ceremony_id` 추가, (4) `join checklist_template_items ti on ...` 조건에 `and nc.contract_conditions @> ti.applicable_contract_conditions` 추가. 함수 시그니처·반환 타입·타임존 처리는 전부 그대로.

### 2-hop 재검증 구현 (가장 안전 결정적인 부분)

AD-2: "`checklist_instance_items`에 항목을 추가/제거하는 모든 쓰기 경로는 `instance.hall_id = template_item.hall_id`를 명시적으로 재검증해야 하며, 이 재검증 없이 `instance_id`만으로 항목 추가를 허용하는 구현은 AD-2 위반으로 간주한다."

Story 1.4의 `assertTemplateItemOwnedByHall`(`lib/services/demo-video.ts`)과 같은 원리를 **양쪽 모두**에 적용한다 — `instanceId`와 `templateItemId`를 각각 신뢰할 수 있는 `hallId` 파라미터로 스코프해서 조회하고, **둘 다 조회에 성공해야만** 진행한다:

```ts
export async function addInstanceItem(hallId: string, ceremonyId: string, templateItemId: string) {
  const instance = await instanceRepo.findByCeremony(hallId, ceremonyId); // hallId 스코프 1
  if (!instance) throw new ChecklistInstanceValidationError("존재하지 않는 예식입니다");
  const templateItem = await templateItemRepo.findById(hallId, templateItemId); // hallId 스코프 2
  if (!templateItem) throw new ChecklistInstanceValidationError("존재하지 않는 체크리스트 항목입니다");
  // 두 조회 모두 같은 hallId로 통과했으므로 instance.hall_id === hallId === template_item.hall_id가 성립한다.
  await instanceRepo.addItem(hallId, instance.id, templateItem);
}
```

**하지 말 것:** `instanceId`만 받아서 `checklist_instances` 테이블에서 `hall_id`를 읽어온 뒤 그 값으로 `templateItemId`를 조회하는 방식(instance 쪽 hallId를 "신뢰"하는 방식)은 쓰지 않는다 — 반드시 **호출자가 이미 인증/인가로 확보한 hallId**(Server Action에서 폼의 hidden hallId 필드를 받아 `isValidUuid`만 검증한 값)를 양쪽 조회의 기준으로 삼는다. `hallId` 자체가 조작됐다면 애초에 `findByCeremony`/`findById` 둘 다 실패해 `ChecklistInstanceValidationError`로 막힌다.

### 아키텍처 준수사항 (필수)

- **AD-2:** 새 리포지토리 함수(`checklist-instance.ts`)도 전부 `hallId`를 첫 인자로 받고 `WHERE hall_id = $hallId`를 포함한다. `listCandidateTemplateItems`는 반드시 `checklistTemplateItems.hallId = $hallId`로 스코프한다(AC 4).
- **AD-3:** 신규 Server Action 2개 모두 첫 줄 `requireAdminSession()`.
- **AD-9:** 이 스토리가 AD-9의 실제 구현부다 — Story 2.1 Dev Notes에 "Story 2.2 작업자에게: 이 JOIN의 on 절에 조건을 추가하는 것이 2.2의 핵심 변경점"이라고 명시해뒀던 바로 그 지점.
- **Consistency Conventions:** 관리자 CRUD는 Server Actions. `id`/`hallId`류는 항상 `isValidUuid()`로 형식 검증 후 사용(Story 1.3 코덱스 6차 P2 — DB에 잘못된 uuid 형식이 그대로 흘러가면 500이 노출된다).
- **라우트 구조 [ASSUMPTION]:** 예식 상세 페이지는 `/admin/ceremonies/[hallId]/[ceremonyId]`로 만든다(`ceremonyId`만 있는 라우트가 아님) — `ceremonyRepo.findById`가 AD-2에 따라 `hallId`를 필수로 받으므로, `hallId` 없이 `ceremonyId`만으로 예식을 조회하는 홀 미스코프 함수를 새로 만들지 않기 위함. `templates/[hallId]` 라우트와 동일한 이유·동일한 패턴.

### UX 준수사항

- 조건 배지(`template-item-row.tsx`): 상태 배지가 아니라 메타 정보이므로 UX-DR8(초록/주황/파랑 상태 배지)과 색을 공유하지 않는다 — 중립 톤(`--color-text-muted` 텍스트 + `--color-surface-soft` 배경)의 작은 태그로 표시.
- 상세 페이지의 "추가"/"제외" 버튼: 기존 `.btn-secondary` 그대로(halls/templates 페이지의 수정·삭제 버튼과 동일 톤 — 파괴적이지도 주 CTA도 아닌 보조 액션).
- 후보 항목이 0개(모든 항목이 이미 포함됨)일 때: `templates-page__empty`류의 `#888888` 안내 문구 재사용("추가할 수 있는 항목이 없습니다" 등, UX-DR12 톤 유지).

### 스코프 경계 (하지 말 것)

- **"당일" 제약 구현 금지:** AC 2의 "당일 변경으로"는 실제 운영 시나리오를 설명하는 서술일 뿐, "예식 날짜 당일에만 추가/제외 가능"이라는 기술적 제약이 아니다 — 날짜 기반 게이트를 만들지 않는다.
- **최소 항목 수 제약 없음:** 인스턴스 항목을 전부 제외해서 0개가 되는 것을 막지 않는다 — 그런 제약은 어떤 AC에도 없다.
- **새 항목 추가 시 sortOrder:** 추가되는 시점의 템플릿 항목 `sortOrder` 값을 그대로 스냅샷 복사한다(별도의 "끝에 추가" 로직 불필요) — 기존 항목과 순서가 뒤섞여도 이 스토리 범위에서는 허용(재정렬 UI는 어떤 AC에도 없음).
- **예식 자체의 `contract_conditions` 수정 UI 없음:** 생성 후 계약 형태를 바꾸는 기능은 이 스토리 범위 밖이다(인스턴스가 이미 생성된 뒤이므로 바꿔도 소급 재계산되지 않아 혼란만 준다).

### 파일 구조

```
apps/web/
  lib/
    db/repositories/
      template-item.ts                        # MODIFY — applicableContractConditions 입력 추가
      ceremony.ts                              # MODIFY — create() CTE에 부분집합 매칭 JOIN 추가
      checklist-instance.ts                    # NEW
    services/
      template.ts                              # MODIFY
      checklist-instance.ts                    # NEW
  app/admin/
    templates/[hallId]/
      actions.ts                               # MODIFY
      template-item-form.tsx                   # MODIFY — 조건 체크박스 2개
      template-item-row.tsx                    # MODIFY — 조건 배지 표시
    ceremonies/
      ceremony-row.tsx                         # MODIFY — 상세 페이지 링크
      [hallId]/[ceremonyId]/
        actions.ts                             # NEW
        page.tsx                               # NEW
  tests/
    repositories/
      ceremony.test.ts                         # MODIFY — 부분집합 매칭 케이스 추가
      checklist-instance.test.ts               # NEW
    services/
      checklist-instance.test.ts               # NEW
```

### 테스트 요구사항

- `tests/helpers/db.ts`의 `resetDb()`/`createTestHall()`/`createTestTemplateItem()`을 그대로 재사용. `createTestTemplateItem`은 현재 `applicableContractConditions`를 안 받으므로, 필요하면 `overrides`에 추가하거나 테스트에서 직접 `db.insert(checklistTemplateItems)...`로 태깅된 항목을 만든다.
- 가장 중요한 회귀 케이스: (1) 부분집합 매칭 JSONB 방향이 뒤집히지 않았는지(위 "계약 형태 키 대칭" 표의 3가지 경우 전부), (2) AC 3의 2-hop 재검증 — 다른 홀의 templateItemId로 `addInstanceItem` 호출 시 반드시 거부.

### Previous Story Intelligence (Story 2.1에서 이어지는 교훈)

- **CTE는 재작성하지 말고 최소 diff로 확장한다.** Story 2.1이 이미 raw SQL 타임존 버그를 해결해뒀다 — CTE를 새로 쓰면 그 교훈이 사라질 위험이 있다. 위 "CTE 수정" 섹션의 diff만 적용할 것.
- **AD-2 2-hop 재검증은 "양쪽을 각각 신뢰된 파라미터로 스코프 조회"로 구현한다** — Story 1.4(`assertTemplateItemOwnedByHall`)와 이 스토리(`addInstanceItem`)가 같은 패턴을 반복 적용한다. 이 패턴이 세 번째로 나타나면(Epic 3 이후) 공용 헬퍼로 추출을 고려할 만하다.
- **UUID 형식 검증은 모든 새 엔드포인트에서 습관적으로.** Story 1.3 코덱스 6차 P2 이후 `isValidUuid()`가 모든 admin Server Action의 표준 첫 관문이 됐다.
- **AD-3 가드는 새 엔드포인트마다 다시 확인.** 이번엔 세 번째 반복(Story 1.2 → 1.3/1.4 → 2.1 → 2.2).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2: 계약 형태 기반 인스턴스 자동 조합 (FR-5)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-2, AD-9]
- [Source: apps/web/lib/db/repositories/ceremony.ts] — 수정 대상 CTE의 현재 상태(Story 2.1 산출물).
- [Source: apps/web/lib/services/demo-video.ts#assertTemplateItemOwnedByHall] — 2-hop 재검증의 기존 구현 예시(Story 1.4).
- [Source: apps/web/app/admin/templates/[hallId]/] — `isValidUuid`+`notFound()` 라우트 가드 패턴, Server Action/폼 패턴의 실제 코드.
- [Source: _bmad-output/implementation-artifacts/2-1-ceremony-registration.md#Dev Notes] — 계약 형태 키(`requiresOfficiant`, `hasAdditionalEvent`) 정의 원문.

## Dev Agent Record

### Agent Model Used

Amelia (claude-sonnet-5)

### Debug Log References

- **jsonb 컬럼 타입 갭:** `schema.ts`의 `applicableContractConditions`/`contractConditions`는 `.$type<...>()` 없이 선언돼 있어 drizzle이 `unknown`으로 추론했다(Story 2.1 시점엔 단순 pass-through라 안 드러남). 이번 스토리에서 `item.applicableContractConditions?.requiresOfficiant`처럼 실제로 값을 읽는 코드를 추가하자마자 tsc가 "Object is of type 'unknown'"으로 잡아냄 — 두 컬럼 모두 `.$type<Record<string, boolean>>()`를 추가해 해결(마이그레이션 불필요, 타입 전용 변경).
- **부분집합 매칭 테스트로 실제 매칭 방향을 검증함:** `ceremony.contract_conditions @> template_item.applicable_contract_conditions` 방향을 실제 DB에 태깅된 항목 3가지 케이스(제외/포함/무조건포함)로 검증 — 전부 스토리 Dev Notes의 표대로 동작함을 확인.
- **수동 검증 중 발견한 검증 스크립트 자체의 함정(앱 버그 아님):** (1) 상세 페이지의 "제외" 버튼은 `useActionState` 없는 plain Server Action이라 `$ACTION_ID_<hash>` 히든 필드가 필요한데, 처음엔 이 필드 없이 POST해서 500을 봤다 — Story 1.4에서 이미 기록된 인코딩 차이(useActionState 액션은 `$ACTION_REF_N`, plain 액션은 `$ACTION_ID_<hash>`)를 재확인. (2) "제외" 후 해당 항목명이 페이지에서 완전히 사라질 거라 잘못 가정해 검증 스크립트가 실패로 보였음 — 실제로는 인스턴스에서만 빠지고 원본 템플릿 항목은 그대로라 "추가 가능한 항목" 섹션에 다시 나타나는 게 맞는 동작(DB 직접 조회로 삭제 자체는 확인됨). 둘 다 애플리케이션 코드가 아니라 검증 스크립트의 실수였다.

**코덱스 리뷰 1차(PR #9) — 2건 실결함, 둘 다 수정·회귀 테스트 추가 후 확인:**
- **[P1] `readContractConditions`가 체크 안 한 조건도 `false`로 채우고 있었음.** 부분집합 매칭은 "요구 조건 없음"(키 없음)과 "false를 요구함"(키 있음+false)을 구분하는데, 태깅 안 한 템플릿 항목이 매번 `{requiresOfficiant:false, hasAdditionalEvent:false}`가 되어 해당 조건이 `true`인 예식에서 잘못 제외되는 실제 버그였다. 체크한 키만 넣도록 수정(`{}` = 무조건 포함). 순수 함수라 `"use server"` 파일 밖(`contract-conditions.ts`)으로 분리해 단위 테스트 가능하게 만듦.
- **[P2] `addItem`에 (instance_id, template_item_id) 유일성이 보장되지 않아, 재전송·두 탭 동시 제출로 같은 항목이 중복 추가될 수 있었음.** DB에 UNIQUE 제약 추가(`0009_curly_fallen_one.sql`) + `onConflictDoNothing`으로 멱등하게 처리하도록 수정.

### Completion Notes List

- AC 1~4 전부 로컬 서버에 실제 로그인 후 HTTP 요청으로 검증: (1) "주례 관련"으로 태깅한 템플릿 항목이 "주례 없음" 예식 등록 시 인스턴스에서 실제로 빠지고, "주례 있음"이면 포함됨을 DB 직접 조회로 확인, (2) 상세 페이지에서 후보 항목 추가 → "포함된 항목"으로 이동, 제외 → "추가 가능한 항목"으로 복귀함을 확인, (3) 다른 홀의 templateItemId를 폼 필드에서 직접 조작해 추가를 시도 → `ChecklistInstanceValidationError`로 거부되고 DB에도 실제로 추가되지 않음을 확인(2-hop 재검증의 핵심 시나리오), (4) 조합 후보 목록에 다른 홀의 템플릿 항목이 한 번도 노출되지 않음을 확인.
- Story 2.1의 원자적 생성 CTE는 재작성하지 않고 Dev Notes에 명시된 최소 diff만 적용 — 기존 raw SQL 타임존 처리는 그대로 유지.
- "당일" 제약, 최소 항목 수 제약, 예식 자체의 계약 형태 수정 UI는 스토리 Dev Notes "스코프 경계"에 따라 구현하지 않음.

### File List

- `apps/web/lib/db/schema.ts` (MODIFY) — `applicableContractConditions`/`contractConditions`에 `.$type<Record<string, boolean>>()` 추가
- `apps/web/lib/db/repositories/template-item.ts` (MODIFY) — `create`/`update`에 `applicableContractConditions` 입력 추가
- `apps/web/lib/db/repositories/ceremony.ts` (MODIFY) — `create()` CTE에 부분집합 매칭 JOIN 조건 추가
- `apps/web/lib/db/repositories/checklist-instance.ts` (NEW)
- `apps/web/lib/services/template.ts` (MODIFY)
- `apps/web/lib/services/checklist-instance.ts` (NEW)
- `apps/web/app/admin/templates/[hallId]/actions.ts` (MODIFY) — 조건 체크박스 값 읽기
- `apps/web/app/admin/templates/[hallId]/template-item-form.tsx` (MODIFY) — 조건 체크박스 2개
- `apps/web/app/admin/templates/[hallId]/template-item-row.tsx` (MODIFY) — 조건 배지 표시
- `apps/web/app/admin/templates/[hallId]/templates.css` (MODIFY)
- `apps/web/app/admin/ceremonies/ceremony-row.tsx` (MODIFY) — 상세 페이지 링크
- `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/actions.ts` (NEW)
- `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx` (NEW)
- `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/add-item-button.tsx` (NEW)
- `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/ceremony-detail.css` (NEW)
- `apps/web/tests/helpers/db.ts` (MODIFY) — `createTestTemplateItem`에 `applicableContractConditions` 오버라이드 추가
- `apps/web/tests/repositories/ceremony.test.ts` (MODIFY) — 부분집합 매칭 테스트 3건 추가
- `apps/web/tests/repositories/checklist-instance.test.ts` (NEW, 코덱스 1차 이후 중복 방지 테스트 추가)
- `apps/web/tests/services/checklist-instance.test.ts` (NEW)
- `apps/web/app/admin/templates/[hallId]/contract-conditions.ts` (NEW, 코덱스 1차 P1 수정)
- `apps/web/tests/lib/template-item-conditions.test.ts` (NEW, 코덱스 1차 P1 회귀 테스트)
- `apps/web/drizzle/0009_curly_fallen_one.sql` (NEW, 코덱스 1차 P2 — instance_id/template_item_id UNIQUE)

## Change Log

- 2026-07-27: Story 구현 완료. AC 1~4 전부 자동화 테스트(vitest, 신규 16건) + 실제 로컬 서버 수동 검증(HTTP 요청 + DB 직접 조회)으로 확인. 구현 중 jsonb 컬럼의 TS 타입 갭(`unknown`)을 실제 사용 코드 작성 중 tsc가 잡아내 `.$type<>()` 추가로 해결.
