---
baseline_commit: cba03ddabace1e08d8775302ebb6c13bfb8dadc5
---

# Story 2.3: 오퍼레이터의 체크리스트 인스턴스 열람 (오프라인 캐시)

Status: ready-for-dev

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

- [ ] Task 1: 인증 가드 보강 — `lib/auth-guard.ts` (선행 작업, 신규 Route Handler가 필요)
  - [ ] `requireSession()` 추가: 세션 없으면 throw(패턴은 `requireAdminSession`과 동일하되 role 체크 없음 — operator/admin 둘 다 통과). `app/api/templates/.../video/status/route.ts`가 `requireAdminSession()`을 가드 없이 호출하고 Next.js 기본 에러 핸들링에 맡기는 기존 패턴을 그대로 따른다.

- [ ] Task 2: 오퍼레이터 전용 조회 서비스 — `lib/services/checklist-instance.ts` (MODIFY, AC: 1, 2, 3)
  - [ ] `getOperatorInstanceView(hallId, ceremonyId)` 추가: `ceremonyRepo.findById` + `instanceRepo.findByCeremony` + `instanceRepo.listItems`만 호출(기존 `getCeremonyDetail`과 달리 `listCandidateTemplateItems` 호출 안 함 — 오퍼레이터는 후보 목록이 필요 없고, 이 함수가 60초마다 폴링되므로 불필요한 쿼리를 추가하지 않는다). 반환 타입 `{ ceremony: Ceremony; items: ChecklistInstanceItem[] }`. 예식/인스턴스 미존재 시 기존 `ChecklistInstanceValidationError` 그대로 재사용.

- [ ] Task 3: 재검증용 Route Handler — `app/api/operator/ceremonies/[hallId]/[ceremonyId]/route.ts` (NEW, AC: 3)
  - [ ] `GET`: `requireSession()` → `isValidUuid(hallId)`/`isValidUuid(ceremonyId)` 검증 실패 시 `{ error: { code: "invalid_id", message } }` 400 → `getOperatorInstanceView` 호출 → `ChecklistInstanceValidationError`면 `{ error: { code: "not_found", message } }` 404 → 성공 시 `{ ceremony, items }` JSON 200.
  - [ ] 이 라우트는 클라이언트의 60초 폴링 전용이다 — 최초 로드는 Task 5의 Server Component가 서비스 함수를 직접 호출한다(같은 요청을 두 번 만들지 않는다).

- [ ] Task 4: 오프라인 캐시 순수 함수 — `lib/operator/checklist-cache.ts` (NEW, AC: 2)
  - [ ] `readCache(ceremonyId)` / `writeCache(ceremonyId, data)`: `window.localStorage` 키 `wedding-check:operator-checklist:${ceremonyId}`. `JSON.parse` 실패, `localStorage` 접근 불가(시크릿 모드 등)는 전부 `try/catch`로 조용히 무시하고 `null` 반환 또는 아무 것도 하지 않음 — 캐시 실패가 화면 자체를 깨뜨려서는 안 된다(DESIGN.md §14 오프라인 배너 계약과 동일한 원칙).
  - [ ] 순수 함수로 분리해 jsdom 없이도(또는 jsdom `localStorage` mock으로) 단위 테스트 가능하게 만든다.

- [ ] Task 5: 오퍼레이터 홈 — 오늘 예식 목록 — `app/operator/page.tsx` (MODIFY, AC 없음 — 2번 AC들의 진입점)
  - [ ] 현재 플레이스홀더 텍스트를 `listTodaysCeremonies()`(Story 2.1에서 이미 구현된 홀 전체 교차 조회, 그대로 재사용) 결과로 교체. 각 예식을 `/operator/ceremonies/${hallId}/${ceremonyId}`로 링크.
  - [ ] 빈 상태: 오늘 예식이 없으면 `#888888` 톤 안내 문구만(DESIGN.md §14 "Empty (오늘 등록된 예식 없음)" — 오퍼레이터는 예식을 등록할 수 없으므로 CTA 없음, 관리자 화면과 다름).

