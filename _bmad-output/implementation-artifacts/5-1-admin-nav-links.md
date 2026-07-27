---
baseline_commit: 2fce15590c8dca27c21e9dc525fa5c42a9da6781
---

# Story 5.1: 어드민 내비게이션 홀·템플릿 링크 연결

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 상단 내비게이션에서 홀 관리와 템플릿 관리 화면으로 바로 이동할 수 있기를,
so that URL을 직접 입력하지 않고도 홀/체크리스트 템플릿을 관리할 수 있다.

## Acceptance Criteria

1. **Given** 관리자로 로그인한 상태에서 **When** 상단 내비게이션을 확인하면 **Then** "홀" 링크가 있고 클릭하면 `/admin/halls`로 이동한다.
2. **Given** 관리자로 로그인한 상태에서 **When** 상단 내비게이션의 "템플릿" 링크를 클릭하면 **Then** 홀 목록 화면(`/admin/halls`)으로 이동한다(템플릿은 홀에 종속된 엔티티라 홀을 먼저 골라야 함 — 현재 홀 목록 각 행에 이미 "템플릿 관리" 버튼이 `/admin/templates/[hallId]`로 연결되어 있음, `hall-row.tsx:25`).
3. **Given** "인사이트"(Epic 4, 아직 backlog)처럼 아직 구현되지 않은 내비 항목이 있을 때 **When** 내비게이션을 렌더링하면 **Then** 그 항목만 계속 비활성 placeholder로 남고, "홀"/"템플릿"/"예식" 등 구현된 항목의 클릭 가능 여부에는 영향을 주지 않는다.

## Tasks / Subtasks

- [x] Task 1: 어드민 내비게이션 링크 배선 — `apps/web/app/admin/layout.tsx` (MODIFY, AC: 1, 2, 3)
  - [x] "템플릿" `<span className="admin-nav__link admin-nav__link--placeholder">템플릿</span>`(현재 25번째 줄)을 `<Link href="/admin/halls" className="admin-nav__link">`로 교체.
  - [x] "홀" 링크를 새로 추가한다: "템플릿" 링크 앞 또는 뒤 어디든, `<Link href="/admin/halls" className="admin-nav__link">홀</Link>`. 두 항목("홀", "템플릿")이 같은 목적지(`/admin/halls`)로 가는 것은 의도된 것이다 — 템플릿이 홀에 종속된 엔티티라 별도의 "템플릿 전용" 화면이 없기 때문(Dev Notes 참고).
  - [x] "인사이트" placeholder(`<span className="admin-nav__link admin-nav__link--placeholder">인사이트</span>`)는 그대로 둔다 — Epic 4가 아직 backlog이므로 이 스토리 범위 밖.
  - [x] 기존 "예식" `<Link>`와 우측 "새 예식 등록" CTA는 변경하지 않는다.

- [x] Task 2: 현재 위치 표시(선택 사항이지만 권장) — 생략함(Completion Notes 참고)

- [x] Task 3: 테스트 (AC: 1, 2, 3)
  - [x] 기존 컴포넌트/서비스 테스트 인프라 확인 — admin layout을 렌더링하거나 placeholder 텍스트를 assert하는 기존 테스트 없음(확인됨, 갱신 불필요).
  - [x] `npm run test`(63 passed), `npx tsc --noEmit`(clean), `npm run lint`(clean), `npm run build`(clean, `/admin/halls` 라우트 정상 포함) 전부 클린 확인.

- [x] Task 4: 수동 검증
  - [x] 로컬 서버에서 관리자 계정(01000000001/changeme123!)으로 `/api/auth/sign-in/phone-number` 실제 로그인 → `GET /admin/ceremonies` SSR HTML의 `<nav class="admin-nav__links">`를 확인 → "홀"/"템플릿" 둘 다 `<a href="/admin/halls">`로 렌더링됨을 직접 확인.
  - [x] `GET /admin/halls` → 200, 응답 HTML에 기존 "템플릿 관리" 버튼 텍스트가 여전히 존재함을 확인(회귀 없음).
  - [x] "인사이트"는 여전히 `<span class="admin-nav__link admin-nav__link--placeholder">`로 렌더링됨을 같은 HTML에서 확인.

## Dev Notes

### 배경 — 왜 이 스토리가 필요한가

Epic 1(홀·템플릿 관리)과 Epic 2(예식 등록)는 sprint-status.yaml상 "done"이지만, 실제 배포된 화면을 대표가 점검한 결과 어드민 내비게이션에서 홀 관리(`/admin/halls`)와 템플릿 관리(`/admin/templates/[hallId]`) 화면에 도달할 UI 경로가 전혀 없었다. 페이지 자체(`apps/web/app/admin/halls/page.tsx`, `apps/web/app/admin/templates/[hallId]/page.tsx`)와 홀 행의 "템플릿 관리" 버튼(`apps/web/app/admin/halls/hall-row.tsx:25`, `href={/admin/templates/${hall.id}}`)은 Story 1.2·1.3에서 이미 정상 구현되어 있다 — 유일한 문제는 `apps/web/app/admin/layout.tsx`의 상단 내비게이션이 "템플릿"을 클릭 불가능한 `<span>` placeholder로만 렌더링하고 "홀" 항목 자체가 아예 없었다는 것이다(1.2/1.3 스토리의 AC 어디에도 "내비게이션에 링크가 있어야 한다"는 조건이 없어 구현 시 빠진 것으로 보인다).

