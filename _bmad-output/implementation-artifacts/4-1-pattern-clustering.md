---
baseline_commit: df64d6c
---

# Story 4.1: 반복 패턴 클러스터링 (FR-10)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 관리자,
I want 누적된 피드백이 의미 기반으로 클러스터링되어 반복 횟수와 함께 보이기를,
so that 어떤 원인이 자주 반복되는지 한눈에 파악할 수 있다.

## Acceptance Criteria

1. **Given** 확정된 변수 케이스가 여러 건 쌓여 있을 때 **When** 일 1회 배치(Vercel Cron → `/api/cron/insight-recompute`)가 실행되면 **Then** 표현이 다른 유사 피드백이 같은 클러스터로 묶여 반복 횟수와 함께 노출된다(AD-6 사업체 전체 범위, 발생 홀 분포 표시).
2. **Given** 재계산이 진행 중일 때 **When** 관리자가 인사이트 화면을 보고 있으면 **Then** 기존 인사이트가 계속 보이고 화면을 덮는 스피너 없이 `#F7F7F7` 스켈레톤으로만 갱신 표시된다(UX-DR13, UX-DR17, AD-7 upsert).
3. **Given** 배치가 동시에 두 번 트리거되면 **When** 두 번째 실행이 시작되면 **Then** 동시 실행이 락으로 차단된다(AD-7).
4. **Given** 클러스터 항목이 표시될 때 **When** 관리자가 항목을 펼치면 **Then** 근거가 된 원본 피드백 목록이 `#E6E6E6` 행 구분선의 테이블로 표시된다(UX-DR9).

## 이 스토리의 본질 — 검색 인덱스를 "집계"로 뒤집는다

Epic 3이 만든 `variable_cases`(확정 피드백 → 임베딩)는 지금까지 **한 건을 찾는** 용도로만 쓰였다(3.3/3.4의 질의). 4.1은 같은 벡터를 **서로 비교**해 "같은 원인"끼리 묶는다. 즉 새로운 AI 능력을 추가하는 게 아니라, 이미 있는 임베딩의 사용 방향을 바꾸는 스토리다.

| # | 추가하는 것 | 근거 |
|---|---|---|
| A | `insight_clusters` + `insight_recompute_state` 테이블(마이그레이션 0024) | AD-7이 이름으로 지정한 테이블. 상태 행은 AC 3의 락. |
| B | 결정적 클러스터링(연결 성분) + 유사도 엣지 쿼리 | AC 1. "의미 기반"은 PRD FR-10 요구, 알고리즘은 미정 상태였음. |
| C | `recomputeInsights()` — AD-7의 **유일한** 쓰기 경로 | AD-7 명시. |
| D | `/api/cron/insight-recompute` + `vercel.json` cron | AD-10이 지정한 실행 방식(장기 워커 금지). |
| E | `/admin/insights` 화면 + 내비 배선 | AC 2·4. 지금 내비의 "인사이트"는 `--placeholder` span이라 도달 경로가 없다. |

**Story 4.2 경계:** 4.2는 오퍼레이터 차단(FR-11)과 미집계 `—` 표시만 다룬다. 이 스토리는 `/admin/*` 레이아웃이 이미 강제하는 admin 가드(layout.tsx 17행)에 얹히기만 하고, 새 인가 로직을 만들지 않는다.

## 확정한 설계 결정

### D-1. 클러스터링 = 임계값 기반 연결 성분(단일 연결), LLM 아님

k-means는 `k`를 요구하고 초기화에 따라 결과가 흔들린다. LLM 그룹핑은 재실행마다 결과가 달라진다. **유사도 임계값 이상인 케이스 쌍을 엣지로 보고 연결 성분(union-find)을 구하는 방식**은 입력 순서와 무관하게 결정적이고, 파일럿 규모에서 정확하다.

- 엣지 계산은 SQL에서(`vc_a.embedding <=> vc_b.embedding`, `a.id < b.id`) — 1024차원 벡터 N개를 앱으로 실어오지 않고 **임계값을 넘는 쌍만** 받는다.
- union-find는 순수 함수(`lib/services/insight-clustering.ts`)로 분리 — DB 없이 테스트 가능.
- **알려진 한계(체이닝):** 단일 연결은 A–B, B–C가 각각 임계값을 넘으면 A–C가 멀어도 한 클러스터가 된다. 파일럿 규모에서는 허용하고, 실데이터에서 과병합이 관측되면 deferred-work로 넘긴다(평균 연결/완전 연결은 순서 의존이라 결정성을 잃는다).

### D-2. 클러스터 임계값은 질의 임계값(0.42)과 다른 값이며, **실측으로 정한다**

3.4의 `MIN_SIMILARITY = 0.42`는 **질의↔문서**(비대칭, `inputType` 다름) 유사도이고, 판정하는 질문도 "관련 있는가?"다. 클러스터링은 **문서↔문서**(대칭)이며 "같은 원인인가?"라는 더 엄격한 질문이다. 두 값을 공유하면 안 된다.

3.4에서 임계값을 문헌 기준선으로 잡았다가 실측에서 뒤집힌 선례가 있으므로, 이 스토리도 **실키로 doc-doc 유사도를 측정한 뒤 확정한다**(Task 3).

**측정 결과 → 최종 `0.58`.** 착수 시 잠정값 `0.55`였고, 측정에서 드러난 사실은 3.4와 성격이 달랐다:

| | 같은 원인(8쌍) | 다른 원인(37쌍) |
|---|---|---|
| 범위 | 0.2353 ~ 0.6722 | 0.1693 ~ 0.5328 |

