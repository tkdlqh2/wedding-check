---
baseline_commit: cba03ddabace1e08d8775302ebb6c13bfb8dadc5
---

# Story 2.3: 오퍼레이터의 체크리스트 인스턴스 열람 (오프라인 캐시)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 오퍼레이터,
I want 태블릿에서 오늘 예식의 체크리스트 인스턴스를 열람할 수 있기를,
so that 예식 진행 중 각 단계를 놓치지 않고 확인할 수 있다.

## Acceptance Criteria

1. **Given** 인스턴스가 생성되어 있을 때 **When** 오퍼레이터가 조회 화면을 열면 **Then** 항목이 POS Tile(UX-DR4, ≥44px 탭 타깃)로 표시되고, 항목 탭 시 0ms 지연으로 즉시 선택 상태(`#FDEDE7`+오렌지-레드 보더)가 반영된다(UX-DR19).
2. **Given** 최초 로드에 성공한 후 **When** 네트워크가 끊기거나 오프라인 상태가 되면 **Then** 캐시(localStorage/메모리)에서 계속 조회 가능하다(AD-5).
3. **Given** 온라인 상태로 화면이 열려 있는 동안 **When** 60초 간격이 지나면 **Then** 백그라운드로 재검증(stale-while-revalidate)하여 관리자의 당일 변경(Story 2.2)이 `motion-instant`로 조용히 반영된다.
4. **Given** Tablet/iPad(768~1024px) 화면 너비일 때 **When** 조회 화면을 렌더링하면 **Then** 고정 체크리스트+질의 레이아웃으로 표시된다(UX-DR11).

## Tasks / Subtasks

- [x] Task 1: 인증 가드 보강 — `lib/auth-guard.ts` (선행 작업, 신규 Route Handler가 필요)
  - [x] `requireSession()` 추가: 세션 없으면 throw(패턴은 `requireAdminSession`과 동일하되 role 체크 없음 — operator/admin 둘 다 통과). `app/api/templates/.../video/status/route.ts`가 `requireAdminSession()`을 가드 없이 호출하고 Next.js 기본 에러 핸들링에 맡기는 기존 패턴을 그대로 따른다.

- [x] Task 2: 오퍼레이터 전용 조회 서비스 — `lib/services/checklist-instance.ts` (MODIFY, AC: 1, 2, 3)
  - [x] `getOperatorInstanceView(hallId, ceremonyId)` 추가: `ceremonyRepo.findById` + `instanceRepo.findByCeremony` + `instanceRepo.listItems`만 호출(기존 `getCeremonyDetail`과 달리 `listCandidateTemplateItems` 호출 안 함 — 오퍼레이터는 후보 목록이 필요 없고, 이 함수가 60초마다 폴링되므로 불필요한 쿼리를 추가하지 않는다). 반환 타입 `{ ceremony: Ceremony; items: ChecklistInstanceItem[] }`. 예식/인스턴스 미존재 시 기존 `ChecklistInstanceValidationError` 그대로 재사용.

- [x] Task 3: 재검증용 Route Handler — `app/api/operator/ceremonies/[hallId]/[ceremonyId]/route.ts` (NEW, AC: 3)
  - [x] `GET`: `requireSession()` → `isValidUuid(hallId)`/`isValidUuid(ceremonyId)` 검증 실패 시 `{ error: { code: "invalid_id", message } }` 400 → `getOperatorInstanceView` 호출 → `ChecklistInstanceValidationError`면 `{ error: { code: "not_found", message } }` 404 → 성공 시 `{ ceremony, items }` JSON 200.
  - [x] 이 라우트는 클라이언트의 60초 폴링 전용이다 — 최초 로드는 Task 5의 Server Component가 서비스 함수를 직접 호출한다(같은 요청을 두 번 만들지 않는다).

- [x] Task 4: 오프라인 캐시 순수 함수 — `lib/operator/checklist-cache.ts` (NEW, AC: 2)
  - [x] `readCache(ceremonyId)` / `writeCache(ceremonyId, data)`: `window.localStorage` 키 `wedding-check:operator-checklist:${ceremonyId}`. `JSON.parse` 실패, `localStorage` 접근 불가(시크릿 모드 등)는 전부 `try/catch`로 조용히 무시하고 `null` 반환 또는 아무 것도 하지 않음 — 캐시 실패가 화면 자체를 깨뜨려서는 안 된다(DESIGN.md §14 오프라인 배너 계약과 동일한 원칙).
  - [x] 순수 함수로 분리해 jsdom 없이도(또는 jsdom `localStorage` mock으로) 단위 테스트 가능하게 만든다.

