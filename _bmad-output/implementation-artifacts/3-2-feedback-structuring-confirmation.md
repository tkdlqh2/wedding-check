---
baseline_commit: 4108d43
---

# Story 3.2: 자동 구조화 및 확정 (FR-9, AD-8)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 오퍼레이터,
I want 내가 입력한 자연어가 5개 필드로 자동 구조화된 걸 확인하고 필요하면 수정한 뒤 확정하고 싶기를,
so that 내 표현이 정확한 근거로 다른 사람에게 전달된다.

## Acceptance Criteria

1. **Given** draft 피드백이 저장되어 있을 때 **When** 자동 구조화를 실행하면 **Then** 단계·상황 설명·대처 결과·사후 판단·태그 5개 필드가 모두 채워진 초안이 제시된다(`claude-haiku-4-5`, `LLMPort.generate`, AD-1).
2. **Given** 구조화 초안이 표시되면 **When** 오퍼레이터가 필드를 수정하면 **Then** 수정된 값이 최종본으로 저장된다.
3. **Given** 오퍼레이터가 확인 후 "확정"을 누르면 **When** 상태가 `confirmed`로 바뀌면 **Then** 그 시점에만 변수 케이스가 생성·임베딩되어 검색 인덱스에 들어간다(AD-8 — draft 상태는 절대 인덱스에 포함되지 않음).
4. **Given** 동일한 자연어 입력을 재구조화하면 **When** 결과를 비교하면 **Then** 동일한 결과를 반환하며(NFR-1), 저장 완료 시 초록 배지로 조용히 확인되고 축하 연출은 없다(UX-DR16).

## Tasks / Subtasks