3.4의 질의 임계값 때는 두 구간이 깔끔히 분리됐지만, **doc-doc에서는 0.2353~0.5328이 통째로 겹친다.** 즉 "같은 원인을 전부 묶으면서 다른 원인을 하나도 안 묶는" 임계값이 존재하지 않는다. 다만 0.5328 위로는 다른 원인 쌍이 하나도 없어 **과병합 0을 보장하는 구간**은 있고, 그 안에서 0.58을 택했다(다른 원인 최댓값 +0.047 / 이 값으로 살아남는 가장 낮은 같은 원인 쌍 0.6063에서 -0.026). 정중앙(0.570)보다 위인 이유는 상수 주석에 기록 — 과병합은 잘못된 근거 제시이고, 단일 연결이라 거짓 엣지 하나가 두 클러스터 전체를 합쳐 피해가 증폭된다.

**대가:** 이 값에서 측정 세트의 같은 원인 8쌍 중 3쌍만 살아남는다. 반복 패턴을 놓치는 쪽(과소 보고)을 택한 결정이며, 실데이터가 쌓이면 `scripts/measure-cluster-threshold.ts`로 재보정해야 한다.

### D-3. 클러스터 라벨만 LLM, 나머지는 전부 파생 데이터

프로토타입의 `ins.title`("축가 반주(MR) 큐 지연")은 원인의 **이름**이지 어떤 한 사례의 원문이 아니다. 이건 요약 생성이고 LLM이 필요하다. 하지만 그 외 모든 표시값(반복 횟수, 홀 분포, 단계, 근거 목록)은 계산·조회로 나온다.

- LLM은 **라벨 한 줄만** 만든다(`gpt-4.1-mini`, `temperature: 0`, strict json_schema — 3.2가 확립한 구조화 경로 그대로).
- `ins.sub`는 LLM이 아니라 파생: `{대표 단계} 단계 · {홀A} N건 · {홀B} M건` — AC 1이 요구하는 **발생 홀 분포**를 여기서 만족시킨다.
- **라벨 실패는 배치를 중단시키지 않는다** — 해당 클러스터만 대표 케이스 `situation` 앞부분으로 폴백하고 구조화 로그를 남긴다. AI 한 건 실패로 집계 전체가 날아가면 안 된다.
- **멤버가 바뀌지 않은 클러스터는 라벨을 다시 만들지 않는다**(`members_hash` 비교) — 비용 절감이자, 아무것도 안 바뀐 날 라벨 문구만 흔들리는 것을 막는다.
- 근거는 라벨 바로 아래 한 번의 클릭으로 열린다(AC 4) — 라벨이 이상하면 관리자가 즉시 확인할 수 있다. §12 원칙 4("근거는 신성하다")를 깨지 않는 범위다.

### D-4. 클러스터 자연키 = `root_case_id`(가장 오래된 멤버)

AD-7은 upsert를 요구하므로 충돌 키가 필요하다. `cluster_id`의 실행 간 안정성은 AD-7이 명시적으로 보장하지 않지만, **가장 오래된 멤버의 case id**를 키로 쓰면 클러스터가 자라기만 하는 통상 경로에서 키가 그대로 유지된다(새 케이스가 합류해도 가장 오래된 멤버는 그대로). 분할·병합 때만 바뀐다. 결정적이고(`created_at ASC, id ASC` 첫 행), 진짜 FK다.

### D-5. 멤버십은 `member_case_ids jsonb`, 별도 조인 테이블 없음

`db.transaction()`은 프로덕션 드라이버(neon-http)에서 throw한다 — Story 1.3/2.1/3.2에서 반복 확인된 이 프로젝트의 확정 제약. AD-7이 요구하는 "커밋 시점 원자적 교체"를 지키려면 **한 문장**이어야 하고, 그러려면 한 테이블이어야 한다. 멤버십을 jsonb 배열로 들고 단일 CTE(upsert + 사라진 클러스터 DELETE)로 교체한다.

- 반복 횟수·홀 분포는 **저장하지 않고 읽기 시점에 파생**한다 — 저장된 카운트와 실제 멤버가 어긋날 경로 자체를 없앤다.
- jsonb 배열이라 FK 무결성이 없다. `variable_cases`는 v1에서 삭제 경로가 없는 append-only 테이블이므로 실질 위험이 없고, 읽기 시 조회되지 않는 id는 조용히 건너뛴다.

### D-6. 락은 advisory lock이 아니라 상태 행

`pg_advisory_lock`은 **세션 스코프**다. neon-http는 문장마다 다른 HTTP 요청이라 세션이 유지되지 않아 이 프로젝트에서는 동작하지 않는다. AD-7이 허용한 다른 선택지인 **상태 행**을 쓴다: 조건부 `UPDATE ... WHERE running_since IS NULL OR lock_expires_at < now()` 한 문장이 원자적 획득이고, 0행이면 이미 실행 중이다(AC 3).

- 만료(`lock_expires_at`)가 있어야 배치가 중간에 죽어도 다음 날 영구히 막히지 않는다.
- 같은 행이 `last_completed_at`(프로토타입의 "마지막 갱신 오늘 05:00")과 `last_error`도 들고 있다.

### D-7. 1건짜리 클러스터는 인사이트가 아니다

FR-10의 산출물은 "이 원인이 **N번째 반복**되고 있다"이다. 멤버 1건은 반복이 아니다. `MIN_CLUSTER_SIZE = 2` 미만은 저장하지 않는다 — 화면이 확정 케이스 전체 목록으로 변질되는 것을 막고, 라벨 LLM 호출도 실제 패턴에만 쓴다.