- [x] Task 5: 오퍼레이터 홈 — 오늘 예식 목록 — `app/operator/page.tsx` (MODIFY, AC 없음 — 2번 AC들의 진입점)
  - [x] 현재 플레이스홀더 텍스트를 `listTodaysCeremonies()`(Story 2.1에서 이미 구현된 홀 전체 교차 조회, 그대로 재사용) 결과로 교체. 각 예식을 `/operator/ceremonies/${hallId}/${ceremonyId}`로 링크.
  - [x] 빈 상태: 오늘 예식이 없으면 `#888888` 톤 안내 문구만(DESIGN.md §14 "Empty (오늘 등록된 예식 없음)" — 오퍼레이터는 예식을 등록할 수 없으므로 CTA 없음, 관리자 화면과 다름).

- [x] Task 6: 체크리스트 인스턴스 조회 화면 — `app/operator/ceremonies/[hallId]/[ceremonyId]/` (NEW, AC: 1, 2, 3, 4)
  - [x] `page.tsx`: Server Component. `isValidUuid` 실패 시 `notFound()`(admin 상세 페이지와 동일 패턴). `getOperatorInstanceView` 직접 호출해 초기 데이터를 서버에서 가져온 뒤 Client Component에 props로 전달(중복 요청 없음 — Task 3 라우트는 이후 60초 폴링 전용).
  - [x] `checklist-instance-view.tsx`: Client Component(`"use client"`).
    - 초기 렌더는 서버에서 받은 props를 그대로 사용(이것이 AD-5의 "최초 로드").
    - mount 시 `writeCache`로 서버에서 받은 데이터를 즉시 캐시에 기록(write-through) — 이후 곧 오프라인이 되어도 이미 렌더 중인 데이터를 잃지 않기 위함.
    - `setInterval` 60초마다 Task 3 라우트를 `fetch`로 호출: 성공하면 state + 캐시 갱신(`motion-instant` = 트랜지션 없이 즉시 교체), 실패(네트워크 에러 또는 `navigator.onLine === false`)하면 기존 state 유지 + 오프라인 배너 노출.
    - 언마운트 시 `clearInterval`.
    - 각 항목은 POS Tile(§4.1 참고, ≥44px)로 렌더링, 탭 시 `useState<Set<string>>` 기반 로컬 선택 상태 토글(서버 저장 없음 — 스키마에 "완료" 필드가 없다, Dev Notes "스코프 경계" 참고). 선택 시 CSS 클래스만 즉시 바뀌고 트랜지션 없음(motion-instant).
  - [x] `checklist-instance-view.css`: POS Tile 스타일 + tablet 768~1024px 고정 레이아웃(AC 4) + 오프라인 배너.

- [x] Task 7: 오퍼레이터 내비 정리 — `app/operator/layout.tsx` (MODIFY, 최소 변경)
  - [x] "체크리스트" nav 항목을 placeholder에서 `/operator`로의 실제 `Link`로 전환(질의/피드백은 Epic 3 범위이므로 placeholder 그대로 유지).

