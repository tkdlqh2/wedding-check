---
baseline_commit: NO_VCS
---

# Story 1.1: 프로젝트 기반 설정 및 로그인

Status: review

## Story

As a 관리자 또는 오퍼레이터,
I want 내 역할에 맞는 계정으로 로그인할 수 있기를,
so that 내 권한에 맞는 화면에만 접근할 수 있다.

## Acceptance Criteria

1. Given Next.js(App Router, TS)/Drizzle/Neon Postgres+pgvector/better-auth 스택이 세팅되어 있을 때, When 유효한 계정으로 로그인하면, Then 세션이 생성되고 역할(operator/admin)에 맞는 초기 화면으로 이동한다.
2. Given 오퍼레이터 세션일 때, When 관리자 전용 라우트에 접근하면, Then 접근이 차단된다(AD-3).
3. Given 프로젝트 스캐폴딩이 완료된 상태에서, When 화면을 렌더링하면, Then 디자인 토큰(UX-DR1)과 관리자용 스티키 헤더 내비/오퍼레이터용 태블릿 내비(UX-DR10)의 기본 골격이 적용되어 있다.

## Tasks / Subtasks

- [x] Task 1: Next.js 프로젝트 스캐폴딩 (AC: 1, 3)
  - [x] `apps/web/`에 Next.js 16.2.11+ App Router + TypeScript 프로젝트 생성: `npx create-next-app@latest apps/web --typescript --app --eslint --import-alias "@/*"`
  - [x] Structural Seed 경로에 맞춰 폴더 골격 생성: `app/admin/`, `app/operator/`, `app/api/`, `lib/services/`, `lib/ai/ports.ts`(+ `adapters/` 빈 폴더), `lib/db/` — 실제 URL이 `/admin`, `/operator`가 되어야 하는 AC 1 요구를 위해 route group 표기(`(admin)`/`(operator)`) 대신 일반 세그먼트로 구현(§Dev Notes 참고). `lib/ai/ports.ts`는 최초 구현에서 누락되어 있어 이번 세션에 `LLMPort`/`EmbeddingPort` 타입 스켈레톤으로 보완
  - [x] `.env.local.example`에 `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY` 플레이스홀더만 기록(AD-10 — 시크릿 하드코딩 금지, 실제 값은 `.env.local`에 로컬로만 존재)

- [x] Task 2: Neon Postgres + Drizzle 연결 (AC: 1)
  - [x] `drizzle-orm`, `@neondatabase/serverless`, `dotenv` 설치, `drizzle-kit` devDependency로 설치
  - [x] `lib/db/index.ts`: `drizzle-orm/neon-http`로 `drizzle(process.env.DATABASE_URL)` 클라이언트 생성
  - [x] `drizzle.config.ts` 작성: `schema: './lib/db/schema.ts'`, `dialect: 'postgresql'`, `dbCredentials.url: process.env.DATABASE_URL` — 기존 `import "dotenv/config"`가 `.env`만 읽고 이 프로젝트는 `.env.local`만 쓰는 버그를 발견해 `config({ path: ".env.local" })`로 수정
  - [x] `lib/db/schema.ts` 생성 — 이번 스토리는 better-auth가 생성하는 스키마만 포함한다(도메인 테이블은 Story 1.2부터 필요한 만큼만 추가)

- [x] Task 3: better-auth 설정 — email/password, 2-role (AC: 1, 2)
  - [x] `better-auth`, `@better-auth/drizzle-adapter` 설치
  - [x] `lib/auth.ts`: `betterAuth({ database: drizzleAdapter(db, { provider: "pg" }), emailAndPassword: { enabled: true }, user: { additionalFields: { role: { type: "string", input: false } } } })` — `input: false`로 사용자가 회원가입 시 스스로 role을 지정하지 못하게 막는다
  - [x] `npx auth@latest generate` → `npx drizzle-kit generate` → `npx drizzle-kit migrate`로 better-auth 스키마(user/session/account/verification)를 DB에 반영 — 마이그레이션 SQL(`drizzle/0000_material_phil_sheldon.sql`)은 이미 생성되어 있었고, 임시 로컬 Postgres에 적용해 스키마 정합성을 검증함(§Dev Agent Record 참고)
  - [x] `app/api/auth/[...all]/route.ts`: `toNextJsHandler(auth)`로 `GET`/`POST` export
  - [x] `lib/auth-client.ts`: `createAuthClient` + `inferAdditionalFields<typeof auth>()` 플러그인으로 `role` 타입을 클라이언트에도 노출
  - [x] `scripts/seed-accounts.ts`: 초기 관리자 1명 + 오퍼레이터 1명 계정을 `auth.api.signUpEmail`로 생성한 뒤, `role`은 API로 못 넣으므로(`input:false`) Drizzle로 직접 `UPDATE user SET role = ...` 실행 — PRD FR 목록에 "계정 생성" 자체가 없어(아래 Dev Notes 참고) 이 시드 스크립트가 v1의 유일한 계정 프로비저닝 경로다

