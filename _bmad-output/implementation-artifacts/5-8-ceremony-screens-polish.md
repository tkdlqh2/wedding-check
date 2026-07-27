---
baseline_commit: 654950f1422bb8cf37338450aaca2345fe8ffd33
---

# Story 5.8: 예식 등록/목록/상세 화면 프로토타입 정합화 + 담당자 배정

Status: ready-for-dev

## Story

As a 관리자,
I want 예식 등록 폼과 목록·상세 화면이 prototype/js/screens/WeddingScreen.js·WeddingDetailScreen.js와 같은 구조로 보기 쉽게 정리되기를,
so that 날짜/시각을 헷갈리지 않고 입력하고, 계약 형태를 실수 없이 고르고, 상세 화면에서 단계별로 항목을 빠르게 훑고, 담당 오퍼레이터를 배정할 수 있다.

## Acceptance Criteria

1. **Given** 예식 등록 폼을 열면 **When** 일시 입력란을 확인하면 **Then** 날짜(`type="date"`)와 시각(`type="time"`, 키보드로 직접 타이핑 가능) 입력란이 분리되어 있다.
2. **Given** 날짜와 시각을 각각 입력해 저장하면 **When** 예식이 생성되면 **Then** 기존과 동일하게 KST 기준 정확한 일시로 저장된다(회귀 없음).
3. **Given** 신랑·신부 이름 입력란을 확인하면 **When** 폼 레이아웃을 보면 **Then** 두 입력란이 "신랑 · 신부" 한 그룹으로 같은 줄에 나란히 배치된다(`[ASSUMPTION]` 데이터는 Story 5.3의 개별 `groomName`/`brideName` 컬럼·검증을 그대로 유지 — 레이아웃만 한 행으로 묶는다, 단일 필드로 합쳐 파싱하지 않는다).
4. **Given** 계약 형태(주례 있음/이벤트 추가 있음)를 고를 때 **When** 폼을 확인하면 **Then** 체크박스 대신 토글 가능한 pill 버튼 형태(선택 시 `#FDEDE7` 배경 + `#E8552D` 보더)로 표시되고, 제출되는 값은 기존과 동일하다(회귀 없음).
5. **Given** 예식 목록·상세 화면을 렌더링하면 **When** 화면을 확인하면 **Then** `prototype/js/screens/WeddingScreen.js`·`WeddingDetailScreen.js`와 같은 카드/타이포 위계로 정렬되고, 좁은 화면이나 긴 이름에서도 카드 밖으로 내용이 밀려나오지 않는다.
6. **Given** 예식 상세 화면의 "포함된 항목"을 확인하면 **When** 화면을 보면 **Then** "추가 가능한 항목"과 동일하게 단계별로 그룹핑되어(단계명 헤더 + 그 아래 항목들) 표시된다.
7. **Given** 예식 상세 화면을 열면 **When** 담당자 영역을 확인하면 **Then** 활성 오퍼레이터 목록이 토글 가능한 pill 버튼(`prototype/js/screens/WeddingScreen.js`의 담당 배정 칩과 동일한 상호작용)으로 표시되고, 클릭으로 그 예식의 담당 오퍼레이터를 배정/해제할 수 있다(`[ASSUMPTION]` 담당자는 오퍼레이터 역할 회원만 배정 가능 — 관리자는 배정 대상에서 제외).
8. **Given** 예식 목록에서 **When** 각 예식 카드를 확인하면 **Then** 배정된 담당자 이름이 읽기 전용 텍스트/칩으로 간단히 표시되고(클릭해도 배정이 바뀌지 않음), 담당자가 없으면 "미배정"이 표시된다 — 배정 조작 자체는 목록에 없고 상세 화면에서만 가능하다(AC 7).

## Tasks / Subtasks

