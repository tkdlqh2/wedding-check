---
baseline_commit: 03e3c84890af7c27d09bde57177af88fe15f73fd
---

# Story 5.5: 체크리스트 템플릿 2단계 구조 전환 — 단계 + 체크리스트 항목

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 체크리스트 템플릿을 "단계"(이름만)와 그 아래 여러 "체크리스트 항목"(제목 필수, 설명·시연 영상 선택)의 2단계로 관리할 수 있기를,
so that 실제 큐시트처럼 한 단계 안의 여러 개별 확인 사항을 각각 독립적으로 등록·확인할 수 있다.

## Acceptance Criteria

1. **Given** 템플릿 관리 화면에서 단계를 등록/수정하면 **When** 단계 폼을 확인하면 **Then** 단계명만 입력하며(설명 필드 없음), 계약 형태 조건 태그(AD-9)는 기존과 동일하게 단계 단위로 유지된다.
2. **Given** 단계가 등록되어 있을 때 **When** 그 단계 아래에 체크리스트 항목을 등록하면 **Then** 제목(필수)·설명(선택)·시연 영상(선택)을 가진 항목이 그 단계 소속으로 저장되고, 단계 안에서 순서를 위/아래로 변경할 수 있다.
3. **Given** 체크리스트 항목에 시연 영상을 업로드하면 **When** 항목을 조회하면 **Then** 그 영상이 해당 체크리스트 항목에 바로 재생 가능하게 연결된다.
4. **Given** 제목 없이 체크리스트 항목 저장을 시도하면 **When** 저장 버튼을 누르면 **Then** 저장이 거부된다.
5. **Given** 예식이 등록되어 체크리스트 인스턴스가 생성될 때 **When** 계약 형태 조건(AD-9)에 맞는 단계가 선택되면 **Then** 그 단계에 속한 모든 체크리스트 항목이 인스턴스에 함께 포함된다.
6. **Given** 오퍼레이터가 실행 중 조회 화면을 열면 **When** 체크리스트를 확인하면 **Then** 단계명이 그룹 제목으로 표시되고, 그 아래 각 체크리스트 항목이 개별 POS Tile(제목 표시)로 표시되어 각각 탭으로 선택할 수 있다.
7. **Given** 관리자가 예식 상세 화면에서 인스턴스에 항목을 수동 추가/제외하면(Story 2.2) **When** 추가/제외 대상을 확인하면 **Then** 그 대상은 개별 체크리스트 항목이며, 후보 목록은 소속 단계로 그룹핑되어 표시된다.

## Tasks / Subtasks

- [x] Task 1: 스키마 — `apps/web/lib/db/schema.ts` (MODIFY, AC: 1, 2, 3, 5)
  - [x] `checklistTemplateItems`("단계")에서 `description` 컬럼 제거. `hallId`/`stepName`/`sortOrder`/`applicableContractConditions`는 그대로 유지.
  - [x] NEW: `checklistTemplateItemChecks`("체크리스트 항목") 테이블 추가 — `id`, `hallId`(AD-2 직접 저장, `halls` 참조), `templateItemId`(uuid, `checklistTemplateItems.id` 참조, `onDelete: "cascade"` — 단계 삭제 시 그 소속 체크리스트 항목도 함께 삭제, 기존 FR-2 하드 삭제 정책 유지), `title`(text, notNull), `description`(text, nullable), `sortOrder`(integer, notNull), `createdAt`/`updatedAt`. `unique(templateItemId, sortOrder)`를 `checkListTemplateItems`와 동일하게 DEFERRABLE INITIALLY DEFERRED로(마이그레이션 SQL 수기 수정 필요 — `template-item.ts` 상단 주석 및 기존 `0007`/`0009` 마이그레이션 파일의 처리 방식 참고).
  - [x] `demoVideos`: `templateItemId` 컬럼을 `checklistItemId`로 이름 변경, 참조 대상을 `checklistTemplateItemChecks.id`로 변경(`onDelete: "cascade"` 유지). `unique(demoVideos.checklistItemId)`로 이름/대상 갱신(1항목당 영상 1개 정책 유지).
  - [x] `checklistInstanceItems`: `templateItemId`(단계로의 소프트 참조) 컬럼을 `templateItemCheckId`로 이름 변경, 참조 대상을 `checklistTemplateItemChecks.id`로 변경(`onDelete: "set null"` 유지 — Story 2.1 "실행용 사본" 원칙: 원본 삭제/수정이 이미 만들어진 예식의 체크리스트를 바꾸지 않음). `title`(text, notNull) 컬럼 추가(체크리스트 항목의 제목 스냅샷). `description`은 그대로 유지하되 이제 "단계 설명"이 아니라 "체크리스트 항목 설명"의 스냅샷이 된다. `stepName`은 그대로 유지(그룹핑 표시용, 소속 단계명 스냅샷). UNIQUE 제약을 `(instance_id, template_item_id)`에서 `(instance_id, template_item_check_id)`로 변경.
  - [x] `drizzle-kit generate`가 rename 모호성 때문에 비대화형 셸에서 프롬프트로 막혀 `--custom`으로 빈 마이그레이션(`0010_checklist-two-level-structure.sql`)을 생성한 뒤 SQL을 직접 작성(DEFERRABLE 포함). dev DB(`wedding_check`)는 관련 행이 0개라 무손실 적용됨. 테스트 DB(`wedding_check_test`)는 기존 `demo_videos` 2행이 있어 1차 적용 중 NOT NULL 위반으로 중간 실패 — 마이그레이션에 `DELETE FROM "demo_videos";`를 추가해 파일을 고치고, 이미 부분 적용된 테스트 DB는 수기 SQL로 나머지 단계(컬럼 추가+제약)를 맞춰 최종 상태를 dev DB와 동일하게 수렴시켰다(`\d` 출력으로 4개 테이블 전부 대조 확인). `checklist_instance_items` 기존 2행(전부 이전 스토리들의 수동 검증용 테스트 데이터)은 새 구조로 백필 불가능해 삭제.

