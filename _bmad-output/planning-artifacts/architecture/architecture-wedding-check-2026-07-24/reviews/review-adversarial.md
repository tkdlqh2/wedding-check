---
review-type: adversarial-spine-compatibility
target: architecture-wedding-check-2026-07-24/ARCHITECTURE-SPINE.md
lens: "construct two units one level down that each obey every AD to the letter yet still build incompatibly"
created: 2026-07-24
verdict: FAIL — 6 real incompatibility pairs found, at least one safety-relevant
---

# Adversarial Review — ARCHITECTURE-SPINE.md (웨딩홀 스캔 오퍼레이터 인수인계 시스템)

## Method

For each of the 6 ADs and the ERD, I tried to write two story-implementer decisions that each satisfy the AD's literal `Rule:` text, then checked whether the resulting code/schema would actually interoperate if built independently (as would happen with parallel story execution against this spine). Six pairs below are real — each is followed by a proposed AD tightening or new Consistency Convention row that closes the hole. This does not modify the spine file.

---

## Pair 1 — `checklist_instances` hall_id scoping: denormalized column vs. transitive JOIN

**AD in question:** AD-2.

**The gap:** AD-2's rule says hall-scoped repository functions take `hallId` as the first argument and "해당 테이블의 모든 조회/수정 쿼리는 `WHERE hall_id = $hallId`를 포함한다." But per the ERD, `checklist_instances` only has a structural link to `hall` *through* `ceremony` (`HALL ||--o{ CEREMONY`, `CEREMONY ||--|| CHECKLIST_INSTANCE`). The ERD does not show `checklist_instances` having a direct edge to `HALL`. Nothing in AD-2 or the Consistency Conventions table says whether `checklist_instances` must carry its own denormalized `hall_id` column, or whether "hall_id scoping" is satisfied by joining through `ceremonies`.

**Implementer A** (building the FR-4/5 ceremony/instance-creation repository): adds a denormalized `hall_id` column directly on `checklist_instances`, copied from the ceremony's `hall_id` at creation time, and writes `WHERE checklist_instances.hall_id = $hallId`. This is a literal, defensible reading of "해당 테이블의... 쿼리는 `WHERE hall_id = $hallId`를 포함한다."

**Implementer B** (building the FR-6/7 query repository, reading instances for the operator screen): never adds a `hall_id` column to `checklist_instances` — instead joins `checklist_instances → ceremonies` and filters `WHERE ceremonies.hall_id = $hallId`. Also fully AD-2-compliant: the join enforces the same isolation guarantee without touching the schema.

**Where this actually breaks:** These aren't just stylistic variants — they produce different `schema.ts` migrations. If both stories land, either the second migration fails (duplicate/missing column depending on order) or the codebase ends up with two live scoping strategies for the same table, one of which (A's denormalized copy) can silently drift from truth if a ceremony's hall is ever corrected after creation — nothing in AD-2 says the denormalized copy must be kept in sync, or forbids denormalization at all.

**Worse, compounding case — `checklist_instance_items` and the FR-5 same-hall constraint:** FR-5's `[ASSUMPTION]` says manual add-after-generation is "제한... 같은 홀의 템플릿 항목 범위 내로" (restricted to template items from the same hall). Enforcing that requires a genuine 2-hop check: `checklist_instance → ceremony → hall_id` compared against the candidate `checklist_template_item`'s `hall_id`. AD-2's rule as written only mandates a `hall_id` filter on "해당 테이블" (singular) — it does not say the *cross-entity equality check* is mandatory on every mutating call. An implementer could satisfy AD-2's letter by scoping the *lookup* of the instance by hall (so you can only reach instances in your hall) while omitting the re-validation that the *item being attached* also belongs to that hall — because "the write query filters `WHERE hall_id = $hallId`" was interpreted as being about the instance row, not the item being joined in. That is a direct path to the exact leak PRD §3 calls out as non-negotiable: "템플릿은 홀 간 절대 섞이지 않아야 함."

