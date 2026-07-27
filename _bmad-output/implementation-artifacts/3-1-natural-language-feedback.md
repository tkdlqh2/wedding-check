---
baseline_commit: 654950f1422bb8cf37338450aaca2345fe8ffd33
---

# Story 3.1: 자연어 피드백 입력

Status: ready-for-dev

## Story

As a 오퍼레이터,
I want 예식 종료 후 자유 텍스트로 있었던 일을 그대로 남길 수 있기를,
so that 정해진 폼을 채우는 부담 없이 겪은 변수 상황을 기록할 수 있다.

## Acceptance Criteria

1. **Given** 예식이 종료된 후 **When** 예식/단계를 선택하고 자유 텍스트 하나만 입력해 저장하면 **Then** 피드백이 저장된다(정해진 폼 필드 없음).
2. **Given** 입력을 완료하지 않고 화면을 나가면 **When** 나중에 다시 열면 **Then** 임시 저장(draft) 상태로 이어 쓸 수 있다.
3. **Given** 서술창을 열었을 때 **When** placeholder를 확인하면 **Then** "있었던 일을 그대로 적으세요" 톤의 여러 줄 textarea가 폼처럼 보이지 않게 표시된다(UX-DR5, DESIGN.md §10).
4. **Given** 피드백을 저장할 때 **When** 스키마를 확인하면 **Then** 개인 실명 필드가 존재하지 않는다(NFR-5).

## Tasks / Subtasks

- [x] Task 1: `feedback` 테이블 스키마 + 마이그레이션 (AC: 1, 2, 4)
  - [x] `apps/web/lib/db/schema.ts`에 `feedback` 테이블 추가(스파인 Naming 컨벤션 — 테이블명은 `feedback` 단수, `variable_cases`와 짝):
    - `id uuid pk defaultRandom`
    - `hallId uuid notNull references halls.id` — AD-6에 따라 격리용이 아니라 **표시용 태그**로 ceremony에서 데이만 저장(checklist_instances/demo_videos와 동일한 "JOIN 대체 금지" 원칙 적용, 이 스토리에서 직접 조회 필터로는 안 쓰지만 3.2/3.4의 홀 태그 표시를 위해 지금 저장해둔다).
    - `ceremonyId uuid notNull references ceremonies.id` — 예식 삭제 기능이 없는 엔티티라 onDelete 정책 불필요.
    - `templateItemId uuid references checklistTemplateItems.id, { onDelete: "set null" }` — 단계로의 소프트 참조(checklist_instance_items.templateItemId와 동일 패턴, 단계 하드 삭제(Story 1.3 정책) 이후에도 피드백 행은 남는다).
    - `stepName text notNull` — 저장 시점 단계명 스냅샷(단계가 이후 삭제/개명돼도 피드백엔 원래 맥락이 남는다, checklist_instance_items와 동일 이유).
    - `content text notNull default ''` — 자유 서술 원문.
    - `status text notNull default 'draft'` — AD-8: `'draft' | 'confirmed'` 두 값만, `user.role`처럼 pgEnum 대신 plain text + 앱 레이어 검증(이 프로젝트 기존 컨벤션). **이 스토리는 draft만 다룬다 — confirmed로의 전환(Story 3.2, FR-9)은 이 스토리 범위 밖이지만 컬럼은 AD-8이 요구하는 최종 스키마를 미리 갖춘다(3.2에서 별도 마이그레이션 불필요하게).**
    - `createdAt`/`updatedAt` timestamp — 다른 테이블과 동일 패턴(`defaultNow()`, `updatedAt`은 `$onUpdate`).
    - Unique 제약: `unique("feedback_ceremony_id_template_item_id_unique").on(table.ceremonyId, table.templateItemId)` — 예식 1건의 같은 단계에는 피드백이 최대 1건만 존재(재방문 시 "이어 쓰기"가 자연스럽게 같은 행을 가리키게 하는 핵심 불변조건). `templateItemId`가 NULL인 행끼리는 Postgres가 서로 다른 값으로 취급해 이 제약에 걸리지 않는다(checklist_instance_items와 동일한 이미 검증된 동작 — 드문 엣지케이스라 별도 방어 불필요).
  - [x] `npx drizzle-kit generate`로 마이그레이션 생성 시도 — 예상대로 인터랙티브 프롬프트(`promptColumnsConflicts`)가 떠서 비대화형 환경에서 실패(Story 5.4와 동일한 알려진 이슈). `0015_snapshot.json`을 베이스로 `feedback` 테이블 CREATE만 추가한 `0016_snapshot.json`을 직접 구성하고 대응하는 `0016_natural-language-feedback.sql`을 손으로 작성, `drizzle/meta/_journal.json`에 엔트리 추가. `npx drizzle-kit check`로 스냅샷 체인 정합성 확인(`Everything's fine`).
  - [x] `db:test:migrate` 스크립트는 "빈 DB만 대상"(증분 미지원, 스크립트 주석에 명시)이라 이미 0000~0015가 적용된 공유 테스트 DB에는 쓸 수 없었다 — `docker exec wedding-check-db psql`로 `0016_natural-language-feedback.sql` 단독 적용(테스트 DB `wedding_check_test`, 로컬 개발 DB `wedding_check` 둘 다) 후 `\dt`로 `feedback` 테이블 생성 확인.