- [ ] Task 1: 등록 폼 — 날짜/시각 분리 (AC: 1, 2)
  - [ ] `apps/web/app/admin/ceremonies/ceremony-form.tsx`: 기존 `<input type="datetime-local" name="ceremonyAt">` 하나를 `<input type="date" name="ceremonyDate">` + `<input type="time" name="ceremonyTime">` 두 개로 분리. `prototype/js/screens/WeddingScreen.js` 47~50행처럼 한 줄에 `flex: 1`(날짜) + 고정폭(시각, 110px)로 배치.
  - [ ] `apps/web/app/admin/ceremonies/actions.ts`의 `createCeremonyAction`: `parseCeremonyAtInput(value: string)`(기존, `"YYYY-MM-DDTHH:mm:00+09:00"`로 KST 오프셋을 붙여 파싱)을 그대로 재사용하되, 호출부에서 `date`/`time` 두 필드를 합쳐 `${date}T${time}` 문자열을 만든 뒤 넘긴다 — **파싱 로직 자체(오프셋 처리)는 절대 바꾸지 않는다**(AC 2, 회귀 방지 — 이미 Story 2.1에서 KST 타임존 버그를 실제로 겪고 고정한 로직). 날짜 또는 시각 중 하나라도 비어있으면 기존과 동일하게 `{ error: "예식 일시를 입력해주세요" }`.

- [ ] Task 2: 신랑·신부 한 줄 배치 (AC: 3)
  - [ ] `ceremony-form.tsx`: 기존 두 개의 개별 `.ceremony-form__field`(신랑 이름, 신부 이름)를 감싸는 `.ceremony-form__couple-row` div 추가, `display: flex; gap: var(--space-sm)`로 한 줄에 나란히. 각 입력란의 `id`/`name`/검증(`errorField`) 로직은 그대로 유지 — 레이아웃만 감싼다.
  - [ ] `apps/web/app/admin/ceremonies/ceremonies.css`: `.ceremony-form__couple-row { display: flex; gap: var(--space-sm); } .ceremony-form__couple-row .ceremony-form__field { flex: 1; min-width: 0; }`(오버플로 방지).

- [ ] Task 3: 계약 형태 pill 토글 (AC: 4)
  - [ ] `ceremony-form.tsx`: 기존 체크박스 2개(`requiresOfficiant`, `hasAdditionalEvent`)를 `useState`로 관리하는 toggle pill 버튼으로 교체 — `member-form.tsx`의 역할 pill 토글(Story 5.7)과 동일한 패턴(로컬 state + `<input type="hidden">`로 제출값 전달). 선택 시 `background: var(--color-brand-tint)` + `border: 1px solid var(--color-brand)`(AC 4 정확한 색상 지정, 임의 hex 쓰지 말고 `design-tokens.css`의 `--color-brand-tint`/`--color-brand` 변수 사용 — 값 자체가 `#FDEDE7`/`#E8552D`와 일치함을 확인).
  - [ ] `actions.ts`: `formData.get("requiresOfficiant") === "on"` 체크 로직은 **변경하지 않는다** — hidden input의 값을 선택 시 `"on"`, 비선택 시 `""`로 렌더링하면 기존 체크박스의 `formData.get(...) === "on"` 판정과 동일하게 동작한다(AC 4 "제출되는 값은 기존과 동일").

- [ ] Task 4: 상세 화면 "포함된 항목" 단계별 그룹핑 (AC: 6)
  - [ ] `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx`: 기존 `groupCandidatesByStep(candidates)`(20~38행, `templateItemId` 기준 순차 그룹핑)와 동일한 로직의 `groupItemsByStep(items: ChecklistInstanceItem[])`를 추가해 "포함된 항목"(현재 87~104행, flat `<ul>`)도 "추가 가능한 항목"과 같은 구조(`<h3>`단계명 + 그 아래 항목 `<ul>`)로 렌더링. `checklistInstanceItems.templateItemId`는 nullable(부모 단계가 나중에 삭제되면 `set null`)이므로, JS `===` 비교는 `null === null`이 `true`라 문제 없이 그룹핑된다(Postgres `NULL != NULL`과 다름 — 순수 배열 순차 비교이므로 안전).
  - [ ] `groupCandidatesByStep`/`groupItemsByStep` 두 함수는 타입만 다르고 로직이 완전히 동일하다 — 제네릭 헬퍼로 통합할지, 각자 유지할지는 구현 시 판단(기존 파일 관례상 페이지 파일 안에 로컬 함수로 두 개 유지도 허용, 과설계 방지).

