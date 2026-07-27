---
baseline_commit: 0a8882d
---

# Story 5.4: 회원(계정) 관리

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 오퍼레이터/관리자 계정을 화면에서 조회하고, 신규 오퍼레이터 계정을 생성·비활성화할 수 있기를,
so that 신입이 들어올 때마다 개발자에게 시드 스크립트 실행을 부탁하지 않고 직접 로그인 정보를 발급할 수 있다.

## Acceptance Criteria

1. **Given** 관리자로 로그인한 상태에서 **When** 상단 내비게이션의 "회원" 링크를 클릭하면 **Then** 회원 관리 화면(`/admin/members`)으로 이동해 등록된 계정 목록(이름·전화번호·역할·활성 상태)을 볼 수 있다.
2. **Given** 회원 관리 화면에서 **When** 이름·전화번호·초기 비밀번호를 입력해 신규 오퍼레이터 계정을 저장하면 **Then** 새 계정이 생성되고 목록에 나타나며, 그 전화번호+비밀번호로 실제 로그인이 가능하다(`[ASSUMPTION]` 생성 폼은 오퍼레이터 계정만 만든다 — 원본 스토리의 "I want" 문장이 "신규 오퍼레이터 계정을 생성"으로 명시적으로 한정하고 있고, 관리자 계정 셀프 생성까지 UI로 열면 AD-3의 최소 권한 원칙과 어긋난다. `prototype/js/screens/MemberScreen.js`는 생성 폼에도 역할 토글을 보여주지만, 이 스토리에서는 목록의 기존 계정 역할 변경에만 토글을 쓰고 생성은 오퍼레이터 고정으로 좁힌다 — 대표 확인 필요).
3. **Given** 이미 다른 계정이 쓰고 있는 전화번호로 신규 계정을 생성하려 하면 **When** 저장을 시도하면 **Then** 저장이 거부되고 "이미 등록된 전화번호입니다" 같은 구체적 오류가 표시된다.
4. **Given** 계정을 비활성화하면(`[ASSUMPTION]` Story 1.2 홀 삭제 정책과 동일하게 완전 삭제 대신 비활성화) **When** 그 계정으로 로그인을 시도하면 **Then** 로그인이 차단된다.
5. **Given** 오퍼레이터 세션으로 회원 관리 화면 URL(`/admin/members`)에 직접 접근을 시도하면 **When** 접근하면 **Then** 차단된다(AD-3, 기존 `admin/layout.tsx`의 role 체크 재사용).

## Tasks / Subtasks

- [x] Task 1: `user` 테이블에 계정 활성 상태 컬럼 추가 — `apps/web/lib/db/schema.ts` (MODIFY, AC: 4)
  - [x] better-auth 공식 `admin` 플러그인(설치된 `better-auth@^1.6.25`에 내장, 별도 패키지 설치 불필요)을 쓴다 — `isActive` 같은 컬럼을 직접 만들지 않는다. 이 플러그인은 로그인 시 배너 계정을 자동으로 차단하는 세션 생성 훅을 이미 구현하고 있어(§Dev Notes 근거 참고), 직접 훅을 작성하는 것보다 훨씬 안전하다.
  - [x] `node_modules/better-auth/dist/plugins/admin/schema.mjs`가 요구하는 필드와 정확히 일치하도록 `user` 테이블에 컬럼 3개 추가: `banned: boolean("banned").default(false).notNull()`, `banReason: text("ban_reason")`, `banExpires: timestamp("ban_expires")` — 기존 `phoneNumberVerified` 컬럼처럼 명시적 컬럼명을 지정한다(스네이크케이스 자동 변환에 기대지 말 것, 이 스키마 파일의 기존 관례).
  - [x] `npx drizzle-kit generate`로 마이그레이션 `drizzle/0010_*.sql` 생성(다음 번호는 0010 — 기존 0000~0009 확인됨). `scripts/apply-migrations.ts`가 파일을 순서대로 직접 실행하는 방식이라 drizzle-kit의 대화형 migrate는 쓰지 않는다(Epic 1 회고에서 이미 정착된 방식, chore-vitest-test-infra 참고).

