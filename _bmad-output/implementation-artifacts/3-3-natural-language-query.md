---
baseline_commit: d0e2a4f
---

# Story 3.3: 자연어 상황 질의 (FR-6)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 오퍼레이터,
I want 예식 진행 중 자유 텍스트로 지금 상황을 질의할 수 있기를,
so that 동료에게 물어볼 수 없는 순간에도 즉시 도움을 받을 수 있다.

## Acceptance Criteria

1. **Given** 확정된 변수 케이스가 사업체 내에 존재할 때 **When** 실행 중 조회 화면 하단 질의창에 상황을 입력하면 **Then** 응답이 p95 5초 이내로 표시된다(`[ASSUMPTION]`, NFR-2).
2. **Given** 표현이 다른 두 질의("주례자가 순서를 바꿈" vs "목사님이 애드리브함")가 같은 상황을 가리킬 때 **When** 각각 질의하면 **Then** 동일한 변수 케이스가 매칭된다(`EmbeddingPort`, NFR-4).
3. **Given** 질의 응답을 기다리는 동안 **When** 질의 버튼을 다시 누르면 **Then** 버튼이 너비를 유지한 채 비활성(disabled) 상태 + 스피너로 중복 요청을 막는다(UX-DR13, UX-DR18).
4. **Given** 동일 질의를 재실행하면 **When** 결과를 비교하면 **Then** 동일한 결과를 반환한다(NFR-1).

## Story 3.4와의 경계 (중요 — 범위 침범 금지)

이 스토리(3.3)는 **질의 파이프라인**을 만든다: 질의창 UI + `/api/query` Route Handler + 임베딩 → pgvector 유사도 검색 → 매칭 결과 반환. Story 3.4(FR-7)는 **응답의 표현과 안전장치**를 만든다. 구체적 경계:

| 항목 | 3.3 (이 스토리) | 3.4 (다음 스토리) |
|---|---|---|
| 질의창 UI(입력+버튼+스피너+중복 방지) | ✅ | — |
| `/api/query` + 서비스 + 리포지토리 유사도 검색 | ✅ | — |
| 매칭 카드 기본 렌더링(유사도 순위·%, 대처 결과 배지, 상황 설명, 사후 판단) | ✅ (프로토타입 RunScreen.js 124~141행 구조 그대로) | 유지 |
| 발생 홀 표시용 태그(AD-6) | API 응답에 `hallName` 포함까지만 | 카드에 표시 |
| 유사도 상위 3건 제한 | ✅ (서비스 상수 `MAX_MATCHES = 3`, 3.4 AC와 정합) | 유지 |
| "관련 사례 없음" `#2B82E0` 카드 + 유사도 임계값 판단 | ❌ — 빈 결과 시 임시로 뮤트 톤 플레인 텍스트("관련 사례 없음 — 선임에게 연락하세요")만 | ✅ 정식 카드 + 임계값 의미론 |
| 질의 실패(네트워크 등) 즉시 오류+재시도 문구 | 기본 인라인 오류 표시(step-feedback 패턴 재사용) | ✅ 재시도 문구/AD-5 완성 |

- 유사도 **임계값(무관 사례 차단)은 3.4 범위**다 — 이 스토리의 리포지토리는 `similarity`(1 - cosine distance)를 응답에 포함해 3.4가 필터만 얹으면 되게 한다. 이 스토리 단계에서는 상위 3건이 그대로 노출된다(파일럿 데이터가 소량이라 임계값 튜닝 근거가 아직 없음 — 3.4에서 확정).

## Tasks / Subtasks

