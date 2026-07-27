---
baseline_commit: 82daf9610546c4daabe893ea220217379484bff3
---

# Story 5.7: 회원 관리 화면 정비 — 역할 선택/변경, 페이지네이션, 프로토타입 정합화

Status: done

## Story

As a 관리자,
I want 회원 등록 시 역할을 고르고 등록된 회원의 역할·활성 상태를 한눈에 관리할 수 있기를,
so that 오퍼레이터뿐 아니라 관리자 계정도 화면에서 직접 발급하고, 회원이 늘어나도 목록을 편하게 훑을 수 있다.

## Acceptance Criteria

1. **Given** 회원 등록 폼을 열면 **When** 필드를 확인하면 **Then** 이름·전화번호 아래 "역할" 선택(오퍼레이터/관리자 토글 버튼, 기본값 오퍼레이터)이 있고, 선택한 역할로 계정이 생성된다.
2. **Given** 회원 목록에서 **When** 각 회원 행을 확인하면 **Then** 오퍼레이터/관리자 세그먼트 버튼으로 역할을 바로 변경할 수 있다(로그인 중인 본인 행은 Story 5.4 원칙대로 위험한 자기 자신 조작을 막는다 — 최소 1명의 활성 관리자가 항상 남아있도록, 마지막 활성 관리자 본인의 역할 변경은 차단하고 안내 문구를 표시한다).
3. **Given** 전화번호가 등록되어 있을 때 **When** 목록에서 조회하면 **Then** `000-0000-0000` 형식(3-4-4)으로 표시된다(저장은 기존대로 숫자만, 표시만 포맷).
4. **Given** 회원이 여러 명 등록되어 있을 때 **When** 목록을 확인하면 **Then** 활성 회원이 먼저, 비활성 회원은 뒤로 정렬되어 표시되고, 목록 상단에 "전체 N명 · 활성 N명 · 비활성 N명" 요약과 "비활성 보기/숨기기" 토글(기본값: 숨김)이 있다.
5. **Given** 등록된 회원이 페이지 크기를 넘을 때 **When** 목록을 확인하면 **Then** 예식 목록(Story 5.2)과 동일한 방식(이전/다음 링크 + `N / totalPages`)의 페이지네이션으로 조회된다.
6. **Given** 회원 등록 폼·목록 카드를 렌더링하면 **When** 화면 폭을 좁히거나 긴 이름/전화번호가 들어와도 **Then** 카드 경계 밖으로 내용이 밀려나오지 않는다(`min-width: 0`/`flex-wrap` 등으로 오버플로 방지).

## Tasks / Subtasks

- [x] Task 1: 회원 등록 폼에 역할 선택 추가 (AC: 1)
  - [x] `apps/web/lib/services/member.ts`의 `createMember(input)`에 `role?: "operator" | "admin"` 필드를 추가(기본값 `"operator"`, 유효하지 않은 문자열이면 `MemberValidationError`). `auth.api.createUser` 호출의 `body.role`에 그대로 전달한다 — better-auth admin 플러그인의 `createUser` 엔드포인트는 `headers` 없이 호출되면(§Dev Notes "권한 체크 우회" 참고, Story 5.4에서 이미 검증된 패턴) 세션이 없어 `hasPermission` 블록 전체가 스킵되므로 `role: "admin"`도 그대로 통과한다(`node_modules/better-auth/dist/plugins/admin/routes.mjs`의 `createUser` 핸들러 실제 확인 완료 — `session`이 falsy면 role 권한 체크를 건너뛴다).
  - [x] `apps/web/app/admin/members/member-form.tsx`: 전화번호 아래·초기 비밀번호 위에 역할 토글 필드 추가. `useState<"operator" | "admin">("operator")`로 로컬 상태 관리, 두 개의 pill 버튼(`오퍼레이터`/`관리자`, 선택 시 `--color-brand-tint` 배경 + `--color-brand` 보더, `border-radius: var(--radius-full)`, prototype `MemberScreen.js` 45~49행의 시각 참고)과 `<input type="hidden" name="role" value={role} />`로 폼 제출값을 전달한다. 기존 `useEffect`의 폼 리셋 로직에 `setRole("operator")`도 함께 추가(성공 후 다음 등록은 다시 기본값에서 시작).
  - [x] `apps/web/app/admin/members/actions.ts`의 `createMemberAction`: `formData.get("role")`을 읽어 `"operator"`/`"admin"`이 아니면 `"operator"`로 폴백 후 `createMember`에 전달.
  - [x] `members.css`: pill 토글 버튼 스타일(`.member-form__role-toggle`, `.member-form__role-pill`, `.member-form__role-pill--active`) 추가 — 색상/라운딩은 `design-tokens.css` 변수만 사용.