- [x] Task 2: `admin` 플러그인 연결 — `apps/web/lib/auth.ts` (MODIFY, AC: 4)
  - [x] `import { phoneNumber, admin } from "better-auth/plugins"`, `plugins: [phoneNumber(), admin({ defaultRole: "operator", bannedUserMessage: "..." })]`로 확장. `defaultRole: "operator"`를 명시해 플러그인의 `databaseHooks.user.create.before` 폴백이 이 시스템의 실제 기본 역할(operator)과 일치하도록 고정한다(§Dev Notes "왜 admin 플러그인인가" 참고 — 명시하지 않으면 폴백이 better-auth 기본값인 `"user"`가 된다).
  - [x] ~~`adminRoles`/`roles` 옵션은 설정하지 않는다~~ → **실제 구현에서 변경**: `roles`를 명시적으로 설정했다. 이유는 두 가지. (1) `auth.api.createUser`의 `body.role` 타입이 `roles` 미설정 시 better-auth 기본 `"user" | "admin"` 유니온으로 추론되어 `"operator"`를 넘기면 tsc가 실제로 컴파일 에러를 냈다(추측이 아니라 `npx tsc --noEmit`으로 확인). (2) `"admin"` 문자열이 better-auth 기본 admin 키와 우연히 같다는 데 기대는 것보다, `operator: ac.newRole({ user: [], session: [] })` / `admin: adminAc`로 명시하는 편이 더 견고하다. `better-auth/plugins/access`의 `createAccessControl`, `better-auth/plugins/admin/access`의 `defaultStatements`/`adminAc`를 재사용해 `lib/auth.ts`에서 구성(`node_modules/better-auth/dist/plugins/admin/has-permission.mjs` 확인 완료).
  - [x] `bannedUserMessage`는 DESIGN.md §10 보이스(탓하지 않음, 명확함)에 맞는 한국어 문구로 — 예: `"비활성화된 계정입니다. 관리자에게 문의하세요."` (better-auth 기본 영문 메시지를 그대로 두지 말 것).
  - [x] **회귀 확인 필수**: 이 파일은 모든 기존 스토리가 의존하는 인증 인프라다. `admin` 플러그인의 `databaseHooks.user.create.before`가 `scripts/seed-accounts.ts`의 기존 `auth.api.signUpEmail()` 호출 흐름(및 기존 시드 계정 재실행 시 UPDATE 경로)에 영향을 주지 않는지 로컬에서 `npm run seed` 실행 후 admin/operator 로그인이 그대로 되는지 반드시 확인한다.

- [x] Task 3: 리포지토리 레이어 — `apps/web/lib/db/repositories/member.ts` (NEW, AC: 1, 3)
  - [x] `export type Member = typeof user.$inferSelect;` (또는 필요한 필드만 추린 서브셋 타입 — 비밀번호 해시는 `account` 테이블에 있어 `user` 셀렉트에는 애초에 포함되지 않는다).
  - [x] `findAll(): Promise<Member[]>` — `db.query.user.findMany({ orderBy: desc(user.createdAt) })`. halls/ceremonies와 달리 계정은 hallId 스코프 엔티티가 아니므로 AD-2의 hallId 필수 인자 규칙은 적용되지 않는다(halls 리포지토리와 동일한 예외, `apps/web/lib/db/repositories/hall.ts` 참고).
  - [x] `findByPhoneNumber(phoneNumber: string): Promise<Member | undefined>` — `db.query.user.findFirst({ where: eq(user.phoneNumber, phoneNumber) })`. 서비스 레이어의 중복 전화번호 사전 검증(AC 3)에 쓴다 — DB unique 제약이 걸어주는 방어는 이미 있지만, raw Postgres unique violation을 그대로 사용자에게 노출하지 않고 깔끔한 한국어 오류로 바꾸려면 사전 조회가 필요하다.
  - [x] 계정 생성/비활성화/재활성화는 이 리포지토리에서 직접 `db.insert`/`db.update`를 하지 않는다 — Task 4에서 `auth.api.createUser`/`banUser`/`unbanUser`를 통해서만 쓴다(§Dev Notes "쓰기는 반드시 better-auth API를 통해서" 참고, 비밀번호 해싱·세션 무효화 로직을 직접 재구현하지 않기 위함).