- [x] Task 2: 단계(Step) 리포지토리/서비스 축소 — `apps/web/lib/db/repositories/template-item.ts`, `apps/web/lib/services/template.ts` (MODIFY, AC: 1)
  - [x] `template-item.ts`: `create`/`update`의 input에서 `description` 제거(타입도 함께). `TemplateItem` 타입은 스키마 변경에 따라 자동으로 description 없는 형태가 된다. `findAllByHall`/`findById`/`remove`/`setSortOrder`/`moveAdjacent`는 그대로.
  - [x] `template.ts`: `createTemplateItem`/`updateTemplateItem`의 input에서 `description` 제거. `assertValidStepName` 등 검증 로직은 그대로.

- [x] Task 3: 체크리스트 항목(Checklist Item) 리포지토리/서비스 신설 — `apps/web/lib/db/repositories/checklist-item.ts`(NEW), `apps/web/lib/services/checklist-item.ts`(NEW) (AC: 2, 4)
  - [x] 리포지토리: `template-item.ts`와 동일한 패턴(동시성 재시도 `withConcurrencyRetry`, `(hallId, templateItemId)` 스코프의 sort_order 계산, `moveAdjacent`)을 그대로 재사용하되, sort_order 스코프가 `hallId` 전체가 아니라 `templateItemId`(그 단계 안)로 좁혀진다는 점만 다르다:
    - `create(hallId, templateItemId, { title, description? })`: `sortOrder`는 `coalesce(max(sort_order) where template_item_id = $templateItemId, -1) + 1`로 단일 INSERT 문 안에서 계산(기존 `template-item.ts:create`와 동일 기법). UNIQUE 위반 시 재시도.
    - `findAllByTemplateItem(hallId, templateItemId)`: `sortOrder` asc 정렬.
    - `findById(hallId, id)`.
    - `update(hallId, id, { title, description? })`.
    - `remove(hallId, id)`: 하드 삭제(FR-2 정책 동일, `demoVideos.checklistItemId`의 `onDelete: cascade`가 연결된 영상도 함께 정리).
    - `moveAdjacent(hallId, id, direction)`: 인접 항목 탐색 시 `where hall_id = $hallId and template_item_id = (select template_item_id from target) and sort_order <op> (select sort_order from target)`로 같은 단계 안에서만 스왑(다른 단계로 넘어가지 않음).
  - [x] 서비스: `createChecklistItem(hallId, templateItemId, input)` — AD-2 2-hop 재검증(기존 `assertTemplateItemOwnedByHall` 패턴 재사용 — `templateItemRepo.findById(hallId, templateItemId)`가 없으면 거부) 후 `title` 필수 검증(`assertValidStepName`과 동일한 트림+빈값 거부 로직, 이름은 `assertValidTitle` 등으로) → repo 호출. `updateChecklistItem`/`deleteChecklistItem`/`moveChecklistItem`/`listChecklistItems`도 동일 패턴으로.
  - [x] `ChecklistItemValidationError` 클래스(기존 `TemplateItemValidationError`와 동일 패턴).