**Proposed fix — tighten AD-2:**
> Add to AD-2's Rule: "`checklist_instances`는 생성 시점에 소속 `hall_id`를 자신의 컬럼으로 반드시 저장한다(조회 편의를 위한 JOIN 대체 금지, 스키마 확정). `checklist_instance_items`에 항목을 추가하는 모든 쓰기 경로는 `instance.hall_id = template_item.hall_id`를 명시적으로 재검증해야 하며, 이 재검증 없이 `instance_id`만으로 항목 추가를 허용하는 구현은 AD-2 위반으로 간주한다."

Also fix the **naming gap** feeding this: the Consistency Conventions table lists table names `halls, checklist_templates, checklist_items, ceremonies, checklist_instances, variable_cases, feedback` — but the ERD has *four* item-shaped entities (`CHECKLIST_TEMPLATE_ITEM`, `DEMO_VIDEO`, `CHECKLIST_INSTANCE_ITEM`, `INSIGHT_CLUSTER`) that never appear in that naming list at all. `checklist_items` is ambiguous between "the ERD's template items" and "the ERD's instance items" — two implementers could each build a *different* one of those two ERD entities under the same table name. Recommend the naming convention row be updated to enumerate all ERD entities 1:1 with table names (e.g., explicitly `checklist_template_items`, `checklist_instance_items`, `demo_videos`, `insight_clusters`).

---

## Pair 2 — `LLMPort`/`EmbeddingPort` shape is never actually specified

**AD in question:** AD-1.

**The gap:** AD-1's rule only says calls "must go through" `lib/ai/ports.ts`'s `LLMPort`/`EmbeddingPort`. No method signature, input shape, output shape, or streaming contract is given anywhere in the spine — not in AD-1, not in the Structural Seed (which only lists the *filenames* `ports.ts`, `adapters/anthropic.ts`, `adapters/voyage.ts`), not in the Stack table.

But the two real call sites need visibly different shapes:
- FR-6/7 (Route Handler, explicitly called out in Consistency Conventions as "스트리밍 가능") needs a **streaming** generation call returning incremental text plus, per FR-7, must carry a **grounding signal** (which past case, if any, was actually used) so the UI can render "관련 사례 없음" honestly rather than let the model free-associate.
- FR-9 (batch/route structuring) needs a **non-streaming, schema-constrained** call that reliably fills exactly 5 fields (단계/상황설명/대처결과/사후판단/태그) — i.e., needs tool-calling/JSON-schema output, not a raw string blob.
- FR-10 (daily clustering batch) needs `EmbeddingPort` to embed potentially hundreds of `feedback`/`variable_case` texts per run — a **batch** shape — while FR-6/7's live query needs to embed exactly one incoming user query per request.

**Implementer A** (building FR-6/7 first): defines `LLMPort.generate(prompt: string): Promise<string>` — raw text in, raw text out, no usage/citation metadata, blocking (no stream method at all, deciding "스트리밍 가능" just means the Route Handler *could* stream the HTTP response by chunking a pre-rendered string).

**Implementer B** (building FR-9 first): defines `LLMPort.generate(input: {system: string; messages: Message[]; responseSchema: JSONSchema}): Promise<{data: unknown; usage: TokenUsage}>` — structured request/response object, no string overload at all.

Both are fully compliant with AD-1's actual rule ("모든 LLM 생성·임베딩 호출은 `lib/ai/ports.ts`의 `LLMPort`/`EmbeddingPort` 인터페이스를 거친다" — it says *go through the port*, not what the port's signature is). Since `ports.ts` is one shared file, whichever story lands second either has to silently redefine the interface out from under the first (breaking the other route handler at compile time) or bolt on a second incompatible method (`generateStructured` vs `generate`), which itself violates AD-1's stated purpose — vendor swap should be a pure adapter change, not something that ripples back into `lib/services/*` call sites because the port grew ad hoc, incompatible overloads.

