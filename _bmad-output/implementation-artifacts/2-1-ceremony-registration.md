---
baseline_commit: 681e09f3e6a268b30472dbc4e0067c0e2e13e127
---

# Story 2.1: 예식 등록

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 홀·날짜·계약 형태를 입력해 예식을 등록할 수 있기를,
so that 그 예식에 맞는 체크리스트 인스턴스가 자동으로 준비된다.

## Acceptance Criteria

1. **Given** 홀이 최소 1개 등록되어 있을 때 **When** 홀·날짜·계약 형태(주례 유무 등)를 입력해 예식을 저장하면 **Then** 예식이 생성되고 즉시 체크리스트 인스턴스가 함께 생성된다.
2. **Given** 홀을 선택하지 않고 저장을 시도하면 **When** 저장 버튼을 누르면 **Then** 저장이 거부된다.
3. **Given** 같은 홀 또는 서로 다른 홀에 같은 날짜로 여러 예식을 등록하면 **When** 각각 저장하면 **Then** 서로 독립된 인스턴스를 가진다.
4. **Given** 오늘 등록된 예식이 없을 때 **When** 예식 목록 화면을 열면 **Then** 차분한 빈 상태 안내 + "예식 등록" CTA가 표시되고(UX-DR12), 예식/인스턴스는 좌측 보더 카드(UX-DR7)로 표시된다.

## Tasks / Subtasks

- [x] Task 1: DB 스키마 — `ceremonies`, `checklist_instances`, `checklist_instance_items` 추가 (AC: 1, 3)
  - [x] `lib/db/schema.ts`에 3개 테이블 추가 (Dev Notes "스키마 설계" 참고 — 정확한 컬럼/FK/onDelete 명시돼 있음, 임의 변경 금지)
  - [x] `npx drizzle-kit generate`로 마이그레이션 SQL 생성
  - [x] `docker exec wedding-check-db psql -U wedding_check -d wedding_check < drizzle/000N_*.sql`로 개발 DB에 적용 (Epic 1 회고 기록: `drizzle-kit migrate`는 이 환경에서 무한 대기/무출력 실패 — 직접 적용이 확립된 우회로)
  - [x] `npm run db:test:migrate`로 `wedding_check_test` DB에도 동일 마이그레이션 적용 (새 빈 DB 대상 스크립트라 기존 8개 마이그레이션이 이미 적용된 DB에는 재실행 금지 — 신규 파일만 별도로 `docker exec ... psql`로 적용)

- [x] Task 2: 리포지토리 — `lib/db/repositories/ceremony.ts` (AC: 1, 2, 3)
  - [x] `create(hallId, input: { ceremonyAt: Date; contractConditions: Record<string, boolean> })`: ceremony + instance + instance_items를 **단일 원자적 SQL 문**으로 생성 (Dev Notes "원자적 생성 SQL" 참고 — `db.transaction()` 절대 사용 금지, 이유는 Dev Notes 참고)
  - [x] `findByHallForDateRange(hallId, startOfDay, endOfDay)`: 특정 홀의 특정 날짜 범위 예식 목록(오늘 예식 조회용)
  - [x] `findById(hallId, id)`: 단건 조회

- [x] Task 3: 서비스 — `lib/services/ceremony.ts` (AC: 1, 2, 4)
  - [x] `CeremonyValidationError` 클래스
  - [x] `createCeremony(input: { hallId: string; ceremonyAt: Date; contractConditions: Record<string, boolean> })`: hallId 미입력/존재하지 않는 홀 거부(AC 2) 후 리포지토리 호출
  - [x] `listTodaysCeremonies()`: `hallRepo.findAllActive()`로 전체 활성 홀을 순회하며 각 홀의 오늘 예식을 조회해 홀 이름을 붙여 병합 반환 (AD-2 위반 아님 — 각 호출은 여전히 `hallId` 스코프 리포지토리 함수를 거친다, Dev Notes 참고)

