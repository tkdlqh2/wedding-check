---
baseline_commit: 03e3c84
---

# Story 5.2: 예식 목록 날짜 필터 캘린더 및 페이지네이션

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 예식 등록 폼 옆의 캘린더에서 날짜를 선택해 그 날짜의 예식만 보고, 선택하지 않으면 등록된 전체 예식을 페이지 단위로 볼 수 있기를,
so that 오늘 하루가 아니라 과거/예정 예식도 쉽게 찾아볼 수 있다.

## Acceptance Criteria

1. **Given** 예식 등록 화면을 열면 **When** 등록 폼 오른쪽을 확인하면 **Then** 예식이 1건 이상 등록된 날짜가 시각적으로 표시된 월간 캘린더가 있다.
2. **Given** 캘린더에서 예식이 있는 특정 날짜를 클릭하면 **When** 목록이 갱신되면 **Then** 그 날짜에 해당하는 예식만 캘린더 아래 목록에 표시된다.
3. **Given** 캘린더에서 아무 날짜도 선택하지 않은 기본 상태일 때 **When** 목록을 확인하면 **Then** 등록된 전체 예식이 예식 일시 역순으로 페이지네이션되어 표시된다(`[ASSUMPTION]` 태블릿/데스크톱 겸용 관리자 화면이라 무한 스크롤 대신 페이지네이션 채택, 페이지당 10건 — 원본 스토리에 수치 미지정) — 목록 위치는 등록 폼 바로 아래가 아니라 캘린더 아래로 이동한다.
4. **Given** 특정 날짜를 선택한 상태에서 **When** 선택을 해제(같은 날짜 재클릭 등)하면 **Then** 전체 목록 + 페이지네이션 상태로 돌아간다.

### 추가 범위 — 어드민 화면 디자인을 프로토타입과 정렬 (2026-07-27, 대표 요청)

Story 착수 중 대표가 "지금 구조가 프로토타입이랑 너무 다르다"고 피드백을 줘 범위에 추가됐다. **범위는 이 스토리가 건드리는 화면으로 한정**(사용자 확인 완료 — 홀/템플릿/회원/인사이트 화면은 이 스토리에서 손대지 않음):

5. **Given** 관리자 화면 어디서든 **When** 상단 내비게이션을 보면 **Then** 현재 위치한 탭이 `prototype/js/screens/AdminScreen.js`와 동일한 방식으로 강조 표시된다(활성 탭 = `#FDEDE7` 배경 + `#E8552D` 텍스트, 비활성 = 중립 텍스트) — 현재는 모든 링크가 항상 동일한 회색으로 렌더링되어 지금 어디에 있는지 알 수 없다.
6. **Given** 관리자 화면 어디서든 **When** 상단 내비게이션과 본문 컨테이너 폭을 보면 **Then** `prototype`과 동일하게 최대 1200px로 중앙 정렬된다 — 현재는 내비게이션이 풀블리드로 늘어나고 본문(`.ceremonies-page`)은 640px로 좁아 둘의 폭이 서로 안 맞는다.
7. **Given** 예식 등록 화면을 열면 **When** 레이아웃을 보면 **Then** `prototype/js/screens/WeddingScreen.js`와 동일하게 왼쪽 고정폭 등록 폼 카드 + 오른쪽(캘린더 위, 목록 아래) 2단 그리드 구조다 — 현재는 세로 1단 레이아웃이다.

## Tasks / Subtasks

- [ ] Task 1: 리포지토리 레이어 — `apps/web/lib/db/repositories/ceremony.ts` (MODIFY, AC: 1, 3)
  - [ ] `findAllByHall(hallId): Promise<CeremonyWithItemCount[]>` 추가 — `findByHallForDateRange`와 동일한 JOIN/그룹핑 구조에서 날짜 WHERE절만 제거. AD-2(hallId 필수 첫 인자) 준수.
  - [ ] `findByHallForDateRange`는 그대로 재사용한다(하루 범위 필터와 월 범위 필터 양쪽에 재사용 가능 — 새 함수 불필요).

