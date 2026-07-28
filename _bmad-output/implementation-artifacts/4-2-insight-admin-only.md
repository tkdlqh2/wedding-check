---
baseline_commit: 68fad71
---

# Story 4.2: 인사이트 관리자 전용 노출 (FR-11)

Status: in-progress

## Story

As a 관리자,
I want 인사이트 화면이 나만 접근 가능하기를,
so that 오퍼레이터 개인을 겨냥한 민감한 집계 정보가 잘못 노출되지 않는다.

## Acceptance Criteria

1. **Given** 관리자 세션일 때 **When** 인사이트 화면에 접근하면 **Then** 정상적으로 조회된다.
2. **Given** 오퍼레이터 세션일 때 **When** 인사이트 화면 URL에 직접 접근을 시도하면 **Then** 접근이 차단된다(AD-3, FR-11).
3. **Given** 클러스터 집계가 아직 실행되지 않은 상태에서 **When** 숫자 플레이스홀더를 표시하면 **Then** `0`이 아닌 `—`로 표시되어 미집계와 0건을 혼동시키지 않는다(UX-DR17).

## 이 스토리의 본질 — "이미 막혀 있다"가 사실이 아니다

Story 4.1은 인가를 `app/admin/layout.tsx`에 맡기고 넘어갔다("4.2는 오퍼레이터 차단만 다룬다"). 착수하며 확인해 보니 **그 전제가 Next.js 공식 문서가 명시적으로 경고하는 패턴**이었다:

> Due to Partial Rendering, be cautious when doing checks in Layouts as these don't re-render on navigation, meaning the user session won't be checked on every route change. Instead, you should do the checks close to your data source or the component that'll be conditionally rendered.
> — `node_modules/next/dist/docs/01-app/02-guides/authentication.md` §Layouts and auth checks

같은 문서가 이어서 못 박는다: "A common pattern in SPAs is to `return null` in a layout or a top-level component if a user is not authorized. This pattern is **not recommended** since Next.js applications have multiple entry points."

즉 지금 상태는 "AC 2가 이미 충족돼 있어서 회귀 테스트만 붙이면 되는" 스토리가 아니다. **실제로 재현 가능한 구멍이 있다**(D-1). 이 스토리가 하는 일은 세 가지다.

| # | 하는 일 | AC |
|---|---|---|
| A | 인가를 레이아웃 단독 의존에서 **페이지별 가드**로 이동(레이아웃은 바깥 그물로 유지) | 1, 2 |
| B | "로그인 필요"와 "권한 없음"을 분리 — 로그인한 오퍼레이터를 로그인 폼으로 보내지 않는다 | 2 |
| C | 미집계 상태의 클러스터 수를 `—`로, 빈 상태 문구도 미집계/0건을 구분 | 3 |

## 확정한 설계 결정

### D-1. 레이아웃 가드만으로는 FR-11이 깨진다 — 재현 경로가 실재한다

레이아웃은 클라이언트 사이드 내비게이션(soft navigation)에서 다시 렌더되지 않는다. 그래서 다음 순서가 성립한다:

1. 관리자 A가 `/admin/ceremonies`를 열어 둔다(레이아웃 1회 렌더 — 이때는 admin이 맞다).
2. 다른 관리자가 회원 관리 화면(Story 5.7)에서 A의 역할을 **오퍼레이터로 강등**한다.
3. A가 열어 둔 탭에서 상단 내비의 "인사이트"를 클릭한다 → soft navigation이라 **레이아웃은 다시 실행되지 않고 페이지 RSC 페이로드만** 받아온다.
4. `app/admin/insights/page.tsx`에는 자체 가드가 없으므로 `getInsights()`가 그대로 실행되어 **오퍼레이터에게 인사이트가 렌더된다.**

역할 변경 UI는 Story 5.7에서 이미 만들어져 있으므로 이건 이론적 시나리오가 아니다. FR-11의 "오퍼레이터는 접근할 수 없다"를 문자 그대로 어긴다.

**조치:** `lib/auth-guard.ts`에 `requireAdminPage()`를 추가하고 **모든 `/admin/**/page.tsx`가 자기 자신을 지키게 한다.** 레이아웃 가드는 그대로 둔다 — 없애는 게 아니라 한 겹 더 두는 것이고, 첫 진입(hard navigation)에서는 레이아웃이 여전히 가장 싼 차단 지점이다.

**결함 계열로 처리한다.** FR-11이 요구하는 건 인사이트 한 화면이지만, 같은 구멍이 `/admin` 하위 7개 페이지에 동일하게 있다. 인사이트만 고치면 나머지 6개는 그대로 뚫려 있고, Story 1.1의 AC("오퍼레이터 세션일 때 관리자 전용 라우트에 접근하면 차단된다")는 인사이트만 가리키지 않는다. 한 줄씩 7곳에 넣는다(메모리 `fix-defect-class-not-instance`).

