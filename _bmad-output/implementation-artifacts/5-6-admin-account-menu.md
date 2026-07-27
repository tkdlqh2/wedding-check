---
baseline_commit: de05700d5a73c03159856217060c0e856417ffde
---

# Story 5.6: 관리자 계정 메뉴 — 비밀번호 변경/로그아웃

Status: review

## Story

As a 관리자,
I want 상단 내비게이션에서 내 비밀번호를 바꾸고 로그아웃할 수 있기를,
so that 계정 발급자(개발자)에게 부탁하지 않고도 비밀번호를 직접 관리하고 안전하게 세션을 종료할 수 있다.

## Acceptance Criteria

1. **Given** 관리자로 로그인한 상태에서 **When** 상단 내비게이션 우측을 확인하면 **Then** 기존 "새 예식 등록" 버튼 대신 "비밀번호 변경"과 "로그아웃" 두 액션이 있다(DESIGN.md §4 Secondary 버튼 스타일).
2. **Given** "비밀번호 변경"을 클릭하면 **When** 현재 비밀번호·새 비밀번호를 입력해 제출하면 **Then** better-auth `changePassword`로 비밀번호가 변경되고 성공이 조용히 확인된다(UX-DR16, 축하 연출 없음).
3. **Given** 현재 비밀번호를 틀리게 입력하면 **When** 제출하면 **Then** 저장이 거부되고 "현재 비밀번호가 올바르지 않습니다" 같은 구체적 오류가 표시된다(UX-DR14).
4. **Given** "로그아웃"을 클릭하면 **When** 액션이 완료되면 **Then** 세션이 종료되고 로그인 화면(`/login`)으로 이동한다.
5. **Given** 상단 내비 탭(홀/예식/회원/인사이트)과 새 계정 메뉴 버튼을 함께 렌더링하면 **When** 화면을 확인하면 **Then** `prototype/js/screens/AdminScreen.js`와 동일한 시각 언어(흰 배경 스티키 헤더, 탭 활성 틴트, 우측 액션 버튼)로 정렬되고 좁은 화면에서도 컨테이너 밖으로 밀리지 않는다.

## Tasks / Subtasks

- [x] Task 1: 로그아웃 버튼 (AC: 1, 4)
  - [x] `apps/web/app/admin/admin-nav-links.tsx` 옆에 새 Client Component `apps/web/app/admin/account-menu.tsx`를 만들어 `authClient.signOut()` 호출 후 `router.push("/login")`, `router.refresh()`로 로그아웃 처리. `btn-secondary` 클래스 재사용.

- [x] Task 2: 비밀번호 변경 모달 (AC: 2, 3)
  - [x] `account-menu.tsx`에 "비밀번호 변경" 버튼 클릭 시 여는 인라인 모달/드로어(`role="dialog"`) 추가 — 별도 라우트 없이 클라이언트 상태(`useState`)로 열고 닫음. `motion-slow`/`ease-enter` 슬라이드인(DESIGN.md §15), `prefers-reduced-motion`에서는 즉시 표시.
  - [x] 현재 비밀번호(`currentPassword`)·새 비밀번호(`newPassword`, 8자 이상 — `lib/services/member.ts`의 `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_LENGTH`와 동일 정책) 입력란 2개, `input`/`input--error` 패턴 재사용.
  - [x] 제출 시 `authClient.changePassword({ currentPassword, newPassword })` 호출(better-auth core 엔드포인트, `apps/web/node_modules/better-auth/dist/api/routes/update-user.mjs` 확인 완료 — 별도 서버 액션 불필요, 클라이언트 SDK가 이미 세션 쿠키로 인증됨).
  - [x] 에러 매핑: `INVALID_PASSWORD` → "현재 비밀번호가 올바르지 않습니다", `PASSWORD_TOO_SHORT`/`PASSWORD_TOO_LONG` → "비밀번호는 8자 이상 128자 이하여야 합니다", 그 외 → 일반 오류 문구. `field-error` 클래스로 표시.
  - [x] 성공 시 모달을 닫고 짧은 확인 문구(초록 텍스트, 축하 연출 없음) 후 폼 리셋 — 별도 페이지 이동 없음(AC 2).