- [ ] Task 2: 서비스 레이어 — `apps/web/lib/services/ceremony.ts` (MODIFY, AC: 1, 2, 3, 4)
  - [ ] 기존 `todayRangeKST()`를 일반화한 `dayRangeKST(dateIso: string): { start: Date; end: Date }` 추가(또는 `todayRangeKST`를 `dayRangeKST(new Date())` 호출로 재작성) — KST 자정 경계 계산 로직은 그대로 재사용.
  - [ ] `monthRangeKST(year: number, month: number): { start: Date; end: Date }` 추가 — 해당 KST 월의 시작/다음달 시작 UTC 경계.
  - [ ] `listCeremoniesForDate(dateIso: string): Promise<CeremonyWithHallName[]>` 추가 — `listTodaysCeremonies`와 동일한 홀별 조회+병합 패턴, `dayRangeKST(dateIso)` 사용.
  - [ ] `listCeremoniesPaginated(input: { page: number; pageSize: number }): Promise<{ ceremonies: CeremonyWithHallName[]; totalCount: number; totalPages: number }>` 추가 — 활성 홀 전체에 대해 `ceremonyRepo.findAllByHall` 호출·병합 후 `ceremonyAt` 역순 정렬, 메모리에서 페이지 슬라이스. `[ASSUMPTION]` 단일 사업체 소규모 데이터셋 전제(PRD §8.1) — 교차 홀 SQL 페이지네이션 대신 기존 `listTodaysCeremonies` 병합 패턴을 그대로 확장(AD-2가 요구하는 hallId 스코프 리포지토리 함수 원칙과 일치).
  - [ ] `listCeremonyDatesForMonth(year: number, month: number): Promise<Set<string>>` 추가 — 활성 홀 전체에 대해 `ceremonyRepo.findByHallForDateRange(hall.id, ...monthRangeKST(year, month))` 호출 후, 각 결과의 `ceremonyAt`을 KST 기준 `YYYY-MM-DD` 문자열로 변환해 Set에 모음(캘린더 점 표시용). UTC→KST 날짜 문자열 변환은 `dayRangeKST`와 동일한 KST_OFFSET_MS 상수를 재사용.

- [ ] Task 3: 캘린더 컴포넌트 — 신규 (AC: 1, 2, 4, 6, 7)
  - [ ] `apps/web/app/admin/ceremonies/ceremony-calendar.tsx` (NEW) — 순수 Server Component. `year`/`month`/`selectedDate`/`markedDates(Set<string>)` props를 받아 월 그리드를 렌더링. 이전/다음달 버튼과 날짜 셀 모두 `<Link>`로 구현(`?year=&month=`, `?date=`) — 클라이언트 상태나 `"use client"` 불필요(관리자 데스크톱 화면은 페이지 단위 내비게이션으로 충분, Operator 태블릿 화면과 달리 DESIGN.md의 0ms 즉시 반응 요구가 적용되는 화면이 아님).
  - [ ] 선택된 날짜 셀: `#E8552D` 배경 + 흰 텍스트. 예식이 있는(미선택) 날짜: 점 마커 `#E8552D`. 같은 날짜를 다시 클릭하면 `date` 파라미터가 제거된 링크(AC 4, "선택 해제").
  - [ ] 스타일은 `prototype/js/screens/WeddingScreen.js`의 캘린더 블록(38~34px 셀, 11px 요일 헤더, 6px radius 버튼)을 참고하되 DESIGN.md 라운딩 스케일(4/8/12px)에 맞춰 6px는 4px로 스냅.

- [ ] Task 4: 페이지네이션 컴포넌트 — 신규 (AC: 3, 4)
  - [ ] `apps/web/app/admin/ceremonies/ceremony-pagination.tsx` (NEW) — Server Component, `<Link>` 기반 이전/다음 + 페이지 번호. `date` 파라미터가 있을 때는 렌더링하지 않음(날짜 필터 중엔 페이지네이션 없음, AC 3·4).