- [x] Task 8: 테스트 (AC: 1, 2, 3, 4)
  - [x] `tests/services/checklist-instance.test.ts`(기존 파일에 추가): `getOperatorInstanceView` — 정상 조회(ceremony+items 반환), 존재하지 않는 ceremonyId 거부, 다른 홀 hallId로 조회 시 거부(AD-2 격리).
  - [x] `tests/lib/checklist-cache.test.tsx`(신규 — 확장자 주의, 아래 "테스트 요구사항" 참고): `readCache`/`writeCache` — 정상 왕복, 손상된 JSON 처리, 존재하지 않는 키 처리.
  - [x] `tests/components/checklist-instance-view.test.tsx`(신규, jsdom): 탭 시 선택 상태 클래스 즉시 반영, `navigator.onLine=false` 또는 fetch 실패 시 캐시 데이터가 유지되고 오프라인 배너가 뜨는지(`vi.useFakeTimers()`로 60초 인터벌 강제 진행 — Story 1.4 `video-upload-polling.test.ts`의 폴링 테스트 패턴 재사용, `act()`로 타이머 advance를 감싸야 `findByRole` 내부 폴링이 fake timer에 걸려 timeout나지 않는다).
  - [x] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [x] Task 9: 수동 검증
  - [x] 로컬 서버(`npm run dev`)에서 오퍼레이터 계정(01000000002)으로 `/api/auth/sign-in/phone-number` 실제 로그인 → `GET /operator` → 오늘 예식("1층 홀", 7월 27일 09:33)이 목록에 실제로 뜨는지 HTML 응답으로 확인 → `GET /operator/ceremonies/[hallId]/[ceremonyId]` → `checklist-tile`/`checklist-tile-grid` 클래스와 실제 항목명("영상 없는 항목")이 SSR HTML에 포함됨을 확인(AC 1 마크업 확인). 탭 시 즉시 선택 상태 반영 자체는 `tests/components/checklist-instance-view.test.tsx`의 첫 번째 테스트로 자동화 검증(순수 클라이언트 상태라 서버 HTTP로는 재현 불가).
  - [x] `GET /api/operator/ceremonies/[hallId]/[ceremonyId]`를 세션 쿠키 있음/없음/잘못된 uuid 3가지로 직접 호출 — 200(JSON 정상), 500(비인증, 기존 `requireAdminSession` 미가드 패턴과 동일하게 처리됨), 400(`{error:{code:"invalid_id",...}}`)을 각각 실제로 확인.
  - [x] AC 3의 데이터 경로를 실제 DB 변경으로 검증: 인스턴스에 항목을 하나 직접 추가(SQL, Story 2.2의 `addInstanceItem`이 같은 테이블에 만드는 것과 동일한 형태의 행) → 같은 폴링 엔드포인트를 재호출 → 항목 수가 1개→2개로 실제 반영됨을 확인 후 원상복구. 클라이언트의 60초 `setInterval` 배선 자체(성공 시 갱신, 실패 시 캐시 유지)는 `checklist-instance-view.test.tsx`의 나머지 3개 테스트로 자동화 검증.
  - [x] **한계 — 브라우저 도구 없음:** 이 세션에는 실제 브라우저를 조작하는 도구(DevTools 오프라인 토글, 창 리사이즈)가 없어 AC 2(실제 오프라인 전환)와 AC 4(768~1024px 리사이즈)는 브라우저 수동 확인 대신 (a) 자동화 컴포넌트 테스트(`navigator.onLine=false` 모킹, fetch 실패 모킹으로 캐시 폴백+배너 확인)와 (b) `checklist-instance-view.css`의 `@media (min-width: 768px) and (max-width: 1024px)` 규칙 코드 리뷰로 대체 검증했다. 실제 태블릿/브라우저에서의 최종 확인은 코드 리뷰 시점에 별도로 필요.

## Dev Notes

### 아키텍처 준수사항 (필수)

- **AD-2:** `getOperatorInstanceView`도 기존 서비스 함수들과 동일하게 `hallId`를 필수 인자로 받아 두 리포지토리 호출(`ceremonyRepo.findById`, `instanceRepo.findByCeremony`) 모두에 전달한다. 새 리포지토리 함수는 만들지 않는다 — 기존 `ceremonyRepo`/`instanceRepo`로 충분하다.
- **AD-3:** 이 스토리는 admin 전용 가드(`requireAdminSession`)를 쓰지 않는다 — operator 열람 기능이므로 `requireSession()`(신규, role 무관 인증만 확인)을 쓴다. `app/operator/layout.tsx`는 이미 세션 존재만 확인하고 role을 가리지 않는다(기존 코드 그대로 — admin도 오퍼레이터 화면을 볼 수 있는 게 이 시스템의 기존 설계이며, 이 스토리에서 역할 제한을 새로 추가하지 않는다).
- **AD-5 (가장 중요):** 정확히 스파인 §71-77의 규칙대로 구현한다 — 체크리스트 조회만 캐시(localStorage), AI 질의는 이 스토리 범위 밖(Epic 3). "최초 로드"는 Server Component의 SSR 데이터 fetch로 이미 충족된다(그 자체가 성공한 네트워크 요청). 클라이언트 쪽 60초 인터벌 폴링이 실패하거나 `navigator.onLine === false`일 때만 캐시/기존 state로 폴백한다. **알려진 한계를 재구현하려 하지 말 것:** 완전히 새로고침한 시점에 오프라인이면 SSR 자체가 실패하므로 이 스토리의 캐시로 해결할 수 없다(스파인에 명시된 트레이드오프 — Service Worker 없음).
- **AD-9와 무관:** 이 스토리는 인스턴스를 읽기만 한다(Story 2.2에서 이미 생성 시점 필터링이 끝난 상태). 부분집합 매칭 로직을 여기서 다시 건드리지 않는다.
- **Consistency Conventions:** Route Handler 응답은 `{ error: { code, message } }` 단일 봉투 형식(스파인 §119). `hallId`/`ceremonyId`는 `isValidUuid()`로 형식 검증 후 사용.

