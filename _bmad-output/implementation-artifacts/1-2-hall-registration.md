---
baseline_commit: 5562ce6630cfd92c100c1e948520b84ad618bce2
---

# Story 1.2: 홀 등록

Status: review

## Story

As a 관리자,
I want 홀(예식 진행 공간)을 생성·수정·삭제할 수 있기를,
so that 홀별로 독립된 체크리스트 템플릿을 관리할 기반을 마련할 수 있다.

## Acceptance Criteria

1. Given 관리자로 로그인한 상태에서, When 홀명을 입력해 저장하면, Then Primary 버튼(UX-DR2)으로 실행되고 새 홀이 생성되어 목록에 나타난다.
2. Given 홀명 없이 저장을 시도하면, When 저장 버튼을 누르면, Then 저장이 거부되고 필드 에러 스타일(1px solid #E0353B + 헬퍼 텍스트, UX-DR14)로 "홀명은 필수입니다"가 표시된다.
3. Given 이미 템플릿 항목이나 예식이 연결된 홀에서, When 삭제를 시도하면, Then 완전 삭제 대신 비활성화 처리된다(`[ASSUMPTION]` 대표 확인 필요 — 아래 Dev Notes 참고).
4. Given 오퍼레이터 계정으로 로그인한 상태에서, When 홀 관리 화면에 접근을 시도하면, Then 접근이 차단된다(AD-3).

## Tasks / Subtasks

- [x] Task 1: `halls` 테이블 스키마 + 마이그레이션 (AC: 1, 2, 3)
  - [x] `lib/db/schema.ts`에 `halls` 테이블 추가: `id`(uuid, `defaultRandom()`, PK), `name`(text, not null), `isActive`(boolean, not null, default true — AC 3의 "완전 삭제 대신 비활성화" 구현), `createdAt`/`updatedAt`(timestamp, ISO 8601 규약)
  - [x] `npx drizzle-kit generate`로 마이그레이션 생성(`0002_futuristic_doctor_doom.sql`) — DB 연결 없이 스키마 diff만으로 생성됨(Story 1.1 Dev Agent Record 참고)
  - [x] 실제 DB(로컬 Postgres 등)에 마이그레이션을 적용해 스키마가 유효한지 검증 — 3개 마이그레이션(0000/0001/0002) 모두 로컬 Postgres에 순서대로 적용 성공

- [x] Task 2: 리포지토리 레이어 — `lib/db/repositories/hall.ts` (AC: 1, 2, 3)
  - [x] `create(input: { name: string }): Promise<Hall>` — `halls`에 INSERT
  - [x] `findAllActive(): Promise<Hall[]>` — `WHERE is_active = true`만 반환(비활성화된 홀은 기본 목록에서 숨김, 아래 Dev Notes "비활성 홀 노출 정책" 참고)
  - [x] `findById(id: string): Promise<Hall | undefined>`
  - [x] `update(id: string, input: { name: string }): Promise<Hall>`
  - [x] `deactivate(id: string): Promise<void>` — `UPDATE halls SET is_active = false WHERE id = $id`(하드 삭제 없음, AD-2 참고 — `halls`는 홀 종속 엔티티가 아니므로 `hallId` 필터링 인자는 필요 없다)
  - [x] `lib/services/*`가 SQL/ORM을 직접 쓰지 않고 이 리포지토리만 호출하도록 강제(AD-2)

- [x] Task 3: 서비스 레이어 — `lib/services/hall.ts` (AC: 1, 2, 3)
  - [x] `createHall(input: { name: string })`: `name`이 빈 문자열/공백이면 서버 사이드에서 거부(`HallValidationError` throw → Server Action이 캐치해 폼 상태로 변환) — 클라이언트 검증만으로는 불충분(AC 2는 서버 사이드 강제가 실제 안전장치)
  - [x] `listActiveHalls()`, `updateHall(id, input)`, `deactivateHall(id)` — 리포지토리 위임, 벤더 SDK/ORM 직접 호출 없음(AD-2)

- [x] Task 4: 홀 관리 화면 — 목록 + 등록/수정 폼 (AC: 1, 2)
  - [x] `app/admin/halls/page.tsx`: Server Component로 `listActiveHalls()` 조회 후 목록 렌더링. 홀이 하나도 없으면 UX-DR12 빈 상태(`#888888` 안내 문구 + 상단 상시 노출된 등록 폼)
  - [x] `app/admin/halls/hall-form.tsx`(Client Component): 홀명 입력 + Primary 버튼(UX-DR2: `#E8552D` bg, 8px radius, 16px/600)으로 저장 실행. Server Action(`createHallAction`/`updateHallAction`)을 호출
  - [x] 서버 검증 실패(홀명 없음) 시 입력 필드에 `1px solid #E0353B` 보더 + `#E0353B` 12px 헬퍼 텍스트 "홀명은 필수입니다" 표시(UX-DR14) — `useActionState`로 Server Action 반환값을 폼 상태로 반영
  - [x] 목록의 각 홀 행(`hall-row.tsx`)에 "수정"(Secondary/Outlined, UX-DR3, 인라인 토글로 `HallForm` 재사용) / "삭제"(`confirm()` 확인 후 비활성화) 액션 배치
  - [x] `app/admin/admin-nav.css`의 내비 자리는 이 스토리 범위에서 바꾸지 않음 — `app/admin/halls`는 직접 URL 접근으로 충분(내비 연결은 이후 스토리)

- [x] Task 5: Server Actions (AC: 1, 2, 3)
  - [x] `app/admin/halls/actions.ts`: `createHallAction`, `updateHallAction`, `deactivateHallAction` — Consistency Conventions(관리자 CRUD는 Server Actions)를 따름, Route Handler 아님
  - [x] 각 액션은 `lib/services/hall.ts`만 호출(리포지토리/DB 직접 접근 금지, AD-2)
  - [x] 저장/비활성화 성공 시 `revalidatePath("/admin/halls")`로 목록 갱신

- [x] Task 6: 접근 제어 확인 (AC: 4)
  - [x] `app/admin/halls/`는 이미 `app/admin/layout.tsx`(Story 1.1)의 `role !== 'admin'` 차단 로직 아래에 위치하므로 별도 구현 불필요 — operator 세션으로 `/admin/halls` 접근 시 307로 `/login` 리다이렉트됨을 수동 검증(curl)으로 확인
  - [x] proxy.ts의 미인증 리다이렉트(Story 1.1)도 `/admin/:path*` 매처에 이미 포함되어 있어 `/admin/halls`도 커버됨을 확인(비로그인 상태 curl로 307 리다이렉트 확인)

## Dev Notes

### 아키텍처 준수사항

- 소스: `_bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md`
- **AD-2(리포지토리 레이어 독점)**: `lib/services/*`는 SQL/ORM을 직접 쓰지 않고 `lib/db/repositories/*`만 호출한다. 단, `halls` 자체는 "홀 종속 엔티티"가 아니라 홀 격리의 기준이 되는 루트 엔티티이므로, AD-2가 요구하는 `hallId` 필수 첫 인자 필터링은 이 스토리에는 적용되지 않는다(적용 대상은 `checklist_templates` 등 홀에 속한 엔티티 — Story 1.3부터 해당).
- **AD-3(역할 2종)**: 홀 CRUD는 `admin` 전용(FR-1~5). `app/admin/` 하위 전체가 Story 1.1의 레이아웃 가드로 이미 보호된다.
- **Consistency Conventions**(스파인 §Consistency Conventions): 관리자 CRUD(FR-1~5, FR-11)는 **Server Actions**로 구현한다(Route Handler 아님 — Route Handler는 FR-6/7/9의 AI 관련 기능 전용). PK는 UUID v4, 타임스탬프는 ISO 8601 UTC. API 오류가 필요한 경우 `{ error: { code, message } }` 봉투를 쓰되, Server Action은 보통 `{ error: string }` 형태의 폼 상태 반환으로 충분하다(REST 오류 봉투는 Route Handler 대상).
- **Naming**: 테이블명은 영문 snake_case, PRD §3 용어집과 1:1(`halls`) — `[ASSUMPTION]` 준수, `hall_list`나 축약형 금지.

### `[ASSUMPTION]` 해소 — 홀 삭제 정책 (AC 3)

- PRD FR-1 Consequences: "이미 템플릿 항목이나 예식이 연결된 홀은 삭제 시 처리 정책이 필요하다 `[ASSUMPTION: 연결된 데이터가 있는 홀은 삭제 대신 비활성화만 허용 — 대표 확인 필요]`". 스파인 Deferred 섹션도 "홀 삭제 정책 세부 구현(비활성화 플래그 vs soft delete 컬럼 설계)"을 "스토리 단계에서 확정"하도록 미뤄뒀다.
- 이 스토리는 **연결 데이터 유무를 조건 분기하지 않고, 삭제 요청은 항상 비활성화(soft delete)로 처리**하기로 확정한다. 이유: (1) 이 스토리 시점엔 `checklist_templates`/`ceremonies` 테이블이 아직 존재하지 않아(Story 1.3/2.1부터 생성) "연결 데이터 존재 여부"를 판별할 근거 테이블이 없다. (2) 하드 삭제 분기를 나중에 추가하는 것보다, 처음부터 소프트 삭제만 지원하는 것이 더 안전하고 이후 스토리에서 되돌릴 필요가 없다. `[ASSUMPTION]`이며 대표 확인 시 정책이 바뀌면 갱신한다.
- **비활성 홀 노출 정책**: 비활성화된 홀은 `findAllActive()`가 기본적으로 걸러내 관리자 홀 목록에 노출되지 않는다(향후 스토리에서 "비활성 홀 보기" 토글이 필요해지면 별도 쿼리로 추가 — 이 스토리 스코프 아님). 재활성화 UI도 이 스토리 스코프 밖이다(PRD/에픽에 명시 없음).

### 라이브러리/프레임워크 요구사항

- 새 의존성 없음 — Story 1.1이 이미 세팅한 스택(Next.js Server Actions, Drizzle ORM 0.45, better-auth 세션)을 그대로 재사용한다.
- `id: uuid("id").primaryKey().defaultRandom()` — Drizzle의 `uuid` 컬럼 타입(`drizzle-orm/pg-core`)과 Postgres `gen_random_uuid()` 확장(Neon은 기본 활성화, 2026-07-24 기준)으로 UUID v4를 생성한다.
- Server Action의 폼 에러 처리는 React 19의 `useActionState`(Next.js 16 App Router 공식 패턴)를 사용한다.

### 테스트 요구사항

- Story 1.1과 동일하게 자동화 테스트 프레임워크 미지정 — 이번 스토리도 수동 검증한다:
  1. 관리자로 로그인 → `/admin/halls`에서 홀명을 입력해 저장 → 목록에 즉시 나타나는지 확인(AC 1).
  2. 홀명 없이 저장 시도 → 거부되고 "홀명은 필수입니다" 에러가 표시되는지 확인(AC 2).
  3. 등록된 홀을 삭제 → DB에서 물리적으로 사라지지 않고 `is_active=false`로만 바뀌며, 목록에서는 사라지는지 확인(AC 3).
  4. 오퍼레이터 계정으로 로그인 → `/admin/halls` 직접 URL 접근 시도 → `/login`으로 차단되는지 확인(AC 4, Story 1.1의 기존 가드 재사용 검증).

### Project Structure Notes

- Story 1.1이 이미 만든 `app/admin/` 세그먼트(주의: 스파인의 `(admin)` route group 표기가 아니라 일반 세그먼트 — Story 1.1 Dev Notes "스파인과 다른 최신 사실" #4 참고) 아래에 `app/admin/halls/`를 신설한다. 새 route group을 만들지 않는다.
- UPDATE 대상: `lib/db/schema.ts`(halls 테이블 추가) — 이 파일은 Story 1.1이 만든 기존 파일이며, 기존 better-auth 테이블(`user`/`session`/`account`/`verification`) 정의를 건드리지 않고 `halls`만 추가한다.
- NEW: `lib/db/repositories/hall.ts`, `lib/services/hall.ts`, `app/admin/halls/page.tsx`, `app/admin/halls/hall-form.tsx`, `app/admin/halls/actions.ts`, 신규 drizzle 마이그레이션 파일.
- `lib/db/repositories/`, `lib/services/`는 Story 1.1에서 빈 폴더로만 만들어졌다 — 이 스토리가 그 폴더에 실제 첫 파일을 채운다.

### Previous Story Intelligence (Story 1.1)

- `app/admin/layout.tsx`가 이미 `auth.api.getSession()`으로 세션을 조회해 `role !== 'admin'`이면 `/login`으로 리다이렉트한다 — Task 6는 새 코드가 아니라 기존 가드가 `/admin/halls`에도 적용됨을 확인하는 것뿐이다.
- `apps/web/proxy.ts`는 `/admin/:path*`를 매칭하므로 `/admin/halls`도 이미 커버된다.
- `.env.local`/`.env.local.example` 패턴, `drizzle-kit generate`가 DB 연결 없이도 스키마 diff만으로 마이그레이션을 생성할 수 있다는 점(Story 1.1에서 확인됨)을 그대로 재사용한다.
- 로컬 검증 시 `drizzle-orm/neon-http`는 일반 로컬 Postgres에 연결할 수 없다(Neon 전용 HTTP 프로토콜 필요) — Story 1.1처럼 로컬 Docker Postgres로 임시 검증할 경우 `lib/db/index.ts`를 `drizzle-orm/node-postgres`로 임시 스왑했다가 검증 후 반드시 원복해야 한다.

### Git Intelligence (최근 작업 패턴)

- Story 1.1은 PR #1로 병합됐다(squash 아님 — 일반 merge, 커밋 이력 보존). 커밋은 논리 단위로 잘게 나뉘어 있었다(버그 수정 1개, 기능 1개, 문서화 1개 등).
- 이후 모든 스토리는 다음 파이프라인을 따른다: `story/<story-key>` 브랜치 생성 → 단계별 커밋 → PR 오픈 → `codex review --base main` → 지적사항 있으면 수정 후 재리뷰(반복) → 클린하면 `gh pr merge --merge --delete-branch`로 자동 머지 → `_bmad-output/implementation-artifacts/sprint-status.yaml`의 `git_pipeline` 섹션에 각 단계 기록.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: 홀·체크리스트 템플릿 관리 / Story 1.2]
- [Source: _bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md#FR-1, §3 용어집, §12 Assumptions Index]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #Consistency Conventions, #Deferred]
- [Source: DESIGN.md#4 Component Stylings(Buttons/Inputs), #14 States(Empty/Error)]
- [Source: _bmad-output/implementation-artifacts/1-1-project-setup-and-login.md#Dev Notes, #Dev Agent Record]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `halls` 테이블/마이그레이션은 DB 연결 없이 `drizzle-kit generate`로 생성(Story 1.1에서 확인된 방식 재사용).
- 검증 시 로컬 Postgres에 마이그레이션 3개(0000/0001/0002)를 순서대로 적용. 컨테이너 이름을 `wedding-check-pg`로 재사용하려다 포트 충돌 발견 — 조사 결과 `wedding-check-db`라는 이전 세션에서 만들어진 컨테이너(2026-07-24 생성, better-auth 스키마만 있고 halls 없음, `verify-*@example.com` 테스트 계정)가 이미 포트 5434를 점유 중이었음. 사용자 데이터가 아닌 이전 검증 잔재로 판단해 건드리지 않고 별도 포트(5435)의 새 컨테이너(`wedding-check-pg-verify`)로 검증 진행.
- Server Action은 REST 엔드포인트가 아니라 Next.js 고유의 인코딩(`$ACTION_ID_*`/`$ACTION_REF_*`/`$ACTION_KEY` hidden 필드)을 쓴다 — curl로 직접 재현 가능함을 확인(렌더된 폼의 hidden 필드를 그대로 재전송). 단, `curl -F`로 한글 값을 이 Windows 환경(한글 로케일)에서 직접 넘기면 인자 인코딩이 깨짐을 발견(예: "1층 웨딩홀"이 DB에 깨진 바이트로 저장) — 앱 버그 아님을 Node.js `fetch`/`FormData`(항상 UTF-8)로 동일 액션을 재현해 확인(예: "3층 스카이홀"은 정상 저장). 이후 모든 Server Action 검증은 Node 스크립트로 수행.
- AC 2(빈 홀명 검증) 첫 시도에서 테스트 스크립트 자체의 버그(`hallName || "기본값"` — 빈 문자열이 falsy라 기본값으로 폴백)로 오탐 발생 → 스크립트를 수정해 진짜 빈 문자열을 보내도록 고친 뒤, DB row count가 요청 전후로 변하지 않고 에러 메시지·`input--error` 클래스가 응답에 포함됨을 재확인.

### Completion Notes List

- Task 1~6 전 항목 구현 및 검증 완료.
- AC 1: Node 스크립트로 admin 세션에서 홀 생성 Server Action을 재현 → 응답에 새 홀명 포함, DB에 `is_active=true`로 저장됨을 확인.
- AC 2: 빈 홀명으로 제출 → DB row 수 불변(서버 검증이 실제로 막음), 응답에 "홀명은 필수입니다" 에러 메시지 + `input--error` 클래스 포함 확인.
- AC 3: 삭제 액션 실행 → 해당 홀 row가 DB에서 사라지지 않고 `is_active=false`로만 바뀜, `findAllActive()` 쿼리(활성 홀 수)에서 제외됨을 확인.
- AC 4: operator 세션으로 `/admin/halls` 접근 시 307로 `/login` 리다이렉트, 비로그인 상태도 동일하게 차단됨을 curl로 확인(Story 1.1의 기존 가드를 그대로 재사용, 추가 구현 없음).
- `npm run lint`, `npm run build` 모두 통과(회귀 없음, `/admin/halls` 라우트가 빌드 결과에 정상 포함).
- 검증 후 `lib/db/index.ts`(neon-http 유지), `.env.local`(Neon 플레이스홀더 유지)은 모두 원복, 임시 로컬 Postgres 컨테이너·`pg` 패키지도 정리 완료 — 실제 운영 코드에는 검증용 변경이 남지 않음.
- 자동화 테스트 프레임워크 미지정(Story 1.1과 동일 정책) — Dev Notes에 정의된 수동 검증 절차로 AC를 확인함.

### File List

- NEW `apps/web/lib/db/repositories/hall.ts`
- NEW `apps/web/lib/services/hall.ts`
- NEW `apps/web/app/admin/halls/page.tsx`
- NEW `apps/web/app/admin/halls/hall-form.tsx`
- NEW `apps/web/app/admin/halls/hall-row.tsx`
- NEW `apps/web/app/admin/halls/actions.ts`
- NEW `apps/web/app/admin/halls/halls.css`
- NEW `apps/web/drizzle/0002_futuristic_doctor_doom.sql`
- NEW `apps/web/drizzle/meta/0002_snapshot.json`
- MODIFIED `apps/web/lib/db/schema.ts` (`halls` 테이블 추가)
- MODIFIED `apps/web/drizzle/meta/_journal.json`
- MODIFIED `apps/web/app/design-tokens.css` (`.btn-secondary`, `.input`, `.input--error` 재사용 프리미티브 추가)