- [x] Task 2: 회원 목록에서 역할 변경 + 마지막 활성 관리자 보호 (AC: 2)
  - [x] `apps/web/lib/db/repositories/member.ts`에 `findById(id: string): Promise<Member | undefined>` 추가 — `db.query.user.findFirst({ where: eq(user.id, id) })`(`findByPhoneNumber`와 동일한 패턴).
  - [x] `apps/web/lib/services/member.ts`에 `setMemberRole(currentUserId: string, targetId: string, role: string): Promise<void>` 추가:
    - `role`이 `"operator"`/`"admin"`이 아니면 `MemberValidationError`.
    - `memberRepo.findById(targetId)`로 대상 조회, 없으면 `MemberValidationError("존재하지 않는 회원입니다")`.
    - **마지막 활성 관리자 보호**: `target.id === currentUserId && target.role === "admin" && role !== "admin"`이면, `memberRepo.findAll()` 결과에서 `role === "admin" && !banned`인 계정 수를 세어 1 이하이면 `MemberValidationError("마지막 활성 관리자는 역할을 변경할 수 없습니다. 다른 계정을 관리자로 지정한 뒤 다시 시도하세요.")`를 던진다(DESIGN.md §10 — 탓하지 않고 다음 행동을 제시하는 톤).
    - 통과하면 `auth.api.setRole({ body: { userId: targetId, role }, headers: await headers() })` 호출 — `setRole`은 `banUser`/`unbanUser`와 동일하게 `adminMiddleware`를 쓰므로 headers가 반드시 필요하다(`routes.mjs`의 `setRole` 핸들러 확인 완료, `requireHeaders: true`).
  - [x] `apps/web/app/admin/members/actions.ts`에 `setMemberRoleAction(formData: FormData): Promise<void>` 추가(다른 form-action들과 동일한 시그니처) — `const session = await requireAdminSession()`으로 현재 사용자 id를 얻고, `id`/`role` 필드를 읽어 `setMemberRole(session.user.id, id, role)` 호출 후 `revalidatePath("/admin/members")`.
  - [x] `apps/web/app/admin/members/page.tsx`: `listMembersPaginated()`(Task 4)가 반환하는 전체 목록 기준 `activeAdminCount`를 각 `MemberRow`에 내려준다. `MemberRow`에서 `isLastActiveAdmin = isSelf && member.role === "admin" && activeAdminCount <= 1`을 계산.
  - [x] `apps/web/app/admin/members/member-row.tsx`: props에 `activeAdminCount: number` 추가.
    - `isLastActiveAdmin`이면 세그먼트 버튼 대신 현재 역할 배지 + `"마지막 활성 관리자는 역할을 변경할 수 없습니다"` 안내 텍스트(정적, 클릭 불가)를 렌더링 — 실패할 액션을 아예 보여주지 않는다(Story 5.6/5.4에서 이미 확립된 원칙, `member-row.tsx` 상단 주석 참고).
    - 그 외의 경우 세그먼트 컨트롤 렌더링: 현재 역할은 강조된 정적 라벨, 다른 역할은 `setMemberRoleAction`을 호출하는 `<form>`(hidden `id`/`role` + 제출 버튼) — prototype `MemberScreen.js` 71~75행의 다크 세그먼트 시각(선택 `#1f1f1f` 배경/흰 글자, 비선택 흰 배경/회색 글자)을 토큰으로 치환해 참고.
  - [x] `members.css`: 세그먼트 컨트롤(`.member-row__role-segment`, `.member-row__role-segment-btn`, `.member-row__role-segment-btn--active`)과 마지막 관리자 안내(`.member-row__role-locked-hint`) 스타일 추가.

- [x] Task 3: 전화번호 표시 포맷 (AC: 3)
  - [x] `apps/web/lib/phone.ts`에 `formatPhoneNumberDisplay(phoneNumber: string | null): string` 추가: `null`/빈 문자열이면 `"전화번호 미등록"`(기존 `member-row.tsx`의 폴백 문구 재사용). 숫자만 남은 값 기준 길이 11 → `000-0000-0000`(3-4-4), 길이 10 → `000-000-0000`(3-3-4), 그 외(비정상 길이)는 원본 그대로 반환(방어적 폴백, 저장 데이터를 훼손하지 않음).
  - [x] `apps/web/app/admin/members/member-row.tsx`: `member.phoneNumber`를 직접 렌더링하던 부분을 `formatPhoneNumberDisplay(member.phoneNumber)`로 교체.