- [ ] Task 5: 담당자 배정 — 스키마/리포지토리/서비스 (AC: 7, 8)
  - [ ] `apps/web/lib/db/schema.ts`의 `ceremonies` 테이블에 `assignedOperatorId: text("assigned_operator_id").references(() => user.id, { onDelete: "set null" })` 추가(nullable). **주의: `user.id`는 `uuid`가 아니라 `text`다**(better-auth가 자체 id 포맷을 생성 — `apps/web/lib/db/schema.ts`의 `user` 테이블 정의 확인, 251행 `id: text("id").primaryKey()`) — `ceremonies.id`/`halls.id` 등 다른 FK와 달리 `uuid()` 타입을 쓰면 컴파일은 되지만 실제 값 형식이 안 맞아 조인/비교가 항상 실패한다.
  - [ ] `npx drizzle-kit generate`로 마이그레이션 `drizzle/0016_*.sql` 생성 시도 — 이 환경(비TTY)에서 컬럼 추가만으로는 대화형 프롬프트가 안 뜰 가능성이 높지만(단일 컬럼 추가라 이름 충돌/모호성 없음), 만약 걸리면 Story 5.4 방식대로 `0015_snapshot.json`을 베이스로 `assigned_operator_id` 컬럼 하나만 추가한 `0016_snapshot.json`을 직접 구성한다.
  - [ ] `apps/web/lib/db/repositories/ceremony.ts`에 `assignOperator(hallId: string, ceremonyId: string, operatorId: string | null): Promise<void>` 추가 — `db.update(ceremonies).set({ assignedOperatorId: operatorId }).where(and(eq(ceremonies.id, ceremonyId), eq(ceremonies.hallId, hallId)))`(AD-2: hallId 스코프 필수).
  - [ ] `apps/web/lib/services/ceremony.ts`에 `assignOperator(hallId: string, ceremonyId: string, operatorId: string | null): Promise<void>` 추가:
    - `ceremonyRepo.findById(hallId, ceremonyId)`로 예식 존재 확인, 없으면 `CeremonyValidationError("존재하지 않는 예식입니다")`.
    - `operatorId`가 `null`이 아니면 `memberRepo`(`../db/repositories/member`, Story 5.4/5.7에서 이미 존재)의 `findById(operatorId)`로 대상 조회 → 없거나 `role !== "operator"` 또는 `banned`면 `CeremonyValidationError("배정할 수 없는 담당자입니다")`(AC 7 `[ASSUMPTION]` — 활성 오퍼레이터만).
    - 통과하면 `ceremonyRepo.assignOperator(hallId, ceremonyId, operatorId)` 호출.
  - [ ] `getCeremonyDetail`(`apps/web/lib/services/checklist-instance.ts`)이 반환하는 `ceremony`에 이미 `assignedOperatorId`가 포함된다(스키마에 컬럼만 추가하면 drizzle이 자동으로 셀렉트에 포함) — 상세 페이지에서 이 id로 담당자 이름을 표시하려면 `memberRepo.findAll()`(또는 `findById`)로 조회한 이름을 페이지 레벨에서 합성한다(hallName을 병합하는 기존 패턴과 동일 — 리포지토리/서비스에 조인을 넣지 않는다).
  - [ ] `apps/web/lib/services/ceremony.ts`의 `listTodaysCeremonies`/`listCeremoniesForDate`/`listCeremoniesPaginated`가 반환하는 각 예식에도 담당자 이름을 병합한다(AC 8, 목록 카드 표시용) — `memberRepo.findAll()`을 한 번만 호출해 `id → name` 맵을 만들고 각 예식의 `assignedOperatorId`로 조회(할당 안 된 예식은 `undefined`/`null` 유지). N+1 쿼리 방지 — hallName 병합과 동일한 스타일(홀별로 개별 쿼리 후 메모리에서 합성).