### `getOperatorInstanceView`가 `getCeremonyDetail`을 재사용하지 않는 이유

기존 `getCeremonyDetail(hallId, ceremonyId)`(Story 2.2)은 `instanceRepo.listCandidateTemplateItems`까지 호출해 관리자 상세 페이지의 "추가 가능한 항목" 목록을 함께 반환한다. 오퍼레이터 화면은 후보 목록이 전혀 필요 없고, 이 조회가 60초마다 반복 폴링되므로 매번 불필요한 템플릿 항목 쿼리를 추가로 실행하는 것은 낭비다. 그래서 `ceremony`+`items`만 반환하는 별도의 얇은 함수를 둔다. 두 함수는 내부적으로 같은 리포지토리 호출을 일부 공유하지만(`ceremonyRepo.findById`, `instanceRepo.findByCeremony`), 억지로 하나로 합치지 않는다.

### 오프라인 캐시 설계 — 왜 mount 시 즉시 재검증 fetch를 보내지 않는가

AD-5 원문은 "화면 마운트 시 및 60초 고정 간격마다... 재검증 fetch를 보낸다"고 되어 있다. 이 스토리에서는 Server Component가 이미 마운트 시점에 최신 데이터를 서버에서 가져오므로(=SSR 자체가 첫 번째 "재검증"과 동등), 클라이언트가 mount 직후 같은 데이터를 또 fetch하는 것은 중복 요청이다. 대신: **SSR로 받은 초기 데이터를 즉시 localStorage에 write-through**하고, 그 다음부터 60초 인터벌로 폴링한다. AC 2("최초 로드에 성공한 후... 캐시에서 계속 조회 가능")와 AC 3("60초 간격이 지나면... 재검증")을 모두 만족시키면서 불필요한 네트워크 요청을 만들지 않는 절충이다. 코드 리뷰에서 이 설계가 AD-5 위반이라고 지적되면(엄격하게 "마운트 시 fetch"를 요구하는 것으로 해석), mount 시 무조건 한 번 더 fetch하도록 수정하되 이 Dev Notes를 참고해 판단할 것.

### "체크" 상태는 서버에 저장하지 않는다 — 스코프 경계

`checklist_instance_items` 스키마에는 완료/체크 여부를 나타내는 컬럼이 없고, PRD/에픽 어디에도 "체크 완료" 기능을 명시하지 않는다(§4.5 인사이트는 피드백 기반이지 체크리스트 진행률 기반이 아니다). AC 1의 "탭 시 즉시 선택 상태 반영"은 DESIGN.md §15 "체크리스트 항목 탭" 모션 스펙("타일이 `#FDEDE7` 틴트 + 오렌지-레드 보더를 0ms 지연으로 얻는다")을 그대로 만족시키는 **순수 클라이언트 로컬 UI 상태**로 구현한다. 서버에 쓰지 않고, 새로고침하면 초기화되는 것이 이 스토리의 의도된 동작이다. 만약 나중에 "체크 진행률을 다른 사람과 공유"하는 요구가 생기면 별도 스토리로 스키마 변경이 필요하다 — 이 스토리 범위에서 임의로 컬럼을 추가하지 않는다.

### 오퍼레이터가 어떤 예식을 보는지 — 홀 선택 없음

