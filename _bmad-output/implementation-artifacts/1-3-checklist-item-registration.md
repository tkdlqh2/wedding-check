---
baseline_commit: 3d3a2f5279becaa46343566b4cbe3a796cb857a8
---

# Story 1.3: 체크리스트 항목 등록

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 특정 홀에 속한 체크리스트 항목(단계명·설명)을 생성·수정·순서변경·삭제할 수 있기를,
so that 홀 전용 조작 표준을 만들 수 있다.

## Acceptance Criteria

1. Given 홀이 등록되어 있을 때, When 해당 홀 소속으로 단계명을 입력해 항목을 저장하면, Then 항목이 그 홀의 템플릿에만 추가되고 Feature Card 스타일(UX-DR6)로 목록에 나타난다(다른 홀에 영향 없음, AD-2).
2. Given 단계명 없이 저장을 시도하면, When 저장 버튼을 누르면, Then 저장이 거부되고 필드 에러 스타일(1px solid #E0353B + 헬퍼 텍스트, UX-DR14)로 "단계명은 필수입니다"가 표시된다.
3. Given 여러 항목이 등록된 상태에서, When 순서를 변경하면(위/아래 이동), Then 변경된 순서가 즉시 저장되고 목록에 반영된다. (인스턴스 생성 시점의 순서 스냅샷 반영은 Epic 2 책임이며 이 스토리 범위 밖 — 아래 Dev Notes "AC 3 범위 경계" 참고)
4. Given 등록된 항목이 하나도 없을 때, When 해당 홀의 템플릿 화면을 열면, Then 격려하는 톤의 빈 상태 안내 + 등록 CTA가 표시된다(UX-DR12, DESIGN.md §10 금칙어 회피).
5. Given 오퍼레이터 계정으로 로그인한 상태에서, When 템플릿 관리 화면(`/admin/templates/[hallId]`)에 접근을 시도하면, Then 접근이 차단된다(AD-3).

## Tasks / Subtasks

- [x] Task 1: `checklist_template_items` 테이블 스키마 + 마이그레이션 (AC: 1, 2, 3)
  - [x] `lib/db/schema.ts`에 `checklistTemplateItems` 테이블 추가: `id`(uuid, `defaultRandom()`, PK), `hallId`(uuid, not null, `references(() => halls.id)`), `stepName`(text, not null — 단계명), `description`(text, nullable — 설명, FR-2상 선택 필드), `sortOrder`(integer, not null), `applicableContractConditions`(jsonb, not null, default `{}` — AD-9 스키마 확정, 이 스토리에서 편집 UI는 만들지 않음), `createdAt`/`updatedAt`(timestamp, halls와 동일 패턴)
  - [x] `npx drizzle-kit generate`로 마이그레이션 생성(DB 연결 없이 스키마 diff만으로 생성됨, Story 1.1/1.2에서 확인된 방식) — `0004_naive_james_howlett.sql`
  - [x] 로컬 Postgres에 마이그레이션 적용해 검증 — **중요:** 이제 임시 스왑이 필요 없다. `lib/db/index.ts`는 이미 `DATABASE_URL`이 localhost를 가리키면 자동으로 `node-postgres`를 쓰도록 분기되어 있고(2026-07-26 fix 병합됨), `.env.local`의 `DATABASE_URL`도 이미 로컬 Docker Postgres(`wedding-check-db`, 포트 5434)를 가리키고 있다. 그냥 `npm run dev`/마이그레이션 스크립트를 그대로 실행하면 된다 — Story 1.2 방식(임시 스왑 후 원복)을 반복하지 말 것(아래 "Previous Story Intelligence" 참고).

- [x] Task 2: 리포지토리 레이어 — `lib/db/repositories/template-item.ts` (AC: 1, 2, 3)
  - [x] `create(hallId: string, input: { stepName: string; description?: string | null }): Promise<TemplateItem>` — `sortOrder`는 해당 홀의 현재 최대값+1로 자동 계산(append). `WHERE hall_id = $hallId`가 모든 쿼리에 포함되어야 한다(AD-2).
  - [x] `findAllByHall(hallId: string): Promise<TemplateItem[]>` — `WHERE hall_id = $hallId ORDER BY sort_order ASC`
  - [x] `findById(hallId: string, id: string): Promise<TemplateItem | undefined>` — id뿐 아니라 hallId도 WHERE 조건에 포함(다른 홀 소속 id로 조회/수정 시도를 원천 차단, AD-2)
  - [x] `update(hallId: string, id: string, input: { stepName: string; description?: string | null }): Promise<TemplateItem>`
  - [x] `remove(hallId: string, id: string): Promise<void>` — 하드 삭제(아래 "삭제 정책" Dev Notes 참고, halls의 소프트 삭제와 다름)
  - [x] `reorderAll(hallId: string, orderedIds: string[]): Promise<void>` — `db.transaction`으로 각 id의 `sortOrder`를 배열 인덱스로 갱신, 각 UPDATE의 WHERE 절에 `hall_id = $hallId`를 포함해 다른 홀 항목이 섞여 들어와도 무시되게 한다(AD-2 안전장치)
  - [x] `lib/services/*`가 SQL/ORM을 직접 쓰지 않고 이 리포지토리만 호출하도록 강제(AD-2)

- [x] Task 3: 서비스 레이어 — `lib/services/template.ts` (AC: 1, 2, 3)
  - [x] `TemplateItemValidationError extends Error` — Story 1.2의 `HallValidationError`와 동일 패턴
  - [x] `createTemplateItem(hallId: string, input: { stepName: string; description?: string | null })`: `stepName`이 빈 문자열/공백이면 거부(`TemplateItemValidationError` throw). `hallId`가 존재하지 않거나 비활성 홀이면 거부(직접 URL 접근/Server Action 재전송으로 존재하지 않는 홀에 항목이 생기는 것을 서버에서 막음 — `lib/db/repositories/hall.ts::findById` 재사용)
  - [x] `listTemplateItems(hallId)`, `updateTemplateItem(hallId, id, input)`, `deleteTemplateItem(hallId, id)` — 리포지토리 위임
  - [x] `moveTemplateItem(hallId, id, direction: "up" | "down")`: `listTemplateItems(hallId)`로 현재 순서를 가져와 대상 항목과 인접 항목의 위치를 배열에서 바꾼 뒤 `reorderAll(hallId, newOrderedIds)` 호출. 맨 위에서 "up" 또는 맨 아래에서 "down" 요청은 조용히 무시(범위 밖 이동 없음)

- [x] Task 4: 템플릿 관리 화면 — 항목 목록 + 등록/수정 폼 (AC: 1, 2, 4)
  - [x] `app/admin/templates/[hallId]/page.tsx`(Server Component): `hallId` params로 `hall.findById` 조회 → 없거나 비활성이면 `notFound()`. `listTemplateItems(hallId)`로 항목 조회 후 렌더링. 상단에 "← 홀 목록" 링크 + `{hall.name} 체크리스트 항목` 헤딩. 항목이 하나도 없으면 UX-DR12 빈 상태(`#888888` 안내 문구 + 상시 노출된 등록 폼, 격려 톤 — "아직 등록된 체크리스트 항목이 없어요. 첫 항목을 등록해보세요." 류, DESIGN.md §10 금칙어 회피)
  - [x] `app/admin/templates/[hallId]/template-item-form.tsx`(Client Component): 단계명 입력 + 설명 textarea(일반 `.input` 스타일 — FR-6/8용 "있었던 일을 그대로" 톤의 자유서술 textarea와는 다른, 구조화된 운영 콘텐츠이므로 일반 placeholder "이 단계에서 해야 할 일을 설명하세요") + Primary 버튼(UX-DR2). `useActionState`로 Server Action 반환값을 폼 상태로 반영(Story 1.2의 `HallForm` 패턴 재사용)
  - [x] `app/admin/templates/[hallId]/template-item-row.tsx`(Client Component): **Feature Card 스타일(UX-DR6)** 적용 — 흰 배경, `border: 1px solid #E6E6E6`, `border-radius: 12px`(Story 1.2 hall-row의 8px/12px 컴팩트 리스트 스타일과 다름, `padding: 24px`. 단계명(16px/600) + 설명(14px/400, `#555555`) 표시. 위/아래 이동 버튼(맨 위/아래에서는 disabled) + "수정"(Secondary, 인라인 토글로 `TemplateItemForm` 재사용) + "삭제"(`confirm()` 후 하드 삭제)
  - [x] 서버 검증 실패(단계명 없음) 시 `1px solid #E0353B` 보더 + `#E0353B` 12px 헬퍼 텍스트 "단계명은 필수입니다"(UX-DR14, Story 1.2의 `.input--error`/`.field-error` 클래스 재사용)

- [x] Task 5: Server Actions (AC: 1, 2, 3)
  - [x] `app/admin/templates/[hallId]/actions.ts`: `createTemplateItemAction`, `updateTemplateItemAction`, `deleteTemplateItemAction`, `moveTemplateItemAction` — Consistency Conventions(관리자 CRUD는 Server Actions)를 따름
  - [x] 각 액션은 첫 줄에 `requireAdminSession()`을 호출한다(`lib/auth-guard.ts` 재사용, layout 가드는 Server Action 자체를 보호하지 않음 — Story 1.2 코덱스 P1, [[project-wedding-check-auth-patterns]])
  - [x] 각 액션은 `lib/services/template.ts`만 호출(리포지토리/DB 직접 접근 금지, AD-2)
  - [x] 성공 시 `revalidatePath("/admin/templates/[hallId]")`로 목록 갱신

- [x] Task 6: 홀 목록에서 템플릿 관리로 진입 경로 연결 (AC: 1 — 기능이 실제로 도달 가능해야 함)
  - [x] `app/admin/halls/hall-row.tsx`(UPDATE, Story 1.2가 만든 기존 파일)에 "템플릿 관리" 링크(Secondary 버튼 또는 텍스트 링크, `/admin/templates/${hall.id}`로 이동) 추가 — 기존 "수정"/"삭제" 액션 옆에 배치
  - [x] `app/admin/layout.tsx`의 상단 내비 "템플릿" 항목(현재 `admin-nav__link--placeholder`, 클릭 불가 `<span>`)은 이 스토리에서 건드리지 않는다 — 홀별로 스코프된 라우트라 홀을 먼저 골라야 하고, 홀 선택 UI 없는 최상위 `/admin/templates` 인덱스는 이 스토리 AC에 없다(Story 1.2와 동일하게 내비 전면 연결은 이후 스토리로 미룸)

- [x] Task 7: 접근 제어 확인 (AC: 5)
  - [x] `app/admin/templates/`는 이미 `app/admin/layout.tsx`(Story 1.1)의 `role !== 'admin'` 차단 로직 아래에 위치하므로 별도 구현 불필요 — operator 세션으로 `/admin/templates/[hallId]` 접근 시 `/login`으로 리다이렉트됨을 수동 검증(Node fetch 스크립트)으로 확인(307)
  - [x] `apps/web/proxy.ts`의 `/admin/:path*` 매처도 이미 커버함을 확인 — 비로그인 상태도 307로 `/login` 차단됨을 확인

## Dev Notes

### 아키텍처 준수사항

- 소스: `_bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md`
- **AD-2(리포지토리 레이어 독점 + 홀 격리)**: `checklist_template_items`는 스파인이 명시한 "홀 종속 엔티티" 목록에 포함된다 — halls와 달리 **이 스토리부터 AD-2의 `hallId` 필수 첫 인자 규칙이 실제로 적용된다.** 모든 리포지토리 함수는 `hallId`를 첫 인자로 받고, 모든 조회/수정 SQL은 `WHERE hall_id = $hallId`를 포함해야 한다 — 이걸 빠뜨리면 A홀 관리자가 URL의 id만 바꿔 B홀 항목을 수정/삭제할 수 있게 된다(스파인이 명시적으로 막으려는 시나리오).
- **AD-3(역할 2종)**: 템플릿 CRUD는 `admin` 전용(FR-2). `app/admin/` 하위는 Story 1.1의 레이아웃 가드로 이미 보호된다.
- **AD-9(계약 형태 조건부 항목)**: `checklist_template_items`에 `applicable_contract_conditions JSONB` 컬럼을 이번 스토리에서 스키마 레벨로 확정해둔다(기본값 `{}` = 모든 계약 형태에 포함). **이 컬럼을 편집하는 UI는 이 스토리 스코프가 아니다** — 스파인 Deferred 섹션이 "관리자가 이 조건을 편집하는 화면 설계만 UX 단계로 남는다"고 명시. 지금 컬럼만 만들어두는 이유: Epic 2(FR-5, 인스턴스 자동 조합)가 이 컬럼을 읽기 시작할 때 마이그레이션 없이 바로 쓸 수 있게 하기 위해서다.
- **Consistency Conventions**: 관리자 CRUD는 Server Actions(Route Handler 아님). PK는 UUID v4, 타임스탬프는 ISO 8601 UTC.
- **Naming**: 테이블명은 `checklist_template_items`(스네이크 케이스, 스파인 §Consistency Conventions와 1:1). **`checklist_items`처럼 템플릿 항목과 인스턴스 항목을 뭉뚱그리는 이름은 스파인이 명시적으로 금지한다**(AD-2) — 나중에 Epic 2에서 `checklist_instance_items`가 별도로 생긴다.

### `[ASSUMPTION]` 해소 — `checklist_templates` 테이블은 만들지 않는다

- **문제:** 스파인의 Consistency Conventions 표(§118)는 `checklist_templates`와 `checklist_template_items`를 별개 테이블처럼 나열하지만, 같은 문서의 "핵심 엔티티 ERD"(§161-171, mermaid)에는 `CHECKLIST_TEMPLATE`이라는 엔티티가 아예 없고 `HALL ||--o{ CHECKLIST_TEMPLATE_ITEM : "has"`로 홀이 항목을 직접 갖는다. 두 섹션이 서로 어긋난다.
- **근거로 ERD를 택함:** (1) PRD §3 용어집이 "체크리스트 템플릿"을 "홀 단위로 등록되는 재사용 가능한 단계별 항목 모음"이라고 정의한다 — 별도 엔티티가 아니라 **항목들의 집합 자체**를 가리키는 개념어다. (2) PRD/epics 어디에도 "템플릿을 생성한다"는 별도 스토리나 AC가 없다 — Story 1.2(홀 등록) 다음이 바로 Story 1.3(항목 등록)이고 그 사이에 "템플릿 생성" 단계가 없다. (3) 스파인 §159 "핵심 엔티티 ERD"는 명시적으로 스키마 확정 다이어그램으로 취급된다(AD-2 본문도 "스키마 확정(JOIN 대체 금지)" 같은 표현으로 ERD를 권위 있는 것으로 다룸).
- **결정:** `checklist_templates` 테이블을 만들지 않는다. `checklist_template_items.hall_id`가 직접 `halls.id`를 참조한다. "템플릿"은 이 코드베이스에서 "특정 홀에 속한 `checklist_template_items`의 집합"을 가리키는 UI/개념적 용어일 뿐 물리적 테이블이 아니다. `[ASSUMPTION]`이며, 대표 확인 후 스파인이 갱신되면 이 결정도 재검토한다.

### 삭제 정책 — 하드 삭제 (halls와 다름, 실수 아님)

- FR-2 Consequences는 "생성·수정·순서변경·**삭제**"라고만 쓰여 있고, FR-1(홀)처럼 "연결된 데이터가 있으면 비활성화만 허용"이라는 `[ASSUMPTION]` 플래그가 붙어있지 않다.
- 이 스토리 시점에는 `checklist_template_items`를 참조하는 테이블(`demo_videos`, `checklist_instance_items`)이 아직 존재하지 않는다(각각 Story 1.4, Epic 2) — 지금 하드 삭제해도 고아 참조가 생길 수 없다.
- **결정:** `checklist_template_items`는 하드 삭제(`DELETE FROM ...`)한다. halls의 소프트 삭제(`is_active` 플래그)와 다른 정책이니 실수로 halls 패턴을 그대로 복사하지 말 것. Story 1.4에서 `demo_videos`가 이 테이블을 참조하기 시작하면, 그때 삭제 정책을 재검토해야 할 수 있다(이 스토리 스코프 아님, 다음 스토리에 인계).

### AC 3 범위 경계 — "순서 변경이 신규 인스턴스에만 반영"은 Epic 2 책임

- 에픽 AC 원문: "순서를 변경하면 → 이후 생성되는 신규 인스턴스에만 반영되고 기존 인스턴스는 영향받지 않는다." `checklist_instances` 테이블 자체가 아직 존재하지 않으므로(Epic 2), 이 문장의 "인스턴스" 부분은 지금 테스트할 수 없다.
- 이 스토리가 실제로 구현/검증하는 것은: `sortOrder`가 정확히 영속화되고 목록에 그 순서대로 렌더링된다는 것뿐이다. "기존 인스턴스는 영향받지 않는다"는 자동으로 지켜진다 — Epic 2가 인스턴스 생성 시점에 `checklist_template_items`를 스냅샷(복사)해서 `checklist_instance_items`를 만들 것이기 때문이다(스파인 ERD의 "combined into" 관계). **Epic 2 구현자에게 인계:** 인스턴스 생성 로직은 반드시 그 순간의 `sort_order` 값을 복사해야 하며, 이후 템플릿이 바뀌어도 이미 만들어진 인스턴스는 절대 다시 읽지 않아야 한다.

### 라이브러리/프레임워크 요구사항

- 새 의존성 없음. 순서 변경은 드래그앤드롭 라이브러리 없이 위/아래 버튼(배열 스왑 후 `reorderAll`)으로 구현한다 — v1 관리자 도구에 걸맞은 최소 복잡도(신규 npm 패키지는 사용자 승인 필요, dev-story 워크플로우 HALT 조건).
- `jsonb`, `integer` 컬럼 타입은 `drizzle-orm/pg-core`에서 import(Story 1.2까지는 미사용).

### 테스트 요구사항

- 자동화 테스트 프레임워크 미지정(Story 1.1/1.2와 동일 정책) — 수동 검증:
  1. 관리자로 로그인 → 홀 목록에서 "템플릿 관리" 클릭 → 단계명(+설명)을 입력해 저장 → Feature Card 스타일로 목록에 나타나는지, 다른 홀의 템플릿 화면에는 나타나지 않는지 확인(AC 1, AD-2 홀 격리).
  2. 단계명 없이 저장 시도 → 거부되고 "단계명은 필수입니다" 에러 표시 확인(AC 2).
  3. 항목 3개 이상 등록 후 위/아래 버튼으로 순서 변경 → 새로고침해도 순서가 유지되는지 DB(`sort_order` 컬럼)로 확인(AC 3).
  4. 항목이 없는 새 홀의 템플릿 화면 진입 → 격려 톤 빈 상태 + 등록 CTA 확인(AC 4).
  5. operator 세션으로 `/admin/templates/[hallId]` 직접 URL 접근 → `/login` 차단 확인(AC 5).
  6. **홀 격리 회귀 테스트(중요, 이 스토리가 처음 실제로 검증하는 AD-2 규칙):** A홀의 항목 id를 가져와 B홀의 `hallId` 파라미터로 조합한 수정/삭제 Server Action을 직접 재전송 → 거부되거나 조용히 무시되는지(즉 A홀 항목이 바뀌지 않는지) 확인.

### Project Structure Notes

- `app/admin/halls/`(Story 1.2) 옆에 `app/admin/templates/[hallId]/`를 신설한다. 스파인의 `(admin)/templates` 표기는 Story 1.1/1.2에서 이미 일반 세그먼트(`app/admin/`)로 확정되었으므로 그대로 따른다(route group 아님).
- UPDATE 대상: `lib/db/schema.ts`(checklistTemplateItems 테이블 추가), `app/admin/halls/hall-row.tsx`("템플릿 관리" 링크 추가).
- NEW: `lib/db/repositories/template-item.ts`, `lib/services/template.ts`, `app/admin/templates/[hallId]/page.tsx`, `template-item-form.tsx`, `template-item-row.tsx`, `actions.ts`, `templates.css`, 신규 drizzle 마이그레이션 파일.

### Previous Story Intelligence (Story 1.2 + 이번 세션의 fix 두 건)

- **로컬 개발 DB가 이제 상시 동작한다(중요, 이전 스토리와 다름):** Story 1.2 때는 `lib/db/index.ts`가 `neon-http`로 고정되어 있어 로컬 검증 때마다 `node-postgres`로 임시 스왑 후 반드시 원복해야 했다. **2026-07-26 fix(PR #4, main에 병합됨)로 이 과정이 없어졌다** — `lib/db/index.ts`는 `DATABASE_URL`이 `localhost`/`127.0.0.1`을 가리키면 자동으로 `node-postgres`를 쓰고, 아니면(Neon 실제 엔드포인트) 기존 `neon-http`를 쓴다. `.env.local`의 `DATABASE_URL`도 이미 로컬 Docker Postgres(`wedding-check-db` 컨테이너, 포트 5434, db/user/password 모두 `wedding_check`)를 가리키도록 설정되어 있다. **이 스토리에서는 스왑도 원복도 하지 말 것** — 그냥 마이그레이션 적용하고 `npm run dev`/`npm run seed`를 그대로 쓰면 된다.
- **로그인은 전화번호 기반, 하이픈 없음:** `SEED_ADMIN_PHONE_NUMBER="01000000001"` / `SEED_OPERATOR_PHONE_NUMBER="01000000002"`, 비밀번호는 `.env.local`의 `SEED_ADMIN_PASSWORD`/`SEED_OPERATOR_PASSWORD`(로컬 값 `changeme123!`). `authClient.signIn.phoneNumber({ phoneNumber, password })`로 로그인. `lib/phone.ts::normalizePhoneNumber()`가 하이픈 유무를 정규화하므로 테스트 스크립트에서 하이픈을 넣든 안 넣든 상관없다.
- **Server Action은 REST 엔드포인트가 아니다** — Next.js 고유 인코딩(`$ACTION_ID_*`/`$ACTION_REF_*`)을 쓴다. curl보다 Node.js `fetch`/`FormData` 스크립트로 재현하는 것이 안전하다 — 이 Windows/한글 로케일 환경에서 `curl -F`로 한글 값(단계명·설명에 한글 들어감)을 보내면 인자 인코딩이 깨진다는 것이 Story 1.2에서 확인됨.
- **`requireAdminSession()`을 모든 관리자 Server Action 첫 줄에 호출할 것** — layout 가드는 페이지 렌더링만 막지 Server Action 자체를 보호하지 않는다(Story 1.2 코덱스 P1로 발견).

### Git Intelligence (최근 작업 패턴)

- 최근 커밋: PR #4(로컬 개발 DB 전환 + 전화번호 정규화, 일반 merge) → PR #3(전화번호 로그인 전환, 5차 코덱스 리뷰) → PR #2(Story 1.2) → PR #1(Story 1.1).
- 파이프라인: `story/<story-key>` 브랜치 생성 → 단계별 커밋 → `codex review --base main` → 지적사항 있으면 수정 후 재리뷰(반복) → 클린하면 `gh pr merge --merge --delete-branch`(스쿼시 아님) → `sprint-status.yaml`의 `git_pipeline` 섹션 갱신.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: 홀·체크리스트 템플릿 관리 / Story 1.3, UX-DR6, UX-DR12, UX-DR14]
- [Source: _bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md#FR-2, §3 용어집]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-9, #Consistency Conventions, #핵심 엔티티 ERD, #Deferred]
- [Source: DESIGN.md#4 Component Stylings(Cards/Buttons/Inputs), #14 States(Empty/Error), #10 Voice & Tone]
- [Source: _bmad-output/implementation-artifacts/1-2-hall-registration.md#Dev Notes, #Dev Agent Record]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- 스키마: `checklist_template_items`에 `hall_id`(uuid, FK→halls.id), `step_name`, `description`(nullable), `sort_order`(integer), `applicable_contract_conditions`(jsonb, default `{}`, AD-9)를 추가. `npx drizzle-kit generate`로 DB 연결 없이 마이그레이션 생성(`0004_naive_james_howlett.sql`), 로컬 Docker Postgres(`wedding-check-db`)에 직접 적용 — 이번 스토리부터는 스왑/원복 절차가 아예 필요 없어졌음을 확인(이전 fix 병합 덕분).
- Server Action 검증은 Story 1.2와 동일하게 렌더된 HTML의 `$ACTION_REF_*`/`$ACTION_*:0`/`$ACTION_*:1`/`$ACTION_KEY` hidden 필드를 파싱해 Node `fetch`/`FormData`로 재전송하는 방식을 재사용. 단, `updateTemplateItemAction`은 클라이언트 `editing` 상태가 true일 때만 렌더되는 폼이라 순수 GET으로는 hidden 필드를 얻을 수 없었음 — AD-2 홀 격리 회귀 테스트는 대신 항상 렌더되는 `deleteTemplateItemAction`(및 `moveTemplateItemAction`)으로 수행: HALL_1F 소속 항목 id를 HALL_2F의 hallId와 조합해 삭제 요청 → 200 응답이지만 DB에는 아무 변화 없음을 확인(`WHERE hall_id = $hallId AND id = $id`가 매치되지 않아 조용히 무시됨).
- 두 홀("1층 홀", "2층 홀")을 로컬 DB에 실제로 생성해 교차 검증. 한글 홀명/단계명/설명 모두 DB에 정상 저장됨을 `psql`로 직접 확인(이 환경의 curl 인자 인코딩 이슈와 무관하게 Node fetch 경로는 항상 정상).

### Completion Notes List

- Task 1~7 전 항목 구현 및 검증 완료.
- AC 1: HALL_1F("1층 홀")에 "촬영 시작"/"조명 점검" 두 항목을 Server Action으로 생성 → 응답에 포함, HALL_1F 페이지에서만 노출되고 HALL_2F("2층 홀") 페이지에는 노출되지 않음을 확인(AD-2 홀 격리). `template-item-card` 클래스(Feature Card, UX-DR6)로 렌더됨을 HTML에서 확인.
- AC 2: 빈 단계명으로 제출 → DB row 수 불변, 응답에 "단계명은 필수입니다" 에러 메시지 포함 확인.
- AC 3: "조명 점검" 항목을 위로 이동 → `sort_order`가 즉시 DB에 반영되어 순서가 바뀜을 `psql`로 확인(0↔1 스왑).
- AC 4: 항목이 없는 HALL_2F 템플릿 화면에서 "아직 등록된 체크리스트 항목이 없어요..." 격려 톤 빈 상태 문구 확인.
- AC 5: operator 세션 및 비로그인 상태 모두 `/admin/templates/[hallId]` 접근 시 307로 `/login` 리다이렉트 확인(Story 1.1 기존 가드 재사용, 추가 구현 없음).
- AD-2 회귀(스코프 밖 추가 검증): HALL_1F 소속 항목 id를 HALL_2F의 hallId로 조합해 삭제 시도 → 항목이 삭제되지 않고 그대로 남아있음을 확인. 이 스토리부터 AD-2의 hallId 필터링이 실전 적용되는 첫 사례라 별도로 검증.
- `npm run lint`, `npx tsc --noEmit`, `npm run build` 모두 통과(회귀 없음, `/admin/templates/[hallId]` 라우트가 빌드 결과에 정상 포함).
- 자동화 테스트 프레임워크 미지정(Story 1.1/1.2와 동일 정책) — Dev Notes에 정의된 수동 검증 절차(Node fetch 스크립트 + DB 직접 조회)로 모든 AC를 확인함.

### File List

- NEW `apps/web/lib/db/repositories/template-item.ts`
- NEW `apps/web/lib/services/template.ts`
- NEW `apps/web/app/admin/templates/[hallId]/page.tsx`
- NEW `apps/web/app/admin/templates/[hallId]/template-item-form.tsx`
- NEW `apps/web/app/admin/templates/[hallId]/template-item-row.tsx`
- NEW `apps/web/app/admin/templates/[hallId]/actions.ts`
- NEW `apps/web/app/admin/templates/[hallId]/templates.css`
- NEW `apps/web/drizzle/0004_naive_james_howlett.sql`
- NEW `apps/web/drizzle/meta/0004_snapshot.json`
- MODIFIED `apps/web/lib/db/schema.ts` (`checklistTemplateItems` 테이블 추가)
- MODIFIED `apps/web/drizzle/meta/_journal.json`
- MODIFIED `apps/web/app/admin/halls/hall-row.tsx` ("템플릿 관리" 링크 추가)