- [x] Task 4: 시연 영상 서비스/리포지토리 대상 변경 — `apps/web/lib/db/repositories/demo-video.ts`, `apps/web/lib/services/demo-video.ts` (MODIFY, AC: 3)
  - [x] 리포지토리: `upsertForTemplateItem` → `upsertForChecklistItem(hallId, checklistItemId, input)`(컬럼명 `checklistItemId`로 insert). `findByTemplateItemIds` → `findByChecklistItemIds(hallId, checklistItemIds)`.
  - [x] 서비스: `assertTemplateItemOwnedByHall` → `assertChecklistItemOwnedByHall(hallId, checklistItemId)`(`checklistItemRepo.findById` 사용, 존재하지 않으면 `DemoVideoValidationError`). `saveDemoVideo(hallId, checklistItemId, input)`, `listDemoVideosByItems(hallId, checklistItemIds)`.
  - [x] 이 이름 변경이 Task 5의 video API 라우트 3개(`blob`/`local`/`status`)에서 쓰는 `saveDemoVideo`/`assertTemplateItemOwnedByHall` import를 깨뜨린다 — 라우트도 함께 갱신(Task 5).

- [x] Task 5: 시연 영상 API 라우트 — `apps/web/app/api/templates/[hallId]/items/[itemId]/video/{blob,local,status}/route.ts` (MODIFY, AC: 3)
  - [x] URL 경로의 `itemId` 세그먼트는 이미 범용 이름이라 그대로 유지(경로 자체는 바꾸지 않음) — 다만 이 값이 이제 "단계 id"가 아니라 "체크리스트 항목 id"를 의미하게 된다는 점을 각 라우트 상단 주석에 명시.
  - [x] 세 라우트 모두 `assertTemplateItemOwnedByHall`/`saveDemoVideo` 호출을 Task 4에서 이름 바뀐 `assertChecklistItemOwnedByHall`/`saveDemoVideo(hallId, checklistItemId, ...)`로 갱신. `tokenPayload`에 담기는 `templateItemId` 키도 `checklistItemId`로 이름 변경(blob 라우트의 `onBeforeGenerateToken`/`onUploadCompleted` 양쪽).
  - [x] `revalidatePath`는 그대로(`/admin/templates/${hallId}`).

- [x] Task 6: 예식 등록 시 인스턴스 자동 조합 CTE 재작성 — `apps/web/lib/db/repositories/ceremony.ts` (MODIFY, AC: 5)
  - [x] `create()`의 `new_items` CTE를 단계→체크리스트 항목 전개로 재작성. `checklist_template_items`를 계약 형태 조건으로 필터링(기존 로직 그대로, AD-9 `@>` 매칭 유지)한 뒤, 각 단계에 속한 `checklist_template_item_checks`를 JOIN해 항목 단위로 전개하고, `row_number() over (order by ti.sort_order, tic.sort_order)`로 단계 순서 → 단계 안 항목 순서 순으로 평탄화된 단일 `sort_order`를 계산해 insert:
    ```sql
    new_items as (
      insert into checklist_instance_items
        (hall_id, instance_id, template_item_check_id, step_name, title, description, sort_order)
      select ni.hall_id, ni.id, tic.id, ti.step_name, tic.title, tic.description,
        row_number() over (order by ti.sort_order, tic.sort_order)
      from new_instance ni
      join new_ceremony nc on nc.id = ni.ceremony_id
      join checklist_template_items ti
        on ti.hall_id = ni.hall_id
        and nc.contract_conditions @> ti.applicable_contract_conditions
      join checklist_template_item_checks tic
        on tic.template_item_id = ti.id
      returning id
    )
    ```
  - [x] 단계에 체크리스트 항목이 하나도 없으면(빈 단계) 그 단계는 INNER JOIN 특성상 자동으로 인스턴스에서 빠진다 — 의도된 동작인지 Dev Notes에 명시(빈 단계는 어차피 오퍼레이터가 체크할 것이 없으므로 인스턴스에 나타나지 않는 것이 맞다).

