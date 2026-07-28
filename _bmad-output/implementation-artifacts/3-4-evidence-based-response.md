---
baseline_commit: c4a1309
---

# Story 3.4: 근거 기반 응답 및 관련 사례 없음 처리 (FR-7)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 오퍼레이터,
I want 질의에 매칭된 변수 케이스의 상황 설명과 사후 판단(대처법+근거)을 함께 보고, 관련 사례가 없으면 정직하게 그렇다고 듣고 싶기를,
so that 확신 없는 즉흥 대응 대신 근거 있는 판단을 할 수 있다.

## Acceptance Criteria

1. **Given** 유사 변수 케이스가 매칭되었을 때 **When** 응답이 표시되면 **Then** 상황 설명과 사후 판단이 함께 나타나고 **발생 홀이 표시용 태그로 붙는다**(AD-6 — 검색은 홀 무관 사업체 전체 범위).
2. **Given** 유사 사례가 여러 건일 때 **When** 응답이 표시되면 **Then** 유사도 상위 3건까지 노출된다(`[ASSUMPTION]`).
3. **Given** 관련 있는 변수 케이스가 하나도 없을 때 **When** 응답이 표시되면 **Then** "관련 사례 없음 — 선임에게 연락하세요"가 `#2B82E0` 톤 카드로 명확히 표시되고, **절대 무관한 사례가 근거처럼 제시되지 않는다**(NFR-7, SM-2, UX-DR15).
4. **Given** 질의 응답이 네트워크 오류 등으로 실패하면 **When** 오류가 발생하면 **Then** 조용한 재시도 없이 즉시 명확한 오류 + 재시도 문구가 노출된다(AD-5, UX-DR14).

## 이 스토리의 본질 — 3.3이 만든 파이프라인에 "안전장치"를 얹는다

Story 3.3은 **질의 파이프라인**(질의창 → `/api/query` → 임베딩 → pgvector 검색 → 상위 3건 반환 → 매칭 카드)을 완성했다. 3.4가 추가하는 것은 딱 세 덩어리다:

| # | 추가하는 것 | 왜 이게 이 스토리인가 |
|---|---|---|
| A | **유사도 임계값 필터** (서비스) | AC 3의 "관련 있는 케이스가 하나도 없을 때"를 판정하는 유일한 기준. 없으면 검색은 항상 뭔가를 반환하므로 SM-2(무관 사례 0%)가 구조적으로 불가능하다. |
| B | **`#2B82E0` "관련 사례 없음" 정식 카드 + 매칭 카드 발생 홀 메타 태그** (UI) | AC 1·3. 3.3은 뮤트 톤 플레인 텍스트로 임시 표시만 해뒀다(스토리 3.3 경계 표에 명시). |
| C | **실패 종류별 오류 카드 + 재시도** (UI) | AC 4. 3.3은 모든 실패를 한 줄 문구로 뭉갰다. |

**스키마 변경·마이그레이션 없음.** 3.2가 만든 `variable_cases`, 3.3이 만든 검색 리포지토리를 그대로 쓴다. 마이그레이션 번호 충돌 걱정 없음.

## Tasks / Subtasks