Same problem on `EmbeddingPort`: Implementer A (FR-6/7) plausibly writes `embed(text: string): Promise<number[]>`; Implementer B (FR-10 batch) needs to embed N texts without N round trips, and either adds a second port method `embedBatch(texts: string[]): Promise<number[][]>` (interface sprawl, not pinned anywhere) or — worse — just calls `embed()` in a loop, silently blowing past whatever latency/cost assumption justified "AI 호출 빈도가 낮다" in PRD §6 Cost for the *batch* path (FR-10 batch job wasn't in that low-frequency assumption; §5 explicitly separates FR-6 latency from FR-10 batch cadence). Also unaddressed: Voyage's Matryoshka dimension selection (2048/1024/512/256, spine picks 1024) — is the output dimension a fixed adapter-level config, or a parameter every port caller must pass? If unpinned, one call site could embed at 1024 and another at 512, producing vectors of incompatible dimensionality inside the same pgvector column — a hard runtime failure, not just a style clash.

**Proposed fix — tighten AD-1 (or add a companion interface contract):**
> Add to AD-1: "`lib/ai/ports.ts`는 다음 시그니처를 고정한다: `LLMPort.generate(input: GenerateInput): Promise<GenerateResult>`(구조화 출력 지원, `responseSchema` 선택적 파라미터로 FR-6/7의 raw-text 케이스와 FR-9의 구조화 케이스를 모두 커버), `LLMPort.generateStream(input): AsyncIterable<GenerateChunk>`(FR-6/7 전용), `EmbeddingPort.embed(texts: string[], opts?: {outputDimension?: 256|512|1024|2048}): Promise<number[][]>`(단건 임베딩도 길이 1 배열로 통일, 배치 우선 시그니처). 임베딩 차원은 어댑터 기본값(1024)을 스키마 컬럼과 고정 바인딩하며, 호출부가 다른 차원을 요청하면 명시적으로 거부한다." This should live in the spine itself (or a tightly-bound companion `lib/ai/ports.ts` contract doc) since it's exactly the kind of shared-shape decision two parallel stories cannot be trusted to converge on independently.

---

## Pair 3 — AD-5 client cache vs. FR-5 manual add/remove: no invalidation rule, stale checklist during a live, irrevocable ceremony

**ADs/FRs in question:** AD-5 (offline cache) × FR-5 (post-generation manual item add/remove).

**The gap:** AD-5's rule only pins the *degrade* path: "체크리스트 인스턴스는 최초 로드 성공 시... 캐시되고, `navigator.onLine`이 false이거나 fetch가 실패하면 캐시에서 렌더링한다." It says nothing about the **steady-state online case** — specifically, whether the operator screen ever re-fetches after the initial load while online, or how a server-side mutation (FR-5's same-day manual add/remove, explicitly framed by the PRD as "당일 변경 대응") reaches an already-open tablet screen.

**Implementer A**: reads AD-5 as "cache is a fallback only" — the operator screen always attempts a fresh fetch on every mount/focus/interval and only falls back to the stored cache when that fetch fails or the browser is offline. Steady-state online behavior is always fresh.

**Implementer B**: reads AD-5 literally — "최초 로드 성공 시... 캐시" describes a one-time write, and once cached, renders straight from the cache for the rest of the session to avoid flicker/reload on every tap (a reasonable tablet-UX instinct, and arguably closer to what "체크리스트 조회는 로컬 캐시로 계속 동작" in the Deferred/§5 language implies) — with no background revalidation at all unless the user does a manual pull-to-refresh (not specified anywhere as required).

Both comply with AD-5's literal text, because AD-5 simply never states a revalidation cadence or an invalidation trigger tied to server-side mutation.

**Why this is a real, safety-relevant incompatibility, not just a UX nit:** Implementer B's build means an admin's FR-5 same-day manual removal of an item (e.ken., a step that got cancelled last-minute) will not reach the operator's already-open tablet for the rest of the ceremony — even though the network is fine and the write already committed. This is precisely the scenario the PRD frames as needing same-day responsiveness (FR-4.2 FR-5 "당일 변경 대응"), and it collides with DESIGN.md Principle #3 ("부담 아래서도 침착하다... 예식은 취소·재시도가 불가능한 라이브 이벤트") and Principle #4 ("근거는 신성하다") — a stale checklist during a live, irreversible ceremony is not a cosmetic bug.