- [ ] Task 2: 리포지토리 레이어 (AC: 1, 2)
  - [ ] `apps/web/lib/db/repositories/feedback.ts`(NEW):
    - `export type Feedback = typeof feedback.$inferSelect;`
    - `findByCeremonyAndStep(ceremonyId: string, templateItemId: string): Promise<Feedback | undefined>` — `db.query.feedback.findFirst({ where: and(eq(feedback.ceremonyId, ceremonyId), eq(feedback.templateItemId, templateItemId)) })` (member.ts::`findByPhoneNumber`와 동일한 단순 조회 패턴).
    - `create(input: { hallId, ceremonyId, templateItemId, stepName, content }): Promise<Feedback>` — `db.insert(feedback).values({ ...input, status: "draft" }).returning()`.
    - `updateContent(id: string, content: string): Promise<Feedback>` — `db.update(feedback).set({ content }).where(eq(feedback.id, id)).returning()` (updatedAt은 `$onUpdate`가 자동 처리).
    - 이 리포지토리에는 hallId 스코프 격리를 넣지 않는다(AD-2가 명시하는 홀 종속 엔티티 목록에 `feedback`은 없음 — AD-6에 따라 hallId는 표시 태그일 뿐). 대신 서비스 레이어가 `ceremonyRepo.findById(hallId, ceremonyId)`로 예식이 실제로 그 홀 소속인지 검증한다(아래 Task 3).

- [ ] Task 3: 서비스 레이어 (AC: 1, 2, 4)
  - [ ] `apps/web/lib/services/feedback.ts`(NEW):
    - `export class FeedbackValidationError extends Error {}`
    - `saveDraftFeedback(hallId: string, ceremonyId: string, templateItemId: string, content: string): Promise<Feedback>`:
      1. `ceremonyRepo.findById(hallId, ceremonyId)` — 없으면 `FeedbackValidationError("존재하지 않는 예식입니다")`.
      2. `templateItemRepo.findById(hallId, templateItemId)` — 없으면 `FeedbackValidationError("존재하지 않는 단계입니다")`(2-hop 재검증, `checklist-instance.ts::addInstanceItem`과 동일 원리 — hallId로 스코프된 두 조회가 모두 성공해야 두 엔티티가 같은 홀 소속임이 보장된다).
      3. `content.trim()` — 빈 문자열이면 `FeedbackValidationError("내용을 입력하세요")`.
      4. `feedbackRepo.findByCeremonyAndStep(ceremonyId, templateItemId)`로 기존 행 조회.
         - 없으면 `feedbackRepo.create(...)`.
         - 있고 `status === "draft"`이면 `feedbackRepo.updateContent(existing.id, trimmed)`.
         - 있고 `status === "confirmed"`이면 `FeedbackValidationError("이미 확정된 피드백은 수정할 수 없습니다")` — **이 스토리에서는 도달 불가능한 분기다(confirmed로 바꾸는 코드가 아직 없음, Story 3.2에서 생김). 그래도 스키마가 이미 status를 지원하므로 지금 막아둔다** — 나중에 3.2가 확정 기능을 추가했을 때 이 방어가 이미 있어야, 이 화면(피드백 재입력 패널)을 통해 확정된 피드백이 조용히 덮어써지는 안전 결함을 원천 차단한다.
    - `getDraftFeedback(hallId: string, ceremonyId: string, templateItemId: string): Promise<Feedback | undefined>`:
      1. `ceremonyRepo.findById(hallId, ceremonyId)` 없으면 `FeedbackValidationError`.
      2. `feedbackRepo.findByCeremonyAndStep(ceremonyId, templateItemId)` 반환(있으면 이어 쓰기용 프리필, 없으면 `undefined`).