- [x] Task 4: 활성/비활성 정렬 + 요약 + 비활성 토글 (AC: 4)
  - [x] `apps/web/lib/services/member.ts`에 `listMembersPaginated(input: { page: number; pageSize: number; showInactive: boolean }): Promise<PaginatedMembers>` 추가(`PaginatedMembers` 타입도 함께 export). 구현:
    - `memberRepo.findAll()`로 전체 목록 조회(기존 `orderBy: desc(createdAt)` 그대로 유지).
    - `totalCount`/`activeCount`/`inactiveCount`/`activeAdminCount`는 **전체 목록 기준**으로 계산(페이지네이션과 무관하게 항상 전체 인원 요약을 보여줘야 하므로 — AC 4).
    - Array의 안정 정렬(stable sort, ECMA2019+ 보장)을 이용해 `.sort((a, b) => Number(a.banned) - Number(b.banned))`로 활성(false=0) 먼저·비활성(true=1) 뒤로 정렬 — 기존 `createdAt desc` 순서는 동일 그룹 내에서 그대로 유지된다.
    - `showInactive`가 `false`면 `banned === true`인 항목을 제외한 뒤 페이지네이션.
    - 페이지네이션은 `listCeremoniesPaginated`(`apps/web/lib/services/ceremony.ts` 132~161행)와 동일한 clamp 패턴 재사용: `totalPages = Math.max(1, Math.ceil(filteredCount / pageSize))`, `page = Math.min(Math.max(1, requestedPage), totalPages)`.
  - [x] `apps/web/app/admin/members/page.tsx`: 기존 `listMembers()` 호출을 `listMembersPaginated({ page, pageSize: PAGE_SIZE, showInactive })`로 교체(`PAGE_SIZE = 10`, ceremonies와 동일). `searchParams`에서 `page`/`showInactive`를 읽어 파싱(`ceremonies/page.tsx`의 `parsePageParam` 패턴 재사용/복제 — 별도 공유 유틸로 추출하지 않는다, 두 파일 모두 각자의 파싱 함수를 갖는 기존 관례 그대로).
  - [x] `page.tsx`에 요약 바 렌더링: `"전체 {totalCount}명 · 활성 {activeCount}명 · 비활성 {inactiveCount}명"` + 비활성 토글. **토글은 실제 `<input type="checkbox">`가 아니라 `showInactive` 쿼리 파라미터를 뒤집는 `<Link>`로 구현한다** — 이 프로젝트의 필터 상태는 전부 URL 쿼리 파라미터 + Server Component + `<Link>` 조합으로만 구현되어 있고(`ceremony-calendar.tsx`, `ceremony-pagination.tsx` 참고, 클라이언트 상태 없음) 실제 체크박스는 폼 제출 없이 값이 바뀌면 자동 네비게이션되지 않아 클라이언트 JS가 추가로 필요하다. `prototype/js/screens/MemberScreen.js` 58행의 실제 참고 구현도 체크박스가 아니라 버튼이다(epics.md의 "체크박스"는 개념적 표현으로 해석). 토글을 누르면 `page=1`로 리셋해야 한다(필터가 바뀌면 총 페이지 수도 바뀌므로).
  - [x] `members.css`: 요약 바(`.members-page__summary`) 스타일 추가.

- [x] Task 5: 페이지네이션 (AC: 5)
  - [x] `apps/web/app/admin/members/member-pagination.tsx`(NEW) — `apps/web/app/admin/ceremonies/ceremony-pagination.tsx`를 1:1 템플릿으로 삼되 `year`/`month` 대신 `showInactive`를 쿼리에 실어야 한다(`pageHref(page, showInactive)` → `/admin/members?page=${page}&showInactive=${showInactive ? "1" : "0"}`). `totalPages <= 1`이면 `null` 반환(동일).
  - [x] `page.tsx`: 목록 아래 `<MemberPagination page={result.page} totalPages={result.totalPages} showInactive={showInactive} />` 렌더링.
  - [x] `members.css`: `.member-pagination`, `.member-pagination__btn`, `.member-pagination__btn--disabled`, `.member-pagination__status` — `ceremonies.css`의 `.ceremony-pagination*` 클래스와 동일한 스타일 값(다른 파일이라 클래스 자체는 복제, 기존 컨벤션 — halls/ceremonies/members 각자 자기 CSS 파일을 갖는 구조 유지).