- [x] Task 3: 레이아웃 교체 (AC: 1, 5)
  - [x] `apps/web/app/admin/layout.tsx`의 `<Link href="/admin/ceremonies" className="btn-primary">새 예식 등록</Link>`를 `<AccountMenu />`로 교체.
  - [x] `apps/web/app/admin/admin-nav.css`에 계정 메뉴 컨테이너(`.admin-nav__account`) 스타일 추가 — `margin-left: auto`, `display: flex`, `gap: var(--space-sm)`, 좁은 화면에서 `flex-wrap: wrap`로 밀림 방지. 모달 오버레이는 `--z-modal` 토큰(기존 `design-tokens.css`에 정의돼 있는지 확인 후 없으면 신규 추가) 사용.

- [x] Task 4: 테스트 (AC: 2, 3)
  - [x] 이 스토리는 better-auth 클라이언트 SDK를 직접 호출하는 클라이언트 컴포넌트라 서버 유닛 테스트 대상이 없다 — 기존 관례(로그인 폼 `login/page.tsx`도 컴포넌트 테스트 없음)를 따라 신규 vitest 파일을 추가하지 않는다. `npm run test`/`npx tsc --noEmit`/`npm run lint`/`npm run build`는 그대로 클린해야 한다.

- [x] Task 5: 수동 검증
  - [x] 로컬 서버에서 관리자 로그인 → 비밀번호 변경(정상 케이스) → 로그아웃 → 새 비밀번호로 재로그인 성공 확인.
  - [x] 현재 비밀번호를 틀리게 입력 → 오류 문구 확인.
  - [x] "로그아웃" 클릭 → `/login`으로 이동, 이후 관리자 라우트 직접 접근 시 다시 로그인 요구되는지 확인(세션 종료 회귀 확인).

## Dev Notes

### 배경

2026-07-27, Story 5.1~5.5 반영 후 대표가 실제 화면을 다시 점검한 2차 후속(3건 중 1번째, FR-16). 상단 내비 우측의 "새 예식 등록"은 이미 "예식" 탭에서 도달 가능해 중복이고, 계정 관리 수단(비밀번호 변경/로그아웃)이 화면 어디에도 없었다.

### 현재 코드 상태

- `apps/web/app/admin/layout.tsx` — Server Component. 세션 체크(`auth.api.getSession`)와 `<Link href="/admin/ceremonies" className="btn-primary">새 예식 등록</Link>`가 여기 있다. 이 부분만 `<AccountMenu />`로 교체.
- `apps/web/app/admin/admin-nav-links.tsx` — 탭 링크(홀/예식/회원, "인사이트" placeholder). `usePathname()`이 필요해 이미 Client Component로 분리돼 있다 — 이번 스토리도 동일한 이유(브라우저 API/상태 필요)로 계정 메뉴를 별도 Client Component로 만든다.
- `apps/web/lib/auth-client.ts` — `authClient = createAuthClient(...)`. better-auth core 클라이언트는 `changePassword`/`signOut`을 플러그인 없이 기본 제공한다(직접 확인: `node_modules/better-auth/dist/api/routes/update-user.mjs`에 `changePassword` 엔드포인트가 core에 있음, `admin`/`phoneNumber` 플러그인과 무관).
- `apps/web/app/(auth)/login/page.tsx` — `authClient.signIn.phoneNumber(...)` 패턴 참고. 로그아웃은 대칭적으로 `authClient.signOut()` 후 `router.push("/login")`.
- `apps/web/lib/services/member.ts`의 `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_LENGTH` 상수(8/128) — 이 스토리의 새 비밀번호 클라이언트 검증도 동일 값을 참고하되, 최종 검증은 어차피 better-auth 서버가 수행하므로 클라이언트 쪽은 UX용 `minLength`/`maxLength` 속성 정도면 충분하다(과설계 방지).

### 스코프 경계 — 하지 말 것