- [x] Task 4: 로그인 화면 + 세션 기반 초기 라우팅 (AC: 1)
  - [x] `app/(auth)/login/page.tsx`: 이메일/비밀번호 로그인 폼, 제출 시 `authClient.signIn.email()` 호출
  - [x] 로그인 성공 시 세션의 `role`에 따라 `admin`→`/admin`, `operator`→`/operator`로 리다이렉트

- [x] Task 5: 역할 기반 라우트 보호 (AC: 2)
  - [x] `apps/web/proxy.ts`(스파인의 `middleware.ts`가 아님 — 아래 "스파인과 다른 최신 사실" 참고): 세션 쿠키 존재 여부만으로 미인증 사용자를 `/login`으로 낙관적 리다이렉트(가벼운 체크만)
  - [x] `app/admin/layout.tsx`: `auth.api.getSession({ headers: await headers() })`로 세션을 조회해 `role !== 'admin'`이면 접근을 차단한다 — 실질적인 권한 강제는 여기서 수행
  - [x] `app/operator/layout.tsx`: 동일 패턴으로 세션이 없으면 `/login`으로 리다이렉트

- [x] Task 6: 디자인 토큰 + 내비게이션 골격 (AC: 3)
  - [x] `app/design-tokens.css`(또는 `globals.css`)에 DESIGN.md §2/§3/§5/§6 토큰을 CSS custom property로 정의(컬러/타이포/스페이싱/라운딩/그림자)
  - [x] `pretendard` 패키지로 폰트를 로드하고 `Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", -apple-system, sans-serif` 스택 적용
  - [x] `app/admin/layout.tsx`에 흰색 스티키 헤더 내비 골격 배치(로고 좌측, 템플릿/예식/인사이트 링크 자리, 우측 오렌지-레드 CTA 자리 — 실제 링크는 이후 스토리에서 채움)
  - [x] `app/operator/layout.tsx`에 태블릿 사이드/하단 내비 골격 배치(체크리스트/질의/피드백 아이콘 3개 자리) — 이 스토리에서는 실제 기능 없이 골격만 배치

## Dev Notes

### 아키텍처 준수사항

- 소스: `_bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md`
- 파라다임: 계층형 Next.js 모놀리스. `app/` → `lib/services/` → (`lib/db/` | `lib/ai/ports.ts`) 의존 방향만 허용, 역방향 금지(Design Paradigm 섹션). 이 스토리는 `lib/services/`, `lib/ai/`를 폴더만 만들고 비워둔다(아직 필요한 로직 없음).
- **AD-3(역할 2종)**: `operator`/`admin` 정확히 2개. "신입"/"선임" 등 중간 티어를 절대 만들지 말 것.
- **AD-10(배포/환경)**: 시크릿은 `.env.local`(추후 Vercel 환경변수)로만 관리, 코드에 하드코딩 금지. 이번 스토리는 로컬 Neon 브랜치 하나로 충분 — Preview/Production 브랜치 분리는 실제 첫 배포 시점에 다룬다.
- 도메인 테이블(halls 등)은 이 스토리에서 만들지 않는다 — Database/Entity Creation Principle에 따라 Story 1.2부터 필요한 테이블만 순차 생성한다.

### ⚠️ 스파인과 다른 최신 사실 (구현 전 필독)