- [x] Task 1: `EmbeddingPort.embed`에 선택적 `inputType` 파라미터 추가 (AC: #2)
  - [x] `lib/ai/ports.ts`: `embed(texts: string[], options?: { inputType?: "document" | "query" })` — 스파인 AD-1 확정 시그니처의 **하위호환 확장**(선택 파라미터, 기존 호출부 무수정). 비대칭 검색(문서는 "document", 질의는 "query"로 임베딩)은 벤더 중립 개념이며 Voyage 공식 권장 사항 — NFR-4(표현이 달라도 매칭) 품질에 직결
  - [x] `lib/ai/adapters/voyage.ts`: `input_type`을 `options?.inputType ?? "document"`로 전달(기본값 유지 — 3.2의 confirm 경로 동작 불변)
  - [x] `tests/lib/voyage-adapter.test.ts`에 input_type 전달 테스트 추가(기본값 "document", "query" 지정 시 요청 바디 반영)
- [x] Task 2: 변수 케이스 유사도 검색 리포지토리 (AC: #1, #2, #4)
  - [x] `lib/db/repositories/variable-case.ts` (NEW): `searchBySimilarity(embedding: number[], limit: number)` — drizzle `cosineDistance`로 정렬, `halls` JOIN으로 `hallName` 포함, **홀 필터 없음**(AD-6 — 사업체 전체 범위, hallId/hallName은 표시용 태그일 뿐)
  - [x] 반환 필드: `id, stepName, situation, rationale, outcome, tags, hallName, similarity(1 - distance), createdAt`
  - [x] **결정적 tie-break**(NFR-1): `ORDER BY distance ASC, created_at DESC, id ASC` — 동일 거리일 때도 실행마다 순서가 흔들리지 않게 한다
  - [x] pgvector ANN 인덱스(ivfflat/hnsw)는 만들지 않는다 — 파일럿 데이터 규모에서 정확 검색(seq scan)이 충분히 빠르고, ANN 근사는 NFR-1(동일 질의 → 동일 결과)을 해칠 수 있다(Deferred: 데이터가 수천 건 이상 쌓이면 재검토)
- [x] Task 3: 질의 서비스 (AC: #1, #2, #4)
  - [x] `lib/services/query.ts` (NEW): `queryVariableCases(text: string): Promise<QueryMatch[]>` — trim 후 빈 문자열이면 `QueryValidationError`("상황을 입력하세요"), 최대 길이 500자 초과 거부(`[ASSUMPTION]` — 질의는 한두 문장, 피드백 본문이 아님)
  - [x] `getEmbeddingPort().embed([text], { inputType: "query" })` → `variableCaseRepo.searchBySimilarity(embedding, MAX_MATCHES)` (`MAX_MATCHES = 3`, 3.4 AC "상위 3건" `[ASSUMPTION]`과 정합)
  - [x] **LLM 생성은 사용하지 않는다**(`[ASSUMPTION]` — 아래 Dev Notes "LLM 미사용 결정" 참고): AC가 요구하는 것은 케이스 매칭·표시이지 생성 요약이 아니다. `LLMPort.generateStream`은 이 스토리에서도 미사용으로 남는다
  - [x] AD-1 준수: 서비스는 `lib/ai`의 포트 조립 지점만 import(벤더 SDK 직접 import 금지)
- [x] Task 4: `/api/query` Route Handler (AC: #1)
  - [x] `app/api/query/route.ts` (NEW, 스파인 Capability Map의 확정 경로): `POST { text: string }` → `requireSessionOr401()`(오퍼레이터/관리자 공용 — AD-3, feedback 라우트와 동일) → 서비스 호출 → `{ matches: QueryMatch[] }`
  - [x] 검증 실패는 400 + `{ error: { code, message } }` 봉투, 예상치 못한 실패는 502 + `console.error` 구조화 로그(AD-10 관측성 — 이벤트 타입 `query_failed`, 3.2 리뷰에서 로그 누락이 지적된 전례)
  - [x] hallId/ceremonyId 파라미터를 받지 않는다 — 검색이 사업체 전체 범위(AD-6)라 홀 컨텍스트가 필요 없다
- [x] Task 5: 질의 패널 UI — 프로토타입 문자 그대로 (AC: #1, #3)
  - [x] `app/operator/ceremonies/[hallId]/[ceremonyId]/query-panel.tsx` (NEW, client component): `prototype/js/screens/RunScreen.js` 106~154행을 문자 그대로 이식 — 흰 카드(radius 12, 그림자), 제목 "지금 이런 상황인데 어떡하죠?"(18px/700), 헬퍼 문구 "상황을 그대로 적으면 과거 유사 사례를 근거와 함께 찾아드립니다. 예: \"주례자가 순서를 갑자기 바꿨어요\""(13px, #888), 입력(flex 1, 16px, placeholder "지금 상황을 그대로 적어보세요") + "질의하기" 버튼(**flex-none width 120px 고정**, `#E8552D`, radius 8, 16px/600)
  - [x] 로딩 중: 버튼 너비 120px 유지 + disabled + 스피너(AC #3, UX-DR13/18) — `useRef` 이중 제출 가드 포함(3.2 확정 버튼 더블클릭 경합 선례), Enter 키 제출도 로딩 중이면 무시
  - [x] 매칭 카드: RunScreen.js 124~141행 구조 — 유사도 배지("유사도 N위 · NN%", `#FDEDE7`/`#E8552D`), 대처 결과 배지(잘 대처됨 `#1FA463` / 잘못 대처됨 `#E0353B`), 상황 설명(15px, #555), 구분선 위 "사후 판단 — 이렇게 하세요"(12px/700, #888) + 사후 판단 본문(16px/600). 발생 홀 태그·meta 표시는 3.4 범위
  - [x] 빈 결과: 뮤트 톤 플레인 텍스트 "관련 사례 없음 — 선임에게 연락하세요"(3.4가 `#2B82E0` 정식 카드로 교체 예정 — 조용히 아무것도 안 보여주는 것은 금지)
  - [x] 오류: step-feedback.tsx의 인라인 오류 패턴(`#E0353B`) 재사용 — 조용한 실패 금지(DESIGN.md §14)
  - [x] 응답 카드 등장 모션: `motion-fast(120ms) / ease-enter` 슬라이드인(프로토타입 `wcenter` 애니메이션과 동일 값), `prefers-reduced-motion` 시 즉시 표시(DESIGN.md §15)
  - [x] CSS는 `checklist-instance-view.css`에 `.run-query__*` 클래스로 추가(5.8의 `.run-*` 네이밍 컨벤션)
- [x] Task 6: 실행 화면 통합 + AD-5 오프라인 처리 (AC: #1)
  - [x] `checklist-instance-view.tsx`: 체크리스트(run-step-list) 아래에 `<QueryPanel isOffline={isOffline} />` 배치(프로토타입 순서: 체크리스트 → 질의 카드 → 피드백)
  - [x] 오프라인이면 질의 버튼 disabled(DESIGN.md §14 Disabled — 크기 유지, `#BCBCBC` 텍스트) — AI 질의는 온라인 전용(AD-5)
  - [x] 오프라인 배너 문구에 "AI 질의만 잠시 사용할 수 없습니다." 문장 추가(프로토타입 RunScreen.js 13행 — 이 스토리에서 AI 질의가 처음 생기므로 이제야 이 문장이 사실이 됨. 단, 프로토타입의 "체크와 피드백은 저장되고" 부분은 현 구현과 다르므로 가져오지 않는다)
- [x] Task 7: 테스트 (AC: #1~4)
  - [x] `tests/repositories/variable-case.test.ts` (NEW, 실제 테스트 DB): 통제된 1024차원 임베딩으로 유사도 정렬 검증, 서로 다른 홀의 케이스가 모두 검색됨(AD-6), limit 적용, 동일 거리 tie-break 결정성, hallName JOIN
  - [x] `tests/services/query.test.ts` (NEW): `vi.mock("@/lib/ai")` 가짜 EmbeddingPort(텍스트→벡터 고정 매핑) + 실제 DB — 표현이 다른 두 질의가 같은 케이스에 매칭(AC #2), 동일 질의 2회 → 동일 결과(AC #4), 빈 질의/초과 길이 거부, `inputType: "query"` 전달 검증
  - [x] `tests/components/query-panel.test.tsx` (NEW): 로딩 중 disabled+스피너+너비 클래스(AC #3), pending 중 재클릭/Enter가 fetch를 중복 호출하지 않음(단일 act 내 이중 클릭 — 3.2의 위양성 테스트 교훈 반영), 결과/빈 결과/오류 렌더링, 오프라인 disabled
  - [x] `tests/lib/voyage-adapter.test.ts` (MODIFY): input_type 파라미터 테스트

### Review Findings

- [x] [Review][Patch] 새 질의 대기 중 이전 질의의 매칭 카드가 계속 노출 — 다른 상황에 대한 낡은 판단이 새 질문의 근거처럼 보임(1차 P2). 질의 시작 시 matches 즉시 초기화 [apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/query-panel.tsx]
- [x] [Review][Patch] 대기 중 입력을 바꾸면 늦게 도착한 응답(2차 P2)/실패 문구(3차 P2)가 제출한 적 없는 새 입력의 결과처럼 노출 — 최종적으로 사용자 지침(2026-07-28)에 따라 in-flight 동안 입력창 disabled 잠금 단순 차단으로 계열 전체 해소(중간 단계의 submittedText 결합은 지침에 따라 제거, 4차 리뷰에서 이 설계로 클린 확인) [apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/query-panel.tsx]

## Dev Notes

### LLM 미사용 결정 — 이 스토리의 가장 중요한 설계 판단 `[ASSUMPTION]`

스파인 Stack 표는 FR-6/7에 `claude-sonnet-5`(실시간 응답)를 배정하고 `LLMPort.generateStream`을 FR-6/7 Route Handler 전용으로 정의했다. 그러나 **epics.md의 3.3/3.4 AC 어디에도 LLM 생성 텍스트가 등장하지 않는다** — 3.4 AC 1은 "매칭된 변수 케이스의 상황 설명과 사후 판단이 함께 나타난다"(저장된 원문 표시)이고, 프로토타입 RunScreen.js의 응답 카드도 매칭 케이스의 원문 필드만 보여준다. 따라서 이 스토리는 **임베딩 검색 → 원문 표시** 파이프라인만 구현하고 LLM 생성을 호출하지 않는다. 근거:

1. **NFR-1(동일 질의 → 동일 결과)**: LLM 생성이 없으면 결정성이 (임베딩 결정성 전제 하에) 구조적으로 보장된다.
2. **NFR-2(p95 5초)**: Voyage 임베딩 1회(수백 ms) + pgvector 검색(ms 단위)으로 여유 있게 충족. LLM 스트리밍이 끼면 5초 상한이 위태로워진다.
3. **SM-2(무관 사례 제시 0%) / "근거는 신성하다"**: 생성 요약은 환각 위험을 만든다. 저장된 원문 표시는 그 위험이 0이다.
4. PRD §6 Cost "AI가 필요한 곳에만" — 검색에 필요한 것은 임베딩뿐이다.

`generateStream`은 인터페이스에 그대로 남는다(스파인 준수 — 향후 생성形 응답이 필요해지면 사용). 이 결정은 보수적 선택이며, 대표가 생성形 응답을 원하면 별도 스토리로 추가한다.

### `EmbeddingPort` 확장 — 스파인 하위호환, 비대칭 검색

3.2의 Voyage 어댑터는 `input_type: "document"`를 하드코딩했다(확정 시점 임베딩 = 문서). Voyage 공식 권장: 검색 질의는 `input_type: "query"`로 임베딩해야 문서-질의 비대칭 매칭 품질이 최적이다. 포트 시그니처는 스파인 AD-1에서 `embed(texts: string[]): Promise<number[][]>`로 고정돼 있으므로 **선택적 두 번째 파라미터**로 확장한다 — 기존 호출부(confirmFeedback) 무수정, 시그니처 하위호환. "query"/"document" 구분은 벤더 중립 개념(OpenAI/Cohere 등도 동일 개념 보유)이라 포트 추상화를 깨지 않는다. deferred-work.md의 "embedding 텍스트가 stepName/outcome을 포함하지 않아 검색 품질에 영향 가능" 항목은 이번에 재검토한 결과 **현행 유지**: 임베딩 대상(`${situation} ${rationale}`)은 질의("지금 이런 상황")와 의미적으로 같은 평면에 있고, stepName/outcome을 섞으면 오히려 상황 의미가 희석된다. 3.4에서 실데이터로 재평가.

### 검색 쿼리 — drizzle `cosineDistance` (0.31+에서 지원, 현재 0.45.2)

```ts
import { cosineDistance, desc, asc, sql } from "drizzle-orm";
const distance = cosineDistance(variableCases.embedding, embedding); // embedding: number[]
// SELECT ..., (1 - distance) AS similarity FROM variable_cases
// LEFT JOIN halls ON halls.id = variable_cases.hall_id  ← 홀 필터 아님, 이름 표시용
// ORDER BY distance ASC, created_at DESC, id ASC LIMIT 3
```

`variable_cases` 스키마는 3.2가 만들어뒀다(`lib/db/schema.ts` 343행~, embedding vector(1024) not null). **스키마 변경·마이그레이션 없음** — 이 스토리는 읽기 전용 검색만 추가한다. 마이그레이션 번호 충돌 걱정도 없다(병행 중인 fix/operator-shell-and-done-lock이 0021을 선점할 예정이지만 이 스토리는 번호를 쓰지 않음).

### 프로토타입이 질의 UI를 문자 그대로 정의한다

`prototype/js/screens/RunScreen.js` 106~154행이 이 스토리 UI의 원본이다(대충 비슷하면 반려 — 확립된 프로젝트 규칙). 핵심 수치: 카드 radius 12 + `rgba(0,0,0,0.06) 0 2px 8px` 그림자 + padding 20px 24px + marginTop 28, 제목 18px/700, 헬퍼 13px #888 marginTop 4, 입력 행 flex gap 10 marginTop 14, 입력 16px padding 12px 14px border #d4d4d4 radius 8(포커스 시 오렌지 — 기존 `.step-feedback` 입력과 동일 관례), 버튼 width 120 고정·flex-none·`#E8552D`·hover `#D14A26`. 매칭 카드: border #e6e6e6 radius 12 padding 20, 유사도 배지 `#FDEDE7`/`#E8552D` 12px/700, 결과 배지 12px/600(초록/빨강), situation 15px #555 lineHeight 1.5 marginTop 10, 구분선(borderTop #e6e6e6 marginTop 12 paddingTop 12) 아래 라벨 12px/700 #888 letterSpacing 0.4px, 사후 판단 16px/600 lineHeight 1.5. 등장 애니메이션 `wcenter 120ms cubic-bezier(0,0,0.2,1)`.

현 실행 화면(`checklist-instance-view.tsx`)은 5.8이 RunScreen.js를 이식한 상태로, 단계 아코디언 내부에 3.1/3.2의 `<StepFeedback>`이 통합돼 있다. 질의 패널은 **체크리스트 목록(run-step-list) 바로 아래**에 온다(프로토타입 순서). 프로토타입의 피드백 섹션(157행~)은 이 프로젝트에선 단계 인라인 방식(3.1 확정)이므로 질의 패널이 화면 최하단 카드가 된다 — "실행 중 조회 화면 하단 질의창"(AC #1)과 일치.

### 기존 코드 현황 (이 스토리가 재사용하는 것)

- `lib/ai/index.ts` — `getEmbeddingPort()` 조립 지점(지연 싱글턴). 테스트는 `vi.mock("@/lib/ai", ...)`로 이 지점만 모킹(3.2 확립 패턴).
- `lib/ai/adapters/voyage.ts` — 응답 shape/차원/index 검증 완비(3.2 리뷰 4라운드 산출물). input_type만 파라미터화하면 된다 — 검증 로직 재작성 금지.
- `lib/auth-guard.ts::requireSessionOr401()` — Route Handler 401 패턴(3.2 리뷰에서 추출). 신규 라우트는 이것만 호출.
- `app/api/feedback/[hallId]/[ceremonyId]/route.ts` — 에러 봉투/400/502/console.error 로그 패턴의 원본. `/api/query`도 동일 구조.
- `lib/db/schema.ts::variableCases` — 검색 대상 테이블(3.2 생성). `tags`는 `jsonb().$type<string[]>()`.
- `tests/helpers/db.ts` — `resetDb()`가 이미 `variable_cases`를 TRUNCATE 목록에 포함. 수정 불필요. 단, variable_cases 삽입에는 feedback 행이 필요하고 feedback은 ceremony/template item 체인이 필요 — `tests/repositories/feedback.test.ts`의 셋업 체인을 재사용.
- `step-feedback.tsx` — 로딩 스피너/인라인 오류/버튼 disabled 관례의 원본(같은 화면 안에서 이미 확립된 시각 언어).

### 환경/검증 제약 — 실 API 키 없음 (3.2와 동일)

`.env.local`의 `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY`는 빈 문자열(실키 미보유). 따라서:
- 자동 테스트는 가짜 EmbeddingPort 주입(결정적 벡터)으로 AC #2/#4를 검증한다. **실제 Voyage 임베딩의 의미 유사도("주례자가 순서를 바꿈" ≒ "목사님이 애드리브함")는 로컬에서 실증 불가** — 이는 3.2가 확립한 한계와 동일하며, 프로덕션 키 투입 후 검수 세트(SM-2)로 검증한다(`[ASSUMPTION]`).
- 로컬 종단 검증: 실서버 로그인 + 질의 POST 시 502(임베딩 키 없음)가 명확히 노출되는 것, 401/400 경로, 그리고 테스트 DB에 더미 임베딩 케이스를 심고 fake 포트로 서비스 레벨 검증까지.
- 이 worktree에는 `.env.local`/`.env.test`가 없다(git 미추적) — primary에서 값을 복사해 만들되, **DB 포트는 이 worktree 전용 격리 컨테이너(예: 5436)로 바꾼다**(Story 5.2 선례 — 공유 5434는 다른 세션이 사용 중).

### NFR-2(p95 5초) 충족 논거

질의 1건 = Voyage 임베딩 API 1회(공식 p50 수백 ms) + pgvector 정확 검색(파일럿 규모 수백 건에서 ms 단위) + JSON 직렬화. LLM 생성 없음. 5초 상한 대비 큰 여유. 계측은 AD-10 구조화 로그(실패 이벤트)로 시작하고, 정식 p95 대시보드는 v1 범위 밖(Deferred).

### NFR-1(동일 질의 → 동일 결과)의 한계 명시

DB 상태가 같고 임베딩이 같으면 검색 결과는 결정적이다(tie-break 포함). 실제 Voyage 임베딩의 호출 간 완전 결정성은 벤더가 보장하지 않는다 — 3.2의 NFR-1 처리(`temperature: 0` + fake 포트 테스트)와 동일한 수준의 `[ASSUMPTION]`으로 기록한다. 새 확정 피드백이 추가되면 결과가 달라지는 것은 NFR-1 위반이 아니다(데이터가 변한 것).

### Project Structure Notes

- `app/api/query/route.ts` — 스파인 Structural Seed가 명시한 경로(`api/query/ # FR-6/7 Route Handler`). 동적 세그먼트 없음.
- `lib/services/query.ts` — 스파인 Capability Map의 `query` 서비스 자리.
- `lib/db/repositories/variable-case.ts` — 3.2가 의도적으로 만들지 않았던 파일(생성 경로 단일화 때문). 이 스토리는 **읽기(검색) 전용**으로 신설한다 — `create()`류 쓰기 함수를 추가하면 AD-8 우회 경로가 생기므로 금지(3.2 Task 6의 결정 존중).
- `query-panel.tsx` — 실행 화면 폴더 배치(step-feedback.tsx와 동급). CSS는 checklist-instance-view.css 공유.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.3] — 원문 AC
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-1/AD-5/AD-6/AD-8/AD-10, Stack, Capability Map]
- [Source: _bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md#FR-6 (143행), §5 NFR (206~208행)]
- [Source: prototype/js/screens/RunScreen.js#106-154] — 질의 UI 원본
- [Source: _bmad-output/implementation-artifacts/3-2-feedback-structuring-confirmation.md] — AI 포트/어댑터/variable_cases 기반, 테스트 전략 선례
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — 임베딩 텍스트 구성 재검토 항목(이번 재검토 결과 현행 유지)

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 3, Story 3.3 (원문 AC)
- `_bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md` — AD-1/AD-5/AD-6/AD-8/AD-10, Capability Map(api/query)
- `_bmad-output/implementation-artifacts/3-2-feedback-structuring-confirmation.md` — AI 포트/어댑터/variable_cases 기반
- `prototype/js/screens/RunScreen.js` 106~154행 — 질의 UI 원본

### Agent Model Used

claude-fable-5

### Debug Log References

- 이 worktree 전용 격리 DB 컨테이너(wedding-check-db-story33, 포트 5436, pgvector/pg16)에 0000~0020 전체 마이그레이션 적용 후 검증 — 공유 5434(다른 세션 사용 중)는 건드리지 않음.
- 로컬 dev 서버(포트 3013)로 실제 로그인+HTTP 종단 검증: 세션 없음 401 → 오퍼레이터 로그인 → 빈 텍스트 400("상황을 입력하세요") → text 누락 400 → 정상 질의 502(VOYAGE_API_KEY 없음 — AD-5 실패 즉시 노출) + 서버 로그에 `{"event":"query_failed"}` 구조화 로그 1건 → 501자 400 → 실행 화면 SSR에 질의 패널(제목/placeholder/질의하기/run-query__submit) 렌더링 확인 → /operator 홈 회귀 없음.
- 확정 변수 케이스는 feedbackRepo.confirmAndCreateVariableCase 정규 경로로 시드(임시 스크립트, 검증 후 삭제).

### Completion Notes List

- Task 1~7 전부 스토리 계획대로 구현. 스키마 변경/마이그레이션 없음(3.2의 variable_cases 재사용) — 병행 브랜치의 0021 선점과 충돌 여지 없음.
- `EmbeddingPort.embed`에 선택적 `options.inputType` 추가(스파인 AD-1 하위호환 확장) — Voyage 어댑터는 기본 "document" 유지(3.2 confirm 경로 불변), 질의만 "query"로 임베딩(비대칭 검색).
- 검색은 `lib/db/repositories/variable-case.ts`(읽기 전용 신설, 쓰기 함수 금지 — 3.2 Task 6 결정 존중)의 단일 `searchBySimilarity`: drizzle `cosineDistance` + halls JOIN(표시용 hallName, AD-6 홀 필터 없음) + `ORDER BY distance, created_at DESC, id ASC`(NFR-1 tie-break) + ANN 인덱스 없음(정확 검색 — 결정성 우선).
- LLM 미사용 결정([ASSUMPTION], Dev Notes) 그대로 구현 — `/api/query`는 임베딩 1회 + pgvector 검색만 수행, `generateStream` 미사용 유지.
- UI는 프로토타입 RunScreen.js 106~154행 문자 그대로: 질의 카드(제목 18/700, 헬퍼 13 muted, 입력+120px 고정폭 브랜드 버튼), 로딩 중 disabled+스피너+너비 유지(AC 3, pendingRef로 리렌더 전 더블클릭/Enter 재진입 차단), 매칭 카드(유사도 배지/결과 배지/상황/사후 판단, 120ms ease-enter + reduced-motion 대응). 빈 결과는 뮤트 톤 플레인 텍스트, 오류는 인라인 즉시 노출 — 정식 카드/재시도 문구/홀 태그 표시는 3.4 경계 표대로 남김.
- 오프라인(AD-5): 질의 버튼 disabled + 오프라인 배너에 "AI 질의만 잠시 사용할 수 없습니다." 문장 추가(프로토타입 13행 — 단, 현 구현과 다른 "체크와 피드백은 저장되고" 부분은 가져오지 않음).
- vitest 293건 전체 통과(신규 29건 — 리포지토리 6, 서비스 8, 컴포넌트 13, Voyage 어댑터 2), tsc/lint/build 클린. AC 2/4는 가짜 EmbeddingPort(통제된 벡터 매핑) + 실제 pgvector 검색으로 결정적으로 검증 — 실제 Voyage 임베딩의 의미 유사도는 실키 미보유로 로컬 실증 불가(3.2와 동일 한계, 프로덕션 키 투입 후 SM-2 검수 세트로 검증).

### File List

- `apps/web/lib/ai/ports.ts` (MODIFY) — `EmbedOptions`(inputType) 추가
- `apps/web/lib/ai/adapters/voyage.ts` (MODIFY) — input_type 파라미터화(기본 "document")
- `apps/web/lib/db/repositories/variable-case.ts` (NEW) — pgvector 유사도 검색(읽기 전용)
- `apps/web/lib/services/query.ts` (NEW) — queryVariableCases(검증 + 임베딩 + 상위 3건)
- `apps/web/app/api/query/route.ts` (NEW) — POST, requireSessionOr401, 에러 봉투, query_failed 로그
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/query-panel.tsx` (NEW) — 질의 패널(프로토타입 이식)
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.tsx` (MODIFY) — QueryPanel 통합 + 오프라인 배너 문구
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/checklist-instance-view.css` (MODIFY) — `.run-query__*` 스타일
- `apps/web/tests/repositories/variable-case.test.ts` (NEW) — 6건
- `apps/web/tests/services/query.test.ts` (NEW) — 8건
- `apps/web/tests/components/query-panel.test.tsx` (NEW) — 10건
- `apps/web/tests/lib/voyage-adapter.test.ts` (MODIFY) — input_type 2건 추가

## Change Log

- 2026-07-28: 스토리 최초 작성 (create-story, Epic 3 세 번째 스토리 — 3.2가 구축한 임베딩 인프라 위에 질의 파이프라인을 얹는 스토리. 스키마 변경 없음. LLM 미사용 결정과 3.4 경계를 명시).
- 2026-07-28: 구현 완료 (dev) — AC 1~4 전부 구현. EmbeddingPort inputType 하위호환 확장, variable-case 검색 리포지토리(AD-6 사업체 전체 + NFR-1 tie-break), /api/query Route Handler(AD-10 query_failed 로그), 프로토타입 그대로의 질의 패널(AC 3 중복 방지 포함), AD-5 오프라인 처리. vitest 290건(신규 26건) 통과, tsc/lint/build 클린, 격리 DB+실서버 종단 검증(401/400/502/SSR 렌더링). Status → review.
- 2026-07-28: 코덱스 리뷰 4라운드 — 1차 P2(대기 중 이전 매칭 카드 노출, matches 초기화로 수정), 2차 P2(대기 중 입력 변경 시 응답이 새 입력 결과처럼 노출, submittedText 결합으로 수정), 3차 P2(같은 계열 — 실패 문구도 결합 필요, 수정). 이후 사용자 지침(2026-07-28)으로 2~3차 해법을 'in-flight 동안 입력창 disabled 잠금' 단순 차단으로 교체(요청 순번 추적/응답 무효화 금지 지침), 4차 리뷰에서 이 설계로 클린 확인. 최종 vitest 293건 통과, tsc/lint/build 클린, 실서버 재확인.