- [ ] Task 4: Route Handler (AC: 1, 2)
  - [ ] `apps/web/app/api/feedback/[hallId]/[ceremonyId]/route.ts`(NEW) — 스파인 Structural Seed `api/feedback/` + Capability Map "FR-8/9 피드백·구조화 → api/feedback/route.ts"를 따른다. **주의:** FR-8(이 스토리)은 AI를 호출하지 않지만, 스파인이 FR-8/9를 같은 Route Handler 트리로 명시했으므로 Server Action이 아니라 Route Handler로 구현한다(관리자 CRUD와 다른 패턴 — Consistency Conventions 표 참고).
    - `GET`: 쿼리 파라미터 `templateItemId` 필수. `requireSession()`(operator/admin 둘 다 허용, AD-3 — 피드백 입력은 오퍼레이터 화면 기능). 세션 없으면 401(`app/api/operator/ceremonies/[hallId]/[ceremonyId]/route.ts`와 동일하게 명시적 401 JSON, throw로 500 새게 하지 않는다). hallId/ceremonyId `isValidUuid` 검증(400). `getDraftFeedback` 호출 → `{ feedback: result ?? null }`. `FeedbackValidationError`는 404(`{ error: { code: "not_found", message } }`).
    - `POST`: body `{ templateItemId: string, content: string }`. 나머지 가드는 GET과 동일. `saveDraftFeedback` 호출 → `{ feedback: result }`. `FeedbackValidationError`는 400(`{ error: { code: "invalid_input", message } }`) — 존재하지 않는 예식/단계는 404가 더 정확하지만, 이 라우트는 URL의 hallId/ceremonyId가 이미 페이지 진입 시점에 검증된 값이라 실무상 거의 항상 "빈 내용" 케이스만 발생한다. 코드 값으로 구분하고 싶으면 에러 메시지 매칭 대신 `FeedbackValidationError`에 `code` 필드를 추가해도 되지만 과설계이므로 하지 않는다 — 메시지를 그대로 노출해 400 하나로 통일.
    - API 오류 응답 형식은 스파인 Consistency Conventions의 `{ error: { code, message } }` 단일 봉투를 그대로 따른다.