- [ ] Task 6: 체크리스트 인스턴스 조회 화면 — `app/operator/ceremonies/[hallId]/[ceremonyId]/` (NEW, AC: 1, 2, 3, 4)
  - [ ] `page.tsx`: Server Component. `isValidUuid` 실패 시 `notFound()`(admin 상세 페이지와 동일 패턴). `getOperatorInstanceView` 직접 호출해 초기 데이터를 서버에서 가져온 뒤 Client Component에 props로 전달(중복 요청 없음 — Task 3 라우트는 이후 60초 폴링 전용).
  - [ ] `checklist-instance-view.tsx`: Client Component(`"use client"`).
    - 초기 렌더는 서버에서 받은 props를 그대로 사용(이것이 AD-5의 "최초 로드").
    - mount 시 `writeCache`로 서버에서 받은 데이터를 즉시 캐시에 기록(write-through) — 이후 곧 오프라인이 되어도 이미 렌더 중인 데이터를 잃지 않기 위함.
    - `setInterval` 60초마다 Task 3 라우트를 `fetch`로 호출: 성공하면 state + 캐시 갱신(`motion-instant` = 트랜지션 없이 즉시 교체), 실패(네트워크 에러 또는 `navigator.onLine === false`)하면 기존 state 유지 + 오프라인 배너 노출.
    - 언마운트 시 `clearInterval`.
    - 각 항목은 POS Tile(§4.1 참고, ≥44px)로 렌더링, 탭 시 `useState<Set<string>>` 기반 로컬 선택 상태 토글(서버 저장 없음 — 스키마에 "완료" 필드가 없다, Dev Notes "스코프 경계" 참고). 선택 시 CSS 클래스만 즉시 바뀌고 트랜지션 없음(motion-instant).
  - [ ] `checklist-instance-view.css`: POS Tile 스타일 + tablet 768~1024px 고정 레이아웃(AC 4) + 오프라인 배너.

- [ ] Task 7: 오퍼레이터 내비 정리 — `app/operator/layout.tsx` (MODIFY, 최소 변경)
  - [ ] "체크리스트" nav 항목을 placeholder에서 `/operator`로의 실제 `Link`로 전환(질의/피드백은 Epic 3 범위이므로 placeholder 그대로 유지).

- [ ] Task 8: 테스트 (AC: 1, 2, 3, 4)
  - [ ] `tests/services/checklist-instance.test.ts`(기존 파일에 추가): `getOperatorInstanceView` — 정상 조회(ceremony+items 반환), 존재하지 않는 ceremonyId 거부, 다른 홀 hallId로 조회 시 거부(AD-2 격리).
  - [ ] `tests/lib/checklist-cache.test.tsx`(신규 — 확장자 주의, 아래 "테스트 요구사항" 참고): `readCache`/`writeCache` — 정상 왕복, 손상된 JSON 처리, 존재하지 않는 키 처리.
  - [ ] `tests/components/checklist-instance-view.test.tsx`(신규, jsdom): 탭 시 선택 상태 클래스 즉시 반영, `navigator.onLine=false` 또는 fetch 실패 시 캐시 데이터가 유지되고 오프라인 배너가 뜨는지(`vi.useFakeTimers()`로 60초 인터벌 강제 진행 — Story 1.4 `video-upload-polling.test.ts`의 폴링 테스트 패턴 재사용).
  - [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [ ] Task 9: 수동 검증
  - [ ] 로컬 서버에서 오퍼레이터 계정으로 로그인 → `/operator` → 오늘 예식 목록에서 하나 선택 → 항목이 POS Tile로 보이는지, 탭 시 즉시 선택 상태가 반영되는지 확인(AC 1).
  - [ ] 브라우저 DevTools Network 탭에서 오프라인 모드로 전환 → 화면이 깨지지 않고 마지막으로 로드된 항목이 계속 보이는지, 오프라인 배너가 뜨는지 확인(AC 2). 다시 온라인으로 전환 → 배너가 사라지는지 확인.
  - [ ] Story 2.2의 관리자 상세 페이지에서 항목을 하나 추가/제외 → 오퍼레이터 화면을 새로고침하지 않고 60초(또는 테스트를 위해 임시로 인터벌을 단축) 대기 → 변경이 반영되는지 확인(AC 3).
  - [ ] 브라우저 창을 768~1024px 폭으로 리사이즈해 레이아웃이 고정 체크리스트+하단 내비 구조를 유지하는지 확인(AC 4).

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

_TBD_

### Debug Log References

_TBD_

### Completion Notes List

_TBD_

### File List

_TBD_

## Change Log

_TBD_