- [ ] Task 5: 예식 목록 페이지 재구성 — `apps/web/app/admin/ceremonies/page.tsx` (MODIFY, AC: 1, 2, 3, 4, 7)
  - [ ] `searchParams: Promise<{ date?: string; year?: string; month?: string; page?: string }>` 시그니처로 변경(Next.js 15+ 비동기 searchParams 컨벤션 — `headers()`를 이미 `await`하는 `admin/layout.tsx`와 동일 관례).
  - [ ] `year`/`month` 미지정 시 KST 기준 이번 달로 기본값 계산.
  - [ ] `date` 파라미터가 있으면 `listCeremoniesForDate(date)` 호출, 없으면 `listCeremoniesPaginated({ page, pageSize: 10 })` 호출.
  - [ ] `listCeremonyDatesForMonth(year, month)`로 점 마커용 날짜 Set 조회.
  - [ ] 마크업을 2단 그리드로 재구성(AC 7): 왼쪽 `.ceremonies-page__form-card`(고정폭), 오른쪽 컬럼 = `<CeremonyCalendar>` 위 + 목록 섹션 아래. 목록 섹션 제목은 `date`가 있으면 "N월 D일 예식", 없으면 "등록된 예식".
  - [ ] 빈 상태 문구 조정: 날짜 필터 중 결과 없음 = "이 날짜에 등록된 예식이 없습니다."(DESIGN.md §14 Empty state 톤 유지), 필터 없음+예식 0건 = 기존 "등록된 예식이 없습니다..." 문구 유지.

- [ ] Task 6: 어드민 내비게이션 활성 탭 스타일 — `apps/web/app/admin/layout.tsx`, 신규 `admin-nav-links.tsx` (MODIFY/NEW, AC: 5, 6)
  - [ ] 현재 `AdminLayout`은 세션 체크 후 리다이렉트하는 async Server Component다(Story 5.1 Dev Notes와 동일 — Client Component로 바꾸지 말 것). `usePathname()`으로 활성 탭을 판별하려면 nav 링크 부분만 별도 `"use client"` 컴포넌트로 분리한다: `apps/web/app/admin/admin-nav-links.tsx` (NEW).
  - [ ] 활성 판정: 현재 경로가 링크의 href로 시작하면 활성(`/admin/ceremonies/[hallId]/[ceremonyId]`처럼 하위 경로여도 "예식" 탭이 활성이어야 함). "인사이트" placeholder는 계속 비활성 `<span>`으로 둔다(Epic 4 backlog, Story 5.1 결정 유지).
  - [ ] `.admin-nav__link`에 활성 상태 클래스 추가 — 배경 `var(--color-brand-tint)`, 텍스트 `var(--color-brand)`, `border-radius: var(--radius-md)`, `padding: 10px 16px`(prototype `AdminScreen.js` 참고).

- [ ] Task 7: CSS 정렬 — `apps/web/app/admin/admin-nav.css`, `apps/web/app/admin/ceremonies/ceremonies.css` (MODIFY, AC: 6, 7)
  - [ ] `.admin-nav` 내부 콘텐츠에 `max-width: 1200px; margin: 0 auto;` 래퍼 추가(현재 풀블리드 — prototype `AdminScreen.js` `maxWidth:1200`과 정렬). `.admin-content`도 동일 max-width로 정렬.
  - [ ] `.ceremonies-page` 폭 제약(현재 `max-width: 640px`)을 제거하고 2단 그리드(`grid-template-columns: 360px 1fr`, `gap: var(--space-lg)`)로 교체 — prototype `WeddingScreen.js` 구조.
  - [ ] 캘린더/페이지네이션 컴포넌트용 클래스 추가. 색상·라운딩·간격은 반드시 `apps/web/app/design-tokens.css`의 기존 CSS 변수만 사용한다(신규 hex 값이나 임의 radius 금지 — `.omd/preferences.md`에 이미 기록된 반복 위반 패턴, DESIGN.md §2/§7 참고).