- [x] Task 4: Server Action — `app/admin/ceremonies/actions.ts` (AC: 1, 2)
  - [x] `createCeremonyAction`: 첫 줄에 `requireAdminSession()` 호출(AD-3, 예외 없음) → `CeremonyValidationError`는 폼 에러로 변환 → 성공 시 `revalidatePath("/admin/ceremonies")`

- [x] Task 5: UI — `app/admin/ceremonies/` (AC: 1, 2, 4)
  - [x] `page.tsx`: `listActiveHalls()` + `listTodaysCeremonies()` 로드, 상단에 등록 폼, 하단에 오늘 예식 목록(빈 상태 포함)
  - [x] `ceremony-form.tsx`: 홀 `<select>`(활성 홀 목록), 예식 일시 `datetime-local` 입력, 계약 형태 체크박스 2개("주례 있음", "이벤트 추가 있음"), `useActionState` 패턴(halls/hall-form.tsx 참고)
  - [x] `ceremony-row.tsx`: 좌측 보더 카드(UX-DR7), 홀명 + 예식 일시(20px/700) + 인스턴스 항목 수
  - [x] `ceremonies.css`: 기존 `halls.css`/`templates.css` 토큰·클래스 네이밍 컨벤션 따름

- [x] Task 6: 관리자 내비게이션 활성화 (AC: 1)
  - [x] `app/admin/layout.tsx`의 "예식" 링크(현재 `admin-nav__link--placeholder`)를 `/admin/ceremonies`로 연결
  - [x] 우측 상단 "새 예식 등록" 버튼(현재 `disabled`)을 `/admin/ceremonies`로 연결된 실제 링크로 전환
  - [x] "템플릿" 링크는 이 스토리 범위 밖 — 손대지 않는다(가리키는 단일 랜딩 페이지가 아직 없음)

- [x] Task 7: 테스트 (AC: 1, 2, 3)
  - [x] `tests/repositories/ceremony.test.ts`: 원자적 생성(ceremony+instance+instance_items 동시 생성 확인), 템플릿 항목이 없는 홀도 빈 인스턴스로 성공, 홀 스코프 격리(`findByHallForDateRange`가 다른 홀 예식을 섞지 않음)
  - [x] `tests/services/ceremony.test.ts`: hallId 미입력/존재하지 않는 홀 거부(AC 2), 같은 홀+같은 날짜 중복 등록이 독립된 인스턴스를 가짐(AC 3)
  - [x] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인

- [x] Task 8: 수동 검증
  - [x] 로컬 서버로 AC 1~4 전부 실제 확인(node fetch 스크립트 또는 브라우저) — 특히 AC 4의 "오늘 예식 없음" 빈 상태는 `wedding_check` 개발 DB에 오늘 날짜 예식이 실제로 없는 상태에서 확인

## Dev Notes

### 스키마 설계 — 정확한 컬럼 정의 (반드시 이대로 구현)