- [ ] Task 6: 담당자 배정 — Server Action + UI (AC: 7, 8)
  - [ ] `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/actions.ts`(기존 `removeInstanceItemAction`이 있는 파일)에 `assignOperatorAction(formData: FormData): Promise<void>` 추가 — `requireAdminSession()` → `hallId`/`ceremonyId`/`operatorId`(빈 문자열이면 `null`로 변환) 읽어 `assignOperator` 호출 → `revalidatePath(...)`.
  - [ ] `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx`: `listMembers()`(또는 `memberRepo.findAll()`, Story 5.4/5.7에서 이미 존재)로 활성 오퍼레이터 목록(`role === "operator" && !banned`) 조회, 상세 화면에 담당자 영역 렌더링 — 각 활성 오퍼레이터를 pill 버튼으로, 현재 배정된 오퍼레이터는 강조 스타일(`--color-brand-tint`/`--color-brand`, member-form의 역할 pill과 동일 토큰) + 클릭 시 `operatorId=""`(해제) 제출, 그 외 오퍼레이터는 클릭 시 `operatorId={member.id}`(배정/전환) 제출. 각 pill은 `<form action={assignOperatorAction}>`(hidden `hallId`/`ceremonyId`/`operatorId` + 제출 버튼) — `member-row.tsx`의 역할 세그먼트(Story 5.7)와 동일한 "폼 하나당 버튼 하나" 패턴.
  - [ ] `apps/web/app/admin/ceremonies/ceremony-row.tsx`(목록 카드): 담당자 이름을 읽기 전용 텍스트/칩으로 표시(AC 8) — `ceremony.assignedOperatorName`이 있으면 이름, 없으면 `"미배정"`(`prototype/js/screens/WeddingScreen.js` 129행의 `#e0353b` 강조 참고, 토큰은 `--color-error`). 클릭 불가능한 `<span>`이어야 한다(배정 조작은 상세 화면 전용).
  - [ ] CSS: `ceremonies.css`에 `.ceremony-card__assignee`(목록, 읽기 전용), `ceremony-detail.css`에 `.ceremony-detail-page__assignee-section`, `.ceremony-detail-page__assignee-pill`, `.ceremony-detail-page__assignee-pill--active`(상세, 인터랙티브 — member-row의 역할 세그먼트 CSS와 시각적으로 유사하되 pill 형태, `border-radius: var(--radius-full)`) 추가.

- [ ] Task 7: 목록/상세 카드 프로토타입 정렬 + 오버플로 방지 (AC: 5)
  - [ ] `ceremonies.css`/`ceremony-detail.css`: `prototype/js/screens/WeddingScreen.js`(77~142행, 카드 구조)·`WeddingDetailScreen.js`(14~105행, 상세 헤더/단계 카드 구조)와 비교해 타이포 크기(시간 20px/700, 이름 15px/600 등 이미 대체로 일치하는지 확인)와 카드 레이아웃을 정렬. 담당자 pill/칩이 추가되며 카드가 넓어지므로 `.ceremony-card`, `.ceremony-detail-page` 관련 flex 컨테이너에 `flex-wrap: wrap`/`min-width: 0`을 Story 5.7과 동일한 원칙으로 점검·보강(긴 신랑신부 이름 + 여러 오퍼레이터 이름이 함께 있어도 카드 밖으로 안 밀리는지).