**Proposed fix — new Consistency Convention row (or amend AD-5):**
> "체크리스트 인스턴스 캐시는 stale-while-revalidate로 동작한다: 화면 마운트 시 및 고정 간격(예: 60초)마다 캐시를 즉시 렌더링하면서 백그라운드로 재검증 fetch를 보낸다. 재검증 성공 시 캐시를 교체하고 화면을 조용히(모션 없이, `motion-instant`) 갱신한다. 재검증 실패 시에만 기존 캐시를 유지하고 AD-5의 오프라인 경로로 진입한다. FR-5의 관리자 수동 추가/제외는 이 재검증 주기 내에 조회 화면에 반영되어야 한다(즉시 push는 v1 범위 밖, 폴링으로 충분)."

---

## Pair 4 — `insight_cluster` write ownership: full-recompute vs. incremental upsert, and no run-locking

**AD/FR in question:** AD-6 × FR-10 (daily clustering batch).

**The gap:** AD-6 only pins *scope* (business-wide, hall as a display tag) — it says nothing about *mutation semantics* for `insight_clusters`. The Capability Map says FR-10/11 "lives in" `lib/services/insight.ts` (일 1회 배치), but no AD states (a) whether re-running clustering fully replaces prior clusters or incrementally merges into existing ones, (b) whether cluster IDs are stable across runs, or (c) what prevents two invocations of the same recompute function from running concurrently.

**Implementer A**: implements `recomputeInsights()` as `DELETE FROM insight_clusters WHERE ...; INSERT ...` each run — simplest correct clustering-from-scratch, new UUIDs every day. Fully satisfies FR-10's stated behavior ("표현이 다른 반복 피드백이... 같은 인사이트 항목으로 묶여 노출된다").