```ts
// lib/db/schema.ts에 추가

// FR-4: 예식(hall·일시·계약 형태). 홀 종속 엔티티(AD-2) — hallId 직접 저장.
export const ceremonies = pgTable("ceremonies", {
  id: uuid("id").primaryKey().defaultRandom(),
  hallId: uuid("hall_id").notNull().references(() => halls.id),
  ceremonyAt: timestamp("ceremony_at").notNull(),
  // AD-9: 부분집합 매칭이 checklist_template_items.applicable_contract_conditions와
  // 대칭되는 셰이프를 요구하므로 동일하게 JSONB로 저장한다(정규화 규칙 테이블 대신,
  // AD-9 rationale 그대로). [ASSUMPTION] 키는 PRD §4.1 예시 그대로 두 개만 정의:
  // { requiresOfficiant?: boolean; hasAdditionalEvent?: boolean } — 부분집합 매칭
  // 알고리즘 자체는 Story 2.2(FR-5) 범위. 이 스토리는 값을 받아 저장만 한다.
  contractConditions: jsonb("contract_conditions").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// FR-4: 예식 1건의 실행용 체크리스트 인스턴스. ERD상 CEREMONY 1:1 CHECKLIST_INSTANCE.
// AD-2(2026-07-24 adversarial review로 확정된 최종 룰, ARCHITECTURE-SPINE.md 참고):
// ceremony→hall JOIN으로 대체하지 말고 hall_id를 이 테이블 자신의 컬럼으로 저장한다.
export const checklistInstances = pgTable(
  "checklist_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id").notNull().references(() => halls.id),
    ceremonyId: uuid("ceremony_id")
      .notNull()
      .references(() => ceremonies.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // 인라인 .unique()가 아니라 기존 코드베이스 컨벤션(schema.ts의 demoVideos,
  // checklistTemplateItems)과 동일하게 이름 붙은 테이블 레벨 제약으로 선언한다.
  (table) => [unique("checklist_instances_ceremony_id_unique").on(table.ceremonyId)],
);

// FR-4/5: 인스턴스에 조합된 항목들. PRD §3 용어집 — 인스턴스는 템플릿의 "실행용 사본".
// 따라서 stepName/description/sortOrder를 생성 시점에 스냅샷으로 복사 저장한다 —
// templateItemId를 라이브 참조로 남겨 매번 JOIN하면, 이후 관리자가 템플릿 항목을
// 수정/삭제할 때 이미 만들어진(어쩌면 진행 중인) 예식의 체크리스트가 조용히 바뀌거나
// (Story 1.4의 FK 삭제 차단 버그와 같은 클래스로) 삭제가 막힌다. templateItemId는
// onDelete: "set null"인 소프트 참조로만 남긴다 — 원본 추적용, 무결성 강제용이 아님.
export const checklistInstanceItems = pgTable("checklist_instance_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  hallId: uuid("hall_id").notNull().references(() => halls.id),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => checklistInstances.id, { onDelete: "cascade" }),
  templateItemId: uuid("template_item_id").references(
    () => checklistTemplateItems.id,
    { onDelete: "set null" },
  ),
  stepName: text("step_name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**하지 말 것:** `ceremonies`에 `(hall_id, ceremony_at)` UNIQUE 제약을 추가하지 않는다 — AC 3이 같은 홀·같은 날짜 중복 등록을 명시적으로 허용한다(Story 1.3의 `sort_order` UNIQUE와 반대 요구사항이니 그 패턴을 그대로 따라오지 말 것).

### 원자적 생성 SQL — `db.transaction()` 사용 금지 (가장 중요한 제약)

**배경(Story 1.3에서 실제로 겪은 P1 버그):** 프로덕션 드라이버 `drizzle-orm/neon-http`는 `db.transaction()`을 지원하지 않고 호출 시 무조건 throw한다. 로컬 `node-postgres` 드라이버로는 이 문제가 절대 드러나지 않는다 — 로컬 테스트가 전부 통과해도 Neon 배포 시 깨진다. `lib/db/repositories/template-item.ts`의 주석과 Story 1.3 Dev Notes에 이 사고 경위가 그대로 남아있다.

이 스토리는 ceremony + instance + N개의 instance_items를 **하나의 요청 안에서 원자적으로** 만들어야 한다(AC 1 — "생성되고 즉시... 함께 생성된다"를 절반만 만들고 실패하면 안 됨). `db.transaction()` 없이 이걸 만족하려면 Story 1.3/1.4가 확립한 패턴 그대로 **여러 INSERT를 체이닝한 단일 SQL 문(CTE)**을 쓴다:

```ts
// lib/db/repositories/ceremony.ts
import { sql } from "drizzle-orm";
import { db } from "../index";