- [ ] Task 8: 테스트 (AC: 1, 2, 3, 4)
  - [ ] `apps/web/tests/repositories/ceremony.test.ts`에 `findAllByHall` 테스트 추가(빈 목록, 여러 건, 다른 홀 데이터 미포함 확인).
  - [ ] `apps/web/tests/services/ceremony.test.ts`에 `listCeremoniesForDate`, `listCeremoniesPaginated`(페이지 슬라이스·totalCount·totalPages 경계값 포함), `listCeremonyDatesForMonth`(월 경계에 걸친 날짜 KST 변환 정확성 — 기존 `create()` UTC/KST 버그 사례처럼 자정 근처 케이스를 반드시 커버) 테스트 추가.
  - [ ] 신규 컴포넌트(`ceremony-calendar.tsx`, `ceremony-pagination.tsx`)는 순수 Server Component이므로 렌더링 스냅샷보다 서비스 레이어 테스트로 로직을 충분히 커버하고, 필요 시 링크 href 조합만 최소 컴포넌트 테스트로 확인.
  - [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [ ] Task 9: 수동 검증
  - [ ] 로컬 서버에서 관리자 로그인 후 `/admin/ceremonies` 접속 → 폼 오른쪽에 캘린더가 있고 예식 있는 날짜에 점이 찍히는지 확인.
  - [ ] 날짜 클릭 → 그 날짜 예식만 표시, 페이지네이션 사라짐 확인.
  - [ ] 같은 날짜 재클릭(또는 "전체 보기") → 전체 목록 + 페이지네이션 복귀 확인.
  - [ ] 내비게이션에서 "홀"/"예식"/"템플릿" 각 화면 방문 시 해당 탭만 강조되는지 확인.
  - [ ] `/admin/halls`, `/admin/templates/[hallId]` 등 이 스토리에서 스타일을 건드리지 않은 화면이 깨지지 않았는지(회귀 없음) 확인 — 특히 `.admin-content` max-width 변경이 다른 페이지 레이아웃을 깨지 않는지.

## Dev Notes

### 배경 — 왜 이 스토리가 필요한가

`/admin/ceremonies`는 현재 `listTodaysCeremonies()`로 "오늘" 예식만 폼 바로 아래 flat list로 보여준다(캘린더 없음, 페이지네이션 없음). 과거/예정 예식을 찾을 방법이 없다. 대표가 원하는 레이아웃은 폼 오른쪽에 예식이 있는 날짜가 표시되는 캘린더, 그 아래(폼+캘린더보다 아래)에 필터 결과 목록.

### 오늘 추가된 범위 — 프로토타입 정렬 (스코프 경계 필독)

이 스토리 작업 중 사용자가 "전반적인 디자인 구성이 프로토타입이랑 너무 다르다"고 요청했다. **명시적으로 확인받은 범위**: 이 스토리가 만지는 화면(어드민 내비게이션 셸 + 예식 등록/목록 화면)만 프로토타입(`prototype/js/screens/AdminScreen.js`, `prototype/js/screens/WeddingScreen.js`)과 정렬한다. **홀 관리, 템플릿 관리, 회원 관리, 인사이트 화면의 스타일은 이 스토리에서 절대 건드리지 않는다** — 각각 별도 스토리(5.4 등)나 후속 작업의 몫이다. 내비게이션 셸(`admin-nav.css`, `layout.tsx`)은 모든 관리자 페이지에 공통이라 불가피하게 함께 수정되지만, 변경은 시각적 스타일(활성 탭 강조, 컨테이너 폭)에 한정하고 다른 화면의 기능/구조는 건드리지 않는다.

`prototype/`은 Claude Design에서 만든 순수 React(CDN)+Babel 목업이며 상태 관리가 클라이언트 `useState` 기반이다(`prototype/README.md` 참고). 이 저장소의 실제 구현은 Next.js App Router Server Component 중심이므로, **시각적 결과**(색상·타이포·레이아웃 구조·간격)만 프로토타입과 맞추고 **구현 메커니즘**(클라이언트 state vs URL 쿼리 파라미터 기반 서버 렌더링)은 이 프로젝트의 기존 관례를 따른다 — 캘린더 날짜 선택·월 이동은 `<Link>` 쿼리 파라미터(`?date=`, `?year=&month=`) 방식으로 구현하고 `"use client"` 캘린더 컴포넌트를 새로 만들지 않는다(Task 3 참고). 관리자 데스크톱 화면은 DESIGN.md §15가 규정하는 "0ms 즉시 반응" 요구가 걸린 오퍼레이터 태블릿 실행 화면이 아니므로, 페이지 단위 내비게이션으로도 요구사항을 충분히 만족한다.

### 현재 코드 상태 (읽고 시작할 것)

- `apps/web/app/admin/ceremonies/page.tsx` — 현재 `listActiveHalls()` + `listTodaysCeremonies()`만 호출하는 단순 Server Component. `max-width: 640px` 단일 컬럼.
- `apps/web/app/admin/ceremonies/ceremonies.css` — `.ceremonies-page` 640px 제약, `.ceremony-card`는 이미 DESIGN.md UX-DR7 톤(흰 배경, 좌측 보더, radius 8px)을 따르고 있어 카드 자체 스타일은 크게 손댈 필요 없음(재사용).
- `apps/web/app/admin/layout.tsx` — Server Component, `auth.api.getSession()` 후 role 체크. nav는 `<Link>` 3개(홀/예식) + placeholder span(인사이트) 나열, 활성 상태 표시 없음(Story 5.1에서 배선만 했고 활성 탭 스타일은 범위 밖이었음).
- `apps/web/app/admin/admin-nav.css` — `.admin-nav`가 `padding: var(--space-md) var(--space-xl)`로 풀블리드, max-width 제약 없음.
- `apps/web/lib/services/ceremony.ts` — `todayRangeKST()`가 KST 자정 경계 계산의 유일한 구현이다. 이 로직(KST_OFFSET_MS 9시간 오프셋, `Date.UTC` 기반 계산)은 반드시 재사용하고 새로 발명하지 말 것 — Story 2.1에서 이미 한 번 타임존 버그(KST 9시간 밀림)를 겪고 고친 코드다.
- `apps/web/lib/db/repositories/ceremony.ts` — `findByHallForDateRange(hallId, start, end)`가 이미 존재하며 하루 범위든 월 범위든 그대로 재사용 가능(파라미터가 임의의 `[start, end)` 구간이므로).

### 아키텍처 준수사항

- **AD-2:** 모든 신규 리포지토리 함수(`findAllByHall`)는 `hallId`를 필수 첫 인자로 받고 `WHERE hall_id = $hallId`를 포함한다. 서비스 레이어(`listCeremoniesPaginated`, `listCeremonyDatesForMonth`)는 `listTodaysCeremonies`와 동일하게 활성 홀 목록을 얻은 뒤 홀별로 리포지토리를 호출하고 애플리케이션 레이어에서 병합한다 — 서비스가 직접 SQL을 쓰지 않는다.
- 이 스토리는 새 Server Action이나 Route Handler를 추가하지 않는다(순수 조회, URL 쿼리 파라미터 기반 페이지 재렌더링). 관리자 CRUD는 기존 Server Action(`ceremony-form.tsx`의 `createCeremonyAction`) 그대로 유지.
- **AD-3:** 권한 로직 변경 없음. `AdminLayout`의 기존 role 체크는 그대로 둔다. nav 활성 탭 컴포넌트 분리 시에도 세션/리다이렉트 로직은 `layout.tsx`(Server Component)에 남기고, 분리되는 `admin-nav-links.tsx`는 순수 표시용 Client Component로 세션 정보를 다루지 않는다.
- DESIGN.md §4 Navigation, §5 Layout(관리자: 중앙 정렬 max-width ~1200px), §7 Do's/Don'ts(라운딩 스케일 4/8/12px만 사용) 준수. 신규 색상 값 도입 금지 — `apps/web/app/design-tokens.css`의 기존 CSS 변수만 사용(Task 7 참고).

### 스코프 경계 — 하지 말 것

- Story 5.3(신랑·신부 이름)의 필드나 표시 로직을 선점하지 않는다 — 카드 헤더에 이름을 추가하지 않는다(아직 스키마에 없음).
- Story 5.4(회원 관리), 홀/템플릿 화면의 레이아웃·스타일을 변경하지 않는다.
- 캘린더에 "담당 오퍼레이터 배정" 같은 prototype의 다른 기능(assignee 칩, status 배지)을 이식하지 않는다 — 이 앱에 아직 없는 데이터 모델(오퍼레이터 배정, 예식 상태 필드)이 필요하며 이 스토리의 AC 밖이다.
- `checklist_instance_items` 완료 상태 등 체크리스트 진행률 표시(prototype의 `progress` 필드)는 이식하지 않는다 — Story 2.3 Dev Notes에 명시된 대로 이 스키마에 완료 필드 자체가 없다.

### 테스트 요구사항

vitest 이중 environment(`.test.ts` = node/DB 통합, `.test.tsx` = jsdom). 신규 서비스/리포지토리 함수는 반드시 `apps/web/tests/repositories/ceremony.test.ts`, `apps/web/tests/services/ceremony.test.ts`의 기존 패턴(`resetDb()`, `createTestHall()` 헬퍼 재사용)을 따라 테스트를 추가한다. 특히 `listCeremonyDatesForMonth`는 KST/UTC 경계(예: 월말 23:xx KST가 UTC로는 다음 달로 넘어가는 케이스)를 반드시 테스트로 커버할 것 — Story 2.1에서 실제로 발생했던 종류의 버그다.

### Project Structure Notes

- Alignment with unified project structure: `lib/services/ceremony.ts` → `lib/db/repositories/ceremony.ts` 계층 그대로 확장, Architecture Spine의 `Capability → Architecture Map`(FR-4/5 예식·인스턴스 → `lib/services/ceremony.ts`, governed by AD-2)과 일치.
- 신규 컴포넌트 파일은 기존 `apps/web/app/admin/ceremonies/*.tsx` 파일들과 같은 디렉터리에 kebab-case로 추가(`ceremony-calendar.tsx`, `ceremony-pagination.tsx`, `ceremonies.css`에 스타일 추가) — 기존 `ceremony-form.tsx`, `ceremony-row.tsx` 명명 관례와 일치.
- Detected conflict: 없음. Story 5.3이 아직 backlog라 `ceremonies` 테이블에 이름 컬럼이 없는 상태로 이 스토리를 구현해야 하며, 카드 UI는 현재 필드(hallName, time, itemCount)만 사용한다.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2] — AC 1~4 원본.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-2] — 리포지토리 hallId 스코프 규칙.
- [Source: prototype/js/screens/WeddingScreen.js] — 캘린더+목록 레이아웃 시각 레퍼런스(AC 1, 2, 4, 7).
- [Source: prototype/js/screens/AdminScreen.js] — 내비게이션 탭 강조·컨테이너 폭 시각 레퍼런스(AC 5, 6).
- [Source: apps/web/lib/services/ceremony.ts] — `todayRangeKST()` KST 경계 계산 패턴, 재사용 필수.
- [Source: _bmad-output/implementation-artifacts/5-1-admin-nav-links.md] — 어드민 내비게이션을 다룬 직전 스토리, `layout.tsx`가 Server Component여야 하는 이유와 세션 체크 위치.
- [Source: DESIGN.md §2, §4, §5, §7] — 색상/라운딩/레이아웃 토큰 및 Do's/Don'ts.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.2
- `prototype/js/screens/WeddingScreen.js`, `prototype/js/screens/AdminScreen.js` — 디자인 정렬 시각 레퍼런스
- `apps/web/lib/services/ceremony.ts`, `apps/web/lib/db/repositories/ceremony.ts`
- `apps/web/app/admin/layout.tsx`, `apps/web/app/admin/ceremonies/page.tsx`

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story). 착수 중 대표 요청으로 어드민 내비게이션+예식 화면의 프로토타입 디자인 정렬 범위 추가(AC 5~7, 사용자 확인: 이 스토리가 만지는 화면으로만 한정).
