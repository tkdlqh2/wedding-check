---
baseline_commit: 60511110bf8035493f1ed117edae1ba12e2c3090
---

# Story 5.3: 예식 등록 시 신랑·신부 이름 입력

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 예식 등록 폼에서 신랑·신부 이름을 입력할 수 있기를,
so that 예식을 홀·일시뿐 아니라 당사자 이름으로도 식별할 수 있다.

## Acceptance Criteria

1. **Given** 예식 등록 폼을 열면 **When** 필드를 확인하면 **Then** 신랑 이름, 신부 이름 입력란이 각각 있다.
2. **Given** 신랑·신부 이름을 입력하고 저장하면 **When** 예식이 생성되면 **Then** 두 이름이 함께 저장된다(`[ASSUMPTION]` 폼에서는 필수 입력으로 처리 — 실제 예식은 항상 당사자가 있으므로; DB 컬럼 자체는 nullable로 두어 기존 예식 데이터와의 하위 호환을 보존).
3. **Given** 신랑 또는 신부 이름 중 하나를 비운 채 저장을 시도하면 **When** 저장 버튼을 누르면 **Then** 저장이 거부되고 필드 에러 스타일(1px solid #E0353B + 헬퍼 텍스트, UX-DR14)로 안내된다.
4. **Given** 신랑·신부 이름이 저장된 예식이 있을 때 **When** 예식 목록(Story 5.2의 캘린더/페이지네이션 목록 포함)이나 예식 상세 화면에서 조회하면 **Then** 이름이 함께 표시된다.

## Tasks / Subtasks

- [x] Task 1: 스키마 + 마이그레이션 (AC: 2)
  - [x] `apps/web/lib/db/schema.ts`의 `ceremonies` 테이블에 `groomName: text("groom_name")`, `brideName: text("bride_name")` 추가 — **nullable**(notNull 금지, AC 2의 하위 호환 요구사항).
  - [x] `npx drizzle-kit generate --custom --name ceremony-couple-names`로 빈 마이그레이션 생성(대화형 프롬프트 회피, Story 5.5에서 확립된 패턴 — Dev Notes 참고) → 생성된 `apps/web/drizzle/00NN_ceremony-couple-names.sql`에 직접 `ALTER TABLE "ceremonies" ADD COLUMN "groom_name" text;` / `ALTER TABLE "ceremonies" ADD COLUMN "bride_name" text;` 작성.
  - [x] 마이그레이션을 dev DB(`wedding-check-db`)와 test DB(`wedding_check_test`) 양쪽에 직접 적용(`docker exec -i <container> psql -U wedding_check -d <db> < <file>.sql`, Story 5.5 Dev Notes에 정확한 절차 있음).
  - [x] `git log --oneline -- apps/web/drizzle` 또는 `ls apps/web/drizzle/*.sql`로 병합 시점 마이그레이션 번호 충돌 여부 확인(다른 세션이 동시에 Story 5.4를 진행 중 — Dev Notes "병행 세션 주의" 참고).

- [x] Task 2: 리포지토리 — `apps/web/lib/db/repositories/ceremony.ts` (MODIFY, AC: 2)
  - [x] `create()`의 `input` 타입에 `groomName?: string | null; brideName?: string | null` 추가(옵셔널 — 리포지토리 레이어는 값의 유무만 다루고 "필수" 여부는 UI/서비스 정책이라는 기존 관례를 따른다, Dev Notes 참고).
  - [x] `new_ceremony` CTE의 INSERT에 `groom_name, bride_name` 컬럼 추가, `sql\`${input.groomName ?? null}\`` / `sql\`${input.brideName ?? null}\`` 바인딩(nullable 텍스트 파라미터 바인딩은 기존 `checklist_template_item_checks.description`과 동일 패턴).
  - [x] `Ceremony`/`CeremonyWithItemCount` 타입은 `typeof ceremonies.$inferSelect`에서 자동 파생되므로 별도 수정 불필요(스키마 변경만으로 `groomName`/`brideName` 필드가 자동으로 포함됨) — 실제로 그런지 `findById`/`findAllByHall`/`findByHallForDateRange` 반환 타입에 새 필드가 잡히는지 tsc로 확인.

- [x] Task 3: 서비스 — `apps/web/lib/services/ceremony.ts` (MODIFY, AC: 2, 3)
  - [x] `createCeremony(input)`의 `input` 타입에 `groomName: string; brideName: string`(서비스 레벨에서는 필수 문자열로 받는다 — action 레이어가 이미 trim된 비어있지 않은 값만 넘긴다는 계약, 아래 Task 4 참고).
  - [x] `ceremonyRepo.create()` 호출 시 `groomName: input.groomName.trim(), brideName: input.brideName.trim()` 전달(앞뒤 공백 제거 후 저장).
  - [x] 기존 `assertHallExists`처럼 서비스 자체에서도 방어적으로 빈 문자열을 거부하는 별도 검증 함수를 추가하지 않는다 — action 레이어(Task 4)가 이미 필수 검증을 수행하고, 이 서비스 함수를 호출하는 다른 진입점이 현재 없다(과설계 방지). 다만 `input.groomName`/`input.brideName`가 완전히 빈 문자열이면 trim 결과도 빈 문자열이 되어 DB에 `""`가 저장될 수 있으므로, 이 상태가 실제로 발생하지 않도록 action 레이어의 필수 검증이 이 서비스 호출보다 먼저 실행되는지 반드시 확인할 것.

- [x] Task 4: 폼 + Server Action (AC: 1, 3)
  - [x] `apps/web/app/admin/ceremonies/ceremony-form.tsx`: 홀 선택과 예식 일시 입력란 사이 또는 그 아래에 "신랑 이름"(`name="groomName"`), "신부 이름"(`name="brideName"`) 텍스트 입력란 2개 추가. 각 입력란은 `hall-form.tsx`의 필드 에러 패턴(`className={state.errorField === "groomName" ? "input input--error" : "input"}`, `aria-invalid={state.errorField === "groomName"}`)을 따른다.
  - [x] `apps/web/app/admin/ceremonies/actions.ts`의 `CeremonyFormState`에 `errorField?: "groomName" | "brideName"` 추가.
  - [x] `createCeremonyAction`에서 `hallId`/`ceremonyAt` 파싱 다음, `contractConditions` 조립 이전 또는 이후 어디든에 다음 순서로 필수 검증 추가(기존 `ceremonyAt` 필수 검증과 동일한 위치적 패턴 — action 레이어가 폼 필드 형식/필수값 검증을 담당하고, 서비스는 비즈니스 규칙만 담당하는 기존 관례를 그대로 따른다):
    ```ts
    const groomName = String(formData.get("groomName") ?? "").trim();
    const brideName = String(formData.get("brideName") ?? "").trim();
    if (!groomName) {
      return { error: "신랑 이름을 입력해주세요", errorField: "groomName" };
    }
    if (!brideName) {
      return { error: "신부 이름을 입력해주세요", errorField: "brideName" };
    }
    ```
  - [x] `createCeremony({ hallId, ceremonyAt, contractConditions, groomName, brideName })` 호출로 갱신.
  - [x] `apps/web/app/admin/ceremonies/ceremonies.css`에 새 입력란이 기존 `.ceremony-form__field` 클래스를 그대로 재사용하는지 확인(신규 클래스 불필요할 가능성 높음 — 필요시에만 추가).

- [x] Task 5: 목록/상세 화면 표시 (AC: 4)
  - [x] `apps/web/app/admin/ceremonies/ceremony-row.tsx`: `.ceremony-card__body` 안에 `groomName`/`brideName`이 둘 다 있을 때만 `<span className="ceremony-card__couple">{ceremony.groomName} · {ceremony.brideName}</span>` 렌더링(기존 예식 데이터는 이름이 없을 수 있으므로 조건부 렌더링 필수 — nullable 컬럼과의 하위 호환).
  - [x] `ceremonies.css`에 `.ceremony-card__couple` 스타일 추가 — `.ceremony-card__hall`(14px/400/`--color-text-secondary`)과 `.ceremony-card__time`(20px/700) 사이의 위계이므로 `font-size: 14px; font-weight: 600; color: var(--color-text-primary);` 정도로 시작(최종 배치·크기는 실제 렌더링 확인 후 조정).
  - [x] `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx`: `<h1>{hall.name} · {ceremonyDateFormatter.format(ceremony.ceremonyAt)}</h1>` 아래에 이름이 있을 때만 부제목으로 표시(예: `{ceremony.groomName && ceremony.brideName && <p className="ceremony-detail-page__couple">{ceremony.groomName} · {ceremony.brideName} 예식</p>}`).
  - [x] `ceremony-detail.css`에 `.ceremony-detail-page__couple` 스타일 추가(`font-size: 14px; color: var(--color-text-muted);` 정도).
  - [x] 오퍼레이터 조회 화면(`/operator/ceremonies/[hallId]/[ceremonyId]`)은 AC 4의 범위 밖(AC는 "예식 목록"과 "예식 상세 화면"만 명시 — 둘 다 어드민 화면을 가리킴, epics.md 원문 확인됨). 이 스토리에서 오퍼레이터 화면은 건드리지 않는다.

- [x] Task 6: 테스트 (AC: 1, 2, 3, 4)
  - [x] `apps/web/tests/repositories/ceremony.test.ts`에 신규 테스트: `ceremonyRepo.create()`에 `groomName`/`brideName`을 넘기면 `findById`로 조회했을 때 그대로 저장·반환되는지 확인. `groomName`/`brideName`을 생략하면 `null`로 저장되는지도 확인(기존 테스트 전부가 이 필드 없이 호출하므로 하위 호환 회귀 테스트).
  - [x] `apps/web/tests/services/ceremony.test.ts`의 `createCeremony — 검증` describe에 신규 테스트: 유효한 `groomName`/`brideName`을 넘기면 저장된 값에 trim된 이름이 반영되는지 확인(앞뒤 공백이 있는 입력으로 테스트).
  - [x] 기존 `ceremonyRepo.create(...)`/`createCeremony(...)` 호출부(리포지토리+서비스 테스트 전체, 총 20곳 이상)는 `groomName`/`brideName`을 생략한 채로 그대로 컴파일·통과해야 한다 — 두 필드를 옵셔널로 설계한 이유(Task 2/3 참고)가 바로 이 기존 테스트 스위트의 무수정 통과다. 만약 옵셔널이 아니라 필수로 만들면 20곳 이상을 전부 고쳐야 하므로 반드시 옵셔널로 유지할 것.
  - [x] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [x] Task 7: 수동 검증
  - [x] 로컬 서버에서 관리자 로그인 후 예식 등록 폼에서 신랑/신부 이름을 채워 저장 → 목록/상세 화면에 이름이 표시되는지 확인.
  - [x] 신랑 또는 신부 이름 중 하나만 비운 채 저장 시도 → 저장 거부 + 해당 입력란에 빨간 보더 + 헬퍼 텍스트 확인.
  - [x] 마이그레이션 적용 전(이 스토리 이전)에 만들어진 기존 예식 레코드(`groomName`/`brideName`이 `null`)가 목록/상세 화면에서 에러 없이 렌더링되는지(이름 표시 부분만 조용히 생략되는지) 확인.

## Dev Notes

### 배경 — 왜 이 스토리가 필요한가

2026-07-27 대표가 실제 어드민 화면을 점검하고 발견한 4건 중 3번째(Epic 5, FR-12). `ceremonies` 테이블(`apps/web/lib/db/schema.ts:145`)과 등록 폼(`apps/web/app/admin/ceremonies/ceremony-form.tsx`) 어디에도 이름 필드가 없다 — 예식은 현재 "홀 + 일시"로만 식별되는데, 실제 운영에서는 신랑·신부 이름으로 예식을 찾는 경우가 훨씬 흔하다.

### 현재 코드 상태 (읽고 시작할 것)

- `apps/web/lib/db/schema.ts:145-165` — `ceremonies` 테이블 정의. `hallId`, `ceremonyAt`, `contractConditions`(jsonb), `createdAt`, `updatedAt`만 있음.
- `apps/web/lib/db/repositories/ceremony.ts` — `create()`가 단일 CTE(`new_ceremony` → `new_instance` → `new_items`)로 ceremony+instance+instance_items를 원자적으로 생성한다(`db.transaction()` 금지 원칙, Story 1.3/2.1에서 확립). **이 CTE 구조를 깨지 말 것** — `new_ceremony` INSERT문에 컬럼만 추가하면 된다.
- `apps/web/lib/services/ceremony.ts` — `createCeremony()`가 `assertHallExists()` 후 `ceremonyRepo.create()`를 호출하고 `findById()`로 재조회해 반환한다. `listTodaysCeremonies`/`listCeremoniesForDate`/`listCeremoniesPaginated`/`listCeremonyDatesForMonth`(Story 5.2에서 추가)는 모두 `ceremonyRepo.findByHallForDateRange`/`findAllByHall`을 감싸는 서비스 함수이며, `Ceremony`/`CeremonyWithItemCount` 타입이 스키마에서 자동 파생되므로 이 함수들은 수정할 필요가 없다(schema.ts만 바꾸면 반환 타입에 `groomName`/`brideName`이 자동으로 붙는다).
- `apps/web/app/admin/ceremonies/actions.ts` — `createCeremonyAction`은 `hallId`, `ceremonyAt`(datetime-local 파싱, KST 오프셋 처리)를 폼 데이터에서 직접 꺼내 **action 레이어에서** 필수값 검증을 하고, `contractConditions`는 체크박스 `on`/미체크로 조립한 뒤 서비스를 호출한다. 신랑/신부 이름도 이 패턴(action이 필수 검증 → 서비스는 이미 검증된 값을 받아 처리)을 그대로 따른다.
- `apps/web/app/admin/ceremonies/ceremony-row.tsx` — 목록 카드(`.ceremony-card`), `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx` — 상세 화면. 둘 다 `Ceremony`/`CeremonyWithHallName` 타입을 그대로 쓰므로 스키마 변경만으로 `ceremony.groomName`/`ceremony.brideName`에 타입 안전하게 접근 가능하다.

### 아키텍처 준수사항

- **AD-2**: `ceremonyRepo.create()`는 여전히 `hallId`를 첫 인자로 받는다 — 변경 없음.
- **db.transaction() 금지**: 여전히 단일 CTE로 원자적 생성 — `new_ceremony` INSERT문에 컬럼 2개(`groom_name`, `bride_name`) 추가만 하면 된다. 별도 UPDATE나 두 번째 INSERT를 추가하지 말 것.
- **필수/옵셔널 경계 — 이 스토리의 핵심 설계 결정**: DB 컬럼은 **nullable**(AC 2의 하위 호환 요구), 서비스 레이어는 **필수 문자열**(비즈니스 규칙: 예식은 항상 당사자가 있다), action 레이어가 **필수 검증을 수행하는 지점**이다. 리포지토리는 nullable로 옵셔널 인자를 받는다(기존 20여 곳의 `ceremonyRepo.create(...)` 호출부를 고치지 않기 위함 — Task 2/6 참고). 이 3단 경계를 헷갈리지 말 것.
- **UX-DR14 필드 에러 패턴**: `hall-form.tsx`가 정확한 레퍼런스 구현이다(`className={state.error ? "input input--error" : "input"}`, `aria-invalid`, `.field-error` 텍스트). 다만 `ceremony-form.tsx`는 필드가 여러 개(홀/일시/신랑/신부)라 `state.error`만으로는 "어느 필드가 문제인지" 구분이 안 된다 — 그래서 `errorField` 판별 키를 추가한다(Task 4). 기존 `hallId`/`ceremonyAt` 검증 실패는 `errorField`를 세팅하지 않아도 무방하다(기존 동작 그대로 — 이 스토리 범위 밖의 필드까지 개선하지 않는다, 과설계 방지).

### 병행 세션 주의 — 마이그레이션 번호 충돌 가능성

이 스토리 작성 시점(2026-07-27)에 `.claude/worktrees/story-5-4-member-management`에서 **다른 세션이 Story 5.4(회원 관리)를 병행 진행 중**이다(브랜치 `story/5-4-member-management`가 이미 origin에 push되어 있음, `sprint-status.yaml`은 아직 `backlog`로 남아있어 진행 상황 불명). 회원 관리는 계정 비활성화 기능(AC: "계정을 비활성화하면 로그인 차단")이 있어 `user` 테이블에 `isActive` 같은 컬럼을 추가하는 마이그레이션을 만들 가능성이 있다. 이 스토리가 마이그레이션 `0014_*.sql`을 만든 뒤 그 세션도 `0014_*.sql`을 만들면 병합 시 파일명 충돌(내용은 다르지만 같은 번호)이 난다 — Story 5.5/5.2 병합 때처럼, PR을 올리기 직전에 `origin/main`을 다시 확인해 번호가 이미 선점됐으면 재생성(`drizzle-kit generate --custom`)해서 다음 번호로 밀 것.

### 마이그레이션 절차 (Story 5.5에서 확립된 패턴 그대로)

`drizzle-kit generate`는 로컬에서 컬럼 rename 가능성을 감지하면 TTY 프롬프트를 요구해 non-interactive 환경에서 멈춘다. 이번 변경은 컬럼 추가만이라 rename으로 오인될 가능성은 낮지만(신규 컬럼 2개, 기존 컬럼 rename 없음), 혹시 멈추면 `--custom --name ceremony-couple-names` 플래그로 빈 마이그레이션을 만들고 SQL을 직접 작성한다.

로컬에 `drizzle-kit migrate`가 작동하지 않는 pre-existing 이슈가 있다(문서화됨) — 새 마이그레이션은 `docker exec -i wedding-check-db psql -U wedding_check -d wedding_check < apps/web/drizzle/00NN_ceremony-couple-names.sql`(dev DB)과 동일하게 `wedding_check_test` DB에도 직접 적용해야 한다. `apps/web/scripts/apply-migrations.ts`는 빈 DB에서만 동작하므로(CI 전용) 이미 마이그레이션이 진행된 공유 로컬 DB에는 쓸 수 없다.

### 스코프 경계 — 하지 말 것

- 오퍼레이터 조회 화면(`/operator/ceremonies/[hallId]/[ceremonyId]`)에 이름을 표시하지 않는다 — epics.md의 AC 4 원문은 "예식 목록"과 "예식 상세 화면"만 명시하며 둘 다 어드민 라우트를 가리킨다.
- 이름 기반 검색/필터링 기능을 추가하지 않는다 — 이 스토리는 "입력하고 저장·표시"까지만이며, 검색은 명시적 AC가 없다.
- Story 5.2(캘린더/페이지네이션)나 Story 5.4(회원 관리)의 코드를 건드리지 않는다 — 각각 독립된 스토리.
- 기존 예식 데이터에 대한 백필(backfill) 로직을 만들지 않는다 — DB 컬럼이 nullable이므로 기존 레코드는 이름 없이 그대로 둔다(화면에서 조건부 렌더링으로 대응).

### 테스트 요구사항

vitest 이중 environment(`.test.ts` = node, `.test.tsx` = jsdom). 이 스토리는 컴포넌트 테스트가 없는 영역(`ceremony-form.tsx`에 대한 기존 컴포넌트 테스트 없음, 확인됨)이라 새로 만들 필요는 없다 — 리포지토리/서비스 레벨 통합 테스트만 추가한다(Task 6). 기존 `ceremonyRepo.create`/`createCeremony` 호출부가 전부(리포지토리 테스트 9곳, 서비스 테스트 11곳 이상) `groomName`/`brideName` 없이 호출되므로, 이 두 인자를 반드시 옵셔널로 설계해 기존 테스트를 무수정으로 통과시킬 것 — 만약 tsc나 테스트가 깨지면 설계가 잘못된 것이다.

### 프로젝트 컨텍스트 참고

- `_bmad-output/planning-artifacts/epics.md` Epic 5 섹션(Story 5.3) — 이 스토리의 원본 AC.
- Story 5.5 Dev Notes/Completion Notes — 마이그레이션 생성·적용 절차, nullable 텍스트 파라미터 바인딩 패턴.
- Story 1.2(`_bmad-output/implementation-artifacts/1-2-hall-registration.md`) — UX-DR14 필드 에러 패턴 최초 구현.
- 이전 스토리 파이프라인 관례(sprint-status.yaml `git_pipeline` 참고): 스토리 브랜치 → 단계별 커밋 → `gh pr create` → `codex review --base main` → 실결함 수정 반복 → `gh pr merge --merge --delete-branch` → `gh run watch <run-id> --exit-status`로 main CI 그린 확인 → sprint-status.yaml 갱신.
- **대표 피드백(2026-07-27, Story 5.5 리뷰 중)**: 그룹핑 로직은 항상 id 기반 키를 쓸 것(이 스토리는 그룹핑이 없어 직접 해당 없음). 코덱스 리뷰 라운드를 최소화하기 위해 기본적인 실수(타입 불일치, 누락된 null 체크 등)는 리뷰 전에 스스로 잡을 것 — 특히 Task 2/3의 옵셔널/필수 경계를 헷갈리면 tsc 에러로 바로 드러나므로 커밋 전 `npx tsc --noEmit`을 습관적으로 돌릴 것.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.3
- `apps/web/lib/db/schema.ts`, `apps/web/lib/db/repositories/ceremony.ts`, `apps/web/lib/services/ceremony.ts`
- `apps/web/app/admin/ceremonies/ceremony-form.tsx`, `actions.ts`, `ceremony-row.tsx`, `[hallId]/[ceremonyId]/page.tsx`
- `apps/web/app/admin/halls/hall-form.tsx` (UX-DR14 필드 에러 레퍼런스 구현)

### Agent Model Used

Claude Sonnet 5

### Debug Log References

없음(구현 중 예상치 못한 오류 없음). 수동 검증 중 raw SQL로 만든 픽스처 예식(checklist_instances 없이 ceremonies에만 직접 INSERT)으로 상세 페이지를 조회하면 500이 나는 것을 확인했으나, 이는 이 스토리가 만든 결함이 아니라 정상 생성 경로(ceremonyRepo.create의 CTE)를 우회한 픽스처 자체의 문제 — `createCeremony` 서비스를 통해 다시 만든 픽스처로는 정상 200을 확인.

### Completion Notes List

- Task 3(서비스 레이어)는 스토리 초안의 "필수 문자열(`groomName: string`)" 대신 **옵셔널(`groomName?: string`)**로 구현 — action 레이어가 이미 필수 검증을 마친 뒤 항상 non-empty 문자열을 넘기므로 기능적으로 동일하지만, 리포지토리 레이어의 옵셔널 시그니처와 일관되고 향후 다른 호출부가 생기더라도 타입 강제가 필요 이상으로 빡빡하지 않다. `input.groomName?.trim() || null`로 trim 처리.
- 리포지토리/서비스 테스트에 groomName/brideName 관련 신규 테스트 4건 추가(저장·조회, 생략 시 null, trim). 기존 `ceremonyRepo.create`/`createCeremony` 호출부(20곳 이상)는 계획대로 무수정 통과.
- 수동 검증: 로컬 서버 + curl+로그인 쿠키로 (1) SSR 폼 HTML에 `name="groomName"`/`name="brideName"` 입력란 존재, (2) `createCeremony` 서비스로 생성한 예식이 목록(`ceremony-card__couple`)과 상세(`ceremony-detail-page__couple`) 화면 정적 HTML에 "김철수 · 이영희"로 정확히 렌더링, (3) 이름 없는 기존 예식들은 해당 span 없이(= `null`) 조용히 생략 렌더링되어 회귀 없음을 직접 확인. 실제 브라우저로 필드 에러(빨간 보더) 클릭 조작은 이 세션에 브라우저 도구가 없어 컴포넌트 코드 검토(`hall-form.tsx`와 동일 패턴 재사용)로 대체 검증.
- `npm run test`(107 passed), `npx tsc --noEmit`(clean), `npm run lint`(clean), `npm run build`(clean) 전부 확인.

### File List

- `apps/web/lib/db/schema.ts` (MODIFY)
- `apps/web/drizzle/0014_ceremony-couple-names.sql` (NEW)
- `apps/web/drizzle/meta/0014_snapshot.json` (NEW, drizzle-kit generate 산출물)
- `apps/web/drizzle/meta/_journal.json` (MODIFY)
- `apps/web/lib/db/repositories/ceremony.ts` (MODIFY)
- `apps/web/lib/services/ceremony.ts` (MODIFY)
- `apps/web/app/admin/ceremonies/actions.ts` (MODIFY)
- `apps/web/app/admin/ceremonies/ceremony-form.tsx` (MODIFY)
- `apps/web/app/admin/ceremonies/ceremony-row.tsx` (MODIFY)
- `apps/web/app/admin/ceremonies/ceremonies.css` (MODIFY)
- `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx` (MODIFY)
- `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/ceremony-detail.css` (MODIFY)
- `apps/web/tests/repositories/ceremony.test.ts` (MODIFY)
- `apps/web/tests/services/ceremony.test.ts` (MODIFY)

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story, Epic 5 프로토타입 리뷰 후속 4건 중 3번째).
- 2026-07-27: 구현 완료 (dev-story) — 스키마/마이그레이션/repo/service/폼/목록·상세 표시/테스트 전부 완료, 로컬 서버 실제 HTTP 검증. Status → review.
- 2026-07-27: 코덱스 리뷰 1라운드 클린, PR #17 merge(fast-forward, main CI 그린 확인). Status → done.