**Implementer B**: implements `recomputeInsights()` as incremental — matches new `variable_case`s against existing cluster centroids, `UPDATE`s counts/representative examples in place, only `INSERT`s new clusters for outliers, explicitly to keep `cluster_id` stable (e.g., so an admin's "펼쳐본" state, a bookmarked URL, or a future "이 인사이트 확인함" flag survives across days). Also fully satisfies FR-10.

**Where it breaks:** These are irreconcilable persistence strategies for the same table, and nothing forces convergence. Worse: nothing in the spine says the batch job is the *only* writer. If a future "다시 계산" admin button (not in v1 scope per Deferred, but a natural addition once `lib/services/insight.ts::recomputeInsights()` already exists as a callable service function) is wired to the same function via a Server Action, and it fires while the scheduled daily batch is also running, Implementer A's delete-then-reinsert strategy racing against itself produces duplicate/partial clusters or a window where `insight_clusters` is empty mid-transaction while `admin` is viewing the screen (Loading-state contract in DESIGN.md §14 says "기존 인사이트는 갱신 중에도 계속 보임" — a delete-first strategy directly violates that already-written UI contract).

**Proposed fix — new AD (AD-7) or tightened AD-6:**
> "`insight_clusters`는 오직 `lib/services/insight.ts::recomputeInsights()`만 쓸 수 있다(다른 서비스/라우트에서 직접 INSERT/UPDATE/DELETE 금지). 재계산은 단일 트랜잭션 내 delete-then-insert가 아니라 upsert 방식으로 동작해야 한다: 실행 전 기존 클러스터를 먼저 삭제하지 않고, 신규 계산 결과를 임시로 만든 뒤 트랜잭션 커밋 시점에 교체한다(또는 클러스터 ID 안정성이 필요 없다면 최소한 '삭제 후 화면 노출 전 즉시 재삽입 완료'를 하나의 트랜잭션으로 강제해 §14 Loading 상태 계약을 어기지 않는다). 동시 실행 방지를 위해 `insight_clustering_runs` 상태 행(또는 advisory lock)으로 중복 실행을 차단한다. `cluster_id`는 실행 간 안정성을 보장하지 않음을 명시하거나(v1은 매번 재계산), 안정성이 필요하면 그 규칙을 여기 못박는다 — 현재는 어느 쪽도 정해져 있지 않다."

---

## Pair 5 — `variable_case` creation timing: draft feedback vs. the ERD's mandatory 1:1 cardinality (safety-relevant)

**AD/FR in question:** ERD (`FEEDBACK ||--|| VARIABLE_CASE`) × FR-8 (draft/temp-save) × FR-9 (auto-structure + operator confirm) × FR-7 Safety guardrail.

**The gap:** The ERD models `FEEDBACK ||--|| VARIABLE_CASE : "structures into"` with **mandatory-mandatory 1:1** cardinality (`||--||`), which literally reads: every `feedback` row always has exactly one `variable_case` row, and vice versa. But FR-8's consequence explicitly allows a feedback to exist in an unfinished state: "입력을 완료하지 않고 나가도 임시 저장되어 이어 쓸 수 있다" (temp-save/draft). FR-9 layers auto-structuring **on top of** that raw text and requires operator confirm/edit before the values are "final" ("자동 구조화는 초안이지 확정이 아님"). Nothing in the spine pins *when*, relative to draft-vs-confirmed feedback state, a `variable_case` row actually gets created — nor whether draft-stage auto-structured content is eligible for FR-6/7's search index.

**Implementer A** (reading the ERD literally, mandatory 1:1): creates a `variable_case` row **immediately** on every feedback save, including drafts — auto-runs FR-9 structuring the moment any text is saved, with a `status: draft | confirmed` column on `variable_case` to satisfy both the ERD's cardinality and FR-8's draft flow.

**Implementer B** (reading FR-8/FR-9's draft→confirm flow as authoritative): only creates the `variable_case` row when the operator explicitly confirms the auto-structured result (final save) — a draft `feedback` correctly has **no** `variable_case` yet, i.e., an optional 0-or-1 relationship, contradicting the ERD's `||--||` notation but arguably the functionally correct design.

**Why this is the most serious pair found:** The two implementations diverge on exactly the input to FR-6/7's search — if Implementer A wins and nothing gates the embedding/indexing pipeline on `status = confirmed`, then a half-finished, not-yet-reviewed, possibly wrong auto-structured draft (whose "사후 판단/대처법" text the operator hasn't verified yet) becomes searchable and can be surfaced to a *different* operator mid-ceremony as if it were a confirmed precedent. That is a direct violation of the PRD's core safety invariant (§6 Safety: "관련 사례가 없을 때 임의 사례를 근거처럼 제시하지 않는다... 잘못된 대처법이 확신을 가진 것처럘 제시되면 실제 사고로 이어질 수 있다") and DESIGN.md Principle #4 ("근거는 신성하다"). Both implementers technically satisfy every literal AD in the spine (this is an ERD/FR gap, not a violated AD) — which is exactly why it needs to be pinned as its own rule, not left to inference from the ERD's cardinality notation.

**Proposed fix — new AD (AD-8) or tightened AD-6:**
> "`variable_case` 레코드는 오퍼레이터가 FR-9 구조화 결과를 확인/저장(확정)한 시점에만 생성된다. 임시저장(draft) 상태의 `feedback`은 `variable_case`를 생성하지 않으며, 따라서 FR-6/7 임베딩 인덱스에도 절대 포함되지 않는다. ERD의 `FEEDBACK ||--|| VARIABLE_CASE` 표기는 확정 완료 상태를 전제로 한 것이며, draft 상태의 `feedback`에는 대응하는 `variable_case`가 존재하지 않는(0..1) 것이 맞는 해석이다 — 스파인 갱신 시 ERD 표기(`||--||` → `||--o|`)도 함께 수정할 것을 권고한다."

---

## Pair 6 — `demo_video` row ownership: client-reported blob URL vs. Vercel Blob `onUploadCompleted` callback

**AD in question:** AD-4.

**The gap:** AD-4's rule only pins what the *server route* must **not** do (proxy file bytes) and mandates the client-side multipart upload path. It says nothing about which side is trusted to write the resulting `demo_video` DB row that references the uploaded blob's URL.

**Implementer A**: after `@vercel/blob/client`'s client-side upload promise resolves, the client calls a Server Action `saveDemoVideo(itemId, blobUrl)` directly with the URL the browser received — simplest implementation, fully compliant with AD-4 (server never touched the bytes).

**Implementer B**: uses the officially recommended `handleUpload`/`onUploadCompleted` server-side callback (invoked by Vercel's infrastructure once the upload actually completes) to write the `demo_video` row — never trusts a client-supplied URL for persistence.

**Where it breaks:** Both satisfy AD-4's literal rule. But A is a real integrity/security gap the spine never rules out: a malicious or buggy client could call `saveDemoVideo` with an arbitrary URL (including another hall's already-uploaded video, or an external URL entirely) without ever having completed a real upload tied to the issued token, silently violating the hall-isolation guarantee AD-2 is supposed to protect (§3 "템플릿은 홀 간 절대 섞이지 않아야 함" extends naturally to demo videos attached to template items). B closes that hole by construction. Nothing in AD-4 tells a story implementer to prefer B.

**Proposed fix — tighten AD-4:**
> Add to AD-4's Rule: "`demo_videos` 행은 반드시 `@vercel/blob/client`의 `onUploadCompleted` 서버 콜백에서만 생성한다. 클라이언트가 업로드 완료 후 직접 보고하는 blob URL을 그대로 신뢰해 DB에 쓰는 경로는 금지한다."

---

## Summary Table

| # | Pair | Root AD gap | Severity |
| --- | --- | --- | --- |
| 1 | `checklist_instances`/`checklist_instance_items` hall scoping: denormalized column vs. transitive JOIN; missing 2-hop re-validation on manual item add | AD-2 rule doesn't pin schema shape or cross-entity re-validation; naming convention omits half the ERD entities | High — direct path to cross-hall template leakage |
| 2 | `LLMPort`/`EmbeddingPort` signatures never specified (string vs. structured, streaming vs. not, single vs. batch embed, output dimension) | AD-1 says "go through the port," never defines the port | High — breaks compile-time compatibility between FR-6/7, FR-9, FR-10 call sites |
| 3 | AD-5 cache: always-revalidate vs. cache-forever-until-manual-refresh; no invalidation trigger tied to FR-5 manual edits | AD-5 only specifies the offline-degrade path, not online steady-state | High — stale checklist during a live, irreversible ceremony |
| 4 | `insight_clusters` write semantics: full delete-reinsert vs. incremental upsert; no concurrency guard | AD-6 pins scope only, not mutation/ownership semantics | Medium — data integrity + violates existing §14 Loading contract |
| 5 | `variable_case` creation timing: on every draft save vs. only on confirm | ERD's mandatory 1:1 cardinality contradicts FR-8/9's draft→confirm flow | **Critical — safety guardrail (PRD §6, DESIGN.md Principle #4) can be silently bypassed** |
| 6 | `demo_video` row creation: client-reported URL vs. server `onUploadCompleted` callback | AD-4 doesn't say who is trusted to persist the upload result | Medium — integrity/security gap in hall isolation |

## Verdict

**FAIL as a build substrate for parallel story execution.** Six concrete pairs of spine-compliant-but-incompatible implementations were constructed, spanning schema shape (Pair 1), shared interface contracts (Pair 2), client/server consistency (Pair 3), entity write-ownership (Pairs 4 and 6), and — most seriously — a genuine safety-relevant gap (Pair 5) where the ERD's stated cardinality contradicts the PRD's own draft/confirm flow and could let an unconfirmed, unverified auto-structured judgment reach a live operator as if it were vetted precedent, undermining the system's core safety invariant. Recommend closing all six before story generation, prioritizing Pair 5 and Pair 1.