### D-8. 프로토타입의 세 번째 통계 카드는 그대로 쓸 수 없다

`InsightScreen.js` 9행의 "이번 달 신입 동반 예식 12회"는 **AD-3과 충돌한다** — 이 시스템에 `신입`/`선임` 구분은 존재하지 않는다(2026-07-24 PRD 변경). 데이터 소스가 없는 숫자를 지어낼 수 없으므로 "최근 30일 신규 확정 피드백"으로 대체한다. 나머지 두 카드(누적 피드백, 반복 원인 클러스터)와 레이아웃·타이포는 프로토타입 그대로.

## Tasks / Subtasks

- [x] **Task 1: 스키마 + 마이그레이션 0024 (AC: #1, #3)**
  - [x] `lib/db/schema.ts`에 `insightClusters` 추가: `id`(uuid pk), `rootCaseId`(uuid notNull unique → `variable_cases.id`), `label`(text notNull), `stepName`(text notNull, 대표 단계 스냅샷), `memberCaseIds`(jsonb `$type<string[]>` notNull default `[]`), `membersHash`(text notNull), `computedAt`(timestamp notNull defaultNow).
  - [x] `insightRecomputeState` 추가(단일 행): `id`(text pk, 항상 `'singleton'`), `runningSince`(timestamp, nullable — null이면 idle), `lockExpiresAt`(timestamp nullable), `lastCompletedAt`(timestamp nullable), `lastError`(text nullable).
  - [x] `drizzle/0024_insight-clusters.sql` 수기 작성(이 환경의 `drizzle-kit generate`는 비TTY 프롬프트로 실패 — Story 5.4/3.1 선례). `0023_snapshot.json` 기반으로 `0024_snapshot.json` 구성, `_journal.json` 갱신.
  - [x] 마이그레이션이 상태 행을 **시드**해야 한다: `INSERT INTO insight_recompute_state (id) VALUES ('singleton') ON CONFLICT DO NOTHING;` — 행이 없으면 조건부 UPDATE 락이 영원히 0행이라 배치가 절대 실행되지 않는다.
  - [x] `CHECK (id = 'singleton')`으로 두 번째 행이 생길 경로를 DB가 직접 막는다.
  - [x] 격리 DB(포트 5438)에 `0000~0024` 전체 체인을 처음부터 적용해 검증.

- [x] **Task 2: 유사도 엣지 리포지토리 + 순수 클러스터링 함수 (AC: #1)**
  - [x] `lib/db/repositories/variable-case.ts`에 `listSimilarPairs(minSimilarity: number)` 추가 — 이 파일의 "쓰기 함수 금지" 규칙은 유지된다(읽기 전용 추가).
    - `FROM variable_cases a JOIN variable_cases b ON a.id < b.id WHERE (a.embedding <=> b.embedding) <= 1 - minSimilarity` → `{ aId, bId }[]`. `a.id < b.id`로 각 쌍을 한 번만 받는다.
    - `ORDER BY a.id, b.id`로 고정 — 결과 순서가 union-find 출력에 영향을 주지 않지만, 테스트 재현성과 NFR-1 관례를 지킨다.
  - [x] `listAllForClustering()` 추가 — 클러스터링 대상 케이스의 메타(`id, stepName, situation, rationale, hallId, hallName, createdAt`)를 `created_at ASC, id ASC`로. **임베딩 컬럼은 select하지 않는다**(엣지는 SQL이 이미 계산했다).
  - [x] `lib/services/insight-clustering.ts` — 순수 함수 `buildClusters(cases, pairs, minSize)`:
    - union-find(경로 압축 + union by size)로 연결 성분 계산.
    - 각 성분의 멤버를 입력 순서(`created_at ASC, id ASC`)로 유지 → `rootCaseId = members[0].id`(D-4).
    - `minSize` 미만 성분은 버린다(D-7).
    - 성분 정렬: 멤버 수 DESC, `rootCaseId` ASC(동점 시 결정적).
    - `membersHash` = 멤버 id를 정렬해 이은 문자열의 SHA-256(node `crypto`) — 라벨 재생성 판단용.
    - DB·AI 의존성 없음. 이 파일은 `import`가 `node:crypto` 하나뿐이어야 한다.

- [x] **Task 3: 클러스터 임계값 실측 확정 (AC: #1)**
  - [x] 3.4와 동일한 방식으로 **실키**(`.env.local`의 `OPENAI_API_KEY`)로 측정한다 — 이번엔 **doc-doc**(양쪽 다 `inputType: "document"`) 유사도다.
  - [x] 측정 세트: 같은 원인의 다른 표현 쌍(예: "축가 MR이 늦게 나옴" ↔ "반주 페이더를 미리 안 올려둬서 한 박자 늦음")과, 같은 도메인 다른 원인 쌍(예: "축가 MR 지연" ↔ "식전 영상 HDMI 신호 끊김")을 각각 여러 쌍.
  - [x] 두 분포가 겹치지 않으면 그 사이값을, 겹치면 **과병합을 피하는 쪽(높은 값)**으로 잡는다 — 관리자 화면에서 무관한 사례가 한 원인으로 합쳐지는 것이 두 클러스터로 갈리는 것보다 나쁘다(잘못된 근거를 제시하는 셈).
  - [x] `MIN_CLUSTER_SIMILARITY` 상수 주석에 실측 구간과 날짜를 기록. **환경변수로 덮어쓰지 않는다**(3.4와 동일 원칙).
  - [x] 실측 구간을 고정하는 회귀 테스트를 건다(3.4 코덱스 2차 P2 교훈 — 단순 범위 체크는 의미 없다).

- [x] **Task 4: `lib/services/insight.ts` — AD-7의 유일한 쓰기 경로 (AC: #1, #3)**
  - [x] `recomputeInsights()`:
    1. 락 획득(`insightRepo.acquireLock(ttlMinutes)`) → 실패 시 `InsightLockedError` throw(라우트가 409로 변환).
    2. `listAllForClustering()` + `listSimilarPairs(MIN_CLUSTER_SIMILARITY)` → `buildClusters(...)`.
    3. 기존 클러스터를 `membersHash`로 조회해, **해시가 같은 클러스터는 기존 라벨을 재사용**하고 나머지만 LLM 라벨 생성(D-3).
    4. `replaceAll(clusters)` — 단일 CTE 원자 교체.
    5. `finally`로 락 해제 + `last_completed_at`/`last_error` 기록. **어떤 경로로 실패해도 락은 반드시 풀린다.**
  - [x] `generateLabel(members)`: `getLLMPort().generate({ prompt, responseSchema, temperature: 0 })`.
    - 프롬프트에 멤버들의 `situation`만 넣는다(라벨은 원인 이름이지 대처법이 아니다). 최대 8건까지만(비용·컨텍스트 상한).
    - 스키마: `{ type: "object", properties: { label: { type: "string" } }, required: ["label"], additionalProperties: false }`.
    - 응답 검증: `label`이 문자열이고 trim 후 1~40자여야 한다. 위반 시 폴백.
    - 폴백: 대표 케이스 `situation`의 앞 30자 + `…`. 구조화 로그 `{ event: "insight_label_failed", rootCaseId }` — **원문(상황 설명)은 로그에 넣지 않는다**(NFR-5).
  - [x] `getInsights()`(읽기): 클러스터 전체 + 멤버 케이스를 조회해 반복 횟수·홀 분포·근거 목록을 파생(D-5). 반환에 `isRecomputing`, `lastCompletedAt` 포함(AC 2).
  - [x] AD-7 주석: 이 파일 밖에서 `insight_clusters`에 INSERT/UPDATE/DELETE 금지임을 명시.

- [x] **Task 5: 리포지토리 `lib/db/repositories/insight.ts` (AC: #1, #3)**
  - [x] `acquireLock(ttlMinutes)`: `UPDATE insight_recompute_state SET running_since = now(), lock_expires_at = now() + interval, last_error = NULL WHERE id = 'singleton' AND (running_since IS NULL OR lock_expires_at < now()) RETURNING id` → 0행이면 `false`(AC 3).
  - [x] `releaseLock({ completed, error })`: `running_since = NULL, lock_expires_at = NULL`, 성공 시 `last_completed_at = now()`.
  - [x] `readState()`: 상태 행 조회(화면의 "마지막 갱신"·스켈레톤 판단).
  - [x] `replaceAll(clusters)`: **단일 문장** CTE —
    - `input`: `json_to_recordset($1)`로 계산 결과 전개.
    - `upserted`: `INSERT ... ON CONFLICT (root_case_id) DO UPDATE SET label, step_name, member_case_ids, members_hash, computed_at = now()`.
    - `deleted`: `DELETE FROM insight_clusters WHERE root_case_id NOT IN (SELECT root_case_id FROM input)`.
    - 최종 `SELECT`에서 **두 CTE를 모두 참조**한다 — 참조되지 않는 데이터 변경 CTE가 실행되지 않는 것으로 관측된 Story 5.5 선례를 그대로 방어한다.
    - 입력이 비면(확정 케이스 0건 또는 전부 1건짜리) 전체 삭제가 맞다 — `NOT IN (빈 집합)`은 참이므로 자연히 그렇게 동작한다. 테스트로 고정.
  - [x] `listClusters()` / `listCasesByIds(ids)`: 읽기 경로.

- [x] **Task 6: `/api/cron/insight-recompute` + `vercel.json` (AC: #1, #3)**
  - [x] `app/api/cron/insight-recompute/route.ts` — `GET`(Vercel Cron은 GET으로 호출한다).
  - [x] 인가: `Authorization: Bearer ${process.env.CRON_SECRET}`. **`CRON_SECRET`이 없으면 503으로 거부**한다 — 시크릿 미설정 환경에서 보호 없이 열리는 경로를 만들지 않는다(fail closed).
  - [x] 비교는 `crypto.timingSafeEqual`(길이 다르면 즉시 false) — 문자열 `===` 비교의 타이밍 누출을 피한다.
  - [x] `InsightLockedError` → **409**(AC 3, 실패가 아니라 "이미 실행 중"). 그 외 오류 → 500 + `{ event: "insight_recompute_failed" }` 구조화 로그.
  - [x] 성공 시 `{ event: "insight_recompute_done", clusterCount, caseCount, durationMs }` 로그 — 피드백 원문·상황 설명은 넣지 않는다(NFR-5).
  - [x] `export const maxDuration`을 넉넉히(임베딩 비교 + LLM 라벨 N건). `dynamic = "force-dynamic"`.
  - [x] `vercel.json`에 `crons: [{ path: "/api/cron/insight-recompute", schedule: "0 20 * * *" }]` — Vercel cron은 **UTC**라 05:00 KST = 전날 20:00 UTC(프로토타입 "매일 새벽 1회 갱신 · 마지막 갱신 오늘 05:00"과 일치).
  - [x] `.env.local.example`에 `CRON_SECRET` 추가, `ARCHITECTURE-SPINE.md` AD-10 시크릿 목록에도 추가.

- [x] **Task 7: `/admin/insights` 화면 — 프로토타입 InsightScreen.js 이식 (AC: #1, #2, #4)**
  - [x] `app/admin/insights/page.tsx`(Server Component): `getInsights()` 호출 → 헤더/통계/클러스터 목록.
    - 제목 줄: `인사이트` 28px/700 + `관리자 전용 · 읽기 전용` 배지(13px/600, `#888` 배경, 흰 글자, radius 4, `2px 8px`) — 프로토타입 15행 그대로.
    - 설명 줄(14px `--color-text-secondary`): "누적 피드백을 의미 기반으로 묶었습니다. 표현이 달라도 같은 원인이면 하나로 집계됩니다. 매일 새벽 1회 갱신 · 마지막 갱신 {…}" — 마지막 갱신은 `lastCompletedAt` 실제 값, 없으면 "아직 갱신되지 않음".
    - 통계 카드 3개(흰 배경, `1px solid --color-border-light`, radius 12, padding 20; 라벨 13px `#888`, 값 28px/700): 누적 확정 피드백 / 반복 원인 클러스터 / 최근 30일 신규 확정 피드백(D-8).
  - [x] `insight-card.tsx`(Client Component): 프로토타입 31~53행 그대로 —
    - 헤더 버튼 전체가 토글, `padding 18px 24px`, `gap 16`.
    - 반복 횟수: `{count}회` 24px/700 `var(--color-brand)`, `min-width 64px`, `flex: none`.
    - 제목 17px/600(= 라벨), 부제 13px `#888`(= `{단계} 단계 · {홀} N건 …`).
    - 우측 `▲/▼ 원본 피드백` 13px/600 `#888`, `margin-left: auto`.
    - 펼침 영역: `border-top 1px solid --color-border-light`, 배경 `--color-surface-soft`, `padding 8px 24px 16px`.
    - 근거 항목: 흰 배경 + `1px solid --color-border-light` + radius 8 + `12px 16px`, 본문 `"{situation}"` 14px `--color-text-secondary` line-height 1.5, 메타 12px `#888` = `{M월 D일} · {홀} · {단계}`.
      - 프로토타입 메타의 "김도윤 선임"은 **쓸 수 없다** — `feedback`에 작성자 식별자 컬럼이 의도적으로 없다(NFR-5, schema.ts 301~303행). 3.4 매칭 카드 메타와 같은 형식으로 통일한다.
      - 날짜 파싱 실패 시 날짜 조각만 생략(3.4 Task 4와 동일 방어).
    - 꼬리말 12px `#888`: "템플릿 반영 여부는 사람이 판단합니다 — 자동 반영은 v2에서 다룹니다." — 프로토타입 50행 문자 그대로.
    - `aria-expanded`/`aria-controls`로 토글 접근성 확보(프로토타입에는 없지만 §12 원칙 5 완성도 기준).
  - [x] `recompute-status.tsx`(Client Component, AC 2): `isRecomputing`이면 목록 **위에** `--color-surface-soft` 스켈레톤 줄(radius 8)과 "인사이트를 갱신하는 중입니다" 문구를 띄우고, 기존 목록은 그대로 둔다. **화면을 덮는 오버레이/스피너 금지**(UX-DR13).
    - 갱신 중일 때만 10초 간격 `router.refresh()`, 끝나면 정지. `prefers-reduced-motion`에서 스켈레톤 펄스 애니메이션 해제.
  - [x] 빈 상태(클러스터 0개): §14대로 `#888` 안내 — "아직 반복 패턴이 없습니다. 피드백이 2건 이상 같은 원인으로 쌓이면 여기에 표시됩니다." 실용적인 다음 행동을 담고, 탓하지 않는 톤.
  - [x] `admin-nav-links.tsx`의 `--placeholder` span을 `/admin/insights` `Link`로 교체(LINKS 배열에 편입).
  - [x] `insights.css` — 다른 admin 화면과 동일하게 페이지 전용 CSS 파일. **임의 hex 금지**, DESIGN.md 토큰과 `color-mix` 파생만(PR #27 규칙).

- [x] **Task 8: 테스트 (AC 전부)**
  - [x] `tests/lib/insight-clustering.test.ts`(순수, DB 없음): 두 성분 분리 / 체이닝으로 3건 병합 / 1건짜리 제외(D-7) / `rootCaseId`가 가장 오래된 멤버 / 엣지 입력 순서를 뒤집어도 동일 출력(결정성) / `membersHash`가 멤버 순서와 무관 / 엣지 0건이면 전부 버려짐.
  - [x] `tests/repositories/insight.test.ts`(격리 DB): `acquireLock` 성공 후 두 번째 호출이 **false**(AC 3) / 만료 후 재획득 가능 / `releaseLock`이 `last_completed_at` 기록 / `replaceAll`이 사라진 클러스터를 삭제하고 남은 것은 갱신(원자 교체) / 빈 입력이면 전부 삭제 / `root_case_id` unique 위반이 안 나는지.
  - [x] `tests/repositories/variable-case.test.ts`에 `listSimilarPairs` 추가: 임계값 위/아래 쌍 / `a.id < b.id`로 쌍 중복 없음 / 케이스 1건이면 빈 배열.
  - [x] `tests/services/insight.test.ts`: LLM 포트 mock —
    - 라벨 생성 성공 경로 / LLM throw 시 폴백 라벨로도 **`replaceAll`이 실행되고 락이 풀린다** / 응답이 스키마를 어겨도(빈 문자열, 41자, 숫자) 폴백 / `membersHash`가 같으면 LLM을 **호출하지 않는다** / 락 실패 시 `InsightLockedError` / 중간에 throw해도 `finally`로 락 해제.
    - `MIN_CLUSTER_SIMILARITY` 실측 구간 고정 테스트(Task 3).
  - [x] `tests/components/insight-card.test.tsx`: 접힘 상태에서 근거 미노출 / 펼치면 근거와 메타 노출(AC 4) / 반복 횟수·홀 분포 렌더링 / 날짜 파싱 실패 시 `Invalid Date` 미노출 / `aria-expanded` 토글.
  - [x] 회귀: 기존 345건이 그대로 통과해야 한다(schema 변경이 기존 쿼리에 영향 없음).

- [x] **Task 9: 검증**
  - [x] 격리 DB(5438)에 `0000~0024` 전체 체인 적용, vitest 전체 / `tsc` / `lint` / `build` 클린.
  - [x] 실서버(포트 3015) 종단: 시크릿 없이 cron 호출 → 401 / 틀린 시크릿 → 401 / `CRON_SECRET` 미설정 → 503 / 올바른 시크릿 → 200 + 클러스터 생성 / **연속 두 번 호출 시 두 번째가 409**(AC 3, 실제 락 확인) / `/admin/insights` SSR 렌더링 / 오퍼레이터 세션으로 접근 시 로그인 리다이렉트(4.2가 다루지만 회귀 확인).
  - [x] 실키로 실제 확정 피드백 여러 건을 시드해 **표현이 다른 두 케이스가 실제로 한 클러스터로 묶이는지** 확인(AC 1의 핵심 — mock 벡터로는 검증되지 않는 부분).

## Dev Notes

### 마이그레이션 번호 충돌

현재 병행 세션이 없고(`git worktree list`에 main과 이 워크트리뿐), main은 `df64d6c`에서 정지. `0024`가 안전하다. 병합 직전에 `origin/main`을 다시 확인할 것 — Epic 3~5에서 이 충돌이 다섯 번 반복됐다.

### 이 스토리가 건드리지 않는 것

- `lib/services/query.ts`의 `MIN_SIMILARITY`(0.42) — 질의 경로는 손대지 않는다. 두 임계값은 서로 독립이다(D-2).
- `feedback.ts`의 임베딩 텍스트 구성 — deferred-work.md에 별도 스토리로 기록돼 있다. 여기서 바꾸면 기존 케이스 재임베딩이 필요해진다.
- `variable_cases` 생성 경로(`confirmAndCreateVariableCase`) — AD-8 단일 경로 유지.

### NFR-4 한계와의 관계

3.4에서 실측으로 확인한 한계("주례자가 순서를 바꿈" ≒ "목사님이 애드리브함"이 0.277)는 **여기서도 그대로 적용된다** — 어휘가 완전히 어긋나는 동의 관계는 클러스터링에서도 두 클러스터로 갈린다. 프로토타입 데이터가 바로 그 예("목사님 애드리브" · "순서 바꿈" 동일 집계)를 두 번째 클러스터로 보여주고 있어, **프로토타입이 약속하는 수준의 병합은 임베딩만으로는 재현되지 않는다.** 이건 이 스토리에서 해결할 수 없고(해결책은 하이브리드 검색/동의어 확장 — deferred-work.md), 실측 결과를 완료 보고에 명시한다.

## Change Log

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-07-28 | 스토리 파일 작성 | Epic 4 착수 |
| 2026-07-28 | 클러스터 임계값 0.55(잠정) → **0.58**(실측 확정) | Task 3 측정에서 두 분포가 겹치는 것이 드러나, 과병합 0을 보장하는 구간에서 재선택 |
| 2026-07-28 | 통계 카드 3번째를 "최근 30일 신규 피드백"으로 대체 | 프로토타입의 "신입 동반 예식"은 AD-3(신입/선임 구분 없음)과 충돌해 데이터 소스가 없음 |
| 2026-07-28 | 근거 메타에서 작성자 이름 제외 | `feedback`에 작성자 식별자 컬럼이 의도적으로 없음(NFR-5) — 발생 홀로 대체 |
| 2026-07-28 | "마지막 갱신" 시각을 24시간제로 고정 | 12시간제 기본값이 런타임 ICU 빌드에 따라 "오후 3:29"/"PM 03:29"로 갈림(로컬에서 후자 확인) |

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` §Epic 4 / Story 4.1
- `_bmad-output/planning-artifacts/prds/prd-wedding-check-2026-07-23/prd.md` §4.5 FR-10
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` AD-1, AD-3, AD-6, AD-7, AD-10
- `prototype/js/screens/InsightScreen.js`(디자인 권위), `prototype/js/data.js` 139~152행
- `_bmad-output/implementation-artifacts/3-4-evidence-based-response.md`(임계값 실측 방법론)

### Completion Notes

**AC 충족**

| AC | 검증 방식 |
|---|---|
| 1 | 실서버 + **실키** 종단 — 확정 케이스 5건을 실제 임베딩으로 시드하고 배치를 돌려 클러스터 2개 생성 확인. 표현이 다른 두 피드백이 실제로 한 원인으로 묶였고(아래), 서로 다른 원인끼리는 합쳐지지 않았으며, 1건짜리는 제외됐다. |
| 2 | 서비스가 `isRecomputing`을 내려주고 화면이 목록 위 스켈레톤만 덧붙임(오버레이 없음). 만료된 락은 실행 중으로 치지 않음. 컴포넌트 테스트 4건 + 서비스 테스트 2건. |
| 3 | HTTP 계층 실검증 — 동시 4회 호출에 **200 1건 / 409 3건**, 락이 잡힌 상태에서 호출 시 결정적으로 409, 해제 후 200. |
| 4 | 펼침 토글 + 근거 카드(상황 · `M월 D일 · 홀 · 단계`) 렌더링. 컴포넌트 테스트 8건. |

**실키로 실제 만들어진 클러스터** (mock 벡터로는 검증되지 않는 부분)

| 라벨(LLM 생성) | 반복 | 묶인 근거 |
|---|---|---|
| HDMI 셀렉터 입력 및 케이블 문제 | 2회 | "식전 영상이 스크린에 안 나왔다. HDMI 셀렉터가 2번 입력으로…" + "영상 송출이 중간에 끊겼다. 셀렉터 케이블 접촉 불량…" |
| 입장 조명 타이밍 오류 | 2회 | "신부 입장 때 스팟 조명을 늦게 올려…" + "신랑 입장 조명을 너무 일찍 올려서…" |

주례사 케이스 1건은 짝이 없어 제외(D-7). 두 클러스터가 서로 합쳐지지 않았다(과병합 없음).

**실측으로 드러난 한계 — 대표 판단이 필요한 항목**

1. **임계값 0.58에서 재현율이 낮다.** 측정 세트의 "같은 원인" 8쌍 중 3쌍만 살아남는다. 두 분포가 겹쳐 있어(같은 원인 0.2353~0.6722 / 다른 원인 0.1693~0.5328) 재현율을 올리면 반드시 과병합이 함께 들어온다. 이번엔 §12 원칙 4("근거는 신성하다")에 따라 정밀도를 택했다 — 관리자 화면의 "N회 반복"에 무관한 사례가 섞이는 것은 잘못된 근거를 제시하는 것이고, 과소 보고는 숫자가 작을 뿐 거짓말은 아니다. **재현율을 우선하는 판단이라면 임계값을 낮추는 것이 아니라 하이브리드 검색으로 가야 한다**(아래 2번과 같은 처방).
2. **PRD가 NFR-4 예시로 든 쌍은 여기서도 안 묶인다.** "주례자가 순서를 바꿈" ≒ "목사님이 애드리브함"은 doc-doc 실측 **0.2353**으로, 다른 원인 쌍(최대 0.5328)보다 한참 낮다. 3.4에서 query-doc 0.277로 확인한 것과 **같은 한계의 재확인**이다. 프로토타입 `data.js` 145행이 이 쌍을 한 클러스터로 보여주지만, **임베딩만으로는 그 수준의 병합이 재현되지 않는다.** deferred-work.md에 후보(동의어 확장 / 하이브리드 검색)를 기록했다.

**설계 편차와 이유**

- 프로토타입 3번째 통계 카드("이번 달 신입 동반 예식")를 "최근 30일 신규 피드백"으로 대체 — AD-3상 신입/선임 구분이 시스템에 없어 데이터 소스가 존재하지 않는다(Change Log).
- 근거 메타의 작성자 이름("김도윤 선임")을 발생 홀로 대체 — `feedback`에 작성자 식별자 컬럼이 의도적으로 없다(NFR-5, schema.ts 301~303행). 3.4 매칭 카드 메타와 형식을 통일했다.
- AC 4 원문은 "테이블"이지만 프로토타입(43~49행)은 `#E6E6E6` 보더 카드 스택이다. 프로토타입을 디자인 권위로 따랐고, `#E6E6E6` 구분선이라는 UX-DR9의 실질은 유지된다.

**검증**

- 격리 DB(포트 5438, pgvector) `0000~0024` 전체 체인 적용, 앱 포트 3015.
- vitest **414건**(신규 69건) 통과, `tsc`/`lint`/`build` 클린.
- cron 인가 4종: 시크릿 없음 401 / 틀린 시크릿 401 / **길이만 같은 시크릿** 401(timingSafeEqual) / 올바른 시크릿 200. `CRON_SECRET` 미설정 시 503은 코드 경로로 보장(fail closed).
- 오퍼레이터 세션으로 `/admin/insights` 접근 → 307 `/login`(4.2 범위지만 회귀 확인).

**코덱스 리뷰**

1차에서 P1 1건 + P2 2건, 전부 실결함이라 수정했다.

- **(P1) 오류 메시지가 NFR-5의 유출 통로였다.** drizzle은 실패한 쿼리의 **파라미터**를 오류 메시지에 싣고, openai 어댑터는 벤더 응답 본문을 메시지에 붙인다. `err.message`를 `last_error`에 저장하고 raw `err`를 `console.error`에 넘기면 상황 원문이 로그와 상태 행에 남는다. 지적은 `insight.ts` 한 곳이었지만 **계열 전체를 전수 점검**해(메모리 `fix-defect-class-not-instance`) raw `err`를 로깅하던 4곳을 모두 고쳤다 — 그중 3곳이 기존 코드였고, `confirm`/`structure`는 실제로 `situation`·`rationale`을 SQL 파라미터로 넘기는 경로라 같은 결함이었다. `lib/safe-error.ts::toSafeErrorLabel()`이 메시지 대신 오류 종류 + SQLSTATE만 남긴다.
- **(P2) 클러스터링 입력과 유사도 쌍이 서로 다른 DB 스냅샷을 봤다.** 두 조회가 `Promise.all`의 별개 HTTP 문장이라 그 사이 확정된 케이스가 한쪽에만 나타날 수 있었다. 순차 실행 + `listSimilarPairs(minSimilarity, candidateIds)`로 쌍 조회를 확정된 대상 집합 안에 못 박아, 타이밍과 무관하게 같은 그래프가 나오게 했다.
- **(P2) 락 해제 문장 자체가 실패하면 `finally`여도 락이 안 풀렸다.** 더구나 `finally`에서 throw가 나면 이미 성공한 `replaceAll`의 결과까지 실패로 보고된다. 3회 재시도 후 삼키고 구조화 로그만 남기도록 바꿨다(데이터는 이미 쓰였고 남은 락은 TTL이 회수한다).

2차에서 **1차 수정이 만든 결함**이 드러나 다시 고쳤다.

- **(P1) 재시도가 남의 락을 풀 수 있었다.** 1차에서 넣은 해제 재시도가 소유권을 확인하지 않았다 — 해제 문장이 DB에서는 커밋됐는데 응답만 유실되면, 재시도하는 사이 다음 실행이 락을 가져갈 수 있고, 그 상태에서 재시도가 singleton 행을 비우면 **새 실행의 락까지 지워 동시 실행이 열린다**(AC 3 정면 위반). TTL 만료로 락을 빼앗긴 뒤 뒤늦게 끝난 실행도 같은 경로다. `run_token` 펜싱 토큰을 도입해(`acquireLock`이 토큰 발급, `releaseLock`은 `run_token` 일치 시에만 해제) 막았다. 해제가 0행이면 실패가 아니라 "이미 내 락이 아니다"라는 정상 종료라 재시도하지 않고 `insight_lock_release_superseded`만 남긴다. **0024가 아직 병합 전이라 새 마이그레이션을 만들지 않고 컬럼을 0024에 추가**하고 격리 DB를 처음부터 재생성해 전체 체인을 재검증했다.
3차에서 **2차 수정이 절반만 고쳤다는 것**이 드러났다.

- **(P1) 펜싱 토큰이 해제만 지키고 쓰기는 안 지켰다.** TTL이 만료돼 실행 B가 락을 가져간 뒤에도, 뒤늦게 끝난 실행 A가 `replaceAll`로 들어와 B의 결과를 덮어쓸 수 있었다 — 해제만 토큰 불일치로 거부될 뿐이라 AC 3의 동시 실행 격리는 여전히 깨져 있었다. 소유권 확인을 **별도 문장으로 두면 확인과 쓰기 사이에 또 TOCTOU가 생기므로**, 같은 문장 안의 `owner` CTE로 두고 upsert와 delete가 모두 이를 참조하게 했다. delete에도 가드가 필요하다 — `input`이 소유권 없음으로 비는 것과 "결과가 0건"인 것을 구분하지 못하면 남의 인사이트를 통째로 지운다. 소유권이 없으면 0건을 쓰고 서비스가 `InsightLockedError`로 끝낸다(성공으로 보고하면 관리자가 "방금 갱신됨"으로 오해한다).

4차에서 **3차 수정도 한 겹 부족했다는 것**이 드러났다.

- **(P1) `owner` CTE가 순수 `SELECT`라 소유권을 직렬화하지 못했다.** 같은 문장 안에 뒀지만, READ COMMITTED에서 `SELECT`는 문장 시작 스냅샷을 보므로 **그 이후에 커밋된 락 인수를 감지하지 못한 채** 소유권을 참으로 판정할 수 있었다(A의 문장 시작 → B가 만료 락 인수 커밋 → A의 `owner`는 옛 스냅샷에서 여전히 A 토큰을 봄 → A가 덮어씀). 조건부 no-op `UPDATE ... WHERE run_token = $token RETURNING 1`로 바꿔 상태 행에 **행 잠금**을 잡게 했다 — 이러면 `acquireLock`과 같은 행을 두고 직렬화되고, 경합 시 갱신된 최신 행 버전으로 `WHERE`가 재평가되어 토큰이 바뀌었으면 0행이 된다. `member.ts::demoteIfNotLastActiveAdmin`이 `FOR UPDATE`로 얻는 것과 같은 성질이다.
  - **알려진 테스트 공백:** 이 경합은 "A의 문장 실행 도중 B가 커밋"이라는 순간을 요구해 결정적으로 재현할 수 없다(드라이버가 문장마다 다른 커넥션을 써서 행 잠금을 열어둔 채 대기시킬 수단이 없다). 순차 시나리오(소유권 상실 후 쓰기 시도)는 테스트로 고정했고, 경합 구간은 행 잠금이라는 메커니즘으로 닫았다.

- **(P2) `toSafeErrorLabel`의 `name`·`code`가 검증되지 않았다.** 둘 다 오류를 만든 쪽이 자유롭게 지정할 수 있는 값이라, 벤더 SDK나 미래의 코드가 거기에 원문을 담으면 1차 수정의 전제가 무너진다. `name`은 `/^[A-Za-z][A-Za-z0-9_]{0,63}$/`, `code`는 SQLSTATE 형태(`/^[0-9A-Z]{5}$/`)일 때만 통과시키고 나머지는 `Error`/생략으로 떨어뜨린다 — 진단 정보를 조금 잃더라도 유출 경로를 남기지 않는다.

**검증 중 만난 함정**

- PowerShell 5.1의 `Set-Content -Encoding utf8`이 **BOM을 붙여** `.env.local` 첫 키가 `﻿DATABASE_URL`이 됐고, `DATABASE_URL is not set`으로 실패했다. 임베딩만 쓰는 스크립트는 첫 줄이 아니라 멀쩡히 돌아 원인이 늦게 드러났다. 워크트리에 env 파일을 복사할 때 반복될 수 있다.