- 예식 등록 진입점을 완전히 없애지 않는다 — "예식" 탭 → `/admin/ceremonies` 경로는 그대로 유지(AC 5의 탭 구조 불변).
- 다른 회원의 비밀번호를 관리자가 여기서 바꾸는 기능은 범위 밖(그건 회원 관리 화면의 몫이며 현재 스토리 목록에 없음) — 이 스토리는 로그인한 본인의 비밀번호만.
- `revokeOtherSessions` 옵션은 기본값(끔)으로 두고 UI에 노출하지 않는다 — 이 스토리 AC에 없는 부가 기능.

### 프로젝트 컨텍스트 참고

- `_bmad-output/planning-artifacts/epics.md` Epic 5, Story 5.6 — 원본 AC.
- `prototype/js/screens/AdminScreen.js` — 상단 내비 시각 레퍼런스(탭 스타일은 Story 5.2에서 이미 정렬 완료, 이번 스토리는 우측 액션 영역만 변경).
- 스토리 파이프라인 관례(sprint-status.yaml `git_pipeline` 참고): 스토리 브랜치 → 단계별 커밋 → `gh pr create` → 리뷰(코덱스/자체) → 실결함 수정 반복 → `gh pr merge --merge --delete-branch` → sprint-status.yaml 갱신.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.6
- `apps/web/app/admin/layout.tsx`, `admin-nav-links.tsx`, `admin-nav.css`
- `apps/web/lib/auth-client.ts`, `apps/web/app/(auth)/login/page.tsx`

### Agent Model Used

Claude Sonnet 5

### Completion Notes List

- `authClient.changePassword`/`authClient.signOut`은 better-auth core 클라이언트 엔드포인트(플러그인 무관)라 별도 Server Action 없이 클라이언트에서 직접 호출 — tsc가 `error.code`(`INVALID_PASSWORD`/`PASSWORD_TOO_SHORT`/`PASSWORD_TOO_LONG`) 타입을 정확히 추론해 매핑에 문제 없음을 확인.
- 공유 로컬 test DB(`wedding_check_test`)가 마이그레이션 `0015_member-management-banned-fields.sql`(Story 5.4, `user.banned` 등)이 누락된 상태였음 — 이 스토리와 무관한 기존 인프라 드리프트였으나, 방치 시 이후 스토리도 계속 실패하므로 `docker exec ... psql`로 직접 적용해 바로잡음(회귀 아님, 최종 125건 전체 통과).
- 로컬 서버(포트 3101, `.env.local`/`.env.test`를 워크트리에 복사) + curl로 실제 better-auth 엔드포인트(`/api/auth/change-password`, `/api/auth/sign-out`) 직접 호출해 AC 2/3/4 검증: 틀린 현재 비밀번호 → `INVALID_PASSWORD`, 올바른 현재 비밀번호 → 변경 성공, 로그아웃 후 `/admin/ceremonies` 접근이 307로 리다이렉트됨을 확인. SSR HTML에서 "새 예식 등록"이 사라지고 "비밀번호 변경"/"로그아웃"이 렌더링됨을 확인(AC 1). 브라우저 도구가 없어 모달 열기/닫기 애니메이션·포커스 이동은 컴포넌트 코드 검토로 대체 검증.
- `npm run test`(125 passed), `npx tsc --noEmit`(clean), `npm run lint`(clean), `npm run build`(clean) 전부 확인.
- 코덱스 CLI 대신 자체 검토(diff 재확인, 보안/회귀 관점) — 코덱스 review 도구는 이 환경의 인증 상태를 확인하지 않고 임의 호출하지 않음.

### File List

- `apps/web/app/admin/account-menu.tsx` (NEW)
- `apps/web/app/admin/layout.tsx` (MODIFY)
- `apps/web/app/admin/admin-nav.css` (MODIFY)

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story, Epic 5 2차 프로토타입 리뷰 후속 3건 중 1번째).
- 2026-07-27: 구현 완료 (dev-story) — 계정 메뉴 컴포넌트, 레이아웃 교체, 로컬 서버 curl 검증. 공유 test DB 마이그레이션 드리프트(0015) 수정. Status → review.