- [x] Task 4: 서비스 레이어 — `apps/web/lib/services/member.ts` (NEW, AC: 2, 3, 4)
  - [x] `export class MemberValidationError extends Error {}`
  - [x] `listMembers(): Promise<Member[]>` — `memberRepo.findAll()`을 그대로 호출.
  - [x] `createMember(input: { name: string; phoneNumber: string; password: string }): Promise<Member>` (AC 2, 3):
    - 이름/전화번호/비밀번호 trim 후 빈 값이면 `MemberValidationError`(홀/예식 서비스의 `assertValidName` 패턴과 동일한 스타일).
    - `normalizePhoneNumber()`(`lib/phone.ts`, 기존 함수 재사용)로 전화번호 정규화.
    - `memberRepo.findByPhoneNumber(phoneNumber)`로 중복 확인 → 존재하면 `MemberValidationError("이미 등록된 전화번호입니다")`(AC 3).
    - 합성 placeholder 이메일 생성: `` `${phoneNumber}@internal.wedding-check.local` `` — **이 패턴은 추측이 아니라 기존 프로젝트 메모리에 이미 기록된 결정**(2026-07-26, `scripts/seed-accounts.ts`의 고정 시드 이메일과 동일 계열)이다. 무작위/UUID 이메일을 만들지 말 것.
    - `auth.api.createUser({ body: { email, password: input.password, name: input.name, role: "operator", data: { phoneNumber, phoneNumberVerified: true } } })` 호출 — **headers를 넘기지 않는다**(§Dev Notes "createUser는 헤더 없이 호출" 근거 참고). 응답의 `user`를 반환.
  - [x] `deactivateMember(id: string): Promise<void>` (AC 4) — `auth.api.banUser({ body: { userId: id }, headers: await headers() })`. `headers()`는 `next/headers`에서 import(이미 `lib/auth-guard.ts`가 쓰는 것과 동일한 관례). **banUser는 createUser와 달리 `adminMiddleware`를 써서 세션이 없으면 무조건 `UNAUTHORIZED`를 던진다** — headers를 반드시 넘겨야 한다(§Dev Notes 근거).
  - [x] `reactivateMember(id: string): Promise<void>` — `auth.api.unbanUser({ body: { userId: id }, headers: await headers() })`. (`[ASSUMPTION]` 원본 AC에는 재활성화가 명시되어 있지 않지만, `prototype/js/screens/MemberScreen.js`가 대칭적인 "다시 활성화" 토글을 보여주고 있고 better-auth `unbanUser`가 이미 존재해 구현 비용이 거의 없다 — 비활성화가 영구 잠금이 되는 것을 막기 위해 포함. 대표가 원치 않으면 UI 버튼만 제거하면 되는 선택적 범위임을 완료 노트에 남길 것.)

- [x] Task 5: Server Actions — `apps/web/app/admin/members/actions.ts` (NEW, AC: 2, 3, 4)
  - [x] `"use server"`. `createMemberAction`, `deactivateMemberAction`, `reactivateMemberAction` 모두 첫 줄에서 `requireAdminSession()`(`lib/auth-guard.ts`, 기존 함수 재사용) 호출 — **레이아웃의 role 체크는 페이지 렌더링만 막을 뿐 Server Action 자체를 보호하지 않는다**(프로젝트 메모리에 이미 기록된, Story 1.2에서 실제로 코덱스 P1이었던 패턴 — 매번 새로 겪지 말 것).
  - [x] `createMemberAction`은 `useActionState` 시그니처(`hall-form.tsx`/`halls/actions.ts`의 `createHallAction`과 동일한 `(prevState, formData) => Promise<{ error?: string }>` 패턴)로 만든다.
  - [x] `deactivateMemberAction`/`reactivateMemberAction`은 `(formData: FormData) => Promise<void>`(hall의 `deactivateHallAction`과 동일한 form-action 패턴).
  - [x] 각 액션 성공 시 `revalidatePath("/admin/members")`.

- [x] Task 6: 회원 관리 화면 — `apps/web/app/admin/members/page.tsx`, `member-form.tsx`, `member-row.tsx`, `members.css` (NEW, AC: 1, 2, 3, 4)
  - [x] `page.tsx`: async Server Component, `listMembers()` 호출 후 렌더링. 레이아웃은 `apps/web/app/admin/halls/page.tsx` + Story 5.2에서 확립된 360px 폼 카드 + 1fr 목록 카드 2단 그리드(`apps/web/app/admin/ceremonies/ceremonies.css`의 `.ceremonies-page` 그리드 패턴 재사용, `prototype/js/screens/MemberScreen.js`의 `360px 1fr` 그리드와도 일치)를 따른다.
  - [x] `member-form.tsx`: `"use client"`, `useActionState(createMemberAction, ...)`. 필드는 이름/전화번호/초기 비밀번호 3개만(AC 2 — 역할 선택 없음, §AC 2 [ASSUMPTION] 참고). `hall-form.tsx`와 동일한 에러 표시 패턴(`state.error` → `.field-error`).
  - [x] `member-row.tsx`: `"use client"`. 이름 + 역할 배지 + 전화번호 + 활성/비활성 배지 + (활성이면)"비활성화" 버튼 / (비활성이면)"다시 활성화" 버튼. `hall-row.tsx`의 `confirm()` 패턴을 비활성화 버튼에 그대로 적용("\"{이름}\" 계정을 비활성화할까요? 이 계정은 더 이상 로그인할 수 없습니다." 같은 구체적 확인 문구 — DESIGN.md §10 톤).
  - [x] 스타일: 색상/라운딩/간격은 `apps/web/app/design-tokens.css`의 기존 CSS 변수만 사용(신규 hex/off-scale radius 금지 — `.omd/preferences.md`에 이미 2회 기록된 반복 위반 패턴, DESIGN.md §2/§7). `prototype/js/screens/MemberScreen.js`의 아바타 원형 배지·역할 pill·상태 배지 구조는 시각적 참고만 하고 색상 값은 토큰으로 치환한다(예: 프로토타입의 `#e8552d`/`#2b82e0`/`#bcbcbc` → `var(--color-brand)`/`var(--color-info)`/`var(--color-text-disabled)`).
  - [x] **프로토타입과 의도적으로 다르게 갈 부분**: `MemberScreen.js` 상단 배지("PRD 범위 밖 · 별도 스펙 필요")와 "등록하면 초기 비밀번호가 문자로 발송됩니다" 안내 문구는 이식하지 않는다 — 전자는 이제 실제 FR-14로 epics.md에 반영되어 더 이상 사실이 아니고, 후자는 이 프로젝트에 SMS 발송 연동이 없다는 이미 확정된 사실(프로젝트 메모리 참고)과 모순된다. 실제 동작(관리자가 초기 비밀번호를 폼에 직접 입력)에 맞는 안내 문구로 대체한다.