- [x] Task 6: 반응형 오버플로 방지 (AC: 6)
  - [x] `members.css`: `.member-row__name-line`에 `flex-wrap: wrap`(역할 배지 + 상태 배지 + 세그먼트 컨트롤이 한 줄에 다 안 들어갈 수 있음). `.member-row__actions`에도 `flex-wrap: wrap`. `.member-row__name`에 `overflow-wrap: anywhere`(매우 긴 이름 대비). `.member-row__info`는 이미 `min-width: 0`이 있음(기존 유지, 회귀 없음 확인만).
  - [x] `.members-page__grid`가 이미 `grid-template-columns: 360px 1fr`인데 좁은 화면(`<1024px`, DESIGN.md §8 Tablet 브레이크포인트)에서 폼 카드 360px 고정폭이 컨테이너를 넘칠 수 있는지 실제로 확인 — 넘치면 `@media (max-width: 1024px) { .members-page__grid { grid-template-columns: 1fr; } }` 추가(halls/ceremonies가 아직 안 갖고 있다면 이 스토리 범위 밖이므로 members 파일에만 국소 적용).

- [x] Task 7: 테스트 (AC: 1, 2, 3, 4, 5)
  - [x] `apps/web/tests/services/member.test.ts`에 추가:
    - `createMember`에 `role: "admin"` 전달 시 실제로 admin 역할로 생성되는지(로그인 후 `role` 확인까지) — role 미전달 시 기존처럼 `"operator"` 기본값 유지 회귀 확인.
    - `setMemberRole`: (a) operator → admin 정상 변경, (b) 다른 활성 관리자가 있을 때 admin → operator 정상 변경, (c) **본인이 유일한 활성 관리자일 때 자기 자신을 admin → operator로 바꾸려 하면 `MemberValidationError`를 던지고 role이 그대로인지**(핵심 회귀 지점, `signInAsAdmin()` 헬퍼로 세션을 만들고 그 계정 자신을 대상으로 호출), (d) 존재하지 않는 id, (e) 유효하지 않은 role 문자열.
    - `listMembersPaginated`: 활성/비활성 섞인 데이터에서 정렬 순서(활성 먼저), `showInactive: false`일 때 비활성 제외, `showInactive: true`일 때 포함, `totalCount`/`activeCount`/`inactiveCount`가 필터와 무관하게 전체 기준인지, `page`/`totalPages` clamp(범위 밖 페이지 요청 시).
  - [x] `apps/web/tests/repositories/member.test.ts`에 `findById` 테스트 추가(존재/미존재).
  - [x] `apps/web/tests/lib/phone.test.ts`(NEW) — `formatPhoneNumberDisplay`: 11자리(`01012345678` → `010-1234-5678`), 10자리(`0212345678` → `021-234-5678`), `null`/빈 문자열(`"전화번호 미등록"`), 비정상 길이(원본 그대로 반환).
  - [x] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [x] Task 8: 수동 검증
  - [x] 로컬 서버에서 회원 등록 폼으로 역할을 "관리자"로 선택해 신규 계정 생성 → 목록에 관리자 배지로 나타나고 그 계정으로 로그인 후 `/admin/members` 접근이 되는지 확인(AC 1).
  - [x] 기존 오퍼레이터 계정을 목록에서 세그먼트 버튼으로 "관리자"로 변경 → 배지 갱신 확인(AC 2).
  - [x] 테스트 DB/로컬 시드에서 활성 관리자를 1명만 남긴 상태를 만들어 그 계정으로 로그인 → 본인 행에 세그먼트 버튼 대신 안내 문구가 뜨는지 확인(AC 2 핵심 시나리오).
  - [x] 전화번호가 `010-1234-5678`처럼 하이픈 포맷으로 표시되는지 확인(AC 3).
  - [x] 11명 이상 등록 후 페이지네이션 동작(이전/다음, 페이지 번호) 확인(AC 5). 비활성 계정을 여러 개 만들고 "비활성 보기" 토글 on/off 시 요약 카운트와 목록이 맞게 바뀌는지 확인(AC 4).
  - [x] 브라우저 폭을 좁혀(또는 iPad 폭 1024px 이하) 긴 이름/전화번호를 가진 회원 행이 카드 밖으로 밀리지 않는지 확인(AC 6).
  - [x] `/admin/halls`, `/admin/ceremonies` 등 이 스토리에서 건드리지 않은 화면이 깨지지 않았는지(회귀 없음) 확인.

## Dev Notes

### 배경