- [x] Task 7: 인스턴스 조회/수동 추가·제외 리포지토리·서비스 — `apps/web/lib/db/repositories/checklist-instance.ts`, `apps/web/lib/services/checklist-instance.ts` (MODIFY, AC: 6, 7)
  - [x] `listItems`: 반환 타입(`ChecklistInstanceItem`)이 스키마 변경에 따라 자동으로 `title` 포함 형태가 됨 — 함수 본문 변경 없음.
  - [x] `addItem(hallId, instanceId, checklistItem)`: 파라미터를 템플릿 항목(step) 대신 체크리스트 항목으로 받도록 시그니처 변경 — `checklistItem: Pick<ChecklistTemplateItemCheck, "id" | "title" | "description" | "sortOrder"> & { stepName: string }`(stepName은 호출자인 서비스가 부모 단계에서 조회해 채워 넘김). insert 시 `templateItemCheckId: checklistItem.id`, `title`, `description`, `stepName`, `sortOrder`. `onConflictDoNothing`의 `target`을 `[instanceId, templateItemCheckId]`로 갱신.
  - [x] `removeItem`: 시그니처 변경 없음(인스턴스 항목 id로 삭제하는 기존 방식 그대로 — 이제 그 행이 체크리스트 항목 1개를 가리킬 뿐).
  - [x] `listCandidateTemplateItems` → `listCandidateChecklistItems(hallId, instanceId)`로 이름 변경: 이미 포함된 `templateItemCheckId` 목록을 조회한 뒤, 그 홀의 모든 체크리스트 항목(`checklistTemplateItemChecks`, 소속 단계 `stepName`도 함께 join해서 반환 — 관리자 화면에서 단계별로 그룹핑해 보여줘야 하므로) 중 아직 포함되지 않은 것만 반환. 반환 타입에 `stepName`을 포함시켜 서비스/화면이 그룹핑할 수 있게 한다.
  - [x] 서비스 `getCeremonyDetail`: `candidates` 타입이 체크리스트 항목(+stepName) 배열로 바뀜.
  - [x] 서비스 `addInstanceItem(hallId, ceremonyId, checklistItemId)`: `checklistItemRepo.findById(hallId, checklistItemId)`로 항목을 찾고, 그 항목의 `templateItemId`로 부모 단계를 `templateItemRepo.findById`로 조회해 `stepName`을 얻은 뒤 `instanceRepo.addItem`에 전달(AD-2 2-hop 재검증은 `checklistItemRepo.findById(hallId, ...)` 자체가 hallId로 스코프되어 있어 충족됨 — 다른 홀의 checklistItemId를 넣으면 findById가 undefined를 반환).

- [x] Task 8: 오퍼레이터 조회 서비스 타입 — `apps/web/lib/services/checklist-instance.ts`의 `OperatorInstanceView` (AC 없음 — Task 7과 같은 파일, 타입은 스키마 변경으로 자동 갱신되므로 별도 코드 변경 불필요, 확인만)

- [x] Task 9: 어드민 템플릿 관리 화면 — 단계 폼/행 축소 — `apps/web/app/admin/templates/[hallId]/template-item-form.tsx`, `template-item-row.tsx`, `actions.ts` (MODIFY, AC: 1)
  - [x] `template-item-form.tsx`: "설명" `<textarea>` 필드 제거. `item` prop 타입에서 `description` 제거.
  - [x] `template-item-row.tsx`: `item.description` 렌더링 블록과 영상 블록(`template-item-card__video`, `<VideoUpload .../>`) 제거 — 영상은 이제 Task 10의 체크리스트 항목 행에 있음. 대신 그 단계의 체크리스트 항목 목록(Task 10의 `ChecklistItemRow` 리스트)과 "체크리스트 항목 추가" 폼(Task 10의 `ChecklistItemForm`)을 이 컴포넌트 안에 중첩 렌더링.
  - [x] `actions.ts`: `createTemplateItemAction`/`updateTemplateItemAction`에서 `description` formData 읽기/전달 제거.

- [x] Task 10: 어드민 템플릿 관리 화면 — 체크리스트 항목 폼/행 신설 — `apps/web/app/admin/templates/[hallId]/checklist-item-form.tsx`(NEW), `checklist-item-row.tsx`(NEW), `actions.ts`(MODIFY) (AC: 2, 3, 4)
  - [x] `checklist-item-form.tsx`: `template-item-form.tsx`를 참고해 동일한 `useActionState` 패턴. 필드: 제목(text, required — `assertValidTitle`이 서버에서 검증하지만 클라이언트 `required`도 UX상 추가), 설명(textarea, optional). `hallId`/`templateItemId`/(수정 시) `id`를 hidden input으로.
  - [x] `checklist-item-row.tsx`: `template-item-row.tsx`의 기존 영상 블록(`<video controls>`/`영상 없음`/`<VideoUpload>`)을 그대로 옮겨오되 prop명을 `templateItemId` → `checklistItemId`로. 제목/설명 표시, 단계 내 위/아래 재정렬 버튼(`moveChecklistItemAction`), 수정/삭제 버튼.
  - [x] `actions.ts`: `createChecklistItemAction`/`updateChecklistItemAction`/`deleteChecklistItemAction`/`moveChecklistItemAction` 추가(기존 4종 템플릿 항목 액션과 동일한 `isMalformedId` 가드 패턴).
  - [x] `video-upload.tsx`: prop명 `templateItemId` → `checklistItemId`로 변경(내부적으로 API 경로 문자열 조합에만 쓰이므로 실질 동작 변화 없음).