- [ ] Task 5: 오퍼레이터 화면에 피드백 입력 UI 추가 (AC: 1, 2, 3)
  - [ ] `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.tsx` 수정: 각 단계 그룹(`<section className="checklist-step-group">`) 안, 체크리스트 타일 그리드 아래에 피드백 진입 UI를 추가한다. **[ASSUMPTION] 별도 페이지/폼 대신 각 단계 그룹에 인라인으로 붙인다** — URL이 이미 예식을 특정하고(`ceremonyId`), 그룹이 이미 단계를 특정하므로(`templateItemId`) "예식/단계 선택"(AC 1)이 화면 이동 없이 자연스럽게 충족된다(DESIGN.md 원칙 1 "헤매거나 긴 글을 읽게 하지 않는다"와 부합).
    - 그룹의 `templateItemId`(=groupKey, `item.templateItemId ?? item.stepName`로 널 가능)가 실제 uuid가 아니면(=원본 단계가 삭제된 뒤 스냅샷만 남은 드문 경우) 피드백 입력 UI를 렌더링하지 않는다 — 저장할 유효한 `templateItemId`가 없으므로.
    - 새 하위 컴포넌트(같은 파일 또는 `step-feedback.tsx` 신규 — 파일이 200줄을 넘기면 분리) `StepFeedback({ hallId, ceremonyId, templateItemId })`:
      - 기본 상태는 접힌 "피드백 남기기" 아웃라인 버튼(DESIGN.md §4 Secondary 스타일, ≥44px, DESIGN.md §8 iPad 탭 타깃).
      - 펼치면 `GET /api/feedback/${hallId}/${ceremonyId}?templateItemId=${templateItemId}`로 기존 draft를 가져와 textarea에 프리필(AC 2 "이어 쓰기"). 로딩 중엔 버튼을 비활성화(중복 펼침 방지).
      - textarea: DESIGN.md §4 "자연어 질의창/피드백 서술창" 스타일(여러 줄, `1px solid #D4D4D4`, focus `#E8552D`), placeholder는 DESIGN.md §10 Voice sample 원문 그대로 사용 — `"있었던 일을 그대로 적으세요"`(AC 3, 폼처럼 보이지 않게 라벨 없이 textarea만).
      - 저장 버튼(Primary, "저장"): `POST /api/feedback/${hallId}/${ceremonyId}` body `{ templateItemId, content }`. 저장 중 버튼은 너비 유지 + 비활성 + 스피너(DESIGN.md §14 Loading 패턴, 중복 제출 방지 — 체크리스트 질의 버튼과 동일 원칙을 재사용).
      - 저장 성공 시: **초록(`#1FA463`) 확정 톤이 아니라 주황(`#F5A623`) "임시저장" 톤으로 조용히 확인**(DESIGN.md §2 Warning 색 정의 — "피드백 임시저장(선임이 나중에 이어 쓰기로 한 상태)"이 정확히 이 색의 용도로 명시돼 있다. 초록은 Story 3.2의 "확정" 전용이므로 여기서 쓰면 색 의미가 어긋난다). 축하 연출 없음(DESIGN.md §14 Success 원칙).
      - 저장 실패 시: DESIGN.md §14 "Error(질의 응답 실패)"와 동일하게 즉시 드러나는 오류 + 재시도 문구(조용한 실패 금지).
  - [ ] `checklist-instance-view.css`에 스타일 추가(새 CSS 파일 만들지 않는다 — 이미 이 화면 전용 CSS 파일이 있음): `.step-feedback`, `.step-feedback__toggle`, `.step-feedback__textarea`, `.step-feedback__save-btn`, `.step-feedback__saved-hint`(주황 톤) 등. 색상/라운딩/스페이싱은 `design-tokens.css` 변수만 사용(Story 5.7 Dev Notes에서 이미 확립된 전역 `box-sizing: border-box` 리셋 덕분에 textarea `width: 100%` + padding이 카드 밖으로 밀려나오지 않는다 — 별도 처리 불필요).