- [x] Task 7: 내비게이션 배선 — `apps/web/app/admin/admin-nav-links.tsx` (MODIFY, AC: 1)
  - [x] `LINKS` 배열에 `{ href: "/admin/members", label: "회원" }`을 "예식"과 "인사이트" placeholder 사이에 추가 — `prototype/js/App.js`의 `adminTabs` 순서(`템플릿(홀), 예식, 회원, 인사이트`)와 일치.
  - [x] `admin/layout.tsx`는 건드리지 않는다 — role 체크는 이미 있고(AC 5), `/admin/members`도 `admin/layout.tsx`가 감싸는 `app/admin/*` 하위 라우트라 자동으로 보호된다(AD-3, 신규 코드 불필요).

- [x] Task 8: 테스트 (AC: 2, 3, 4)
  - [x] `apps/web/tests/repositories/member.test.ts` (NEW) — `findAll`(빈 배열, 여러 계정), `findByPhoneNumber`(존재/미존재).
  - [x] `apps/web/tests/services/member.test.ts` (NEW) — `createMember`(정상 생성 후 실제 로그인 가능 여부까지 `auth.api.signInPhoneNumber`로 검증, 중복 전화번호 거부, 빈 이름/전화번호/비밀번호 거부), `deactivateMember`(비활성화 후 `auth.api.signInPhoneNumber` 호출이 실패하는지 — AC 4의 핵심 회귀 방지 지점, 반드시 실제 로그인 흐름으로 검증할 것 단순히 DB 컬럼 값만 확인하지 말 것), `reactivateMember`(재활성화 후 다시 로그인 가능).
  - [x] `apps/web/tests/helpers/db.ts`에 `createTestMember(overrides)` 헬퍼 추가 여부 검토 — 기존 `resetDb()`의 TRUNCATE 목록에 `"user"`가 이미 포함되어 있어 테이블 자체는 문제없음, 컬럼 추가만으로 스키마가 바뀌므로 헬퍼가 필요하면 `auth.api.createUser`를 감싸는 형태로 만들 것(직접 `db.insert(user, ...)`로 비밀번호 없는 반쪽짜리 계정을 만들지 말 것 — account 테이블과의 정합성이 깨짐).
  - [x] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [x] Task 9: 수동 검증
  - [x] 로컬 서버에서 `npm run seed` 재실행 후 기존 admin/operator 계정으로 정상 로그인되는지 확인(Task 2의 회귀 확인 항목과 동일 — 반드시 실제로 로그인해서 세션이 생성되는지까지 확인).
  - [x] 관리자로 로그인 → "회원" 탭 클릭 → 목록 표시 확인.
  - [x] 새 오퍼레이터 계정 등록 → 목록에 나타남 → 로그아웃 후 그 전화번호+비밀번호로 실제 로그인 성공 확인.
  - [x] 같은 전화번호로 재등록 시도 → "이미 등록된 전화번호입니다" 오류 확인.
  - [x] 방금 만든 계정 비활성화 → 그 계정으로 로그인 시도 → 차단 확인(구체적으로 어떤 에러가 표시되는지 기록 — `login/page.tsx`가 모든 에러를 동일한 문구로 뭉뚱그리는 현재 동작을 그대로 둘지 확인, §Dev Notes 참고).
  - [x] 오퍼레이터 계정으로 로그인 후 `/admin/members` 직접 접근 시도 → 차단 확인(AC 5).
  - [x] `/admin/halls`, `/admin/ceremonies` 등 이 스토리에서 스타일을 건드리지 않은 화면이 깨지지 않았는지(회귀 없음) 확인.

## Dev Notes

### 배경 — 왜 이 스토리가 필요한가

현재 계정 발급은 `apps/web/scripts/seed-accounts.ts`(개발자 전용 CLI, `npm run seed`)가 유일한 경로다. 신입 오퍼레이터가 들어올 때마다 개발자에게 스크립트 실행을 부탁해야 한다. 로그인은 better-auth phone-number 방식(이메일 아님)이며 역할은 `operator`/`admin` 2종(AD-3). 내비게이션에 "회원" 항목 자체가 없다.