- [ ] **Task 1: 유사도 임계값 — 이 스토리의 안전장치 (AC: #3)**
  - [ ] `lib/services/query.ts`에 `MIN_SIMILARITY = 0.5` 모듈 상수 추가. **환경변수로 덮어쓰지 않는다** — 이 값은 NFR-7/SM-2를 지키는 안전 게이트이며, 잘못된 설정 한 줄로 게이트가 꺼지는 경로를 만들지 않는다. NFR-1(결정성)도 상수여야 보장된다.
  - [ ] 근거(아래 Dev Notes "임계값 0.5의 근거" 참고)를 상수 바로 위 주석으로 남긴다 — `[ASSUMPTION]`이며 실데이터 확보 후 SM-2 검수 세트로 재보정 필요.
  - [ ] 필터는 **서비스에서** `searchBySimilarity` 결과에 적용한다(정책은 서비스, SQL 아님). `similarity >= MIN_SIMILARITY`인 것만 남긴다.
  - [ ] **LIMIT 3 이후에 필터해도 정확하다** — 정렬이 distance 오름차순(= similarity 내림차순)이고 필터 술어가 distance에 단조이므로 `filter(top3) === top3(filter)`. 리포지토리를 over-fetch로 바꾸지 말 것(불필요한 변경).
  - [ ] `queryVariableCases` 반환 타입을 `Promise<QueryResult>`로 변경: `{ matches: QueryMatch[]; topSimilarity: number | null }`. `topSimilarity`는 **필터 이전** 최고 유사도(케이스가 0건이면 `null`) — Task 3 관측성에만 쓰이며 클라이언트로 내려보내지 않는다.
- [ ] **Task 2: 기존 서비스 테스트 회귀 수정 (AC: #2, #3)**
  - [ ] ⚠️ `tests/services/query.test.ts`의 **"유사도 상위 3건까지만 반환한다"는 임계값 도입으로 반드시 깨진다** — 케이스 4건이 직교 축(similarity 1.0 / 0 / 0 / 0)이라 필터 후 1건만 남는다. 4건 모두 임계값 위(예: `mixedVector`로 0.95/0.9/0.85/0.8)로 배치해 "상위 3건 상한"의 의미를 유지하도록 재작성한다.
  - [ ] 나머지 기존 테스트는 통과한다(AC 2 매칭 0.97/0.9, NFR-1 재실행 0.99/0.877, 빈 코퍼스) — 확인만 하고 손대지 말 것.
  - [ ] 반환 타입 변경에 따라 기존 단언을 `result.matches` 기준으로 갱신.
  - [ ] 신규 테스트: 임계값 미만 케이스만 있으면 `matches`가 빈 배열이고 `topSimilarity`는 실제 최고값을 담는다 / 경계값(정확히 `MIN_SIMILARITY`)은 **포함**된다(`>=`) / 임계값 이상·미만이 섞이면 이상만 남는다 / 코퍼스가 비면 `topSimilarity === null`.
  - [ ] 신규 테스트: **`MIN_SIMILARITY`가 0.4~0.9 범위 안에 있다** — 0이나 1 같은 사고성 값으로 안전 게이트가 무력화/전면차단되는 것을 CI가 잡는다(값 자체를 고정하지는 않는다 — 재보정은 허용되어야 한다).
- [ ] **Task 3: `/api/query` — 응답 형태 유지 + 무매칭 관측성 (AC: #3)**
  - [ ] `app/api/query/route.ts`: 서비스 반환이 객체로 바뀌므로 `Response.json({ matches })`로 명시 구성. **`topSimilarity`를 응답 바디에 넣지 않는다**(클라이언트 계약 불변 — 3.3의 `QueryMatchDto` 그대로).
  - [ ] `matches.length === 0`이면 AD-10 구조화 로그 1건: `console.info(JSON.stringify({ event: "query_no_match", topSimilarity }))`. **질의 텍스트는 절대 로그에 넣지 않는다**(NFR-5 — 질의에 상황 세부가 담긴다). 이 로그가 나중에 임계값을 실데이터로 재보정할 유일한 계측 근거다.
  - [ ] 기존 401/400/502 경로와 `query_failed` 로그는 그대로 둔다.
- [ ] **Task 4: 매칭 카드에 발생 홀 메타 태그 (AC: #1)**
  - [ ] `query-panel.tsx` 매칭 카드 배지 줄 우측 끝(`margin-left: auto`)에 메타 텍스트 추가 — 프로토타입 `RunScreen.js` 130행 `{m.meta}`(12px, `#888`) 자리 그대로.
  - [ ] 형식: `{M월 D일} · {hallName} · {stepName} 단계` (프로토타입 meta는 "6월 7일 · 주례사 단계"였고, AC 1이 요구하는 **발생 홀**을 그 사이에 넣는다).
  - [ ] 날짜는 모듈 레벨 `Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" })` — `checklist-instance-view.tsx` 16~21행과 동일 관례(weekday만 뺀다).
  - [ ] `createdAt`이 파싱 불가한 값이면 날짜 조각을 생략하고 나머지(홀·단계)만 렌더링한다 — `Invalid Date` 문자열이 예식 중 화면에 노출되면 안 된다(Story 2.3 캐시 날짜 검증 교훈).
  - [ ] `hallName`/`stepName`은 이미 3.3의 API 응답과 `QueryMatchDto`에 들어 있다 — **DTO·API·리포지토리 변경 불필요**.
- [ ] **Task 5: "관련 사례 없음" 정식 카드 — 프로토타입 문자 그대로 (AC: #3)**
  - [ ] `prototype/js/screens/RunScreen.js` 143~152행을 문자 그대로 이식해 3.3의 `.run-query__none` 플레인 텍스트를 대체한다:
    - 카드: `margin-top: 20px`, `border: 1px solid var(--color-info)`, 배경 `color-mix(in srgb, var(--color-info) 10%, white)`(프로토타입 `#eef5fd`의 토큰 파생 — **임의 hex 금지**, PR #27에서 확립된 규칙), `border-radius: var(--radius-lg)`, `padding: 20px`, 등장 애니메이션은 `.run-query__match`와 동일(120ms `ease-enter`, `prefers-reduced-motion`에서 해제).
    - 배지: "관련 사례 없음" — `var(--color-info)` 배경, 흰 글자, `radius 4`, `padding 2px 8px`, 12px/600.
    - 제목: "관련 사례 없음 — 선임에게 연락하세요" — 18px/700, `margin-top: 10px`. **UX-DR15 고정 문구, 한 글자도 바꾸지 말 것.**
    - 본문: "비슷하지 않은 사례를 억지로 보여드리지 않습니다. 지금 바로 **담당 선임에게 연락**하세요. 이 상황은 예식 종료 후 피드백으로 남겨두면 다음부터 검색됩니다." — 14px, `var(--color-text-secondary)`, line-height 1.5, `margin-top: 6px`, "담당 선임에게 연락"만 `<strong>`.
  - [ ] `role="status"`를 유지해 스크린리더에 응답 도착이 전달되게 한다(3.3 동일).
  - [ ] 이 카드는 **에러가 아니다** — `var(--color-error)` 계열 색을 절대 섞지 않는다(DESIGN.md §2: 파랑 = 정직함의 신호).
- [ ] **Task 6: 실패 종류별 오류 카드 + 재시도 (AC: #4)**
  - [ ] `query-panel.tsx`의 `state: "error"` 플래그를 `error: QueryError | null`로 교체 — `{ kind: "offline" | "session" | "invalid" | "server"; title: string; description: string }`.
  - [ ] 분기(계열 전수 — 실패 원인마다 "무엇이 실패했고 무엇을 하면 되는지"가 달라야 한다, DESIGN.md §14):
    - `fetch` throw 또는 `navigator.onLine === false` → `offline` / 제목 "네트워크 연결이 끊겼습니다" / 본문 "연결이 돌아오면 다시 시도해주세요. 체크리스트는 계속 볼 수 있습니다."(AD-5 — 예식 진행 자체는 막히지 않음을 안심시킨다)
    - `res.status === 401` → `session` / 제목 "로그인이 만료되었습니다" / 본문 "다시 로그인한 뒤 질의해주세요." — 액션은 `다시 시도`가 아니라 `/login` 링크. **패널이 자동 리다이렉트하지 않는다**: 예식 중 화면을 강제로 날리는 것은 위험하다(폴링 쪽 자동 리다이렉트는 `checklist-instance-view.tsx` 174행에 이미 있으므로 이중으로 만들지 않는다).
    - `res.status === 400` → `invalid` / 제목 "질의를 보낼 수 없습니다" / 본문 = 서버 봉투 `error.message`(예: "질의는 500자 이내로 입력하세요")
    - 그 외(502/500 등) → `server` / 제목 "질의에 실패했습니다" / 본문 = 서버 봉투 `error.message` ?? "잠시 후 다시 시도해주세요."
  - [ ] 봉투 파싱은 방어적으로: `await res.json().catch(() => null)` 후 `typeof body?.error?.message === "string"`일 때만 사용.
  - [ ] 오류 카드 시각: `border: 1px solid var(--color-error)` + 배경 `color-mix(in srgb, var(--color-error) 10%, white)` + `radius var(--radius-lg)` + `padding 20px` + `margin-top 20px`. 배지 "질의 실패"(`var(--color-error)` 배경/흰 글자, 12px/600), 제목 16px/700, 본문 14px `var(--color-text-secondary)`. 조용한 토스트 금지 — 인라인 카드로 상시 노출(UX-DR14).
  - [ ] `다시 시도` 버튼(`session` 종류 제외)은 `.btn-secondary`를 재사용하고 **반드시 기존 `runQuery()`를 그대로 호출한다** — 새 제출 경로를 만들지 말 것(3.3의 `pendingRef` 이중 제출 가드를 그대로 상속해야 한다). 높이 ≥44px(DESIGN.md §7).
  - [ ] **입력이 변경되면 오류 카드를 즉시 비운다**(`onChange`에서 `setError(null)`). 이유: 오류 카드에는 액션 버튼이 있어서, 문구가 가리키는 질의와 입력창 내용이 어긋나면 "다시 시도"가 무엇을 재시도하는지 모호해진다. **매칭 카드/없음 카드는 입력 변경으로 비우지 않는다** — 액션이 없어 모호함이 생기지 않고, 예식 중 후속 질문을 타이핑하면서 방금 받은 근거를 계속 읽을 수 있어야 한다(3.3에서 4차 리뷰까지 클린으로 확정된 동작을 유지).
  - [ ] in-flight 동안 입력창을 잠그는 3.3의 설계(사용자 지침 2026-07-28)는 **그대로 유지한다** — 요청 순번 추적/응답 무효화 장치를 새로 도입하지 말 것.
- [ ] **Task 7: 테스트 (AC: #1~4)**
  - [ ] `tests/components/query-panel.test.tsx` (MODIFY):
    - AC 1 — 매칭 카드에 `M월 D일 · 홀이름 · 단계명 단계` 메타가 렌더링된다 / `createdAt`이 잘못된 값이면 날짜 없이 홀·단계만 렌더링되고 "Invalid"가 화면에 없다.
    - AC 3 — 빈 결과에서 `#2B82E0` 카드(배지 "관련 사례 없음" + 고정 제목 + 본문)가 뜨고, 매칭 카드가 하나도 렌더링되지 않는다.
    - AC 4 — 4종 실패(fetch throw / 401 / 400 봉투 메시지 / 502)가 각각 다른 제목을 낸다 / `다시 시도` 클릭이 `runQuery`를 재실행해 성공 시 오류 카드가 사라진다 / 401에서는 `다시 시도` 대신 `/login` 링크가 보인다 / 오류 후 입력을 바꾸면 오류 카드가 사라진다 / **매칭 카드는 입력을 바꿔도 남아 있다**(의도된 비대칭 고정).
    - 기존 3.3 테스트의 오류 문구 단언("질의에 실패했습니다 — 다시 시도해주세요.")은 새 카드 문구로 갱신 — 삭제하지 말고 이관할 것.
  - [ ] `tests/services/query.test.ts` (MODIFY): Task 2 항목 전부.
  - [ ] `tests/repositories/variable-case.test.ts`는 **수정 불필요**(임계값은 리포지토리에 없다).
- [ ] **Task 8: `deferred-work.md` 갱신 (AC: #3 후속)**
  - [ ] "실행 중 질의 유사도 임계값(`MIN_SIMILARITY = 0.5`)이 실데이터 없이 정해진 `[ASSUMPTION]` — OpenAI 키 투입 후 SM-2 검수 세트와 `query_no_match` 로그의 `topSimilarity` 분포로 재보정 필요" 를 기존 항목들과 같은 톤으로 1줄 추가.
  - [ ] 3.3이 남긴 "embedding 텍스트가 stepName/outcome을 포함하지 않아 3.3/3.4 검색 품질에 영향 가능 — 3.3/3.4에서 재검토" 항목의 재검토 트리거를 "실데이터 검수 시"로 갱신한다(3.3에서 이미 "현행 유지"로 재검토했고 3.4도 임베딩 대상을 바꾸지 않는다 — 항목을 조용히 지우지 말 것).

## Dev Notes

### 임계값 — 최종값 0.42 (실측 확정, 아래 "실측 결과" 참고)

> 아래는 착수 시점의 `[ASSUMPTION]` 추론이다. 구현 중 사용자가 실 OpenAI 키를 제공해
> **실제 임베딩으로 측정**했고, 그 결과 0.5는 너무 타이트한 것으로 확인돼 **0.42로
> 확정**했다. 최종 근거는 이 절 뒤의 "실측 결과"를 따른다.

### (착수 시 추론) 임계값 0.5의 근거 `[ASSUMPTION]`

현재 임베딩 벤더는 **OpenAI `text-embedding-3-large`(1024차원 Matryoshka 축소)**다(2026-07-28 벤더 교체, `lib/ai/adapters/openai.ts`). 3.3 스토리가 쓰여진 시점의 Voyage가 아니므로 임계값은 **현 어댑터 기준**으로 정한다.

1. `text-embedding-3-*`는 ada-002와 달리 무관한 텍스트 쌍의 코사인 유사도가 낮게 퍼진다 — 공개된 비교 실험에서 무관 단어 쌍 평균 ≈ 0.43(ada-002는 ≈ 0.85), 일반 코퍼스 실무 기준선으로 **0.45**가 자주 인용된다.
2. 그런데 우리 코퍼스는 **전부 웨딩홀 예식 운영 텍스트**로 도메인이 좁다 — 서로 무관한 두 변수 케이스라도 일반 코퍼스의 무관 쌍보다 유사도가 높게 나온다. 따라서 일반 기준선(0.45)보다 **보수적으로 올려 잡아야** SM-2(무관 사례 0%)를 지킬 수 있다.
3. 두 실패 모드의 비용이 대칭이 아니다. **거짓 양성**(무관한 사례를 근거처럼 제시) = PRD §6 Safety가 지목한 실제 사고 경로. **거짓 음성**(관련 있는데 "없음") = 설계된 안전한 실패 모드로, 화면은 "선임에게 연락하세요"라는 유효한 다음 행동을 제시한다. 그러므로 **의심스러우면 높은 쪽**.

→ 착수 시점에는 **`MIN_SIMILARITY = 0.5`**로 출발했다.

### 실측 결과 — 최종 확정값 `0.42`

구현 중 사용자가 `.env.local`에 실 `OPENAI_API_KEY`를 투입해, **실제 `text-embedding-3-large`(1024차원) 호출로 측정**했다(웨딩홀 도메인 문서 3건 × 질의 8건, `inputType` document/query 비대칭 적용):

| 구분 | 질의 | 최고 유사도 |
|---|---|---|
| 관련 | "주례자가 갑자기 순서를 바꿨어요" | 0.570 |
| 관련 | "주례자가 즉흥으로 순서를 바꾸고 있어요" | 0.605 |
| 관련 | "축가 반주가 안 나와요" | 0.501 |
| 관련 | "화면에 영상이 안 떠요" | 0.502 |
| 무관 | "주차장이 만차라서 하객이 못 들어와요" | 0.366 |
| 무관 | "신부님 부케가 없어졌어요" | 0.234 |
| 무관 | "하객이 예상보다 너무 많이 왔어요" | 0.270 |
| 무관 | "점심으로 뭘 먹을까요" | 0.183 |

**관련 0.500~0.674 / 무관 0.183~0.366** — 두 구간 사이가 비어 있고, 그 사이의 `0.42`를 취한다(무관 최댓값에서 +0.054, 관련 최솟값에서 -0.08). 거짓 양성 비용이 더 크므로 정중앙(0.43)보다 무관 쪽에서 조금 더 떨어뜨렸다.

**0.5를 버린 이유:** 진짜 매칭 두 건이 0.5007 / 0.5023으로 **0.0005 차이**로 통과했다 — 표현이 조금만 달라져도 근거 있는 사례가 "관련 사례 없음"으로 뒤집히는 취약한 지점이었다.

### ⚠️ 실측으로 드러난 한계 — NFR-4 예시는 임베딩 검색만으로 만족 불가

PRD가 NFR-4의 대표 예시로 명시한 **"주례자가 순서를 바꿈" ≒ "목사님이 애드리브함"** 쌍은 실측 유사도 **0.277**로, 무관 질의인 "주차장이 만차" (0.366)**보다도 낮다**. 즉 이 쌍을 매칭시키는 임계값은 무관 사례도 함께 들인다 — **어떤 임계값으로도 NFR-4 예시와 SM-2(무관 0%)를 동시에 만족시킬 수 없다.**

원인은 어휘가 완전히 어긋나는 동의 관계(목사님↔주례자, 애드리브↔성혼선언 순서변경)를 이 임베딩 모델이 충분히 가깝게 놓지 않는 것이다. 케이스 텍스트에 단계명·태그를 덧붙이면 관련 +0.01~0.02 / 무관 -0.03으로 분리폭이 소폭 개선되지만 이 쌍(0.285)은 여전히 구제되지 않는다.

이 스토리는 **SM-2(무관 사례 0%)를 우선**해 0.42를 택했다 — PRD §6 Safety가 거짓 양성을 실제 사고 경로로 지목했고, 거짓 음성은 "선임에게 연락하세요"라는 유효한 다음 행동이 있는 설계된 안전한 실패이기 때문이다. 후속 후보(확정 시 LLM 동의어 확장 / 하이브리드 검색 / 질의 확장)는 `deferred-work.md`에 기록했다 — **대표 판단이 필요한 사항**이다.

### AC 3을 만족시키는 유일한 구조 — "필터 없으면 AC 3은 구현 불가"

pgvector 검색은 코퍼스에 행이 하나라도 있으면 **항상** 상위 N건을 반환한다. 즉 3.3 상태에서 "관련 사례 없음"은 *코퍼스가 완전히 비었을 때만* 뜬다. AC 3이 말하는 "관련 있는 케이스가 하나도 없을 때"는 코퍼스가 빈 상태가 아니라 **가장 가까운 것조차 충분히 가깝지 않은 상태**다. 이 판정을 하는 것이 Task 1의 임계값이고, 이것이 이 스토리의 존재 이유다. 임계값 없이 UI만 예쁘게 만들면 AC 3은 미구현이다.

### LLM 생성은 이 스토리에서도 사용하지 않는다

3.3이 확정한 결정(`[ASSUMPTION]`, 3.3 Dev Notes "LLM 미사용 결정")을 그대로 승계한다. AC 1은 "매칭된 변수 케이스의 상황 설명과 사후 판단이 함께 나타난다" — 저장된 원문 표시이지 생성 요약이 아니다. `LLMPort.generateStream`은 이번에도 미사용으로 남는다. 요약·재작성·"AI가 답변" 형태를 발명하지 말 것 — 환각은 SM-2와 정면 충돌하고 NFR-2(p95 5초)도 위태로워진다.

### 프로토타입이 두 카드를 문자 그대로 정의한다

`prototype/js/screens/RunScreen.js`:
- **106~141행** — 질의 카드 + 매칭 카드(3.3이 이미 이식 완료). 130행 `{m.meta}`가 Task 4가 채울 **유일한 빈자리**다: `fontSize: 12, color: '#888', marginLeft: 'auto'`.
- **143~152행** — "관련 사례 없음" 카드(Task 5의 원본). `border: '1px solid #2b82e0'`, `background: '#eef5fd'`, `borderRadius: 12`, `padding: 20`, `marginTop: 20`, 배지 12px/600, 제목 18px/700 marginTop 10, 본문 14px `#555` lineHeight 1.5 marginTop 6.

프로토타입에는 **오류 상태가 없다** — Task 6의 오류 카드는 DESIGN.md §14(Error: 질의 응답 실패)와 이 저장소의 기존 톤(`color-mix` 틴트 박스, `.btn-secondary`)에서 파생한다. 프로토타입에 없다고 해서 오류를 플레인 텍스트로 두면 AC 4 미달이다.

### 기존 코드 현황 (이 스토리가 재사용/수정하는 것)

| 파일 | 현재 상태 | 3.4가 하는 일 |
|---|---|---|
| `lib/db/repositories/variable-case.ts` | `searchBySimilarity`가 `similarity`(1-distance) 포함해 반환, tie-break 고정 | **무수정** |
| `lib/services/query.ts` | 검증 → 임베딩(`inputType:"query"`) → 상위 3건 | 임계값 필터 + 반환 타입 확장 |
| `app/api/query/route.ts` | 401/400/502 봉투 + `query_failed` 로그 | `{ matches }` 명시 구성 + `query_no_match` 로그 |
| `query-panel.tsx` | 매칭 카드·뮤트 톤 없음 텍스트·한 줄 오류 | 메타 태그 + 없음 카드 + 오류 카드 |
| `checklist-instance-view.css` 628~813행 | `.run-query__*` 전체 | `.run-query__none-*`, `.run-query__error-*` 확장(기존 클래스 네이밍 유지) |
| `checklist-instance-view.tsx` | `<QueryPanel isOffline={isOffline} />` 520행 | **무수정**(props 변경 없음) |

디자인 토큰은 전부 `app/design-tokens.css`에 있다: `--color-info: #2b82e0`, `--color-error: #e0353b`, `--radius-lg: 12px`, `--radius-sm: 4px`, `--color-text-secondary`, `--color-text-muted`. **하드코딩 hex 금지** — 틴트가 필요하면 `color-mix(in srgb, var(--token) 10%, white)`(저장소 확립 관례, `ceremony-detail.css` 429행 등).

### 회귀 위험 — 반드시 확인할 것

1. **`tests/services/query.test.ts`의 "상위 3건" 테스트는 임계값 도입으로 깨진다**(Task 2). 이 실패를 "테스트가 낡았으니 삭제"로 처리하면 AC 2 커버리지가 사라진다 — 반드시 재작성.
2. `queryVariableCases` 반환 타입 변경은 호출부가 라우트 하나뿐이다(`app/api/query/route.ts`). 다른 호출부 없음(확인 완료).
3. `.run-query__none` 클래스는 없음 카드로 **재정의**된다 — 기존 뮤트 톤 규칙(14px `#888` 플레인)을 지우지 않고 남겨두면 유령 스타일이 된다.
4. 오류 상태 구조 변경(`state` → `error` 객체) 시 3.3의 **in-flight 입력 잠금**(`disabled={loading}`)과 **`pendingRef` 이중 제출 가드**가 함께 유지되는지 확인. 이 둘은 코덱스 4라운드를 거쳐 확정된 설계다.

### 환경/검증 제약 (3.3과 동일)

- `.env.local`에 실 `OPENAI_API_KEY` 없음 → 실제 임베딩의 의미 유사도로 임계값을 실증할 수 없다. 자동 테스트는 통제된 가짜 벡터(`vi.mock("@/lib/ai")`)로 **임계값 로직의 정확성**만 검증한다(값의 적절성은 검증 불가 — 위 `[ASSUMPTION]`).
- worktree로 착수 시 `.env.local`/`.env.test`는 git 미추적이므로 primary에서 복사하되 **DB 포트를 이 worktree 전용 격리 컨테이너로 바꾼다**(Story 5.2/3.3 선례 — 공유 5434 비접촉). 마이그레이션은 0000~0023 전체 체인 적용.
- 실서버 종단 검증(3.3 선례, 포트 충돌 피해서): 로그인 → 더미 임베딩 케이스 시드(정규 경로 `feedbackRepo.confirmAndCreateVariableCase`) → 임계값 위/아래 각각 질의해 매칭 카드/없음 카드 렌더링 확인 → 501자 질의로 400 카드 → 키 없음 상태에서 502 카드 → `query_no_match` 로그 1건 확인.

### Project Structure Notes

- 신규 파일 없음(테스트 제외). 모든 변경이 3.3이 만든 4개 파일 안에서 일어난다.
- `tests/api/` 디렉터리는 이 저장소에 없다(라우트는 실서버 curl로 검증하는 관례) — Task 3의 응답 형태/로그는 실서버 검증 + 서비스 테스트로 커버하고, 새 테스트 디렉터리를 만들지 않는다.
- CSS는 `checklist-instance-view.css`의 `.run-query__*` 블록(628행~) 끝에 이어 붙인다. 별도 CSS 파일을 만들지 말 것.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.4] — 원문 AC(435~457행), UX-DR13/14/15/18(128~138행)
- [Source: _bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md#FR-7(150행), §5 NFR(206~209행), §6 Safety(221~222행), SM-2(253행)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md#AD-5, AD-6, AD-8, AD-10]
- [Source: prototype/js/screens/RunScreen.js#106-152] — 매칭 카드 meta 자리(130행), 없음 카드(143~152행)
- [Source: _bmad-output/implementation-artifacts/3-3-natural-language-query.md] — 질의 파이프라인, 3.3/3.4 경계 표, in-flight 입력 잠금 결정
- [Source: DESIGN.md §2 Semantic 색, §7 Do/Don't, §14 States(관련 사례 없음 / Error 질의 실패), §15 Motion]
- [Source: https://www.s-anand.net/blog/embeddings-similarity-threshold/] — `text-embedding-3-*` 무관 쌍 평균 ≈43%, 실무 기준선 45%

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` — Epic 3, Story 3.4 (원문 AC)
- `_bmad-output/implementation-artifacts/3-3-natural-language-query.md` — 이 스토리가 확장하는 파이프라인 전체
- `prototype/js/screens/RunScreen.js` 106~152행 — 매칭 카드 meta + 없음 카드 원본
- `apps/web/lib/ai/adapters/openai.ts` — 현 임베딩 벤더(임계값 근거의 전제)

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-28: 스토리 최초 작성 (create-story, Epic 3 마지막 스토리 — 3.3 파이프라인 위에 안전장치 3종(유사도 임계값 / `#2B82E0` 없음 카드 + 발생 홀 태그 / 실패 종류별 오류 카드)을 얹는다. 스키마 변경 없음. 임계값 0.5는 현 벤더(OpenAI `text-embedding-3-large`) 기준 `[ASSUMPTION]`으로 실데이터 재보정 필요).