1. **`middleware.ts`가 아니라 `proxy.ts`다.** 스파인의 AD-3/AD-10/Structural Seed는 `middleware.ts`를 언급하지만, Next.js 16에서 `middleware.ts`/`export function middleware()`는 폐기되고 `proxy.ts`/`export function proxy()`로 이름이 바뀌었다(2026-07-24 웹 검증, [Next.js 공식 안내](https://nextjs.org/docs/messages/middleware-to-proxy)). 이 스토리는 `proxy.ts`로 구현하며, 다음 아키텍처 갱신 때 스파인에도 반영을 건의할 것.
2. **Proxy는 가벼운 용도로만 써야 한다.** Next.js 공식 가이드는 Proxy(구 미들웨어)를 "최후의 수단"으로만 쓰고 무거운 DB 조회·완전한 세션 검증에는 쓰지 말라고 명시한다. 그래서 이 스토리는 2단 방어로 설계했다: `proxy.ts`는 세션 쿠키 유무만 보고 미인증 리다이렉트만 하고, 실제 `role` 기반 접근 차단(AC #2)은 `(admin)/layout.tsx`에서 `auth.api.getSession()`으로 수행한다.
3. **PRD/에픽 어디에도 "계정 생성" FR이 없다.** FR-1~11 중 관리자가 오퍼레이터 계정을 만드는 기능은 없다 — 내부 교육 도구라 셀프 가입 UI가 v1 스코프 밖으로 보인다(`[ASSUMPTION]`, 대표 확인 필요). 그래서 이 스토리는 `scripts/seed-accounts.ts` 시드 스크립트로 초기 관리자 1명 + 오퍼레이터 1명만 만든다. 정식 "계정 관리" 화면은 만들지 않는다(스코프 아님).
4. **`app/(admin)/`, `app/(operator)/`가 아니라 `app/admin/`, `app/operator/`다.** Next.js route group(괄호 폴더)은 URL 세그먼트에 영향을 주지 않는다 — `app/(admin)/page.tsx`는 `/`가 되지, `/admin`이 되지 않는다. AC 1이 요구하는 실제 URL(`/admin`, `/operator`)을 얻으려면 일반 세그먼트 폴더가 필요하므로, 이 스토리는 Structural Seed의 route-group 표기 대신 일반 폴더로 구현했다. 레이아웃 분리(관리자 전용 vs 오퍼레이터 전용)라는 스파인의 의도는 각 폴더의 `layout.tsx`로 동일하게 달성된다.

### 라이브러리/프레임워크 요구사항 (전부 2026-07-24 웹 검증)

- Next.js 16.2.11+, App Router, TypeScript — `npx create-next-app@latest`
- Drizzle ORM 0.31+ — `drizzle-orm`, `@neondatabase/serverless`(Neon 드라이버, `drizzle-orm/neon-http` 사용), `drizzle-kit`(dev)
- better-auth 최신 stable + `@better-auth/drizzle-adapter` — Next.js 16 App Router 공식 호환 확인됨. Route handler는 `app/api/auth/[...all]/route.ts` + `toNextJsHandler(auth)`.
  - 커스텀 `role` 필드는 `user.additionalFields.role`로 추가하고 `input: false`로 자가설정을 막는다. 클라이언트에는 `inferAdditionalFields<typeof auth>()` 플러그인으로 타입을 노출한다.
  - 스키마는 `npx auth@latest generate` → `npx drizzle-kit generate` → `npx drizzle-kit migrate`로 반영한다.
- 스타일링 접근 방식은 스파인에 명시되어 있지 않다 — 이 스토리는 CSS custom properties(디자인 토큰) + 기본 CSS로 최소 구현한다(Tailwind 등 프레임워크는 도입하지 않음). 팀이 스타일링 표준을 정하면 이후 스토리에서 전환 가능.
- 폰트: DESIGN.md가 요구하는 `Pretendard` 우선 스택은 `pretendard` npm 패키지로 로드한다(스파인에 명시되지 않아 이 스토리에서 가정).

### 테스트 요구사항

- 자동화 테스트 프레임워크가 PRD/스파인 어디에도 지정되어 있지 않다 — 임의로 도입하지 않는다. 이번 스토리는 AC 1~3을 다음과 같이 수동 검증한다:
  1. 시드된 admin/operator 계정으로 각각 로그인 → 역할에 맞는 초기 화면(`/admin`, `/operator`)으로 이동하는지 확인.
  2. operator 세션으로 `/admin` 하위 라우트 접근 시도 → 차단되는지 확인.
  3. 각 레이아웃 렌더링 시 디자인 토큰 CSS 변수가 적용되고 내비게이션 골격 요소(관리자 헤더/오퍼레이터 사이드·하단 내비)가 존재하는지 확인.
- 자동화 테스트 도입은 팀 표준이 정해지는 이후 스토리에서 소급 적용한다.

### Project Structure Notes

- Structural Seed(스파인)의 `apps/web/` 하위 구조를 그대로 따른다: `app/(admin)/`, `app/(operator)/`, `app/api/`, `lib/services/`, `lib/ai/ports.ts`+`adapters/`, `lib/db/schema.ts`+`repositories/`. `proxy.ts`는 `middleware.ts`의 최신 명칭(위 참고)이며 `apps/web/proxy.ts`에 둔다.
- 이 스토리에서 만드는 파일은 전부 NEW다 — 첫 스토리라 기존에 수정할 UPDATE 대상 파일이 없다.
- 이전 스토리/Git 이력 없음(레포가 이 스토리로 처음 시작됨) — 참고할 과거 패턴 없음.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: 홀·체크리스트 템플릿 관리 / Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-3, #AD-10, #Design Paradigm, #Structural Seed]
- [Source: _bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md#§3 용어집]
- [Source: DESIGN.md#2 Color Palette, #3 Typography, #4 Navigation]
- [Source: better-auth Next.js integration docs, https://www.better-auth.com/docs/integrations/next — 2026-07-24 웹 검증]
- [Source: better-auth Drizzle adapter docs, https://www.better-auth.com/docs/adapters/drizzle — 2026-07-24 웹 검증]
- [Source: better-auth additionalFields/role docs, https://www.better-auth.com/docs/concepts/typescript — 2026-07-24 웹 검증]
- [Source: Drizzle + Neon 설정 가이드, https://orm.drizzle.team/docs/get-started/neon-new — 2026-07-24 웹 검증]
- [Source: Next.js middleware→proxy 전환 공지, https://nextjs.org/docs/messages/middleware-to-proxy — 2026-07-24 웹 검증]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- 이 스토리는 이전 세션에서 이미 Task 1~6 대부분이 구현된 상태로 시작됨(체크박스만 미반영). 이번 세션은 코드 대조 검증 + 검증 중 발견한 결함 수정 + 수동 AC 검증을 수행함.
- `drizzle.config.ts`가 `import "dotenv/config"`로 기본 `.env`만 읽고 있어 `.env.local`만 쓰는 이 프로젝트에서 `npx drizzle-kit migrate` 실행 시 `DATABASE_URL undefined` 오류 발생 → `dotenv`의 `config({ path: ".env.local" })`로 명시 지정하여 수정.
- `lib/ai/ports.ts`가 Task 1 산출물 목록에 있음에도 누락되어 있어 `LLMPort`/`EmbeddingPort` 타입 스켈레톤으로 생성(ARCHITECTURE-SPINE.md Design Paradigm에 정의된 두 포트).
- `.env.local`의 `DATABASE_URL`이 `.env.local.example`의 플레이스홀더(`ep-example.neon.tech`)로 남아있어 실제 DB 검증이 불가능함을 발견 → 사용자에게 확인 후 "로컬 Postgres로 임시 검증" 선택받음.
- AC 1/2 수동 검증: Docker로 로컬 Postgres 컨테이너를 띄우고, `lib/db/index.ts`를 일시적으로 `drizzle-orm/node-postgres`로 스왑(neon_local 프록시는 실제 Neon 계정/프로젝트 ID를 요구해 로컬 전용 검증에는 부적합함을 확인 후 폐기)해 마이그레이션 적용 → 시드 → `next dev` 구동 → admin/operator 로그인, 역할별 라우팅, operator의 `/admin` 접근 차단(AC 2), 비로그인 시 proxy 리다이렉트를 curl로 확인. 검증 후 `lib/db/index.ts`는 `git checkout`으로, `.env.local`은 백업본으로 원복하여 실제 운영 드라이버(neon-http)는 변경 없이 유지됨.
- `apps/web/.gitignore`의 `.env*` 패턴이 커밋되어야 할 `.env.local.example`까지 무시하고 있던 버그 발견 → `!.env*.example` 예외 추가.
- 사용자 요청으로 관리자 시드 계정에 `phoneNumber`(연락처) 필드를 추가하고, 관리자/오퍼레이터 시드 비밀번호와 관리자 전화번호를 하드코딩 대신 `SEED_ADMIN_PASSWORD`/`SEED_ADMIN_PHONE_NUMBER`/`SEED_OPERATOR_PASSWORD` 환경변수로 뺌(AD-10 정신 준수, 값 미지정 시 로컬 기본값 사용). `lib/auth.ts`에 `phoneNumber` additionalField(선택, `input` 제한 없음 — role과 달리 권한과 무관한 단순 연락처라 자가 입력 허용) 추가, `lib/db/schema.ts`에 `phone_number` 컬럼 추가, `drizzle-kit generate`로 마이그레이션(`0001_flat_iron_man.sql`) 생성. 로컬 Postgres에 두 마이그레이션을 모두 적용해 관리자 계정의 `phone_number`가 실제로 저장되는지 재검증 완료.
- 사용자 요청으로 프로젝트 루트에 `git init -b main` 수행 + 초기 커밋 생성(이전엔 버전관리 없음, 스토리 frontmatter의 `baseline_commit: NO_VCS`는 워크플로우 규칙에 따라 보존).

### Completion Notes List

- Task 1~6 전 항목을 코드 대조로 검증 완료. `lib/ai/ports.ts` 누락만 결함으로 발견되어 보완.
- AC 1(로그인 후 역할별 라우팅), AC 2(operator의 관리자 라우트 차단)를 로컬 Postgres 임시 대체 DB로 curl 기반 수동 시나리오 검증 완료 — admin/operator 로그인 성공, `/admin`·`/operator` 각각 200 렌더링, operator 세션의 `/admin` 접근은 `/login`으로 리다이렉트되어 차단됨을 확인.
- AC 3(디자인 토큰 + 내비 골격)은 코드 리뷰로 검증 — `design-tokens.css`가 DESIGN.md §2/§3/§5/§6 토큰과 정확히 일치, 관리자 스티키 헤더/오퍼레이터 하단 내비(≥44px 타깃) 골격이 각 레이아웃에 존재.
- `npm run lint`, `npm run build` 모두 통과(회귀 없음).
- 자동화 테스트 프레임워크 미지정(스토리 Dev Notes 명시) — 이번 스토리는 Dev Notes에 정의된 수동 검증 절차로 AC를 확인함.
- 추가 요청 반영: 관리자 시드 계정에 `phoneNumber` 필드 및 시드 비밀번호/전화번호의 환경변수화 완료, 실제 DB 반영 검증까지 마침.
- 미해결 항목: `.env.local`의 실제 `DATABASE_URL`(Neon)이 아직 플레이스홀더 상태 — 실제 배포/지속 개발을 위해서는 실제 Neon 프로젝트 연결 문자열이 필요함(다음 세션 또는 인프라 설정 시 채워야 함).

### File List

- NEW `apps/web/app/layout.tsx`
- NEW `apps/web/app/page.tsx`
- NEW `apps/web/app/design-tokens.css`
- NEW `apps/web/app/(auth)/login/page.tsx`
- NEW `apps/web/app/(auth)/login.css`
- NEW `apps/web/app/admin/layout.tsx`
- NEW `apps/web/app/admin/page.tsx`
- NEW `apps/web/app/admin/admin-nav.css`
- NEW `apps/web/app/operator/layout.tsx`
- NEW `apps/web/app/operator/page.tsx`
- NEW `apps/web/app/operator/operator-nav.css`
- NEW `apps/web/app/api/auth/[...all]/route.ts`
- NEW `apps/web/proxy.ts`
- MODIFIED `apps/web/lib/auth.ts` (phoneNumber additionalField 추가)
- NEW `apps/web/lib/auth-client.ts`
- NEW `apps/web/lib/db/index.ts`
- MODIFIED `apps/web/lib/db/schema.ts` (phone_number 컬럼 추가)
- NEW `apps/web/lib/ai/ports.ts` (이번 세션에 누락분 보완)
- NEW `apps/web/lib/ai/adapters/` (빈 폴더)
- NEW `apps/web/lib/services/` (빈 폴더)
- NEW `apps/web/lib/db/repositories/` (빈 폴더)
- MODIFIED `apps/web/drizzle.config.ts` (.env.local 로딩 버그 수정)
- NEW `apps/web/drizzle/0000_material_phil_sheldon.sql`
- NEW `apps/web/drizzle/meta/0000_snapshot.json`
- NEW `apps/web/drizzle/0001_flat_iron_man.sql` (phone_number 컬럼)
- NEW `apps/web/drizzle/meta/0001_snapshot.json`
- MODIFIED `apps/web/drizzle/meta/_journal.json`
- MODIFIED `apps/web/scripts/seed-accounts.ts` (phoneNumber 파라미터, 비밀번호/전화번호 환경변수화)
- MODIFIED `apps/web/.env.local.example` (SEED_ADMIN_PASSWORD/SEED_ADMIN_PHONE_NUMBER/SEED_OPERATOR_PASSWORD 추가)
- MODIFIED `apps/web/.gitignore` (`.env*.example`이 무시되던 버그 수정)
- NEW `apps/web/package.json`, `apps/web/package-lock.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/eslint.config.mjs` (create-next-app 스캐폴딩)