### 왜 `isActive` 컬럼을 직접 만들지 않고 better-auth `admin` 플러그인을 쓰는가 (실제 소스 확인 완료)

이 스토리를 작성하며 `node_modules/better-auth/dist/plugins/admin/`의 실제 소스를 읽고 검증했다(better-auth 버전 `^1.6.25`, `npm install` 후 확인). 핵심 발견:

- **로그인 차단이 이미 구현되어 있다.** `admin.mjs`의 `init()`이 등록하는 `databaseHooks.session.create.before`가 세션이 생성될 때마다(=로그인 시마다) 해당 유저를 조회해 `user.banned === true`면 `APIError("FORBIDDEN", { code: "BANNED_USER" })`를 던진다(`banExpires`가 지났으면 자동으로 밴을 풀어주는 로직도 포함 — 이 스토리에서는 `banExpires`를 안 쓰므로 무해하게 항상 영구 차단 상태 유지). 즉 AC 4("비활성화하면 로그인이 차단된다")를 직접 구현할 필요가 없다 — 커스텀 훅을 새로 짜면 이 검증된 로직을 재발명하는 것이고, 코덱스 리뷰에서 엣지 케이스(세션 갱신 경로, 이미 발급된 세션 처리 등)를 지적받을 위험이 크다.
- **계정 생성/비활성화 API도 이미 있다.** `auth.api.createUser`(비밀번호 해싱 + credential 계정 연결까지 한 번에), `auth.api.banUser`(비활성화 시 `internalAdapter.deleteUserSessions()`로 기존 세션까지 즉시 무효화 — 우리가 직접 구현하면 놓치기 쉬운 부분), `auth.api.unbanUser`가 그대로 이 스토리의 요구사항과 일치한다.
- **스키마 요구사항**: `admin` 플러그인은 `user` 테이블에 `banned`(boolean, default false), `banReason`(string, nullable), `banExpires`(date, nullable) 3개 필드를 요구한다(`node_modules/better-auth/dist/plugins/admin/schema.mjs`). Task 1이 이를 그대로 반영한다.
- **권한 모델**: `hasPermission()`(`has-permission.mjs`)은 `session.user.role`을 `defaultRoles = { admin: adminAc, user: userAc }`의 키와 직접 비교한다. 이 프로젝트의 `"admin"` 역할 문자열이 우연히 better-auth의 기본 admin 키와 같아 **별도 `roles`/`adminRoles` 설정 없이도** `admin` 세션은 `create`/`ban`/`list` 등 필요한 권한을 자동으로 갖고, `"operator"` 세션은 어떤 키와도 매칭되지 않아 자동으로 거부된다. 이 우연의 일치를 이 스토리가 검증했다는 점을 기록해둔다(Task 2 참고) — 나중에 역할 이름을 바꾸는 스토리가 생기면 이 가정이 깨질 수 있음을 염두에 둘 것.

### 엔드포인트별 헤더 요구사항이 다르다 — 실제로 확인한 비대칭성 (구현 중 흔한 실수 지점)

`routes.mjs`를 직접 읽어 확인한 사실이며, 추측이 아니다:

- **`createUser`는 세션이 없어도 동작한다.** `getAuthoritativeSessionFromCtx(ctx)`가 세션을 못 찾아도, `ctx.request`/`ctx.headers`가 둘 다 없으면(=서버 코드에서 headers를 안 넘기고 호출) `UNAUTHORIZED`를 던지지 않고 그냥 `session = undefined`로 진행하며, 이후 role 권한 체크 블록도 `if (session) {...}`로 감싸져 있어 통째로 스킵된다. 즉 **headers 없이 호출하면 better-auth 자체의 권한 체크를 우회하는 "신뢰된 내부 호출"이 된다** — `scripts/seed-accounts.ts`가 이미 `auth.api.signUpEmail()`을 이렇게(headers 없이) 호출해온 것과 동일한 패턴이다. `createMember()`도 이 패턴을 따른다(Task 4) — 우리 쪽 `requireAdminSession()`이 이미 Server Action 진입점에서 권한을 검증했으므로 이중 체크가 불필요.
- **`banUser`/`unbanUser`/`listUsers`/`adminUpdateUser`는 `use: [adminMiddleware]`를 쓰고, `adminMiddleware`는 세션이 없으면 무조건 `UNAUTHORIZED`를 던진다**(`routes.mjs` 16~20행). 이 함수들은 headers 없이 호출하면 100% 실패한다 — 반드시 `headers: await headers()`를 넘겨야 한다(Task 4의 `deactivateMember`/`reactivateMember` 참고).
- 이 비대칭성을 모르고 `deactivateMember`를 `createMember`와 같은 방식(headers 없이)으로 구현하면 로컬 vitest 통합 테스트 단계에서 바로 `UNAUTHORIZED` 에러로 드러난다 — Task 8의 테스트가 이를 잡아줄 것이다.