### 현재 코드 상태 (읽고 시작할 것)

`apps/web/app/admin/layout.tsx` 현재 전체 내용(23줄 nav 블록):
```tsx
<nav className="admin-nav__links">
  <span className="admin-nav__link admin-nav__link--placeholder">템플릿</span>
  <Link href="/admin/ceremonies" className="admin-nav__link">
    예식
  </Link>
  <span className="admin-nav__link admin-nav__link--placeholder">인사이트</span>
</nav>
```
`AdminLayout`은 `async function` Server Component이며 세션 체크(`auth.api.getSession`) 후 `role !== "admin"`이면 `redirect("/login")`한다 — Client Component로 바꾸지 말 것(Task 2가 필요하면 링크 목록만 별도 컴포넌트로 분리).

`apps/web/app/admin/halls/page.tsx`(Story 1.2)와 `apps/web/app/admin/templates/[hallId]/page.tsx`(Story 1.3)는 이미 정상 동작하며 이 스토리에서 수정하지 않는다.

### 아키텍처 준수사항

- **AD-3:** 이 스토리는 권한 로직을 건드리지 않는다. `AdminLayout`의 기존 role 체크(`session.user.role !== "admin"` → `/login` redirect)는 그대로 둔다.
- 새 Server Action, Route Handler, DB 접근이 전혀 없는 순수 UI 배선 스토리다 — `lib/services/*`, `lib/db/repositories/*` 어느 것도 건드리지 않는다.
- DESIGN.md §4 Navigation: 관리자 내비는 "템플릿/예식/인사이트 내비, 오렌지-레드 새 예식 등록 CTA 우측" — 이 스토리는 "홀" 항목을 추가로 넣지만 DESIGN.md 원문 스펙에는 명시되지 않은 항목이다. 템플릿이 홀에 종속되는 실제 데이터 모델(AD-2) 때문에 발생한 실무적 추가이며, DESIGN.md 위반이 아니라 보완으로 간주한다(색상/타이포/스페이싱은 기존 `.admin-nav__link` 클래스를 그대로 재사용하므로 토큰 이탈 없음).

### 스코프 경계 — 하지 말 것

- "템플릿 전용 인덱스" 페이지(홀 선택 없이 전체 템플릿을 한 화면에 모아보는 화면)를 새로 만들지 않는다 — `[ASSUMPTION]` 홀이 2~3개 수준인 이 제품 규모에서는 과설계로 판단했다. 홀이 늘어나 실제로 불편해지면 별도 스토리로 다룬다.
- "인사이트" 내비 항목을 이 스토리에서 연결하지 않는다 — Epic 4(반복 패턴 인사이트)가 아직 backlog이며 해당 화면 자체가 없다.
- Story 5.2(예식 목록 캘린더/페이지네이션), Story 5.3(신랑신부 이름), Story 5.4(회원 관리)는 각각 별도 스토리다 — 이 스토리에서 손대지 않는다.

### 테스트 요구사항

이 저장소는 vitest 이중 environment(`.test.ts` = node, `.test.tsx` = jsdom)를 쓴다(`vitest.config.ts`). 이 스토리는 신규 로직이 없어(정적 링크 교체) 새 유닛 테스트를 강제하지 않지만, 기존 테스트 스위트 전체가 여전히 통과해야 한다(`npm run test`). admin layout을 다루는 기존 테스트가 있는지 `apps/web/tests/` 하위를 먼저 확인할 것.

### 프로젝트 컨텍스트 참고

- `_bmad-output/planning-artifacts/epics.md` Epic 5 섹션(Story 5.1) — 이 스토리의 원본 AC.
- 이전 스토리 파이프라인 관례(sprint-status.yaml `git_pipeline` 참고): 스토리 브랜치 → 단계별 커밋 → `gh pr create` → `codex review --base main` → 실결함 수정 반복 → `gh pr merge --merge --delete-branch` → `gh run watch <run-id> --exit-status`로 main CI 그린 확인 → sprint-status.yaml 갱신.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 5, Story 5.1
- `apps/web/app/admin/layout.tsx`, `apps/web/app/admin/halls/hall-row.tsx`

### Agent Model Used

(dev-story 실행 시 기록)

### Debug Log References

없음(구현 중 예상치 못한 오류 없음).

### Completion Notes List

- Task 2(현재 위치 표시)는 의도적으로 생략함 — AC에 없는 UX 다듬기 항목이고, 이 스토리의 핵심(내비게이션 배선 자체가 없던 문제)과 무관한 별도 스코프라 과설계 방지 원칙에 따라 뺐다. 필요해지면 별도 스토리로.
- "홀"과 "템플릿" 두 내비 항목이 동일한 목적지(`/admin/halls`)로 연결된다 — 의도된 설계다(Dev Notes 참고, 템플릿이 홀에 종속된 엔티티라 별도 인덱스 화면이 없음).
- SSR HTML 직접 확인(curl + 로그인 쿠키)으로 AC 1~3을 모두 검증했다 — 실제 브라우저 클릭 조작 도구는 이 세션에 없어 대체 검증.

### File List

- `apps/web/app/admin/layout.tsx` (MODIFY)

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story, Epic 5 프로토타입 리뷰 후속 4건 중 1번째).
- 2026-07-27: 구현 완료 (dev-story) — 어드민 내비게이션에 "홀"/"템플릿" 실링크 추가, 테스트/빌드/수동 검증 전부 클린. Status → review.