- [ ] Task 6: 테스트 (AC: 1, 2, 3, 4)
  - [ ] `apps/web/tests/repositories/feedback.test.ts`(NEW): `create`/`findByCeremonyAndStep`(존재/미존재)/`updateContent` 기본 CRUD.
  - [ ] `apps/web/tests/services/feedback.test.ts`(NEW):
    - `saveDraftFeedback`: 최초 저장(신규 행 생성) / 재저장(같은 ceremony+step, 기존 행 update, id 불변) / 존재하지 않는 예식 / 다른 홀의 예식(hallId 불일치) / 존재하지 않는 단계 / 빈 문자열(trim 후 빈 값 포함) 거부 / **status가 이미 'confirmed'인 행을 직접 DB에 심어두고 저장 시도 → FeedbackValidationError**(3.2 이전엔 프로덕션 코드로 confirmed를 만들 수 없으므로 테스트에서 `feedbackRepo.create` 후 `db.update`로 직접 status를 확정 상태로 만들어 이 방어선을 검증).
    - `getDraftFeedback`: 존재/미존재/다른 홀의 예식으로 조회 시 거부.
  - [ ] `apps/web/tests/lib` 또는 컴포넌트 테스트 — `StepFeedback` 컴포넌트가 jsdom environment에서 draft 프리필 → 저장 → 주황 톤 확인 문구까지 렌더링되는지(`tests/components` 기존 패턴 확인 후 동일 스타일로 작성, 없으면 이 스토리에서 이 폴더에 처음 추가해도 됨 — 이미 `tests/components` 디렉터리는 존재).
  - [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 전부 클린 확인.

- [ ] Task 7: 수동 검증
  - [ ] 로컬 서버에서 오퍼레이터 계정으로 예식 상세 화면에 진입, 한 단계에 "피드백 남기기"를 펼쳐 텍스트 입력 후 저장 → 주황 톤 확인 문구 표시 확인(AC 1, 3).
  - [ ] 저장 없이 화면을 나갔다가 같은 단계로 다시 들어가 이전에 쓴 내용이 프리필되는지 확인, 이어서 수정 후 재저장 시 같은 행이 갱신되는지(id 불변, DB 직접 확인) 확인(AC 2).
  - [ ] 관리자 계정으로도 동일 화면 접근이 가능한지(AD-3, requireSession은 역할 무관) 확인.
  - [ ] `curl`로 세션 쿠키 없이 `GET/POST /api/feedback/[hallId]/[ceremonyId]` 직접 호출 → 401 확인.
  - [ ] `/admin/*`, `/operator`, 기존 체크리스트 조회/폴링 화면이 이 스토리로 회귀 없는지 확인(체크리스트 타일 클릭/오프라인 배너 등 Story 2.3 동작 그대로인지).

## Dev Notes

### 배경

Epic 3의 첫 스토리 — 아직 `feedback`/`variable_cases` 테이블이 스키마에 존재하지 않는다(확인 완료: `apps/web/lib/db/schema.ts`에 없음, 최신 마이그레이션은 `0015_member-management-banned-fields.sql`). 이 스토리가 `feedback` 테이블을 처음 만든다. `variable_cases`, 구조화(FR-9), 임베딩, 확정(confirm) UI는 **Story 3.2 범위 — 이 스토리에서 만들지 않는다.** `lib/ai/ports.ts`의 `LLMPort`/`EmbeddingPort` 스텁도 건드리지 않는다(AI 호출이 전혀 없는 스토리).

### 아키텍처 준수 사항 (반드시 따를 것)

- **AD-1**: 이 스토리는 AI를 호출하지 않으므로 해당 없음(3.2부터 적용).
- **AD-2**: `feedback`은 스파인이 명시하는 홀 종속 엔티티 목록(`checklist_templates`, `checklist_template_items`, `demo_videos`, `ceremonies`, `checklist_instances`, `checklist_instance_items`)에 **포함되지 않는다** — `hallId`는 저장하되(AD-6 표시 태그용) 리포지토리 레벨 격리 쿼리 대상이 아니다. 대신 서비스 레이어가 `ceremonyRepo.findById(hallId, ceremonyId)`로 예식↔홀 소속을 검증한다(Task 3).
- **AD-3**: 피드백 입력은 `operator`/`admin` 모두 접근 가능한 화면 기능이다(체크리스트 인스턴스 열람과 동일 원칙) — `requireAdminSession()`이 아니라 `requireSession()`을 쓴다.
- **AD-6**: `hallId`는 지금 저장해두되(스키마 준비), 이 스토리엔 검색/집계 기능이 없어 실제로 "표시 태그"로 쓰이는 화면은 아직 없다(3.4에서 쓰임).
- **AD-8**: `status: draft | confirmed` 컬럼을 지금 만들되 이 스토리는 `draft`만 생성한다. `variable_case` 생성/임베딩은 절대 이 스토리에서 하지 않는다(Story 3.2 범위, "확정 시점에만" 원칙).
- **Consistency Conventions(Route Handler vs Server Action)**: 스파인이 `api/feedback/` → Route Handler로 FR-8/9를 명시했다 — 관리자 CRUD처럼 Server Action으로 만들지 않는다(Task 4 참고).
- **API 오류 형식**: `{ error: { code: string, message: string } }` 단일 봉투(스파인 Consistency Conventions).

### 현재 코드 상태 (읽고 시작할 것)

- `apps/web/lib/db/schema.ts` — `feedback` 테이블 없음, 이 스토리에서 신규 추가. 기존 테이블(특히 `checklistInstanceItems`)의 소프트 참조(`onDelete: "set null"`) + 스냅샷 텍스트 병행 패턴을 그대로 재사용한다(Task 1).
- `apps/web/lib/db/repositories/ceremony.ts::findById(hallId, id)` — `and(eq(ceremonies.id, id), eq(ceremonies.hallId, hallId))`로 홀 소속을 검증하는 기존 패턴. `feedback` 서비스가 그대로 재사용한다(트랜잭션/JOIN 새로 만들지 않는다).
- `apps/web/lib/services/checklist-instance.ts::addInstanceItem` — hallId로 스코프된 두 리포지토리 조회(인스턴스, 체크리스트 항목)가 모두 성공해야 진행하는 "2-hop 재검증" 패턴의 실제 예시. `saveDraftFeedback`이 예식+단계에 대해 동일한 패턴을 쓴다.
- `apps/web/app/api/operator/ceremonies/[hallId]/[ceremonyId]/route.ts` — 이 프로젝트에서 `requireSession()` 실패를 명시적 401 JSON으로 응답하는 유일하고 정확한 레퍼런스(그냥 throw하면 Next.js가 500으로 응답해 클라이언트의 401 분기가 죽은 코드가 된다, Story 2.3 코덱스 2차 P2). 이 스토리의 Route Handler가 그대로 복제.
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.tsx` — 단계별 그룹핑(`groupItemsByStep`, `templateItemId ?? stepName`을 그룹 키로 사용)이 이미 구현돼 있다. 이 스토리는 이 파일을 수정해 각 `<section className="checklist-step-group">` 안에 피드백 UI를 추가한다(Task 5) — 기존 60초 폴링/오프라인/캐시 로직은 건드리지 않는다(피드백은 별도 온디맨드 fetch, AD-5가 요구하는 "AI 질의/피드백 저장은 항상 온라인" 원칙과 일치 — 피드백 저장 실패를 캐시로 조용히 덮지 않는다).
- `apps/web/lib/auth-guard.ts` — `requireSession()`(역할 무관, 로그인만 확인) 이미 존재, 그대로 재사용.
- `apps/web/tests/services/member.test.ts` — vitest node 환경에서 `next/headers()`를 쓰는 코드(예: `requireSession()`)는 직접 호출 시 "headers was called outside a request scope"로 실패한다는 이 프로젝트의 확립된 제약. **이 스토리는 이 문제를 피해간다** — `feedback` 서비스 함수(`saveDraftFeedback`/`getDraftFeedback`) 자체는 `headers()`를 호출하지 않도록 설계했다(피드백에 사용자 식별자를 저장하지 않으므로 세션이 필요 없다, AC 4와 정확히 맞물림). 세션 검사는 Route Handler 레이어(`requireSession()`)에만 있고, 그 레이어는 기존 관행대로(Story 2.3) vitest가 아니라 수동 curl/브라우저로 검증한다(Task 7) — 서비스 로직은 전부 vitest로 커버 가능.

### 스코프 경계 — 하지 말 것

- `variable_cases` 테이블, 임베딩, 5필드 자동 구조화(단계·상황 설명·대처 결과·사후 판단·태그), "확정" 버튼/상태 전환 UI는 전부 Story 3.2(FR-9) 범위다 — 이 스토리는 `feedback.status`를 `'draft'`로만 다룬다.
- `lib/ai/ports.ts`, `lib/ai/adapters/*`는 건드리지 않는다.
- 예식 시각이 지났는지(`ceremonyAt < now`) 강제 검증하지 않는다 — AC의 "예식이 종료된 후"는 사용 시나리오 설명이지 명시적 검증 요구가 아니다. 임의로 시간 기반 차단을 추가하면 스코프 크리프다.
- 피드백에 작성자(userId) 등 어떤 형태의 사용자 식별자도 저장하지 않는다(AC 4, NFR-5) — "이어 쓰기"는 예식+단계 단위로만 이어지며 특정 오퍼레이터에게 귀속되지 않는다. 이는 의도된 설계다(오퍼레이터는 특정 홀에 소속되지 않고, PRD가 "선임 본인도 정형화해서 기억 못 한다"는 전제로 개인 책임 추궁이 아니라 상황 기록 자체를 목적으로 설계됐다).

### 테스트 요구사항

vitest 이중 environment(`.test.ts` = node/DB 통합, 컴포넌트는 jsdom). `resetDb()`(`tests/helpers/db.ts`) 재사용. 서비스 테스트는 `next/headers()` 제약이 없어 다른 서비스 테스트(예: `ceremony.test.ts`)와 동일하게 직접 호출 방식으로 작성 가능 — `member.test.ts`의 `signInAsAdmin()` 같은 세션 우회 헬퍼가 필요 없다(세션 검증이 서비스 레이어에 없으므로).

### Project Structure Notes

- 신규 파일: `apps/web/lib/db/repositories/feedback.ts`, `apps/web/lib/services/feedback.ts`, `apps/web/app/api/feedback/[hallId]/[ceremonyId]/route.ts`, `apps/web/tests/repositories/feedback.test.ts`, `apps/web/tests/services/feedback.test.ts` — 전부 기존 명명 규칙(kebab-case 파일, `lib/services`/`lib/db/repositories`/`app/api` 구조)과 일치.
- Detected conflict: 없음. 5.x 스토리들과 겹치는 파일 없음(이 스토리는 `feedback` 관련 신규 파일 + `checklist-instance-view.tsx`/`.css`만 수정).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1] — 원본 AC 4개.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md] — AD-1/2/3/6/8, Structural Seed, Capability Map, Consistency Conventions, ERD(FEEDBACK 엔티티).
- [Source: apps/web/lib/db/schema.ts] — `checklistInstanceItems`의 소프트 참조+스냅샷 패턴, 다른 테이블들의 컬럼 컨벤션.
- [Source: apps/web/lib/services/checklist-instance.ts, apps/web/lib/db/repositories/ceremony.ts] — 2-hop 재검증, hallId 스코프 조회 패턴.
- [Source: apps/web/app/api/operator/ceremonies/[hallId]/[ceremonyId]/route.ts] — Route Handler 401 처리 레퍼런스.
- [Source: apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.tsx] — 단계 그룹핑 UI, 이 스토리가 확장하는 대상.
- [Source: DESIGN.md §2, §4, §10, §14] — Warning 색(임시저장) 의미, 입력창/버튼 스타일, Voice 톤, Loading/Error/Success 상태 처리.
- [Source: _bmad-output/implementation-artifacts/5-7-member-management-polish.md, 5-4-member-management.md] — 리포지토리/서비스/Route Handler 계층 분리, `ValidationError` 서브클래스 패턴, 방어적 코딩(도달 불가능해도 막아두는 관행)의 실제 선례.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 3, Story 3.1
- `_bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md` — AD-1/2/3/6/8
- `apps/web/lib/services/checklist-instance.ts`, `apps/web/lib/db/repositories/ceremony.ts` — 재사용 패턴 원본
- `apps/web/app/api/operator/ceremonies/[hallId]/[ceremonyId]/route.ts` — Route Handler 템플릿
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.tsx` — UI 확장 대상

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