### 회원 조회는 better-auth API를 거치지 않고 직접 drizzle로 읽는다

`auth.api.listUsers`도 존재하지만, 이 프로젝트의 다른 모든 리포지토리(halls, ceremonies)가 이미 drizzle로 직접 읽는 것과 통일성을 유지하기 위해 `member.ts` 리포지토리는 `db.query.user.findMany()`를 직접 쓴다(Task 3). **쓰기(생성/비활성화/재활성화)만** better-auth API를 거친다 — 비밀번호 해싱, 세션 무효화 같은 보안에 민감한 로직을 직접 재구현하지 않기 위해서다. 이 read/write 비대칭은 의도된 설계 결정이다.

### 로그인 실패 메시지를 구체화할지 여부 — 현재는 그대로 둔다

`apps/web/app/(auth)/login/page.tsx`는 현재 모든 로그인 실패(비밀번호 오류든 계정 비활성화든)를 동일한 "전화번호 또는 비밀번호가 올바르지 않습니다."로 뭉뚱그린다. AC 4는 "로그인이 차단된다"까지만 요구하고 특정 문구를 요구하지 않는다. 계정 존재 여부/상태를 공격자에게 흘리지 않는 것도 보안상 합리적인 기존 선택이므로, **이 스토리에서는 로그인 페이지의 에러 분기 로직을 바꾸지 않는다** — `admin` 플러그인이 서버 쪽에서 던지는 `BANNED_USER` 에러 코드도 그냥 기존 catch-all 문구로 흡수되게 둔다. 더 친절한 안내가 필요하다고 판단되면 별도 스토리로 분리할 것(범위 확장 금지).

### 현재 코드 상태 (읽고 시작할 것)