Story 5.4로 회원 관리 화면 자체는 생겼지만, 대표가 실제 화면을 다시 점검한 2차 후속(3건 중 3번째, FR-14/FR-17) 결과 다음 6가지가 지적됐다: (1) 등록 폼이 오퍼레이터 계정만 만들 수 있음, (2) 이미 등록된 회원의 역할을 바꿀 방법이 없음, (3) 목록에 페이지네이션이 없음, (4) 비활성 회원이 활성 회원과 뒤섞여 표시됨, (5) 전화번호가 원본 숫자 그대로 표시됨, (6) 전체/활성/비활성 인원 요약과 비활성 숨기기 토글이 없음. 카드가 화면 폭보다 밀려나오는 레이아웃 문제도 함께 지적됨(AC 6). `prototype/js/screens/MemberScreen.js`가 이 6가지를 모두 반영한 시각 참고 구현이다.

### 현재 코드 상태 (읽고 시작할 것)

- `apps/web/app/admin/members/page.tsx` — 현재 `listMembers()`(전체 조회, 페이지네이션/필터 없음)를 호출하는 단순 Server Component. `session.user.id`를 이미 조회해 `isSelf` 계산에 쓰고 있다(비활성화 버튼 숨김용) — 이 값을 역할 변경 보호에도 재사용한다.
- `apps/web/lib/services/member.ts` — `listMembers`, `createMember`, `deactivateMember`, `reactivateMember`, `MemberValidationError` 전체 존재. `createMember`는 이름/비밀번호 trim, 전화번호 정규화, 중복 검사, `auth.api.createUser` 호출까지 이미 구현돼 있다 — role 파라미터만 추가하면 된다(구조를 바꾸지 않는다).
- `apps/web/lib/db/repositories/member.ts` — `findAll`, `findByPhoneNumber`만 존재. `findById` 없음(Task 2에서 추가).
- `apps/web/app/admin/members/member-row.tsx` — `ROLE_LABEL` 매핑, `isSelf`일 때 비활성화 버튼 대신 `"현재 로그인한 계정"` 힌트를 보여주는 기존 패턴이 있다 — 역할 변경의 "마지막 활성 관리자" 보호도 동일한 스타일(위험한 액션을 숨기고 안내 텍스트로 대체)로 만든다.
- `apps/web/app/admin/ceremonies/page.tsx`, `ceremony-pagination.tsx`, `ceremony-calendar.tsx` — 이 스토리가 그대로 재사용할 페이지네이션/URL 쿼리 파라미터 패턴의 실제 원본. **이 프로젝트는 필터·페이지 상태를 클라이언트 상태 없이 전부 `<Link>` + searchParams로 구현한다** — 새 클라이언트 상태(예: `useState` 기반 필터)를 도입하지 않는다.
- `apps/web/lib/phone.ts` — `normalizePhoneNumber`(숫자만 남김)만 존재. 표시용 포맷 함수 없음(Task 3에서 추가, 이름을 `formatPhoneNumberDisplay`로 지어 정규화 함수와 혼동하지 않게 한다).
- `apps/web/lib/auth.ts` — `Role = "operator" | "admin"` 타입 export됨. `roles: { admin: adminAc, operator: operatorRole }`로 두 역할 모두 better-auth에 등록돼 있어 `setRole`/`createUser`에 `"admin"`을 넘겨도 `YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE`가 나지 않는다(직접 소스 확인 완료).

### better-auth 권한 체크 재확인 (이 스토리를 위해 직접 소스 읽고 검증)

`node_modules/better-auth/dist/plugins/admin/routes.mjs` 실제 코드 기준(버전 `^1.6.25`, Story 5.4가 검증한 것과 동일 버전):

- **`createUser`**: `headers` 없이 호출하면(Story 5.4의 기존 패턴 그대로) `session`이 `undefined`가 되고, `requestedRole !== undefined`일 때의 역할 권한 체크(`hasPermission({ permissions: { user: ["set-role"] } })`)는 `if (session) { ... }` 블록 안에 있어 통째로 스킵된다 — `role: "admin"`을 넘겨도 권한 오류 없이 그대로 생성된다. `opts.roles`에 등록 안 된 role 문자열만 (세션 유무와 무관하게) `YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE`로 거부되는데, `"admin"`/`"operator"` 둘 다 `lib/auth.ts`에 등록돼 있어 문제 없다.
- **`setRole`**: `requireHeaders: true` + `use: [adminMiddleware]` — `banUser`/`unbanUser`와 동일하게 headers(호출자 세션) 없이는 무조건 실패한다. `hasPermission({ permissions: { user: ["set-role"] } })` 체크도 있어 `operator` 세션으로 호출하면 거부된다(Server Action의 `requireAdminSession()`이 먼저 걸러내므로 이중 방어). **better-auth 자체는 "자기 자신을 마지막 관리자에서 강등"을 막는 로직이 없다** — `banUser`의 `YOU_CANNOT_BAN_YOURSELF`와 달리 `setRole`에는 자기 자신 체크가 전혀 없으므로, 이 스토리의 서비스 레이어(`setMemberRole`)가 유일한 방어선이다(§Task 2 참고, 절대 생략하지 말 것).