`user` 테이블에는 특정 홀에 대한 소속 필드가 없다(오퍼레이터는 홀에 고정 배정되지 않음 — PRD는 "사업체 내 여러 홀"만 언급하고 오퍼레이터-홀 매핑을 정의하지 않는다). 따라서 오퍼레이터 홈 화면은 관리자의 "오늘 예식" 목록과 동일하게 **홀 전체를 교차하는** `listTodaysCeremonies()`를 그대로 재사용한다(Story 2.1에서 이미 구현·테스트됨, 새 함수 불필요). 오퍼레이터는 목록에서 자신이 담당할 예식을 골라 들어간다 — 이것이 `[ASSUMPTION]`이며, PRD UJ-1은 "이미 열람 중"인 상태부터 시작해 진입 경로를 명시하지 않으므로 관리자 화면과 대칭되는 패턴을 그대로 적용한 것이다.

### 라우트 구조

`/operator/ceremonies/[hallId]/[ceremonyId]` — `/admin/ceremonies/[hallId]/[ceremonyId]`와 동일한 이유(AD-2, `ceremonyId`만으로는 홀 스코프 조회가 불가능)로 `hallId`를 포함한다. Route Handler도 동일 패턴: `/api/operator/ceremonies/[hallId]/[ceremonyId]`.

### 파일 구조

```
apps/web/
  lib/
    auth-guard.ts                                  # MODIFY — requireSession() 추가
    services/
      checklist-instance.ts                        # MODIFY — getOperatorInstanceView 추가
    operator/
      checklist-cache.ts                            # NEW — localStorage 순수 함수
  app/
    api/operator/ceremonies/[hallId]/[ceremonyId]/
      route.ts                                      # NEW — 60초 폴링용 GET
    operator/
      page.tsx                                      # MODIFY — 오늘 예식 목록
      layout.tsx                                    # MODIFY — 체크리스트 nav 링크화
      ceremonies/[hallId]/[ceremonyId]/
        page.tsx                                    # NEW — Server Component, 초기 데이터
        checklist-instance-view.tsx                  # NEW — Client Component, 캐시+폴링+POS Tile
        checklist-instance-view.css                  # NEW
  tests/
    services/
      checklist-instance.test.ts                    # MODIFY — getOperatorInstanceView 테스트 추가
    lib/
      checklist-cache.test.tsx                        # NEW (jsdom 필요 — window.localStorage)
    components/
      checklist-instance-view.test.tsx                # NEW
```

### 테스트 요구사항

- `tests/helpers/db.ts`의 `resetDb()`/`createTestHall()`/`createTestTemplateItem()`을 그대로 재사용. 예식 생성은 `ceremonyRepo.create()`(Story 2.1/2.2 테스트에 쓰인 패턴)로 인스턴스까지 함께 만든다.
- 컴포넌트 테스트는 `tests/lib/video-upload-polling.test.ts` + `tests/components/video-upload.test.tsx`(Story 1.4)의 `vi.useFakeTimers()` + `fetch` mock 패턴을 그대로 재사용할 것 — 이미 이 저장소에 폴링 테스트 선례가 있다.
- **`checklist-cache.test.tsx` 확장자는 `.tsx`로 고정한다(확인 완료, `vitest.config.ts` 참고).** `vitest.config.ts`는 `*.test.ts` → node 환경(`window` 전역 자체가 없음), `*.test.tsx` → jsdom 환경(`window.localStorage` 사용 가능)으로 나뉜다. `lib/operator/checklist-cache.ts`는 `window.localStorage`를 직접 쓰므로 테스트 파일이 node 환경에서 돌면 `window is not defined`로 즉시 실패한다 — JSX가 없어도 파일명은 반드시 `.test.tsx`로 만들 것.

### Previous Story Intelligence (Story 2.1/2.2에서 이어지는 교훈)