export async function create(
  hallId: string,
  input: { ceremonyAt: Date; contractConditions: Record<string, boolean> },
): Promise<{ ceremonyId: string; instanceId: string }> {
  const result = await db.execute<{ ceremony_id: string; instance_id: string }>(sql`
    with new_ceremony as (
      insert into ceremonies (hall_id, ceremony_at, contract_conditions)
      values (${hallId}, ${input.ceremonyAt}, ${JSON.stringify(input.contractConditions)}::jsonb)
      returning id, hall_id
    ),
    new_instance as (
      insert into checklist_instances (hall_id, ceremony_id)
      select hall_id, id from new_ceremony
      returning id, hall_id
    ),
    new_items as (
      insert into checklist_instance_items
        (hall_id, instance_id, template_item_id, step_name, description, sort_order)
      select ni.hall_id, ni.id, ti.id, ti.step_name, ti.description, ti.sort_order
      from new_instance ni
      join checklist_template_items ti on ti.hall_id = ni.hall_id
      returning id
    )
    select
      (select id from new_ceremony) as ceremony_id,
      (select id from new_instance) as instance_id
  `);
  const row = result.rows[0]; // 주의: db.execute()는 pg의 QueryResult({rows,rowCount,...})를
  // 그대로 반환한다 — .insert().returning()처럼 배열을 바로 주는 게 아니다. `const [row] =
  // await db.execute(...)`로 배열 구조분해하면 undefined가 나온다(node-postgres/neon-http
  // 양쪽에서 직접 실행해 확인함 — 흔히 헷갈리는 지점이라 명시해둔다).
  return { ceremonyId: row.ceremony_id, instanceId: row.instance_id };
}
```

- **[ASSUMPTION] — 항목 필터링 없음, 전체 포함:** `join checklist_template_items ti on ti.hall_id = ni.hall_id`는 계약 형태(`contract_conditions`)와 무관하게 그 홀의 템플릿 항목을 **전부** 복사한다. AD-9의 부분집합 매칭(계약 형태에 안 맞는 항목 제외)은 Story 2.2(FR-5)의 명시적 범위다 — epics.md가 FR-4(이 스토리)와 FR-5(2.2)를 의도적으로 분리했고, 2.2의 AC가 "주례 없음 선택 시 주례 항목 제외"를 그 스토리에서 처음 검증한다. **Story 2.2 작업자에게:** 이 JOIN의 `on` 절에 조건을 추가하는 것이 2.2의 핵심 변경점이다.
- 홀에 템플릿 항목이 0개면 `new_items`가 0행 삽입 — ceremony/instance는 정상 생성되고 빈 체크리스트가 된다. 에러 처리 불필요.
- 생성 후 `Ceremony` 타입으로 반환해야 하면 위 함수가 리턴한 `ceremonyId`로 별도 `findById` SELECT를 한 번 더 호출한다(읽기는 원자성이 필요 없다 — 원자성이 필요한 건 "여러 테이블에 걸친 쓰기" 뿐).

### 서비스 계층 — `listTodaysCeremonies()`가 AD-2를 위반하지 않는 이유

AD-2는 **리포지토리 함수**가 `hallId`를 필수 첫 인자로 받으라는 규칙이다. 관리자 예식 목록 화면은 전체 홀을 가로질러 "오늘 예식"을 보여줘야 하므로(§3 박태호 페르소나 — 대표는 홀 전체를 한 화면에서 본다), 서비스 계층에서 `hallRepo.findAllActive()`로 활성 홀 목록을 얻은 뒤 **각 홀에 대해 `hallId`가 스코프된 리포지토리 함수를 개별 호출**하고 결과를 병합한다:

```ts
// lib/services/ceremony.ts
export async function listTodaysCeremonies() {
  const halls = await hallRepo.findAllActive();
  const { start, end } = todayRange(); // 로컬 자정 ~ 다음 자정, UTC 변환 주의
  const results = await Promise.all(
    halls.map(async (hall) => {
      const ceremonies = await ceremonyRepo.findByHallForDateRange(hall.id, start, end);
      return ceremonies.map((c) => ({ ...c, hallName: hall.name }));
    }),
  );
  return results.flat();
}
```

이 패턴은 **서비스가 SQL을 직접 쓰지 않고 리포지토리만 호출한다**는 AD-2의 상위 규칙("`lib/services/*`는 SQL/ORM을 직접 쓰지 않고 `lib/db/repositories/*`만 호출한다")도 그대로 지킨다 — 홀 하나당 한 번씩 안전한 스코프 쿼리를 반복 호출할 뿐, 전체 스캔 쿼리를 새로 만들지 않는다.

**`todayRange()`의 "오늘" 기준 — KST, UTC 아님:** 이 제품은 국내 단일 웨딩홀 대상(DESIGN.md "한국어 1순위")이라 "오늘"은 한국 표준시(KST, UTC+9) 달력 기준이어야 한다. `new Date()`로 UTC 자정을 기준 삼으면 KST 오전 0~9시 사이에 등록/조회 시 하루가 밀려 보이는 버그가 생긴다. `start`/`end`는 서버 로컬 타임존에 의존하지 말고 명시적으로 KST 오프셋(+9:00)을 적용해 계산할 것.

### 아키텍처 준수사항 (필수)

- **AD-2 (hall_id 격리):** `ceremonies`, `checklist_instances`, `checklist_instance_items` 전부 홀 종속 엔티티. 모든 리포지토리 함수는 `hallId`를 첫 인자로 받고 `WHERE hall_id = $hallId`를 포함한다. **이 3개 테이블은 Story 2.2가 추가할 "당일 수동 항목 추가" 기능과 스키마를 공유하므로, 이 스토리에서 스키마를 잘못 잡으면 2.2 전체가 막힌다** — 위 스키마 정의를 임의로 바꾸지 말 것.
- **AD-3 (역할 가드):** `createCeremonyAction`은 첫 줄에 `requireAdminSession()`을 호출한다(`lib/auth-guard.ts`, Story 1.2에서 확립, 1.3/1.4에서 반복 검증됨). `app/admin/layout.tsx`의 리다이렉트는 페이지 렌더링만 막지 Server Action 자체를 보호하지 않는다.
- **AD-9 (부분집합 매칭):** 이 스토리는 `contract_conditions` 컬럼을 만들고 값을 저장하는 것까지만 한다. 매칭 알고리즘 구현은 명시적으로 Story 2.2 범위 — 이 스토리에서 필터링 로직을 미리 만들지 말 것(스코프 밖 작업, Story 1.4가 AD-4의 Blob 실경로 검증을 명시적으로 다음으로 미룬 것과 같은 패턴).
- **Consistency Conventions:** 관리자 CRUD(FR-1~5)는 Server Actions(Route Handler 아님) — `HallFormState`/`createHallAction` 패턴(`app/admin/halls/actions.ts`) 그대로 따른다. PK는 UUID v4(스키마에 이미 반영).

### UX 준수사항

- UX-DR2 (Primary 버튼): "예식 등록" 저장 버튼.
- UX-DR5 (입력): 홀 select, datetime-local, 체크박스 — 기존 `hall-form.tsx`/`template-item-form.tsx`의 인풋 스타일 클래스 재사용.
- UX-DR7 (예식/인스턴스 카드): 좌측 보더 색상. **[ASSUMPTION] — 현재 백로그에 체크리스트 항목/예식 "완료" 상태를 만드는 FR이 없다.** UX-DR7이 말하는 "초록=완료/주황=진행중" 좌측 보더는 아직 존재하지 않는 데이터에 기반한다 — 이 스토리에서는 중립(`--color-border-mid`) 좌측 보더로 구현하고, 실제 진행 상태 FR이 생기면 그때 색을 반영한다. 있지도 않은 상태를 색으로 지어내지 않는다(DESIGN.md §4 원칙 4 "근거는 신성하다"와 같은 정신).
- UX-DR12 (빈 상태): "오늘 등록된 예식이 없습니다" 류의 `#888888` 안내 + "예식 등록" CTA. `halls-page__empty` 패턴(`app/admin/halls/page.tsx`) 재사용.
- UX-DR10 (내비게이션): "예식" 링크 + "새 예식 등록" 버튼 활성화(Task 6). 색상은 오렌지-레드(`#E8552D`) CTA 그대로.

### 파일 구조

```
apps/web/
  lib/
    db/
      schema.ts                          # MODIFY — ceremonies, checklistInstances, checklistInstanceItems 추가
      repositories/
        ceremony.ts                       # NEW
    services/
      ceremony.ts                         # NEW
  app/
    admin/
      layout.tsx                          # MODIFY — 예식 nav + 새 예식 등록 버튼 활성화
      ceremonies/
        actions.ts                        # NEW
        page.tsx                          # NEW
        ceremony-form.tsx                 # NEW
        ceremony-row.tsx                  # NEW
        ceremonies.css                    # NEW
  drizzle/
    000N_*.sql                            # NEW — drizzle-kit generate 결과
  tests/
    repositories/
      ceremony.test.ts                    # NEW
    services/
      ceremony.test.ts                    # NEW
```

경로는 실제 코드베이스 컨벤션(`app/admin/...`, 괄호 없는 flat 폴더)을 따른다 — ARCHITECTURE-SPINE.md의 Structural Seed는 `app/(admin)/` route group을 제안하지만 Story 1.1부터 실제로는 `app/admin/`(route group 아님)으로 확정돼 있다. 스파인 문서를 문자 그대로 따라 새 route group을 만들지 말 것.

### 테스트 요구사항

- Epic 1 회고(2026-07-26) 결정에 따라 이 스토리부터 vitest 통합 테스트 도입(`chore/vitest-test-infra` PR #7로 이미 병합됨). `tests/helpers/db.ts`의 `resetDb()`/`createTestHall()`을 그대로 재사용하고, 이 스토리용으로 `createTestCeremony`류 헬퍼가 필요하면 같은 파일에 추가한다.
- 최소 커버리지: (1) 원자적 생성이 실제로 ceremony+instance+instance_items를 함께 만드는지, (2) 템플릿 항목이 0개인 홀도 실패 없이 빈 인스턴스를 만드는지, (3) hallId 누락/미존재 홀 거부, (4) 같은 홀+같은 날짜 두 번 등록이 독립된 두 인스턴스를 만드는지(AC 3), (5) `findByHallForDateRange`가 다른 홀 예식을 섞지 않는지(AD-2).
- `resetDb()`는 현재 `demo_videos, checklist_template_items, halls, session, account, verification, "user"`만 TRUNCATE한다 — **이 스토리에서 `ceremonies`, `checklist_instances`, `checklist_instance_items`를 추가로 TRUNCATE 목록에 넣어야 한다**(안 넣으면 이전 테스트의 예식 데이터가 다음 테스트로 새어 들어가 `listTodaysCeremonies()` 관련 테스트가 랜덤하게 깨질 수 있음).

### Previous Story Intelligence (Story 1.3/1.4에서 이어지는 교훈)

- **`db.transaction()` 절대 금지, 대신 단일 SQL 문.** 이 스토리에서 가장 중요하게 적용되는 교훈 — 위 "원자적 생성 SQL" 섹션 참고. Story 1.3에서 실제 프로덕션 드라이버(neon-http)가 트랜잭션 호출 시 무조건 throw하는 걸 코덱스 리뷰로 처음 발견했고, 1.4는 애초에 트랜잭션이 필요 없도록 UPSERT 단일 문으로 설계해 같은 함정을 피했다. 이 스토리는 1.4보다 더 복잡한(3테이블 체이닝) 케이스라 CTE 패턴 자체를 위에 완성된 코드로 제공했다 — 그대로 가져다 쓸 것.
- **AD-3 가드는 매번 새로 확인해야 한다.** `app/admin/layout.tsx`의 리다이렉트가 페이지만 막고 Server Action/Route Handler는 못 막는다는 사실을 Story 1.2에서 발견했고, 1.3(Server Action)·1.4(Route Handler)에서 각각 다시 검증해야 했다 — 새 엔드포인트(이번엔 `createCeremonyAction`)를 추가할 때마다 습관적으로 넣을 것.
- **FK로 인한 삭제/수정 차단을 스키마 설계 단계에서 미리 피할 것.** Story 1.4는 `demo_videos.template_item_id`에 `onDelete: "cascade"`가 빠져서 항목 삭제가 막히는 걸 코덱스 리뷰(1차 P1)에서야 발견해 마이그레이션을 추가했다. 이 스토리는 그 교훈을 애초에 스키마 설계에 반영했다(`checklist_instance_items.template_item_id`를 `onDelete: "set null"` 소프트 참조로 설계) — 굳이 하드 FK로 바꾸지 말 것.
- **`docker exec ... psql`이 확립된 마이그레이션 적용 경로.** `drizzle-kit migrate`는 이 로컬 환경에서 무한 대기/무출력 실패한다(원인 미규명, Epic 1 회고 기록). Task 1에 정확한 명령을 적어뒀다.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1: 예식 등록 (FR-4)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-2, AD-3, AD-9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/reviews/review-adversarial.md#Pair 1 — checklist_instances hall_id scoping] — AD-2의 현재 텍스트(denormalized hall_id + 2-hop 재검증 필수)는 이 adversarial review로 확정된 최종본이다.
- [Source: _bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md#4.2 FR-4, §3 용어집 "체크리스트 인스턴스"/"계약 형태"]
- [Source: apps/web/lib/db/repositories/template-item.ts] — `db.transaction()` 금지 사유 주석 및 단일 SQL 문 패턴의 실제 코드 예시.
- [Source: apps/web/app/admin/halls/] — Server Action(`useActionState`) + 폼 + 목록 페이지 패턴의 실제 코드 예시.
- [Source: _bmad-output/implementation-artifacts/1-4-demo-video-upload.md#Dev Agent Record] — FK cascade 버그, 코덱스 리뷰 라운드 상세.

## Dev Agent Record

### Agent Model Used

Amelia (claude-sonnet-5)

### Debug Log References

- **실제 버그 발견(구현 중, 코덱스 리뷰 이전): `ceremonyRepo.create`의 raw SQL에 JS `Date` 객체를 직접 바인딩하면 9시간이 밀려 저장됨.** `db.execute(sql\`...${date}...\`)`로 `timestamp`(without time zone) 컬럼에 JS Date를 그대로 넘기면 node-postgres가 클라이언트/세션 타임존(로컬 환경 KST, UTC+9)을 거쳐 값을 변환해버린다 — `05:00Z`를 넣었는데 `14:00`으로 저장되는 걸 로컬 DB에 직접 스크립트를 실행해 재현·확인(`db.execute(sql\`select a::text ...\`)`로 저장된 원문 비교). drizzle의 `timestamp` 컬럼 자체는 `.insert().values()`를 쓸 때 `mapToDriverValue: value.toISOString()` / `mapFromDriverValue: 문자열+"+0000"` 규약으로 "컬럼 숫자는 항상 UTC"를 지키는데, raw SQL 경로는 이 규약을 타지 않아 깨졌던 것. 수정: `input.ceremonyAt.toISOString().replace("Z", "")` 후 `::timestamp` 캐스팅으로 세션 타임존 변환이 끼어들 여지를 없앰 — 수정 전/후 스크립트로 직접 검증(수정 후 `05:00Z` 입력 → `05:00` 저장 확인). 이 버그는 vitest 통합 테스트(`ceremonyAt.toISOString()` 왕복 비교)로 최초 발견됐고, `tests/services/ceremony.test.ts`/`tests/repositories/ceremony.test.ts`에 회귀 테스트로 남아있다.
- `npm run dev` 포트 3000에 이전 세션에서 남은 것으로 보이는 좀비 프로세스(요청 시 500)가 떠 있어 `taskkill`로 종료 후 재기동 — Story 1.4 Debug Log에 기록된 것과 같은 클래스의 환경 이슈(Turbopack/스테일 프로세스), 애플리케이션 버그 아님.

### Completion Notes List

- AC 1~4 전부 로컬 서버에 실제 로그인(관리자 계정) 후 HTTP 요청으로 검증: (1) 홀 2개가 있는 상태에서 예식 등록 → DB에서 ceremony/instance/instance_items가 실제로 함께 생성됨을 `psql`로 직접 확인, (2) hallId 없이 제출 시 `field-error` 메시지로 거부, (3) 같은 홀+같은 날짜로 두 번 등록 → `psql`로 서로 다른 `ceremony.id`/`instance.id` 2쌍이 생겼음을 확인, (4) 예식이 0건인 처음 상태에서 "오늘 등록된 예식이 없습니다" 빈 상태 문구 확인 후 등록 진행.
- AD-9 부분집합 매칭(계약 형태 필터링)은 스토리 범위 밖으로 명시적으로 남겨둠 — `ceremonyRepo.create`의 CTE는 홀의 템플릿 항목을 조건 없이 전부 복사한다(Dev Notes에 Story 2.2 확장 지점으로 표시).
- 관리자 내비게이션의 "템플릿" 링크는 이 스토리 범위 밖이라 손대지 않음(Task 6에 명시된 대로).
- `db.transaction()`을 전혀 사용하지 않고 3테이블(ceremony+instance+instance_items) 체이닝 INSERT를 CTE 단일 SQL 문으로 구현 — Story 1.3/1.4의 교훈을 그대로 적용.

### File List

- `apps/web/lib/db/schema.ts` (MODIFY) — `ceremonies`, `checklistInstances`, `checklistInstanceItems` 테이블 추가
- `apps/web/drizzle/0008_happy_purifiers.sql` (NEW) — 위 3개 테이블 생성 마이그레이션
- `apps/web/lib/db/repositories/ceremony.ts` (NEW)
- `apps/web/lib/services/ceremony.ts` (NEW)
- `apps/web/app/admin/ceremonies/actions.ts` (NEW)
- `apps/web/app/admin/ceremonies/page.tsx` (NEW)
- `apps/web/app/admin/ceremonies/ceremony-form.tsx` (NEW)
- `apps/web/app/admin/ceremonies/ceremony-row.tsx` (NEW)
- `apps/web/app/admin/ceremonies/ceremonies.css` (NEW)
- `apps/web/app/admin/layout.tsx` (MODIFY) — "예식" 내비 링크 + "새 예식 등록" 버튼 활성화
- `apps/web/tests/helpers/db.ts` (MODIFY) — `resetDb()` TRUNCATE 목록에 `ceremonies`/`checklist_instances`/`checklist_instance_items` 추가
- `apps/web/tests/repositories/ceremony.test.ts` (NEW)
- `apps/web/tests/services/ceremony.test.ts` (NEW)

## Change Log

- 2026-07-26: Story 구현 완료. AC 1~4 전부 자동화 테스트(vitest, 13건) + 실제 로컬 서버 수동 검증으로 확인. 구현 중 `ceremonyRepo.create`의 raw SQL 타임존 버그(9시간 밀림)를 vitest 테스트로 직접 발견·수정(Debug Log 참고).