### D-2. 인가는 서비스(DAL)가 아니라 페이지에 둔다

Next.js 문서는 "check close to your data source"를 권하며 DAL 안에서 검증하는 예를 든다. 즉 `getInsights()`가 스스로 세션을 확인하는 형태다. 이 프로젝트에서는 택하지 않는다.

- 이 코드베이스의 확립된 관례는 **"가드는 진입점(Server Action / Route Handler), 서비스는 순수"**다(Story 1.2 코덱스 P1에서 `requireAdminSession()`이 도입된 이유). 서비스 30여 개 중 세션을 아는 것은 하나도 없다. 인사이트만 예외로 만들면 다음 사람이 어느 쪽 규칙을 따라야 할지 모른다.
- 서비스가 `headers()`에 의존하면 요청 컨텍스트 밖(테스트, 배치)에서 호출할 수 없다. `recomputeInsights()`는 실제로 cron이 호출하고, `getInsights()`는 테스트가 직접 호출한다.

대신 문서가 경고한 실질(= 레이아웃 하나에만 의존하지 말 것)은 D-1의 페이지별 가드로 충족한다.

### D-3. `forbidden()`은 쓰지 않는다

Next.js에는 이 용도의 전용 API가 있다(`forbidden()` + `forbidden.tsx`, 403 페이지). 쓰지 않는 이유는 하나다 — **`version: experimental`이고 `experimental.authInterrupts` 플래그를 켜야 한다**(`node_modules/next/dist/docs/.../forbidden.md`). 라이브 예식을 진행하는 파일럿에서 403 화면 하나를 얻자고 실험적 런타임 플래그를 켤 이유가 없다. 안정화되면 그때 옮긴다(deferred-work).

### D-4. 로그인한 오퍼레이터는 `/login`이 아니라 `/operator`로 보낸다

현재 `admin/layout.tsx`는 세션 없음과 권한 없음을 **둘 다 `/login`으로** 보낸다. 로그인한 오퍼레이터에게 로그인 폼을 다시 띄우는 건 사실과 다르다 — 그는 로그인이 필요한 게 아니라 권한이 없다. §10의 운영 에러 톤("무슨 일이 있었는지, 무엇을 해야 하는지. 오퍼레이터를 탓하지 않음")과도 어긋난다.

- 세션 없음 → `/login` (그대로).
- 세션 있고 admin 아님 → `/operator` (자기 홈).

오퍼레이터 내비에는 인사이트 링크 자체가 없으므로 이 경로로 들어오는 경우는 (a) URL 직접 입력, (b) 강등 후 남아 있던 탭 두 가지뿐이고, 둘 다 자기 홈으로 되돌리는 게 맞는 처리다.

### D-5. 세션 조회는 `React.cache`로 요청당 1회

가드를 페이지에 넣으면 관리자 페이지 한 번 렌더에 `getSession()`이 2회(레이아웃+페이지) 돈다 — better-auth의 세션 조회는 DB 왕복이다. `React.cache()`로 감싸 **같은 요청 안에서만** 공유한다. soft navigation은 페이지만 렌더하므로 검사 자체는 매 요청 그대로 수행된다(캐시가 가드를 약화시키지 않는다).

### D-6. `—`는 "배치 산출값"에만 적용한다

통계 카드 3개 중 `—`가 필요한 건 하나뿐이다.

| 카드 | 출처 | 미집계 시 |
|---|---|---|
| 누적 확정 피드백 | `variable_cases` 실시간 COUNT | 실제 숫자 (배치와 무관하게 항상 참) |
| **반복 원인 클러스터** | **배치 산출물(`insight_clusters`)** | **`—`** |
| 최근 30일 신규 피드백 | `variable_cases` 실시간 COUNT | 실제 숫자 |

아는 숫자를 `—`로 가리는 것은 UX-DR17이 막으려는 혼동("미집계와 0건")을 오히려 다른 방향으로 만드는 것이다. §14의 규칙은 "집계 전"의 자리에만 적용된다.

**미집계 판정 = `lastCompletedAt === null` **그리고** 저장된 클러스터가 0개.** 후자를 함께 보는 이유: 배치가 쓰기에 성공한 뒤 락 해제만 실패하면(4.1의 `releaseLockBestEffort`가 삼키는 경로) 클러스터는 있는데 `lastCompletedAt`이 비어 있을 수 있다. 그때 `—`를 띄우면 **아래에 클러스터 목록이 N개 깔린 화면에서 카운트만 `—`인 자기모순**이 된다.