- [x] Task 11: 어드민 템플릿 페이지 데이터 로딩 — `apps/web/app/admin/templates/[hallId]/page.tsx` (MODIFY, AC: 1, 2, 3)
  - [x] 각 단계(`items`)마다 그 소속 체크리스트 항목 목록(`listChecklistItems(hallId, item.id)`)과 그 항목들에 연결된 영상(`listDemoVideosByItems(hallId, checklistItemIds)`, 이제 checklistItemId 기준)을 함께 조회해 `TemplateItemRow`에 전달.
  - [x] N+1 방지: 모든 단계의 체크리스트 항목을 한 번에 가져오는 `listChecklistItemsByTemplateItems(hallId, templateItemIds)` 같은 배치 조회 함수를 Task 3에 추가하고 여기서 사용(기존 `listDemoVideosByItems`가 이미 이 배치 조회 패턴을 쓰고 있음 — 동일하게).

- [x] Task 12: 어드민 예식 상세 화면 — 수동 추가/제외 대상 변경 — `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx`, `add-item-button.tsx` (MODIFY, AC: 7)
  - [x] `page.tsx`: "포함된 항목" 목록은 이제 체크리스트 항목 단위(각 행에 `item.title` 표시, `item.stepName`을 소속 표시로 함께 보여줌 — 예: "개식사 · 조명: 사회자 조명 준비"). "추가 가능한 항목" 목록(`candidates`)은 소속 단계(`stepName`)로 그룹핑해서 렌더링(예: 단계명을 소제목으로, 그 아래 체크리스트 항목들을 나열).
  - [x] `add-item-button.tsx`: prop명 `templateItemId` → `checklistItemId`로 변경(내부 hidden input name도 `checklistItemId`).
  - [x] `actions.ts`(`ceremonies/[hallId]/[ceremonyId]/actions.ts`): `addInstanceItemAction`의 formData 키 `templateItemId` → `checklistItemId`.

- [x] Task 13: 오퍼레이터 조회 화면 — 단계별 그룹핑 렌더링 — `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.tsx`, `checklist-instance-view.css` (MODIFY, AC: 6)
  - [x] `OperatorItem` 타입에 `title: string` 추가(POS Tile 라벨로 사용, 기존 `stepName` 대신). `stepName`은 그룹핑 헤더용으로 유지.
  - [x] 렌더링: `items`를 순서 그대로(이미 서버가 정렬해서 줌, Task 6의 flattened sort_order) 순회하며 `stepName`이 바뀔 때마다 새 그룹 헤더(`<h2>` 또는 유사, 비인터랙티브)를 렌더링하고, 그 아래 `checklist-tile-grid`에 그 단계의 체크리스트 항목들을 POS Tile로 나열(각 타일 라벨은 `item.title`). `selectedIds`/`toggleSelected`/오프라인·캐시·폴링 로직은 항목 단위로 그대로 동작(itemId가 이제 체크리스트 항목 id이므로 자연히 맞음).
  - [x] CSS: 그룹 헤더 스타일 추가(DESIGN.md 토큰 — `--color-text-secondary`, 14px/600 정도의 절제된 섹션 라벨, 화려하지 않게 §7 Do's/Don'ts "실행 화면을 장식하지 말 것" 준수).