### 마지막 활성 관리자 판정 로직에 대한 근거

관리자 세션으로만 `/admin/members`에 접근 가능하므로(AD-3, `admin/layout.tsx`의 role 체크), 현재 로그인한 사용자는 항상 활성 관리자 집합에 포함된다. 따라서 "활성 관리자가 1명뿐이고 그 1명이 나 자신이 아닌" 상황은 논리적으로 존재할 수 없다 — 즉 이 보호 로직이 실제로 걸리는 유일한 경우는 "본인이 유일한 활성 관리자인 채로 본인 역할을 바꾸려는 시도"뿐이다. 그래도 서비스 레이어의 조건은 `target.id === currentUserId`를 명시적으로 검사한다(방어적 코딩 — 카운트 로직에 버그가 있어도 다른 사람의 역할 변경까지 막지 않도록).

### 스코프 경계 — 하지 말 것

- 로그인 페이지, `lib/auth.ts`의 플러그인 설정, `lib/auth-guard.ts`는 건드리지 않는다 — 이 스토리는 `member.ts`(service/repo), `app/admin/members/*`, `lib/phone.ts`만 변경한다.
- 역할 변경 직후 "본인 세션의 role 표시가 즉시 갱신되지 않을 수 있는" better-auth 세션 캐싱 이슈는 이 스토리 범위 밖이다(AC에 명시 없음) — 다음 로그인 시 반영되는 것으로 충분하다. 별도로 세션 강제 갱신/재발급 로직을 추가하지 않는다.
- SMS 발송, 비밀번호 초기화 UI 등 Story 5.4에서 이미 범위 밖으로 확정된 기능은 이번에도 다루지 않는다.
- `showInactive` 토글은 실제 `<input type="checkbox">` DOM 엘리먼트가 아니라 URL 쿼리 파라미터를 뒤집는 링크로 구현한다(§Task 4 근거 참고) — 체크박스 UI를 만들겠다고 클라이언트 컴포넌트나 `onChange` 핸들러를 새로 도입하지 않는다.
- halls/ceremonies/templates 화면의 스타일이나 구조는 변경하지 않는다.

### 테스트 요구사항

vitest 이중 environment(`.test.ts` = node/DB 통합). `deactivateMember`/`reactivateMember`와 마찬가지로 `setMemberRole`도 내부에서 `headers()`를 호출하므로 순수 node 컨텍스트에서 직접 호출하면 `"headers was called outside a request scope"`로 실패한다 — 기존 `signInAsAdmin()` 헬퍼(`tests/services/member.test.ts` 16~35행)로 실제 관리자 세션 헤더를 만들고, `auth.api.setRole({ headers, body: {...} })`를 직접 호출해 검증하거나, `setMemberRole` 자체를 테스트하려면 동일한 방식으로 `next/headers`의 요청 스코프 제약을 우회해야 한다(기존 파일의 검증된 패턴 그대로 재사용, 새 우회 방법을 발명하지 않는다).

### Project Structure Notes