- **AD-2 hallId 우선 인자 규칙은 예외 없이 반복 적용.** 이번엔 읽기 전용 조회뿐이라 2-hop 재검증(Story 1.4/2.2)까지는 필요 없다 — 단일 hallId로 두 리포지토리를 스코프 조회하는 정도로 충분(쓰기가 없으므로 "다른 홀 항목을 몰래 추가"할 방법 자체가 없음).
- **UUID 형식 검증은 모든 새 엔드포인트에서 습관적으로.** 이번이 네 번째 반복(Story 1.3 → 1.4 → 2.1/2.2 → 2.3).
- **폴링 UI는 이미 이 저장소에 선례가 있다(Story 1.4 `waitForVideoUpdate`).** 완전히 새로 설계하지 말고 그 테스트 패턴(가짜 타이머, fetch mock, 성공/실패 분기)을 그대로 재사용할 것.
- **jsonb `.$type<>()` 누락처럼, 새 코드가 실제로 값을 다루기 시작해야 tsc가 타입 갭을 잡아낸다(Story 2.2 교훈).** 이번 스토리엔 새 jsonb 컬럼이 없지만, `ChecklistInstanceItem`/`Ceremony` 타입을 그대로 JSON 직렬화해 Route Handler로 보낼 때 `Date` 필드(`ceremonyAt`, `createdAt` 등)가 `JSON.stringify`를 거치며 문자열이 된다는 점을 클라이언트 타입에서 놓치지 않을 것(서버 타입과 클라이언트가 받는 타입이 다르다 — `Date` vs `string`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3: 오퍼레이터의 체크리스트 인스턴스 열람 (오프라인 캐시)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-5] — 오프라인 캐시 규칙 원문(§71-77).
- [Source: apps/web/lib/services/checklist-instance.ts] — `getCeremonyDetail`, `ChecklistInstanceValidationError`, `requireInstance`(Story 2.2 산출물, 그대로 재사용).
- [Source: apps/web/lib/db/repositories/checklist-instance.ts#listItems] — 홀 스코프 조회 패턴.
- [Source: apps/web/lib/services/ceremony.ts#listTodaysCeremonies] — 홀 교차 오늘 예식 목록(Story 2.1 산출물, 오퍼레이터 홈에 그대로 재사용).
- [Source: apps/web/app/api/templates/[hallId]/items/[itemId]/video/status/route.ts] — 인증 가드+`isValidUuid`+JSON 에러 봉투를 쓰는 기존 Route Handler 패턴(Story 1.4).
- [Source: apps/web/tests/lib/video-upload-polling.test.ts, apps/web/tests/components/video-upload.test.tsx] — 가짜 타이머 기반 폴링 테스트 선례(Story 1.4).
- [Source: apps/web/app/operator/layout.tsx, apps/web/app/operator/page.tsx] — 현재 플레이스홀더 상태.
- [Source: DESIGN.md §4 체크리스트 항목 타일, §14 States, §15 Motion & Easing] — POS Tile 스펙, 오프라인 배너 톤, motion-instant 규칙.

## Dev Agent Record

### Agent Model Used

Amelia (claude-sonnet-5)

### Debug Log References

- **테스트 순서 함정 재확인(Story 2.2와 동일 클래스):** `getOperatorInstanceView` 테스트를 처음 작성할 때 템플릿 항목을 예식보다 나중에 만들어 인스턴스가 빈 채로 나왔다 — Story 2.2의 CTE는 예식 생성 시점에 존재하는 템플릿 항목만 스냅샷 복사하므로, 순서를 (템플릿 항목 생성 → 예식 생성)으로 바꿔 해결.
- **`vi.advanceTimersByTimeAsync` + fake timers + React 상태 업데이트 조합에서 `findByRole`이 타임아웃:** 컴포넌트 테스트에서 `setInterval` 콜백이 비동기로 state를 갱신하는데, 이 갱신을 `act(async () => { await vi.advanceTimersByTimeAsync(60_000); })`로 감싸지 않으면 "not wrapped in act" 경고와 함께 `findByRole`의 내부 폴링(실제 타이머 기반)이 가짜 타이머에 걸려 5초 실제 타임아웃이 났다 — `act()`로 감싸고 이후 동기 `getByRole`을 쓰는 것으로 해결(Story 1.4의 폴링 테스트는 컴포넌트가 아니라 순수 함수를 테스트해 이 문제를 겪지 않았다는 차이를 확인).
- **AD-5 "mount 시 재검증 fetch" 문구를 문자 그대로 구현하지 않은 설계 결정:** Server Component(SSR)가 이미 최신 데이터를 가져오므로 클라이언트 mount 시 중복 fetch를 보내지 않고, 대신 SSR 데이터를 즉시 localStorage에 write-through한 뒤 60초 인터벌부터 폴링을 시작하도록 구현(스토리 Dev Notes에 이 설계 판단과 그 근거를 미리 기록해둠).

**코덱스 리뷰 1차(PR #10) — 1건 실결함, 수정·확인 완료:**
- **[P2] tablet 768~1024px 레이아웃에서 하단 내비가 뷰포트 밖으로 밀림.** `.operator-content`에 `height: 100dvh`를 직접 주면, 부모 `.operator-shell`(operator-nav.css, `min-height: 100dvh` 플렉스 컨테이너)의 실제 높이가 `.operator-content`의 100dvh + sibling `.operator-nav`의 높이만큼 뷰포트를 넘쳐버려, "항상 보이는" 하단 내비가 화면 밖으로 밀리고 페이지 전체가 스크롤되는 문제였다(AC 4 "고정 레이아웃" 의도와 정반대). `.operator-shell`을 이 breakpoint에서 `height: 100dvh`로 고정하고, `.operator-content`는 기존에 이미 상속받던 `flex: 1`로 남은 공간만 차지하도록 수정(불필요한 `height` 재선언 제거).

**코덱스 리뷰 2차(PR #10) — 2건 실결함, 수정·회귀 테스트 추가 후 확인:**
- **[P2] 폴링의 모든 실패를 "오프라인"으로 뭉뚱그림.** `!res.ok`(401/404/500 등 실제 서버 응답)를 네트워크 연결 실패(fetch가 throw하는 경우)와 같은 catch 블록에서 처리하고 있었다 — 세션 만료나 서버 오류에도 "오프라인"이라 말하며 낡은/이미 접근 권한이 없는 캐시 데이터를 계속 보여주는 정직하지 않은 상태였다. `fetch()` 자체의 throw(진짜 연결 실패)만 오프라인 폴백(캐시+배너)으로 처리하도록 분리하고, `res.ok`가 false인 경우는 별도 처리: 401은 즉시 `/login`으로 리다이렉트(세션이 실제로 끊겼으므로 캐시를 보여주는 것 자체가 위험), 그 외(404/500 등)는 캐시로 되돌아가지 않고 마지막 화면을 유지한 채 오프라인 배너와 다른 별도의 오류 문구(`hasError`)만 표시.
- **[P2] `readCache`가 문법적으로 유효하지만 셰이프가 다른 JSON을 그대로 반환.** 예: 이전 앱 버전이 남긴 `{}` — `ceremony`/`items`가 `undefined`인 채로 다음 렌더에서 크래시할 수 있었다. `isValidCachedShape()`로 `ceremony.id`/`ceremony.ceremonyAt`가 문자열인지, `items`가 배열인지 런타임 검증 후 셰이프가 안 맞으면 `null`을 반환하도록 수정.
- **테스트 작성 중 발견한 부수 문제(둘 다 검증 스크립트 자체의 버그, 코드 버그 아님):** `vi.spyOn(window.navigator, "onLine", "get")`로 만든 스파이가 `vi.unstubAllGlobals()`로는 정리되지 않아 다음 테스트로 값이 새어나갔다(이전 테스트가 `onLine=false`로 남겨두면 이후 테스트가 전부 오프라인 분기로 잘못 빠짐) — `afterEach`에 `vi.restoreAllMocks()`를 추가해 해결.

**코덱스 리뷰 3차(PR #10) — 2건 실결함, 수정·로컬 서버 실제 확인 후 확인:**
- **[P2] 세션 만료가 401이 아니라 500으로 응답됨.** 2차 수정에서 클라이언트에 `res.status === 401` 리다이렉트 분기를 추가했지만, Route Handler의 `requireSession()`은 그냥 throw하고 있어 Next.js 기본 에러 핸들링이 이를 500으로 바꿔버렸다 — 그 결과 401 분기가 실행될 수 없는 죽은 코드였고, 세션이 끊긴 오퍼레이터는 "새로고침 실패" 오류만 보며 로그인 화면으로 가지 못했다. `requireSession()` 호출을 try/catch로 감싸 인증 실패를 명시적으로 401 JSON 응답으로 반환하도록 수정. 로컬 서버에 실제 미인증 요청을 보내 401을 반환함을 확인.
- **[P2] 폴링 라우트가 비활성 홀 검증을 건너뜀.** `page.tsx`(최초 로드)는 `hall.isActive`를 확인해 `notFound()`로 막는데, 폴링 라우트는 이 검증이 없어 홀이 비활성화된 뒤에도 계속 데이터를 내려주거나 다른 비활성 홀의 예식을 직접 조회당할 수 있었다. `hallRepo.findById` + `isActive` 검증을 라우트에도 동일하게 추가(404 반환). 로컬 서버에서 홀을 실제로 비활성화한 뒤 폴링 라우트가 404를 반환함을 확인, 원상복구 후 재확인.

### Completion Notes List

- AC 1: POS Tile 마크업(`checklist-tile`/`checklist-tile-grid`)이 실제 SSR HTML에 렌더링됨을 로컬 서버 HTTP 응답으로 확인. 탭 시 0ms 즉시 선택 상태 반영(트랜지션 없는 CSS)은 컴포넌트 테스트로 자동화 검증.
- AC 2: `getOperatorInstanceView`/폴링 API/오프라인 캐시(`checklist-cache.ts`) 전부 자동화 테스트로 검증. 실제 브라우저 오프라인 토글은 이 세션에 브라우저 조작 도구가 없어 수행하지 못함(Dev Notes 및 Task 9에 한계로 명시) — `navigator.onLine=false` 모킹 + fetch 실패 모킹으로 동일한 코드 경로를 커버.
- AC 3: 클라이언트 폴링 배선(성공/실패 분기)은 컴포넌트 테스트로, 실제 데이터 반영 경로(관리자 쪽 변경 → 오퍼레이터 폴링 API 응답)는 로컬 서버에 대한 실제 DB 변경 + HTTP 재호출로 검증(항목 1개→2개 반영 확인 후 원상복구).
- AC 4: `checklist-instance-view.css`의 tablet 768~1024px 미디어 쿼리로 구현. 실제 브라우저 리사이즈 확인은 도구 제약으로 수행하지 못함(코드 리뷰로 대체).
- `getOperatorInstanceView`는 `getCeremonyDetail`과 일부 리포지토리 호출을 공유하지만 억지로 통합하지 않음(Dev Notes에 근거 기록) — 60초 폴링에 불필요한 `listCandidateTemplateItems` 쿼리를 추가하지 않기 위함.
- "체크" 상태는 스키마에 없는 대로 서버에 저장하지 않고 순수 클라이언트 로컬 상태로만 구현(Dev Notes "스코프 경계" 그대로 준수).
- `npm run test`(54개 전체 통과), `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린.

### File List

- `apps/web/lib/auth-guard.ts` (MODIFY) — `requireSession()` 추가
- `apps/web/lib/services/checklist-instance.ts` (MODIFY) — `getOperatorInstanceView` 추가
- `apps/web/lib/operator/checklist-cache.ts` (NEW)
- `apps/web/app/api/operator/ceremonies/[hallId]/[ceremonyId]/route.ts` (NEW)
- `apps/web/app/operator/page.tsx` (MODIFY) — 오늘 예식 목록으로 교체
- `apps/web/app/operator/operator-home.css` (NEW)
- `apps/web/app/operator/layout.tsx` (MODIFY) — 체크리스트 nav 링크화
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/page.tsx` (NEW)
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.tsx` (NEW)
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.css` (NEW)
- `apps/web/tests/services/checklist-instance.test.ts` (MODIFY) — `getOperatorInstanceView` 테스트 3건 추가
- `apps/web/tests/lib/checklist-cache.test.tsx` (NEW)
- `apps/web/tests/components/checklist-instance-view.test.tsx` (NEW)

## Change Log

- 2026-07-27: Story 구현 완료. AC 1~4 중 서버/데이터 경로(AC 1 마크업, AC 2 캐시 로직, AC 3 데이터 반영)는 자동화 테스트(vitest, 신규 11건) + 로컬 서버 실제 HTTP 요청 + DB 직접 조작으로 검증. AC 2/4의 실제 브라우저 동작(오프라인 토글, 태블릿 리사이즈)은 이 세션에 브라우저 도구가 없어 컴포넌트 테스트 모킹 + CSS 코드 리뷰로 대체 검증했으며, 이 한계를 스토리 파일에 명시했다.