- [ ] Task 14: 시드 스크립트 전면 재작성 — `apps/web/scripts/seed-ceremony-checklist.ts` (MODIFY, AC 없음 — 검증용 실 데이터 정합성)
  - [ ] `STEPS` 배열 구조를 `{ stepName: string; items: { title: string; description?: string }[] }[]`로 변경. 기존 12단계 각각의 "·"로 구분된 description 문자열을 개별 체크리스트 항목(제목+선택적 설명)으로 분해 — 예: "개식사"의 기존 `"조명: 사회자 조명 준비 · 주의: 조명이 들어가면 개식사부터 진행하도록 사회자에게 사전 안내"`를 `[{ title: "사회자 조명 준비" }, { title: "조명 진입 시 개식사 진행 안내", description: "조명이 들어가면 개식사부터 진행하도록 사회자에게 사전 안내" }]` 형태로(제목은 핵심 동작을 짧게, 부가 맥락이 있으면 설명으로). 12단계 전체를 원본 큐시트 메모(세션 앞부분에서 사용자가 제공한 원문, 이 스토리 파일에는 재수록하지 않음 — 기존 커밋의 `seed-ceremony-checklist.ts` git 히스토리에서 원문 확인 가능)를 참고해 분해.
  - [ ] 시드 로직: 기존 "stepName 매칭 upsert + currentMax 기준 재배치" 패턴을 2단계로 확장 — (1) 단계를 upsert(설명 없이 stepName만), (2) 그 단계 안에서 체크리스트 항목들을 title 매칭 upsert(같은 `currentMax+1+index` 재배치 기법을 `templateItemId` 스코프로 적용). 삭제 로직 없음 원칙(코덱스 리뷰 1~2차 교훈, PR #11)을 그대로 유지 — 이름이 일치하지 않는 기존 체크리스트 항목도 지우지 않는다.
  - [ ] 재실행 시 기존 2개 홀(1층/2층)의 데이터가 새 구조로 안전하게 수렴하는지 로컬 DB에 실제로 재실행해 확인(Task 17 수동 검증에서).

- [ ] Task 15: 테스트 — 리포지토리/서비스 (AC: 1, 2, 3, 4, 5, 7)
  - [ ] `apps/web/tests/repositories/template-item.test.ts`(MODIFY): `description` 관련 assertion 제거/갱신.
  - [ ] `apps/web/tests/repositories/checklist-item.test.ts`(NEW): create(sortOrder 자동 계산), findAllByTemplateItem(정렬), update, remove(연결된 demo_video cascade 확인), moveAdjacent(같은 단계 안에서만 스왑 — 다른 단계 항목과는 섞이지 않는지 별도 테스트), 홀 스코프 격리.
  - [ ] `apps/web/tests/repositories/demo-video.test.ts`(MODIFY): `templateItemId` → `checklistItemId` 관련 전부 갱신.
  - [ ] `apps/web/tests/repositories/ceremony.test.ts`(MODIFY): `create()`가 단계당 여러 체크리스트 항목을 올바르게 전개하고 flattened sort_order가 (단계 순서, 항목 순서)를 따르는지 검증하는 테스트 추가. 빈 단계(체크리스트 항목 없음)가 인스턴스에서 자동 제외되는지 테스트 추가.
  - [ ] `apps/web/tests/repositories/checklist-instance.test.ts`(MODIFY): `addItem`/`removeItem`/`listCandidateChecklistItems`(이름 변경) 전부 체크리스트 항목 단위로 갱신, `stepName` 그룹핑 정보가 candidates에 포함되는지 확인.
  - [ ] `apps/web/tests/services/demo-video.test.ts`(MODIFY): 함수명/인자명 갱신.
  - [ ] `apps/web/tests/services/checklist-instance.test.ts`(MODIFY): `getOperatorInstanceView`가 반환하는 항목에 `title`이 포함되는지, `getCeremonyDetail`의 candidates가 체크리스트 항목+stepName 형태인지 갱신.
  - [ ] NEW: `apps/web/tests/services/checklist-item.test.ts`: 제목 필수 검증(빈 문자열/공백만 거부), AD-2 2-hop 재검증(다른 홀 templateItemId로 생성 시도 시 거부).
  - [ ] `apps/web/tests/lib/template-item-conditions.test.ts`: 이 파일이 `description` 관련 로직을 다루지 않는지 확인(순수 조건 파싱 함수라 영향 없을 가능성 높음 — 영향 있으면 갱신).

- [ ] Task 16: 테스트 — 컴포넌트 (AC: 6)
  - [ ] `apps/web/tests/components/checklist-instance-view.test.tsx`(MODIFY): 기존 6개 테스트의 mock 데이터(`initialItems`)에 `title` 필드 추가, 탭 선택 대상 텍스트를 `stepName`이 아니라 `title` 기준으로 갱신. NEW 테스트: 서로 다른 두 단계에 속한 항목들이 각각의 그룹 헤더 아래 올바르게 나뉘어 렌더링되는지 확인.
  - [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [ ] Task 17: 수동 검증
  - [ ] 마이그레이션을 로컬 dev DB에 적용 후, `npm run seed:ceremony-checklist` 재실행 — 두 홀 모두 12단계 + 각 단계별 체크리스트 항목이 올바르게 생성/재배치되는지 `docker exec wedding-check-db psql`로 직접 확인.
  - [ ] 로컬 서버에서 관리자 로그인 → `/admin/templates/[hallId]`에서 단계 등록(설명 필드 없음 확인) → 그 단계에 체크리스트 항목 2개 등록(제목만/제목+설명) → 하나에 영상 업로드 → 재생 확인 → 위/아래 재정렬이 같은 단계 안에서만 동작하는지 확인.
  - [ ] `/admin/ceremonies`에서 새 예식 등록 → 생성된 인스턴스의 항목 수가 "포함된 단계들의 체크리스트 항목 합계"와 일치하는지 DB로 직접 확인(AC 5) → `/admin/ceremonies/[hallId]/[ceremonyId]`에서 후보 목록이 단계별로 그룹핑되어 보이는지, 개별 체크리스트 항목 추가/제외가 되는지 확인.
  - [ ] 오퍼레이터 로그인 → `/operator/ceremonies/[hallId]/[ceremonyId]`에서 단계 그룹 헤더 + 체크리스트 항목 POS Tile이 올바르게 표시되고 탭 선택이 즉시 반영되는지 SSR HTML + 실제 탭 동작(자동화 컴포넌트 테스트로 대체 가능, Story 2.3 한계와 동일) 확인.

## Dev Notes

### 배경 — 왜 이 스토리가 필요한가

Story 5.1 리뷰 중 대표가 직접 발견. 현재 `checklist_template_items`("단계")는 자유 텍스트 `description` 하나와 영상 1개만 가질 수 있다(Story 1.3/1.4 스코프). 하지만 실제 큐시트(2026-07-27 세션 앞부분에서 대표가 공유한 실제 웨딩홀 Cue Sheet 2.7 + 운영 메모)를 반영해 만든 시드 데이터(`seed-ceremony-checklist.ts`, PR #11)를 보면 한 단계 안에 "·"로 구분된 여러 독립적 사실(조명 준비, 사전 안내, 음향 재생 등)이 뭉쳐 있다 — 이건 각각 오퍼레이터가 따로 확인할 수 있는 별개의 체크 항목이어야 한다. 대표의 요구사항 원문: "단계는 그냥 단계 이름만 있으면 되고, 체크리스트는 제목·긴 설명·영상에서 제목은 필수 나머지는 optional."

### 전체 아키텍처 변화 요약

```
[기존]                                    [신규]
checklist_template_items(단계)             checklist_template_items(단계 — 이름만)
  ├─ description                             │
  └─ demo_videos(1:1)                        └─ checklist_template_item_checks(체크리스트 항목, 1:N)
                                                    ├─ title(필수)
                                                    ├─ description(선택)
                                                    └─ demo_videos(1:1, FK 대상 변경)

checklist_instance_items                   checklist_instance_items
  (단계 단위 스냅샷 1행)                        (체크리스트 항목 단위 스냅샷 1행,
                                                 stepName은 그룹핑용으로 유지)
```

계약 형태 조건(AD-9, `applicableContractConditions`)은 **단계 단위에 그대로 유지**한다 — "주례 없음이면 혼인서약 단계 전체 제외" 같은 기존 의미를 그대로 보존하고, 체크리스트 항목 단위로 세분화하지 않는다(대표가 요구하지 않았고, 세분화하면 Story 2.2의 기존 필터링 로직·CTE가 훨씬 복잡해진다 — 과설계 방지).

### 이 스토리가 건드리는 기존 "done" 스토리 범위 (알고 시작할 것)

이 변경은 Story 1.3(체크리스트 항목 등록), 1.4(시연 영상 업로드), 2.1(예식 등록/인스턴스 생성), 2.2(계약 형태 기반 조합 + 수동 추가/제외), 2.3(오퍼레이터 열람)이 만든 스키마·리포지토리·서비스·화면을 모두 관통한다. 각 스토리의 **AC 자체는 이 변경 이후에도 여전히 유효**하다(단계 CRUD는 여전히 되고, 영상 업로드도 여전히 되고, 인스턴스 자동 조합도 여전히 되는 등) — 다만 "항목"이 가리키는 대상이 단계에서 체크리스트 항목으로 한 단계 내려간다. 기존 vitest 스위트가 이 변화를 검증하는 회귀 방지선이므로, Task 15/16에서 기존 테스트를 새 구조에 맞게 갱신하는 것이지 삭제하는 것이 아니다.

### 아키텍처 준수사항

- **AD-2:** 새 테이블 `checklist_template_item_checks`도 홀 종속 엔티티다 — `hallId`를 `templateItemId`와 별도로 직접 저장한다(JOIN으로 대체 금지, `demo_videos`가 이미 쓰는 것과 동일한 패턴).
- **db.transaction() 금지:** Task 6의 CTE 재작성은 기존과 동일하게 단일 SQL 문 안에서 처리한다. Task 3의 체크리스트 항목 생성/재정렬도 `template-item.ts`와 동일하게 단일 INSERT/UPDATE 문 + `(template_item_id, sort_order)` UNIQUE 제약 + 재시도로 동시성을 보장한다(트랜잭션 없이).
- **AD-9:** 부분집합 매칭 로직 자체(단계 단위)는 변경하지 않는다 — Task 6에서 기존 `nc.contract_conditions @> ti.applicable_contract_conditions` 조건을 그대로 재사용하고, 그 뒤에 체크리스트 항목 JOIN만 추가한다.
- **FR-2/FR-3 삭제·업로드 정책:** 체크리스트 항목도 하드 삭제(단계와 동일), 영상 업로드 경로(local/blob 듀얼 스토리지, AD-4)는 대상만 바뀔 뿐 방식은 그대로.

### 스코프 경계 — 하지 말 것

- 계약 형태 조건(AD-9)을 체크리스트 항목 단위로 세분화하지 않는다(위 설명 참고).
- 오퍼레이터 화면에 시연 영상을 노출하지 않는다 — FR-3은 원래 관리자 전용 기능("관리자는 항목별로 영상 파일을 업로드하고 재생 확인할 수 있다")이고, 현재 오퍼레이터 조회 화면(Story 2.3)도 영상을 전혀 보여주지 않는다. 이 스토리는 영상의 **연결 대상**만 단계→체크리스트 항목으로 옮길 뿐, 오퍼레이터에게 영상을 새로 노출하는 기능 추가가 아니다.
- 체크리스트 항목에 "완료" 상태를 서버에 저장하지 않는다 — Story 2.3에서 이미 확정된 스코프 경계(선택 상태는 순수 클라이언트 로컬 상태)를 그대로 유지한다.
- Story 5.2/5.3/5.4(예식 캘린더, 신랑신부 이름, 회원 관리)는 이 스토리와 무관 — 손대지 않는다.

### 테스트 요구사항

vitest 이중 environment(`.test.ts`=node, `.test.tsx`=jsdom, `vitest.config.ts`) 규칙은 기존과 동일. 리포지토리/서비스 테스트는 실제 로컬 테스트 DB(`wedding_check_test`, `npm run db:test:migrate`로 마이그레이션 적용 후)를 쓴다 — 이 스토리는 스키마 마이그레이션이 포함되므로 **테스트 실행 전 반드시 `db:test:migrate`로 테스트 DB에 새 마이그레이션을 적용**해야 한다(Task 15 착수 전 필수 선행 작업으로 Dev Agent Record에 기록할 것).

### 프로젝트 컨텍스트 참고

- `_bmad-output/planning-artifacts/epics.md` Epic 5 섹션(Story 5.5) — 이 스토리의 원본 AC.
- `apps/web/scripts/seed-ceremony-checklist.ts`의 현재(이 스토리 이전) git 히스토리 — Task 14에서 분해할 원본 12단계 description 텍스트의 출처.
- 이전 스토리 파이프라인 관례(sprint-status.yaml `git_pipeline` 참고): 스토리 브랜치 → 단계별 커밋(스키마 → repo/service → API → admin UI → operator UI → seed → 테스트 순으로 커밋을 나누는 것을 권장 — 리뷰하기 쉽고, 문제 발생 시 어느 레이어인지 바로 파악 가능) → `gh pr create` → `codex review --base main` → 실결함 수정 반복 → `gh pr merge --merge --delete-branch` → `gh run watch <run-id> --exit-status` → sprint-status.yaml 갱신.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.5
- 스키마: `apps/web/lib/db/schema.ts`
- 리포지토리: `apps/web/lib/db/repositories/{template-item,demo-video,ceremony,checklist-instance}.ts`
- 서비스: `apps/web/lib/services/{template,demo-video,checklist-instance}.ts`
- 어드민 UI: `apps/web/app/admin/templates/[hallId]/*`, `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/*`
- 오퍼레이터 UI: `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.tsx`
- 시드: `apps/web/scripts/seed-ceremony-checklist.ts`

### Agent Model Used

(dev-story 실행 시 기록)

### Debug Log References

(dev-story 실행 시 기록)

### Completion Notes List

(dev-story 실행 시 기록)

### File List

(dev-story 실행 시 기록)

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story, Story 5.1 리뷰 중 대표가 발견한 후속 요구사항 — Epic 5의 5번째 스토리).