- 신규 파일은 `apps/web/app/admin/members/` 안에 kebab-case로(`member-pagination.tsx`) — `halls/`, `ceremonies/` 명명 관례와 일치.
- `formatPhoneNumberDisplay`는 `normalizePhoneNumber`와 같은 파일(`lib/phone.ts`)에 추가 — 새 파일을 만들지 않는다.
- Detected conflict: 없음. Story 5.6(계정 메뉴)과 이 스토리는 서로 다른 라우트(`admin/account-menu.tsx` vs `admin/members/*`)를 건드려 충돌하지 않는다.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.7] — 원본 AC 6개 + 배경.
- [Source: apps/web/lib/services/member.ts, apps/web/lib/db/repositories/member.ts, apps/web/app/admin/members/*] — 확장 대상 기존 구현 전체.
- [Source: apps/web/lib/services/ceremony.ts#listCeremoniesPaginated, apps/web/app/admin/ceremonies/ceremony-pagination.tsx, ceremony-calendar.tsx] — 페이지네이션/URL 쿼리 파라미터 패턴 1:1 템플릿.
- [Source: node_modules/better-auth/dist/plugins/admin/routes.mjs] — `createUser`/`setRole` 권한 체크 실제 동작(이 스토리 작성 중 직접 읽고 검증).
- [Source: prototype/js/screens/MemberScreen.js] — 역할 토글 pill, 세그먼트 컨트롤, 요약 바, 비활성 토글의 시각 참고(색상은 토큰으로 치환, SMS 안내 문구·PRD-범위-밖 배지는 Story 5.4와 동일하게 이식하지 않음).
- [Source: _bmad-output/implementation-artifacts/5-4-member-management.md] — 이 스토리가 확장하는 원본 스토리, `isSelf` 패턴과 better-auth 권한 모델 근거.
- [Memory: project-wedding-check-auth-patterns] — phone-number 로그인, Server Action 보안(`requireAdminSession()` 필수 재확인).

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.7
- `_bmad-output/implementation-artifacts/5-4-member-management.md` — 원본 회원 관리 스토리
- `node_modules/better-auth/dist/plugins/admin/routes.mjs` — `createUser`/`setRole` 실제 소스 확인 완료
- `apps/web/app/admin/ceremonies/*` — 페이지네이션/필터 패턴 템플릿
- `prototype/js/screens/MemberScreen.js` — 시각 레퍼런스

### Agent Model Used

Claude Sonnet 5

### Debug Log References

없음(구현 중 예상치 못한 오류 없음).

### Completion Notes List

- Task 1~7은 계획대로 구현. `createMember`/`setMemberRole`/`listMembersPaginated` 모두 스토리 작성 단계에서 확인한 better-auth `createUser`/`setRole` 실제 동작(headers 유무에 따른 권한 체크 스킵/필수 여부)과 일치.
- `setMemberRole`의 마지막 활성 관리자 보호는 계획대로 `target.id === currentUserId && target.role === "admin" && role !== "admin"` 조건에서만 활성 관리자 수를 세도록 구현 — 다른 계정의 역할 변경에는 영향 없음(vitest로 검증).
- **대표의 실시간 UI 피드백으로 범위 확장(스토리 작성 시점엔 없던 항목, 로컬 서버로 화면을 직접 보며 나온 요청)**:
  1. 회원 등록 폼 입력창이 카드 밖으로 밀려나오는 문제 — 원인은 전역 `box-sizing: border-box` 리셋이 없어서(`.input`의 `width:100%` + padding이 content-box 기준으로 카드보다 넓게 렌더링됨). `design-tokens.css`에 전역 리셋 추가로 해결 — 이 프로젝트의 모든 폼(halls/ceremonies/members)에 공통 적용되는 회귀 없는 개선.
  2. 비활성화/다시 활성화 버튼을 `prototype/js/screens/MemberScreen.js` 76~80행처럼 흰 배경 + 상태색(error/success) 보더·텍스트로 재스타일링(기존 `btn-secondary` 중립 스타일 대체).
  3. 로그인 중인 본인 행 표시를 "현재 로그인한 계정" 문구에서 "Me" 배지로 축약, 비활성화/다시 활성화 버튼과 동일한 `min-width: 96px` + `height: 32px`로 통일해 행 높이/정렬이 흔들리지 않게 함.
  4. `<Link>` 기반 버튼(페이지네이션, 비활성 토글)에 브라우저 기본 밑줄이 그대로 노출되던 문제 — 전역 `a { text-decoration: none; }` 리셋 추가(이 앱의 모든 `<Link>`는 자체 스타일을 가진 버튼/필이라 안전).
  5. 이름 검색 추가(AC에는 없던 요청) — `listMembersPaginated`에 `search` 옵션 추가(대소문자 무시 부분 일치), GET 폼 기반 URL 쿼리 파라미터(`q`)로 구현해 이 프로젝트의 기존 필터 패턴(showInactive, ceremonies의 date/year/month)과 일관되게 유지. 페이지네이션/비활성 토글 둘 다 `q`를 유지하도록 배선.
- `npm run test`(155 passed), `npx tsc --noEmit`(clean), `npm run lint`(clean), `npm run build`(clean) 전부 확인.
- 로컬 서버(포트 3000, 대표가 직접 구동 중)에서 대표가 실시간으로 화면을 보며 회원 등록/역할 토글/세그먼트 변경/전화번호 포맷/페이지네이션/비활성 토글/검색을 직접 확인 — 4건의 UI 수정 요청이 모두 이 실시간 검증 과정에서 나왔고 즉시 반영/재확인함.
- **코덱스 리뷰 4라운드(1~3차 전부 실결함 발견 후 수정, 4차 클린)**:
  1. (1차 P2) `setMemberRole`의 마지막 활성 관리자 보호가 "카운트 확인 → setRole 호출" 두 단계로 나뉘어 있어, 두 관리자가 동시에 자기 자신을 강등하면 TOCTOU 경합으로 활성 관리자가 0명이 될 수 있었음 — `memberRepo.demoteIfNotLastActiveAdmin()`을 추가해 `FOR UPDATE`로 모든 활성 관리자 행을 잠그고 재확인한 카운트 기준으로만 UPDATE하는 단일 SQL 문으로 교체(`db.transaction()`은 프로덕션 드라이버에서 throw하므로 Story 1.3과 동일한 "단일 문으로 원자성 확보" 패턴). 동시 자기 강등 경합 재현 테스트 추가(반복 실행으로 비결정성 없음 확인).
  2. (1차 P2) `createMemberAction`이 `role=owner` 같은 조작된 값을 검증 없이 `operator`로 조용히 흡수했음 — `admin`/`operator` 외 값은 명시적으로 거부하도록 수정.
  3. (2차 P2) `formatPhoneNumberDisplay`가 서울(02, 2자리 지역번호) 번호에 일반 3자리 지역번호 규칙(3-3-4)을 그대로 적용해 `0212345678` → `"021-234-5678"`(틀림)로 표시됨 — `02` 프리픽스를 먼저 감지해 9자리(2-3-4)/10자리(2-4-4)로 별도 처리.
  4. (3차 P2) 이름 검색이 활성화되면 `listMembersPaginated`의 요약 카운트(전체/활성/비활성)가 검색 결과 기준으로 좁혀져 AC 4가 요구하는 "전체 회원 현황" 의미와 어긋났음 — 카운트를 검색 필터 이전(`all`) 기준으로 계산하도록 수정, 검색은 목록/페이지네이션에만 적용.

### File List

- `apps/web/lib/phone.ts` (MODIFY) — `formatPhoneNumberDisplay` 추가
- `apps/web/lib/db/repositories/member.ts` (MODIFY) — `findById`, `demoteIfNotLastActiveAdmin`(원자적 강등) 추가
- `apps/web/lib/services/member.ts` (MODIFY) — `createMember`에 `role` 파라미터, `setMemberRole`, `listMembersPaginated`(+ `search` 옵션) 추가
- `apps/web/app/admin/members/actions.ts` (MODIFY) — `setMemberRoleAction` 추가, `createMemberAction`에 role 처리
- `apps/web/app/admin/members/member-form.tsx` (MODIFY) — 역할 선택 pill 토글
- `apps/web/app/admin/members/member-row.tsx` (MODIFY) — 역할 세그먼트 컨트롤, 전화번호 포맷, Me 배지, 비활성화/다시 활성화 버튼 재스타일링
- `apps/web/app/admin/members/member-pagination.tsx` (NEW)
- `apps/web/app/admin/members/page.tsx` (MODIFY) — 페이지네이션/요약/이름 검색 배선
- `apps/web/app/admin/members/members.css` (MODIFY) — pill/세그먼트/요약/검색/페이지네이션 스타일
- `apps/web/app/design-tokens.css` (MODIFY) — 전역 `box-sizing: border-box`, `a { text-decoration: none }` 리셋
- `apps/web/tests/repositories/member.test.ts` (MODIFY) — `findById`, `demoteIfNotLastActiveAdmin` 테스트
- `apps/web/tests/services/member.test.ts` (MODIFY) — role/setMemberRole/listMembersPaginated(+search) 테스트, `signInAsAdmin` 헬퍼가 `userId`도 반환하도록 확장
- `apps/web/tests/lib/phone.test.ts` (NEW) — `formatPhoneNumberDisplay` 테스트

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story, Epic 5 2차 후속 3건 중 3번째, Story 5.4 확장).
- 2026-07-27: 구현 완료 (dev) — AC 1~6 전부 구현. 대표가 로컬 서버로 실시간 확인하며 준 4건의 UI 피드백(입력창 오버플로, 비활성화 버튼 스타일, Me 배지, 링크 밑줄) + 이름 검색 추가 요청까지 모두 반영. 코덱스 리뷰 4라운드(1~3차 실결함 3건 발견/수정 — 역할 강등 TOCTOU 경합, 잘못된 role 값 흡수, 서울 지역번호 포맷 오류, 검색 시 요약 카운트 왜곡; 4차 클린). vitest 155건 통과, tsc/lint/build 클린. Status → review.