빈 상태 문구도 같은 분기를 따른다 — 집계 전에 "아직 반복 패턴이 없습니다"는 알 수 없는 것을 단정하는 문장이다.

## Tasks / Subtasks

- [ ] **Task 1: `requireAdminPage()` + 전 admin 페이지 적용 (AC: #1, #2)**
  - [ ] `lib/auth-guard.ts`에 `requireAdminPage()` 추가 — 세션 없음 `redirect("/login")`, admin 아님 `redirect("/operator")`(D-4). 세션 반환.
  - [ ] 세션 조회를 `React.cache`로 감싼 `getCurrentSession()`으로 통일하고 `requireAdminSession`/`requireSession`도 그것을 쓰게 한다(D-5).
  - [ ] `app/admin/**/page.tsx` 7곳 전부에 `await requireAdminPage()`를 첫 줄로(D-1 결함 계열).
  - [ ] `app/admin/layout.tsx`는 유지하되 같은 분기(`/operator`)를 쓰도록 맞추고, 왜 두 겹인지 주석으로 남긴다.

- [ ] **Task 2: `hasAggregated` 파생 (AC: #3)**
  - [ ] `InsightsView`에 `hasAggregated: boolean` 추가 — `lastCompletedAt !== null || clusters.length > 0`(D-6).
  - [ ] AD-7 원칙대로 저장 필드를 새로 만들지 않는다(읽기 시점 파생).

- [ ] **Task 3: 화면 (AC: #3)**
  - [ ] 통계 카드를 `insight-stats.tsx`로 추출(순수 표현 컴포넌트 — 테스트 가능하게). 클러스터 카드만 `hasAggregated=false`에서 `—`.
  - [ ] `—`는 `--color-text-disabled`로(§14 Disabled/플레이스홀더 톤). 28px/700 기하는 유지해 집계 후 레이아웃이 흔들리지 않게 한다.
  - [ ] 빈 상태 문구 분기: 미집계 → "아직 집계 전입니다. 매일 새벽 1회 갱신됩니다." / 집계 완료 + 0개 → 기존 문구 유지.
  - [ ] `insights.css`에 플레이스홀더 modifier 추가(임의 hex 금지, 토큰만).

- [ ] **Task 4: 테스트 (AC 전부)**
  - [ ] `tests/lib/auth-guard.test.ts`(신규): 세션 없음 → `/login` / 오퍼레이터 → `/operator` / 관리자 → 통과(AC 1, 2). `requireAdminSession`의 throw 경로도 함께 고정.
  - [ ] `tests/components/insight-stats.test.tsx`(신규): 미집계 시 클러스터 카드 `—`이고 **`0개`가 화면에 없다** / 집계 후 `0개` 표시 / 나머지 두 카드는 미집계에도 실제 숫자(D-6) / 빈 상태 문구 분기.
  - [ ] `tests/services/insight.test.ts`: `hasAggregated` — 최초 false / 배치 후 true / 클러스터만 있고 `lastCompletedAt`이 null이어도 true.
  - [ ] 회귀: 기존 435건 그대로 통과.

- [ ] **Task 5: 검증 (AC 전부)**
  - [ ] 격리 DB + 실서버 종단: 오퍼레이터 세션으로 `/admin/insights` → `/operator` 리다이렉트, 관리자 세션 → 200, 미로그인 → `/login`.
  - [ ] **D-1의 강등 시나리오 실검증**: 관리자 세션 쿠키를 유지한 채 그 계정을 오퍼레이터로 강등하고 페이지만 재요청(soft navigation과 동일한 RSC 요청) → 차단되는지.
  - [ ] `—` 렌더링을 실제 SSR 응답에서 확인(집계 전 / 집계 후).
  - [ ] `tsc` / `lint` / `build` / vitest 전체 클린.

## Dev Notes

### 이 스토리가 건드리지 않는 것

- `app/operator/layout.tsx`에는 역할 검사가 없다(로그인만 확인) — 즉 **관리자는 오퍼레이터 화면에 들어갈 수 있다**. AD-3/FR-11은 그 반대 방향만 요구하고, 대표가 오퍼레이터 화면을 확인하는 것은 막을 이유가 없다. 의도된 비대칭이며 이 스토리에서 바꾸지 않는다.
- `/api/cron/insight-recompute`의 인가는 `CRON_SECRET`이고 역할과 무관하다(AD-10). 여기서 손대지 않는다.
- 마이그레이션 없음. 스키마 변경 없음.

## Change Log

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-07-29 | 스토리 파일 작성 | Epic 4 마지막 스토리 착수 |

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` §Epic 4 / Story 4.2
- `_bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md` §4.5 FR-11
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` §Layouts and auth checks
- `_bmad-output/implementation-artifacts/4-1-pattern-clustering.md`(선행 스토리, 경계 표)