- [ ] Task 8: 테스트 (AC: 1, 2, 4, 7, 8)
  - [ ] `apps/web/tests/repositories/ceremony.test.ts`(기존 파일 있으면 추가, 없으면 확인 후 생성): `assignOperator` — 배정, 해제(null), 존재하지 않는 예식.
  - [ ] `apps/web/tests/services/ceremony.test.ts`: `assignOperator` — 활성 오퍼레이터 배정 성공, 관리자 role 배정 시도 거부, 비활성(banned) 오퍼레이터 배정 시도 거부, 존재하지 않는 operatorId 거부, `null`로 해제 성공. `listCeremoniesPaginated`/`listTodaysCeremonies` 등이 반환하는 예식에 담당자 이름이 정확히 병합되는지(배정 없는 예식은 이름 없음).
  - [ ] Server Action(`createCeremonyAction`의 날짜/시각 분리 파싱, `assignOperatorAction`)은 기존 관례대로(Story 5.4/5.6/5.7) `next/headers` 요청 스코프 제약 때문에 순수 vitest로 커버하지 않고 로컬 서버 수동 검증으로 대체 — 단, 날짜/시각 결합 후 `parseCeremonyAtInput`에 넘기는 문자열 조합 로직 자체는 순수 함수로 분리 가능하면 단위 테스트 추가 검토(과설계 방지 — 굳이 분리할 만큼 복잡하지 않으면 생략 가능).
  - [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [ ] Task 9: 수동 검증
  - [ ] 로컬 서버에서 날짜/시각을 각각 입력해 예식 등록 → 저장된 일시가 KST 기준으로 정확한지(기존 `datetime-local` 방식과 동일 결과인지) 확인(AC 1, 2).
  - [ ] 계약 형태 pill 토글 클릭 → 선택 시각적 표시 확인, 저장 후 실제 반영된 계약 형태가 맞는지 확인(AC 4).
  - [ ] 예식 상세 화면에서 활성 오퍼레이터 pill 클릭 → 배정됨 확인 → 같은 pill 다시 클릭 → 해제(미배정) 확인 → 다른 오퍼레이터 pill 클릭 → 이전 배정이 교체되는지 확인(AC 7).
  - [ ] 예식 목록에서 배정된 담당자 이름이 칩으로 표시되고 클릭해도 아무 반응 없는지(읽기 전용) 확인(AC 8).
  - [ ] "포함된 항목"이 단계별로 그룹핑되어 "추가 가능한 항목"과 동일한 구조로 보이는지 확인(AC 6).
  - [ ] 좁은 화면(1024px 이하)에서 긴 이름 + 여러 pill이 있는 카드가 밀려나오지 않는지 확인(AC 5).
  - [ ] `/admin/halls`, `/admin/members`, `/admin/templates` 등 이 스토리에서 건드리지 않은 화면이 깨지지 않았는지(회귀 없음) 확인.

## Dev Notes

### 배경

Story 5.1~5.7로 어드민 화면 대부분이 프로토타입과 정렬됐지만, 예식 등록/목록/상세는 아직 남아 있었다(대표의 2차 어드민 화면 점검 후속 3건 중 마지막). 현재 등록 폼은 `datetime-local` 하나(시각만 키보드로 고치기 불편)와 체크박스 2개로 계약 형태를 받고, 상세 화면의 "포함된 항목"은 "추가 가능한 항목"과 달리 flat list다(Story 5.5에서 후자만 단계별 그룹핑됨). 담당자 배정은 이번 스토리에서 처음 도입되는 신규 기능이다(기존 DB에 관련 컬럼 없음, 직접 grep으로 확인 완료).

### 현재 코드 상태 (읽고 시작할 것)

- `apps/web/app/admin/ceremonies/ceremony-form.tsx` — `datetime-local` 단일 필드, 체크박스 2개, 신랑/신부 개별 필드. `"use client"` + `useActionState`(Story 5.7 `member-form.tsx`와 동일한 폼 리셋 패턴).
- `apps/web/app/admin/ceremonies/actions.ts` — `parseCeremonyAtInput`(9~17행)이 KST 오프셋(`+09:00`)을 직접 붙여 파싱 — Story 2.1에서 실제로 겪은 타임존 버그(JS Date를 raw SQL에 직접 바인딩하면 세션 타임존을 거쳐 9시간 밀림)의 재발 방지 로직. **이 파싱 로직 자체는 절대 건드리지 않는다** — 날짜+시각 문자열을 합치는 부분만 추가한다.
- `apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx` — `groupCandidatesByStep`(20~38행)이 이미 `templateItemId` 기준 순차 그룹핑 함수의 정확한 참고 구현이다. "포함된 항목"(83~104행)만 flat `<ul>`로 남아있다.
- `apps/web/lib/services/checklist-instance.ts` — `getCeremonyDetail`이 `ceremony`/`instance`/`items`/`candidates`를 반환. `ceremony`는 `ceremonyRepo.findById`가 그대로 반환하는 값이라 스키마에 `assignedOperatorId` 컬럼만 추가하면 자동으로 포함된다(서비스 함수 자체는 수정 불필요).
- `apps/web/lib/db/schema.ts` — `ceremonies` 테이블(145~163행 근방)에 `groomName`/`brideName`(Story 5.3), `contractConditions`(jsonb) 존재. `user` 테이블(251행~)의 `id`는 **`text`**(uuid 아님) — better-auth가 자체 id 포맷 생성. 새 FK 컬럼은 반드시 `text("assigned_operator_id").references(() => user.id, ...)`로 선언해야 한다.
- `apps/web/lib/db/repositories/member.ts`, `apps/web/lib/services/member.ts` — Story 5.4/5.7에서 이미 존재. `memberRepo.findById(id)`, `memberRepo.findAll()`(role/banned 포함) 그대로 재사용 — 새 조회 함수를 만들지 않는다.
- `apps/web/app/admin/members/member-form.tsx`, `member-row.tsx` (Story 5.7) — pill 토글(로컬 state + hidden input)과 세그먼트 컨트롤(폼 하나당 버튼 하나) 패턴의 실제 코드 원본. 이번 스토리의 계약 형태 pill·담당자 pill 모두 이 패턴을 그대로 재사용한다.
- `apps/web/app/design-tokens.css` — Story 5.7에서 전역 `box-sizing: border-box`, `a { text-decoration: none }` 리셋이 이미 추가됨(이 스토리에서 새로 필요한 CSS 오버플로 방지 작업이 이 리셋 위에서 진행된다는 뜻 — 별도 조치 불필요, 이미 적용된 상태).

### 프로토타입과 의도적으로 다르게 갈 부분 — 반드시 읽을 것

- **담당자는 단일 배정이다(복수 아님).** `prototype/js/screens/WeddingScreen.js`의 실제 구현(122~130행)은 `w.assignees`가 배열이라 여러 오퍼레이터를 동시에 배정할 수 있다. 하지만 이 스토리의 epics.md AC는 "그 예식의 **담당 오퍼레이터**를 배정/해제"(단수), "배정된 **담당자 이름**이... 표시"(단수)로 명시적으로 단수를 쓴다 — `[ASSUMPTION]`으로 단일 배정(컬럼 하나, FK)으로 좁혀서 구현한다. 다대다(복수 배정)로 만들지 않는다 — epics.md 텍스트가 프로토타입의 실제 배열 동작보다 우선한다(이 프로젝트의 반복된 관례: 프로토타입은 시각/상호작용 참고일 뿐 기능 스펙이 아님, Story 5.4/5.6 Dev Notes 참고).
- **담당자 배정 UI는 상세 화면에 있다(목록 카드 아님).** 프로토타입의 실제 인터랙티브 배정 칩은 `WeddingScreen.js`(목록 카드, 121~130행)에 있고 `WeddingDetailScreen.js`(상세)는 읽기 전용 요약 텍스트만 보여준다(22행) — epics.md AC는 이를 정확히 뒤집어서 **상세 화면에 인터랙티브 pill, 목록 카드는 읽기 전용**으로 요구한다(AC 7, 8). epics.md 텍스트를 따른다 — 프로토타입 파일 위치를 그대로 옮기지 않는다.

### 스코프 경계 — 하지 말 것

- 신랑/신부 이름을 하나의 자유 텍스트 필드로 합치지 않는다(AC 3 `[ASSUMPTION]`, Story 5.3에서 이미 확정된 개별 컬럼 구조 유지).
- 계약 형태 조건 종류(주례/이벤트 2개)를 늘리거나 줄이지 않는다 — 이 스토리는 표현 방식(체크박스→pill)만 바꾼다.
- 담당자 배정을 여러 명 가능한 구조로 만들지 않는다(위 "프로토타입과 다르게 갈 부분" 참고).
- 오퍼레이터 조회 화면(`/operator/*`)은 이 스토리 범위 밖 — 손대지 않는다.
- 홀/회원/템플릿 화면 구조를 변경하지 않는다.

### 테스트 요구사항

vitest 이중 environment. `assignOperator`(서비스)는 `headers()`를 호출하지 않으므로(단순 DB 조회/갱신) 순수 node 테스트로 직접 검증 가능 — Story 5.7의 `setMemberRole`과 달리 `next/headers` 우회가 필요 없다(Server Action 레이어의 `assignOperatorAction`만 `requireAdminSession()` 때문에 수동 검증 대상).

### Project Structure Notes

- 신규 파일 없음(전부 기존 파일 MODIFY) — 마이그레이션 파일(`drizzle/0016_*.sql`)만 신규.
- `ceremonies` 스키마 변경은 이 스토리가 유일하게 건드리는 테이블 변경이라 병행 스토리와의 마이그레이션 번호 충돌 위험이 낮다(현재 sprint-status.yaml 기준 병행 진행 중인 다른 스토리 없음).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.8] — 원본 AC 8개 + 배경.
- [Source: apps/web/app/admin/ceremonies/*, apps/web/lib/services/ceremony.ts, apps/web/lib/db/repositories/ceremony.ts] — 확장 대상 기존 구현 전체.
- [Source: apps/web/app/admin/ceremonies/[hallId]/[ceremonyId]/page.tsx#groupCandidatesByStep] — 단계별 그룹핑 로직 원본, `groupItemsByStep`이 그대로 따라야 할 패턴.
- [Source: apps/web/app/admin/members/member-form.tsx, member-row.tsx] — Story 5.7의 pill 토글/세그먼트 컨트롤 패턴, 이번 스토리 전체가 재사용.
- [Source: prototype/js/screens/WeddingScreen.js, WeddingDetailScreen.js] — 시각 참고(단, 담당자 단일/위치는 §"프로토타입과 다르게 갈 부분" 참고 — 그대로 이식하지 않음).
- [Source: _bmad-output/implementation-artifacts/5-7-member-management-polish.md] — 직전 스토리, pill/세그먼트 패턴과 코덱스 리뷰에서 실제로 걸렸던 이슈 유형(TOCTOU, 입력 검증 누락, 지역 특수 케이스) 참고 — 이번 스토리에서도 동일 클래스 실수(예: operatorId 검증 없이 흡수, 동시 배정 경합)를 미리 점검할 것.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.8
- `apps/web/app/admin/ceremonies/*`, `apps/web/lib/services/ceremony.ts`, `apps/web/lib/db/repositories/ceremony.ts`
- `apps/web/app/admin/members/member-form.tsx`, `member-row.tsx` — 재사용할 pill/세그먼트 패턴
- `prototype/js/screens/WeddingScreen.js`, `WeddingDetailScreen.js`

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story, Epic 5 2차 후속 3건 중 마지막, Story 5.4/5.7의 pill/세그먼트 패턴 재사용).