- `apps/web/lib/auth.ts` — 전체 읽음(§Story 본문 상단 요약). `emailAndPassword.enabled: true`는 `signUpEmail`/`createUser` 내부 호출에 필요해서 켜져 있고, `/sign-in/email` 경로는 `hooks.before`로 차단되어 있다(우회 방지, PR #3에서 5라운드 코덱스 리뷰로 확정된 로직 — 손대지 말 것).
- `apps/web/lib/auth-guard.ts` — `requireAdminSession()`/`requireSession()` 그대로 재사용. 새 가드를 만들지 않는다.
- `apps/web/scripts/seed-accounts.ts` — `createMember()`가 참고할 패턴(headers 없는 `auth.api.*` 호출, `normalizePhoneNumber` 사용, `hashPassword`는 이 스토리에서 직접 안 씀 — `createUser`가 내부에서 처리).
- `apps/web/app/admin/halls/{page,hall-form,hall-row}.tsx`, `actions.ts` — CRUD 화면 구조(폼 카드 + 목록, `useActionState`, `confirm()` 비활성화 흐름)의 1:1 참고 템플릿.
- `apps/web/app/admin/admin-nav-links.tsx`, `apps/web/app/admin/layout.tsx` — Story 5.1/5.2에서 이미 확립된 내비게이션 구조. `layout.tsx`의 세션 체크는 Server Component로 유지되어야 한다(재차 강조 — 이미 두 스토리에서 확정된 원칙).
- `apps/web/lib/db/schema.ts` 181~198행 — 현재 `user` 테이블 전체 컬럼. `banned`/`banReason`/`banExpires` 3개만 추가하면 된다(다른 컬럼 변경 없음).

### 아키텍처 준수사항

- **AD-2:** `member.ts` 리포지토리는 hallId 스코프 규칙의 예외다(halls와 동일한 이유 — 계정은 홀 종속 엔티티가 아니라 루트 엔티티).
- **AD-3:** 역할은 `operator`/`admin` 2종 불변. 이 스토리는 새 역할을 추가하지 않는다.
- Server Action 보안 원칙(프로젝트 메모리에 이미 기록됨): 신규 Server Action은 전부 `requireAdminSession()`을 첫 줄에서 호출한다.
- DESIGN.md §2(색상 토큰), §7(라운딩 스케일 4/8/12/9999px만), §10(보이스 — 탓하지 않는 에러 문구, 과장 금지) 준수.

### 스코프 경계 — 하지 말 것

- 관리자 계정을 화면에서 생성하는 기능은 만들지 않는다(§AC 2 참고, 생성은 오퍼레이터 전용).
- SMS 발송/문자 안내 UI는 만들지 않는다 — 이 프로젝트에 SMS 업체 연동이 없다(프로젝트 메모리에 이미 확정).
- 로그인 페이지(`login/page.tsx`)의 에러 메시지 분기 로직을 바꾸지 않는다(§Dev Notes "로그인 실패 메시지" 참고).
- 홀/템플릿/예식 화면의 스타일이나 구조를 변경하지 않는다 — 이 스토리는 `/admin/members`와 내비게이션 링크 배열, `lib/auth.ts`, `lib/db/schema.ts`만 건드린다.
- `better-auth`의 `impersonate`, `set-password`, `set-email` 등 `admin` 플러그인이 제공하는 다른 엔드포인트는 쓰지 않는다 — 이 스토리 범위는 create/list/ban/unban뿐이다.

### 테스트 요구사항

vitest 이중 environment(`.test.ts` = node/DB 통합, `.test.tsx` = jsdom). `resetDb()`(`apps/web/tests/helpers/db.ts`)가 이미 `"user"` 테이블을 TRUNCATE 목록에 포함하고 있어 추가 수정 불필요. **AC 4(로그인 차단)는 반드시 `auth.api.signInPhoneNumber()`를 실제로 호출해 성공/실패 여부로 검증한다** — `banned` 컬럼 값만 assert하면 better-auth 훅이 실제로 그 값을 읽어 차단하는지까지는 검증하지 못한다(이 스토리의 핵심 안전장치이므로 우회 검증 금지).

### Project Structure Notes

- Alignment with unified project structure: `lib/services/member.ts` → `lib/db/repositories/member.ts` 계층은 기존 `hall.ts`/`ceremony.ts`와 동일한 패턴.
- 신규 컴포넌트는 `apps/web/app/admin/members/` 디렉터리에 kebab-case로(`member-form.tsx`, `member-row.tsx`, `members.css`) — `halls/`, `ceremonies/` 디렉터리 명명 관례와 일치.
- Detected conflict: 없음. Story 5.3(신랑신부 이름)과 이 스토리는 서로 다른 테이블(`ceremonies` vs `user`)을 건드려 충돌하지 않는다.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4] — AC 1~5(원본 4개 + 내비게이션 항목 1개로 재구성) 원본.
- [Source: node_modules/better-auth/dist/plugins/admin/admin.mjs, routes.mjs, schema.mjs, has-permission.mjs, access/statement.mjs] — 이 스토리 작성 중 직접 읽고 검증한 better-auth `admin` 플러그인 실제 동작(버전 `^1.6.25`). 라이브러리가 마이너 업그레이드되면 재확인 권장.
- [Source: apps/web/lib/auth.ts, apps/web/lib/auth-guard.ts, apps/web/scripts/seed-accounts.ts] — 기존 인증 아키텍처, 반드시 읽고 시작.
- [Source: apps/web/app/admin/halls/*] — CRUD 화면 구조 1:1 템플릿.
- [Source: prototype/js/screens/MemberScreen.js, prototype/js/App.js] — 레이아웃/탭 순서 시각 참고(단, SMS 안내 문구·PRD-범위-밖 배지는 이식하지 않음, §Task 6 참고).
- [Memory: project-wedding-check-auth-patterns] — phone-number 로그인, Server Action 보안, seed 식별자 규칙. 합성 이메일 패턴(`{전화번호}@internal.wedding-check.local`)의 근거.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.4
- `node_modules/better-auth/dist/plugins/admin/` — 실제 소스 확인 완료(스토리 작성 시점, `npm install` 후)
- `apps/web/lib/auth.ts`, `apps/web/lib/auth-guard.ts`, `apps/web/scripts/seed-accounts.ts`
- `apps/web/app/admin/halls/*` — 구조 템플릿
- `prototype/js/screens/MemberScreen.js`, `prototype/js/App.js` — 시각 레퍼런스

### Agent Model Used

claude-sonnet-5

### Debug Log References

없음(구현 중 예상치 못한 오류 없음). tsc가 스토리 작성 시점에 예상한 대로 `admin` 플러그인의 기본 role 타입(`"user" | "admin"`)과 이 프로젝트의 `"operator"` 역할 불일치를 실제로 잡아냈다 — Task 2에 계획된 `roles` 명시 설정으로 해결(계획대로 진행, "예상치 못한" 오류는 아님).

### Completion Notes List

- Task 1~9 전부 계획대로 구현. `roles`(`ac`/`operatorRole`/`adminAc`) 명시 설정으로 전환한 것 외에는 스토리 계획과 실제 구현이 거의 1:1로 일치했다 — 스토리 작성 단계에서 `node_modules/better-auth/dist/plugins/admin/`을 직접 읽고 검증한 결과.
- **Task 9 회귀 확인(Task 2)**: `npm run seed` 재실행 → 기존 admin/operator 계정 phoneNumber/비밀번호 갱신 경로 정상 동작, `admin` 플러그인의 `databaseHooks.user.create.before`가 기존 시드 흐름을 깨지 않음을 확인.
- **테스트 전략 관련 중요 사항**: `deactivateMember`/`reactivateMember`(lib/services/member.ts)는 `next/headers()`의 `headers()`를 내부에서 호출한다. 실제로 확인한 결과 Next.js 요청 스코프 밖(vitest node 통합 테스트, 또는 `tsx`로 직접 실행하는 스크립트)에서 호출하면 `"headers was called outside a request scope"`로 즉시 실패한다(`apps/web/lib/auth-guard.ts`의 `requireAdminSession`/`requireSession`도 동일 제약이라 기존에 vitest 커버리지가 전혀 없었다 — grep으로 확인). 그래서 `tests/services/member.test.ts`는 이 두 서비스 함수를 직접 호출하는 대신, 그 함수들이 위임하는 실제 메커니즘(`auth.api.banUser`/`unbanUser` + 로그인 시 자동 차단 훅)을 관리자 세션 헤더를 수동으로 구성해(로그인 → `set-cookie` 추출) 검증했다 — AC 4를 컬럼 값이 아니라 `auth.api.signInPhoneNumber()`의 실제 성공/실패로 검증(스토리 요구사항 그대로 준수). 서비스 함수 자체의 `headers()` 배선(한 줄, `auth-guard.ts`와 동일 패턴)은 Task 9 수동 서버 검증으로 커버.
- **수동 검증**: 로컬 서버(포트 3002) + curl로 (1) 관리자 로그인 → `/admin/members` SSR HTML에서 목록/등록폼/내비 활성 탭(`admin-nav__link--active`) 확인, (2) 오퍼레이터 로그인 → `/admin/members` 접근 시 `/login`으로 리다이렉트 확인(AC 5), (3) `npx tsx --env-file=.env.local`로 `createMember`/`auth.api.banUser`를 직접 호출해 등록→로그인 성공→중복 전화번호 거부→비활성화 후 로그인 차단까지 end-to-end 확인(스크립트는 검증 후 삭제, git에 커밋되지 않음).
- `[ASSUMPTION]`(AC 2, 회원 등록 폼은 오퍼레이터 전용, 역할 선택 없음)과 `reactivateMember`(원 AC에 없던 추가 기능) 모두 스토리에 명시된 대로 구현 — 대표 확인 필요 항목으로 남겨둠.

### File List

- `apps/web/lib/db/schema.ts` (MODIFY) — `user` 테이블에 `banned`/`banReason`/`banExpires` 추가
- `apps/web/drizzle/0010_good_trauma.sql`, `apps/web/drizzle/meta/0010_snapshot.json`, `apps/web/drizzle/meta/_journal.json` (NEW/MODIFY) — 마이그레이션
- `apps/web/lib/auth.ts` (MODIFY) — `admin` 플러그인 연결(`ac`/`roles`/`defaultRole`/`bannedUserMessage`)
- `apps/web/lib/db/repositories/member.ts` (NEW) — `findAll`, `findByPhoneNumber`
- `apps/web/lib/services/member.ts` (NEW) — `listMembers`, `createMember`, `deactivateMember`, `reactivateMember`, `MemberValidationError`
- `apps/web/app/admin/members/actions.ts` (NEW) — `createMemberAction`, `deactivateMemberAction`, `reactivateMemberAction`
- `apps/web/app/admin/members/page.tsx` (NEW)
- `apps/web/app/admin/members/member-form.tsx` (NEW)
- `apps/web/app/admin/members/member-row.tsx` (NEW)
- `apps/web/app/admin/members/members.css` (NEW)
- `apps/web/app/admin/admin-nav-links.tsx` (MODIFY) — "회원" 탭 추가
- `apps/web/tests/repositories/member.test.ts` (NEW) — 4건(findAll 2건, findByPhoneNumber 2건)
- `apps/web/tests/services/member.test.ts` (NEW) — 9건(createMember 6건 + 비활성화/재활성화/권한 3건)

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story). better-auth `admin` 플러그인 실제 소스(`node_modules/better-auth/dist/plugins/admin/`)를 직접 읽고 검증해, 커스텀 `isActive` 컬럼/훅 대신 공식 플러그인(banned/banReason/banExpires + createUser/banUser/unbanUser + 세션 생성 시 자동 차단 훅)을 쓰는 것으로 설계 확정 — headers 필요 여부가 엔드포인트마다 다르다는 점(createUser는 불필요, banUser/unbanUser/listUsers는 필수)도 소스 확인으로 못박음.
- 2026-07-27: 구현 완료 (dev) — AC 1~5 전부 구현. `roles` 명시 설정(계획 대비 유일한 변경, tsc가 실제로 타입 불일치를 잡아냄)을 제외하면 스토리 계획과 구현이 그대로 일치. vitest 신규 13건(리포지토리 5건, 서비스 8건 — 실제 로그인 성공/실패로 AC 4 검증) 포함 전체 94건 통과, tsc/lint/build 전부 클린. 로컬 서버 curl + `tsx` 스크립트로 등록/중복거부/로그인/비활성화/오퍼레이터 접근차단 전부 수동 검증. Status → review.