- [ ] Task 1: AI 포트 인터페이스를 스파인 확정 시그니처로 승격 (AC: #1)
  - [ ] `lib/ai/ports.ts`를 AD-1 확정 시그니처로 교체: `GenerateInput`(`prompt`, 선택적 `responseSchema: Record<string, unknown>`, 선택적 `temperature`), `GenerateResult`(`text: string`, 선택적 `variableCaseId?: string`), `LLMPort.generate`/`LLMPort.generateStream`(AsyncIterable — 3.3 스텁), `EmbeddingPort.embed(texts: string[]): Promise<number[][]>`
  - [ ] 기존 `feedback.ts`/기존 코드에 `LLMPort`/`EmbeddingPort`를 직접 구현한 곳이 없는지 확인(3.1은 AI 미사용이므로 영향 없어야 함)
- [ ] Task 2: Anthropic LLM 어댑터 구현 (AC: #1, #4)
  - [ ] `@anthropic-ai/sdk`를 의존성에 추가(최신 stable)
  - [ ] `lib/ai/adapters/anthropic.ts`: `LLMPort` 구현. `client.messages.create({ model: "claude-haiku-4-5", max_tokens, temperature: 0, messages: [...], output_config: { format: { type: "json_schema", schema } } })` 호출(신규 파라미터 위치 — `output_config.format`, beta 헤더 불필요, 2026-02-04부로 Haiku 4.5도 지원. `responseSchema` 미지정 시 `output_config` 생략하고 raw text 반환 — FR-6/7 대비 경로 유지)
  - [ ] 응답은 `response.content` 배열에서 `type === "text"`인 블록의 `text`를 사용
  - [ ] `ANTHROPIC_API_KEY` 환경변수로 클라이언트 생성, `.env.local`/`.env.test`에 키가 없으면 명확한 에러로 실패(조용히 undefined 호출 금지)
  - [ ] `lib/services/**`에서 `@anthropic-ai/sdk`를 직접 import하지 않는지 확인(AD-1 — 포트만 import)
- [ ] Task 3: Voyage 임베딩 어댑터 구현 (AC: #3)
  - [ ] 공식 SDK 없음 — 네이티브 `fetch`로 `POST https://api.voyageai.com/v1/embeddings` 직접 호출(불필요한 의존성 추가 지양)
  - [ ] `lib/ai/adapters/voyage.ts`: `EmbeddingPort` 구현. Body: `{ model: "voyage-3.5", input: texts, input_type: "document", output_dimension: 1024 }`, Header: `Authorization: Bearer ${VOYAGE_API_KEY}`, `Content-Type: application/json`
  - [ ] 응답 `{ data: [{ embedding: number[], index: number }] }`을 `index` 순서로 정렬해 `number[][]`로 반환(API가 순서를 보장하지 않을 가능성에 대비해 방어적으로 정렬)
  - [ ] `VOYAGE_API_KEY` 환경변수 필수
- [ ] Task 4: `feedback` 테이블에 구조화 초안 컬럼 추가 (AC: #1, #2)
  - [ ] `lib/db/schema.ts`의 `feedback` 테이블에 컬럼 추가: `situation: text` (상황 설명, nullable), `outcome: text` (대처 결과, `'well_handled' | 'mishandled'` 값만 허용 — DB에는 text로 저장하고 서비스 레이어에서 검증), `rationale: text` (사후 판단, nullable), `tags: jsonb` (`text[]` 대신 jsonb 배열 — Drizzle의 `jsonb().$type<string[]>()`, 기본값 `[]`)
  - [ ] 이 4개 컬럼은 모두 구조화 실행 전에는 `null`/기본값이며, `content`(원본 자연어)는 그대로 보존(구조화는 파생 데이터를 추가하는 것이지 원본을 대체하지 않음)
- [ ] Task 5: `variable_cases` 테이블 + pgvector 마이그레이션 (AC: #3)
  - [ ] `lib/db/schema.ts`에 `variableCases` 테이블 추가: `id uuid pk`, `hallId uuid not null references halls.id`(AD-6 — 표시용 태그일 뿐 격리 조건 아님), `feedbackId uuid not null unique references feedback.id`(0..1 역참조를 유니크 FK로 강제), `stepName text not null`, `situation text not null`, `outcome text not null`, `rationale text not null`, `tags jsonb not null default '[]'`, `embedding vector(1024) not null`(`drizzle-orm/pg-core`의 `vector({ dimensions: 1024 })`), `createdAt timestamp defaultNow().notNull()`
  - [ ] `npx drizzle-kit generate`는 이 환경에서 비TTY 컬럼 충돌 프롬프트로 실패한다(Story 3.1/5.4와 동일 이슈, [[3-1 Dev Notes]] 참고) — `0016_snapshot.json`을 베이스로 `0017_variable-cases.sql` + `0017_snapshot.json`을 수동 구성하고 `npx drizzle-kit check`로 정합성 검증
  - [ ] 마이그레이션 SQL 최상단에 `CREATE EXTENSION IF NOT EXISTS vector;` 포함(이 프로젝트에서 pgvector 컬럼을 쓰는 최초의 마이그레이션 — DB 이미지는 `pgvector/pgvector:pg16`이라 확장 자체는 설치돼 있으나 활성화는 안 돼 있음)
  - [ ] `_journal.json`에 idx 17 엔트리 추가
  - [ ] ⚠️ Story 5.8(PR #21, 별도 브랜치)이 이미 자신만의 마이그레이션을 0016으로 등록했을 수 있다(3.1 완료 노트에 남긴 경고) — 이 스토리 시작 시점의 `origin/main` 기준으로 0016은 이미 3.1의 `natural-language-feedback`으로 확정되어 있으므로, 이 스토리는 무조건 0017부터 시작한다. 만약 머지 시점에 또 다른 브랜치가 0017을 선점했다면 rebase 시 재번호 부여.
- [ ] Task 6: `variable-case` 리포지토리 (AC: #3)
  - [ ] `lib/db/repositories/variable-case.ts` 신규: `create(input): Promise<VariableCase>` — insert 1건. hallId 전용 조회는 이 스토리 범위 밖(3.3/3.4가 검색 쿼리를 추가함 — AD-6에 따라 hallId 필터 없이 전체 검색이므로 여기서는 생성 경로만 필요)
- [ ] Task 7: 구조화 서비스 함수 (AC: #1, #4)
  - [ ] `lib/services/feedback.ts`에 `structureFeedback(hallId, ceremonyId, templateItemId): Promise<Feedback>` 추가
  - [ ] 기존 `requireCeremonyAndStep`으로 draft 피드백 존재 확인(없거나 이미 `confirmed`면 `FeedbackValidationError`)
  - [ ] JSON 스키마(5필드: `situation: string`, `outcome: "well_handled" | "mishandled"` — enum, `rationale: string`, `tags: string[]`)를 만들어 `LLMPort.generate`에 `responseSchema`로 전달, 프롬프트는 `feedback.content`(원본 자연어) + `stepName`(어떤 단계에서 있었던 일인지 컨텍스트)을 포함
  - [ ] 응답 JSON을 파싱해 `feedbackRepo.updateStructuredFields(id, { situation, outcome, rationale, tags })`로 저장(신규 리포지토리 함수 — `status`는 여전히 `draft` 유지, AC #1은 "초안 제시"이지 확정이 아님)
  - [ ] `outcome` 값이 스키마 enum 밖이면 저장 거부(`FeedbackValidationError`) — LLM이 스키마를 어길 가능성에 대한 방어(구조화 출력 스키마가 이를 대부분 막아주지만, 서비스 레이어에서 한 번 더 검증하는 것이 AD-8 안전 경계 원칙과 일치)
- [ ] Task 8: 필드 수정 서비스 함수 (AC: #2)
  - [ ] `lib/services/feedback.ts`에 `updateStructuredFields(hallId, ceremonyId, templateItemId, fields): Promise<Feedback>` 추가 — 오퍼레이터가 4개 필드(situation/outcome/rationale/tags) 중 일부/전부를 수정해 저장. `status='confirmed'`인 행은 수정 거부(AD-8 — 확정 후에는 변수 케이스가 이미 생성됐으므로 feedback을 조용히 바꾸면 검색 인덱스와 어긋남; 수정하려면 재확정 플로우가 필요하나 이는 v1 범위 밖 — Dev Notes 참고)
- [ ] Task 9: 확정 서비스 함수 (AC: #3)
  - [ ] `lib/services/feedback.ts`에 `confirmFeedback(hallId, ceremonyId, templateItemId): Promise<{ feedback: Feedback; variableCase: VariableCase }>` 추가
  - [ ] 5필드가 모두 채워져 있는지 검증(situation/outcome/rationale 비어있지 않음, tags 배열) — 안 채워졌으면 `FeedbackValidationError`("구조화를 먼저 완료하세요")
  - [ ] `feedbackRepo`에 원자적 `confirmIfDraft(id): Promise<Feedback | undefined>`(status draft→confirmed, `setWhere: eq(status,'draft')`로 이중 확정 경합 방지 — 3.1의 `upsertDraft` 동시성 수정과 동일 원리)가 `undefined`를 반환하면(이미 confirmed) 에러
  - [ ] 확정 성공 시 `situation + " " + rationale`(또는 유사한 근거 텍스트 조합)을 `EmbeddingPort.embed([text])`로 임베딩하고 `variableCaseRepo.create({ hallId, feedbackId, stepName, situation, outcome, rationale, tags, embedding })`로 저장
  - [ ] **트랜잭션 경계 필수**: feedback 확정 상태 전환 + variable_case 생성 + 임베딩 저장은 하나의 논리적 단위다. 임베딩 API 호출이 실패하면 feedback이 confirmed로 남되 variable_case가 없는 상태가 되어 AD-8의 "confirmed는 곧 인덱스에 있음"이라는 암묵적 불변식이 깨진다. `db.transaction()`으로 feedback 상태 전환 + variable_case insert를 묶고, **임베딩 API 호출은 트랜잭션 진입 전에 먼저 완료**한 뒤(외부 API 호출을 트랜잭션 안에 두지 않는다 — 커넥션을 오래 붙잡는 것을 피함) 그 결과만 트랜잭션 안에서 저장한다
- [ ] Task 10: Route Handler 확장 (AC: #1, #2, #3)
  - [ ] `app/api/feedback/[hallId]/[ceremonyId]/route.ts`에 구조화/확정 전용 하위 경로 추가 — 스파인 Capability Map은 `api/feedback/route.ts`만 명시하므로, 기존 파일 트리 컨벤션을 따라 `app/api/feedback/[hallId]/[ceremonyId]/structure/route.ts`(POST — `templateItemId`를 바디로 받아 `structureFeedback` 호출) 신규
  - [ ] 기존 POST(draft 저장)는 그대로 두고, PATCH를 기존 `route.ts`에 추가해 `updateStructuredFields`(필드 수정)와 확정(`confirmFeedback`)을 구분 — 예: 바디에 `action: "update_fields" | "confirm"` 또는 별도 `confirm/route.ts` 하위 경로. **Dev가 택1**: 이 스토리는 REST 리소스 경로 확정을 dev에게 위임한다(스파인이 세부 경로까지 못박지 않음) — 단, 에러 봉투(`{ error: { code, message } }`)와 `requireSessionOr401()` 패턴은 3.1과 동일하게 유지할 것
  - [ ] UUID 파라미터 검증(`isValidUuid`)과 401/400/404 처리는 3.1 `route.ts` 패턴 그대로 재사용
- [ ] Task 11: 오퍼레이터 화면 UI — 구조화 초안 확인/수정/확정 (AC: #1, #2, #4)
  - [ ] `step-feedback.tsx`에 "임시저장됨" 상태 이후 "자동 구조화" 액션 추가(DESIGN.md 버튼 스타일 — Secondary 아웃라인, "구조화하기")
  - [ ] 구조화 결과를 4개 필드로 편집 가능하게 표시: 상황 설명(textarea), 대처 결과(라디오/세그먼트 2択 — "잘 대처됨"/"잘못 대처됨"), 사후 판단(textarea), 태그(칩 입력 또는 콤마 구분 텍스트 — 이 스토리는 간단한 콤마 구분 입력으로 충분, 태그 자동완성은 범위 밖)
  - [ ] "확정" Primary 버튼(DESIGN.md `#E8552D`) — 확정 성공 시 초록 배지(`--color-success`)로 조용히 확인, 축하 연출 없음(UX-DR16, DESIGN.md §14 Success). 확정 후에는 필드가 읽기 전용으로 전환(AD-8 — confirmed 이후 수정 불가와 UI가 일치해야 함)
  - [ ] 구조화 요청 중 로딩 상태(버튼 너비 유지 + 스피너, 중복 요청 방지 — DESIGN.md §14 Loading 패턴, 3.1의 저장 버튼과 동일 관례)
  - [ ] 구조화 실패(LLM 타임아웃/에러) 시 즉시 드러나는 에러 표시(조용한 실패 금지 — DESIGN.md §14 Error 패턴)

## Dev Notes

### AD-1 포트 시그니처는 이미 스파인에서 고정됨 — 재발명 금지

현재 `lib/ai/ports.ts`는 3.1 이전에 만들어진 자리표시자(`generate(prompt: string): Promise<string>`, `embed(text: string): Promise<number[]>`)다. 이 스토리가 **처음으로 AI를 실제로 호출하는 스토리**이므로, 스파인이 이미 못박은 최종 시그니처로 교체하는 것이 이 스토리의 Task 1이다. 임의로 다른 시그니처를 설계하지 말 것 — ARCHITECTURE-SPINE.md AD-1 §46-49를 그대로 따른다:
- `LLMPort.generate(input: GenerateInput): Promise<GenerateResult>`
- `LLMPort.generateStream(input: GenerateInput): AsyncIterable<GenerateChunk>` (3.3/3.4 전용 — 이 스토리에서는 타입만 정의, 구현은 스텁도 필요 없음. 어댑터가 인터페이스를 만족시켜야 하면 최소 구현만)
- `EmbeddingPort.embed(texts: string[]): Promise<number[][]>` (배치 우선 — 단건도 길이 1 배열)

`GenerateResult`에 "근거로 쓰인 변수 케이스 ID"가 포함된다고 스파인에 적혀 있는데, 이는 FR-6/7(3.3/3.4)에서만 의미가 있다 — 이 스토리(FR-9)에서는 `variableCaseId`가 항상 `undefined`.

### Anthropic Structured Outputs — 2026-02-04부로 Haiku 4.5도 지원 (베타 헤더 불필요)

웹 검증(2026-07-27 시점 최신): Structured Outputs가 `output_config.format`으로 이동했고 베타 헤더(`structured-outputs-2025-11-13`)가 더 이상 필요 없다(과거 헤더도 하위호환으로 당분간 동작하지만 신규 코드는 헤더 없이 작성). 요청 예시:

```ts
const response = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 1024,
  temperature: 0,
  messages: [{ role: "user", content: prompt }],
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          situation: { type: "string" },
          outcome: { type: "string", enum: ["well_handled", "mishandled"] },
          rationale: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["situation", "outcome", "rationale", "tags"],
        additionalProperties: false,
      },
    },
  },
});
```

응답은 `response.content`의 `type === "text"` 블록의 `text`에 유효한 JSON 문자열로 들어온다. JSON Schema 제약: `minimum`/`maximum`/`minLength`/재귀 스키마 미지원, `additionalProperties: false` 필수. `@anthropic-ai/sdk`의 `.parse()` + zod 헬퍼도 있으나, 이 프로젝트는 zod를 의존성에 추가하지 않았고 포트 시그니처가 이미 plain JSON schema(`Record<string, unknown>`)로 고정돼 있으므로 `client.messages.create` + 수동 `JSON.parse`를 쓴다(zod 헬퍼 도입은 이 스토리 범위 밖 — 벤더 중립 포트 경계와도 맞지 않음, zod 스키마는 Anthropic 전용 개념).

NFR-1("동일 입력 → 동일 결과")은 `temperature: 0`으로 결정성을 최대화하되, 실제 LLM은 완전한 결정성을 보장하지 않는다는 한계가 있다 — 단위 테스트는 실제 API를 호출하지 않고 **가짜(fake) `LLMPort`를 서비스에 주입**해 검증한다(아래 테스트 전략 참고). 실제 어댑터에 대해서는 결정성을 강제하지 않는다(`[ASSUMPTION]`).

### Voyage AI Embeddings — 공식 SDK 없이 fetch로 직접 호출

웹 검증(2026-07-27): `POST https://api.voyageai.com/v1/embeddings`, `Authorization: Bearer ${VOYAGE_API_KEY}`, body `{ model: "voyage-3.5", input: string[], input_type: "document", output_dimension: 1024 }`. 응답 `{ object: "list", data: [{ embedding: number[], index: number }], model, usage: { total_tokens } }`. `data`는 `index` 필드로 순서를 명시하므로, 방어적으로 `data.sort((a,b) => a.index - b.index).map(d => d.embedding)`로 정렬해서 반환할 것(입력 순서와 응답 순서가 항상 일치한다고 가정하지 않는다).

### `variable_cases`는 이 프로젝트 최초의 pgvector 테이블

`drizzle-orm/pg-core`의 `vector({ dimensions: 1024 })`를 컬럼 타입으로 쓴다(drizzle-orm 0.45.2에 이미 포함 확인됨 — 스파인이 요구하는 0.31+ 조건 충족). DB 컨테이너 이미지는 `pgvector/pgvector:pg16`이라 `vector` 확장 자체는 이미지에 설치돼 있지만, 각 데이터베이스에서 `CREATE EXTENSION vector`로 활성화해야 한다 — 이 스토리의 마이그레이션이 그 활성화를 최초로 수행한다. 마이그레이션 SQL 최상단에 `CREATE EXTENSION IF NOT EXISTS vector;`를 빠뜨리면 이후 `vector(1024)` 컬럼 생성이 실패한다.

### 마이그레이션 절차 — 3.1과 동일한 수동 구성 (drizzle-kit generate 비TTY 이슈)

`npx drizzle-kit generate`는 이 환경에서 `promptColumnsConflicts`가 TTY를 요구해 실패한다(Story 3.1/5.4 선례). `0016_snapshot.json`을 베이스로 Python 스크립트 등으로 `0017_snapshot.json`을 구성하고(`feedback` 테이블에 4개 컬럼 추가 + `variable_cases` 테이블 신규 추가를 스냅샷에 반영), `0017_variable-cases.sql`을 손으로 작성한 뒤 `npx drizzle-kit check`로 스냅샷 체인 정합성을 확인한다. `_journal.json`에 idx 17 엔트리 추가. `db:test:migrate`는 빈 DB 전용이므로 공유 테스트/개발 DB에는 `docker exec wedding-check-db psql -U wedding_check -d <db> < 0017_variable-cases.sql`로 단독 적용한다(3.1과 동일 절차).

### AD-8 확정 후 수정 불가 — 이 스토리가 도달하는 지점

3.1의 Completion Notes: "`confirmed` 전환 로직은 만들지 않았다(Story 3.2 범위) — 대신 서비스 레이어(`saveDraftFeedback`)가 이미 confirmed인 행에 대한 덮어쓰기를 방어적으로 차단해뒀다(현재는 도달 불가능한 분기, 3.2가 확정 기능을 추가하는 순간부터 유효해짐)." 이 스토리에서 그 분기가 처음으로 실제로 도달 가능해진다 — `saveDraftFeedback`(3.1)과 `updateStructuredFields`(3.2 신규)는 동일한 "confirmed면 거부" 원칙을 공유해야 한다.

**확정 후 재수정은 v1 범위 밖**: AC #2는 "구조화 초안이 표시되면" 수정 가능하다고만 명시한다 — confirmed 이후 상황 설명/사후 판단을 다시 고치고 싶다면(오퍼레이터가 실수를 늦게 발견하는 경우) 이미 생성된 `variable_case`와 임베딩까지 갱신해야 하는데, 이는 스토리 범위 밖이다(Deferred로 남김 — 필요해지면 별도 스토리로).

### 트랜잭션 경계 — 확정 시 "반쪽 상태" 방지

`confirmFeedback`은 (1) feedback.status를 draft→confirmed로 전환, (2) variable_case를 생성, (3) 임베딩 API를 호출하는 3단계로 이뤄진다. 임베딩 API(외부 네트워크 호출)를 DB 트랜잭션 **안에** 넣으면 커넥션을 API 응답 대기 동안 붙잡아두게 되므로, 순서를 **임베딩 먼저(트랜잭션 밖) → 그 결과를 트랜잭션 안에서 저장**으로 설계한다. 만약 임베딩 호출이 실패하면 feedback은 여전히 draft 상태로 남아야 한다(트랜잭션에 진입하지 않았으므로 자동으로 보장됨) — "confirmed인데 variable_case가 없는" 상태가 절대 관측되지 않아야 AD-8의 안전 경계가 유지된다.

### 기존 코드 현황 (Story 3.1이 만든 것, 이 스토리가 그 위에 짓는 것)

- `apps/web/lib/db/schema.ts` — `feedback` 테이블 존재(`id, hallId, ceremonyId, templateItemId, stepName, content, status(draft|confirmed), createdAt, updatedAt`). 이 스토리는 여기에 4개 컬럼만 추가한다(테이블 재설계 금지).
- `apps/web/lib/db/repositories/feedback.ts` — `findByCeremonyAndStep`, `create`, `updateContent`, `upsertDraft`(원자적 upsert, `setWhere: status='draft'` 패턴 참고할 것 — `confirmIfDraft`도 동일 패턴).
- `apps/web/lib/services/feedback.ts` — `requireCeremonyAndStep`(hallId/ceremonyId/templateItemId 2-hop 검증 — 인스턴스 멤버십까지 확인, 그대로 재사용), `saveDraftFeedback`, `getDraftFeedback`.
- `apps/web/app/api/feedback/[hallId]/[ceremonyId]/route.ts` — GET/POST, `requireSessionOr401()`, UUID 파라미터 검증, 에러 봉투 패턴. 신규 경로도 이 패턴을 그대로 따른다.
- `apps/web/app/operator/ceremonies/[hallId]/[ceremonyId]/step-feedback.tsx` — 접기/펼치기, draft 프리필, 저장 상태(로딩/에러/저장됨). 구조화/확정 UI는 이 컴포넌트를 확장하는 것이지 새 컴포넌트를 만드는 것이 아니다.
- `apps/web/tests/helpers/db.ts` — `resetDb()`의 TRUNCATE 목록에 `variableCases` 추가 필요(3.1이 `feedback`을 추가했던 것과 동일한 자리).

### 환경 변수

`.env.local`/`.env.test`에 `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`가 없다 — 이 스토리에서 추가해야 실제 API 호출 테스트(수동 검증)가 가능하다. CI/vitest 단위 테스트는 실제 키 없이도 통과해야 한다(가짜 포트 주입, 아래 테스트 전략 참고).

### 테스트 전략 — 실제 LLM/임베딩 API를 단위 테스트에서 호출하지 않는다

- `lib/services/feedback.ts`의 `structureFeedback`/`confirmFeedback` 단위 테스트는 `LLMPort`/`EmbeddingPort`의 **가짜(fake) 구현**을 의존성으로 주입해서 검증한다(3.1에 이미 있는 서비스 함수들이 리포지토리를 직접 import하는 모듈 결합 방식이므로, 어댑터 선택은 별도 `lib/ai/index.ts` 같은 조립 지점을 하나 두고 서비스는 그 조립된 포트 인스턴스를 import하되, 테스트에서는 `vi.mock`으로 해당 모듈을 모킹하는 방식을 권장 — 3.1의 리포지토리 테스트가 실제 DB를 쓰는 것과 달리 AI 포트는 실제 벤더를 호출하지 않는 것이 원칙).
- 어댑터(`anthropic.ts`, `voyage.ts`) 자체에 대한 자동 테스트는 실제 API 키가 필요해 CI에서 불안정하므로, 이 스토리에서는 **수동 검증**(실제 키로 1회 호출해 응답 파싱이 맞는지 확인)으로 충분하다 — 자동화된 벤더 계약 테스트는 범위 밖.
- `variable-case.ts` 리포지토리 테스트는 3.1의 `feedback.ts` 리포지토리 테스트와 동일하게 실제 테스트 DB(`wedding_check_test`)를 사용한다(embedding 값은 임의의 1024차원 더미 배열로 충분 — 실제 유사도 검색은 3.3/3.4 범위).

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 3, Story 3.2 (원문 AC)
- `_bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md` — AD-1(포트 시그니처 확정), AD-6(변수 케이스 검색 범위), AD-8(안전 경계), Stack(벤더/모델 확정)
- `_bmad-output/implementation-artifacts/3-1-natural-language-feedback.md` — 선행 스토리, `feedback` 테이블/서비스/리포지토리 기반

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-27: 스토리 최초 작성 (create-story, Epic 3 두 번째 스토리 — 이 프로젝트 최초로 실제 AI(LLM+임베딩) 벤더를 연동하는 스토리).
