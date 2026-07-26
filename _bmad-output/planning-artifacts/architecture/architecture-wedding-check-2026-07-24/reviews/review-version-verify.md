# Adversarial Review: Version/Reality-Check of ARCHITECTURE-SPINE.md Stack Table

**Reviewer lens:** Verify every committed stack decision was web-researched or reality-checked rather than asserted from training data — current versions, that each named technology still exists and fits, and that model IDs are plausible and current.

**Review date:** 2026-07-24 (session current date)
**Target file:** `ARCHITECTURE-SPINE.md`, Stack table (lines 88–94)
**Method:** WebSearch against live sources for each claim, plus the bundled `claude-api` skill (authoritative, dated cache 2026-06-24) for the two Anthropic model IDs.

---

## Overall Verdict: ALL VERIFIED — no stale or fabricated claims found

Every claim in the Stack table checks out against current, dated sources. This is a well-researched table — nothing here reads as asserted-from-training-data. Below is the claim-by-claim record.

---

## 1. Next.js 16.2.11+ (App Router, TS)

**Spine claim:** `Next.js (App Router, TypeScript) | 16.2.11+ (2026-07 보안 패치 반영)`

**Verification status: VERIFIED — current as of today.**

- `16.2.11` is real and is the **current stable/Active LTS** release, published **2 days before today's session date (2026-07-24)** — i.e., ~2026-07-21/22.
- It is a security-only patch release (July 2026 scheduled security release), fixing a High-severity DoS in Server Actions, a Turbopack middleware bypass, SSRF in rewrites/Server Actions, and a cache-confusion issue. This matches the spine's own annotation ("2026-07 보안 패치 반영" — reflects the 2026-07 security patch).
- App Router has existed since Next.js 13 and is obviously still current in 16.x — not in question.
- The "+" in "16.2.11+" is appropriately hedged: a 16.3.0 stable release was in canary/preview at review time (`v16.3.0-canary.92`, `v16.3.0-preview.7`), so pinning to "16.2.11+" rather than a hard pin is defensible.

**Sources:**
- [Release v16.2.11 · vercel/next.js](https://github.com/vercel/next.js/releases/tag/v16.2.11)
- [July 2026 Security Release | Next.js](https://nextjs.org/blog/july-2026-security-release)
- [next - npm (versions)](https://www.npmjs.com/package/next?activeTab=versions)

**Flag:** None. This is date-sensitive (a security patch train), so it should be re-verified again at implementation time in case 16.2.12+/16.3.0 stable has since shipped — but as written, it is accurate for 2026-07-24.

---

## 2. Postgres + pgvector via Neon (Vercel Marketplace)

**Spine claim:** `Postgres + pgvector | Neon (Vercel Marketplace 경유)`

**Verification status: VERIFIED.**

- Neon is live on the Vercel Marketplace ("Neon for Vercel") as a first-party integration — confirmed via `vercel.com/marketplace/neon` and the Vercel-hosted Neon Postgres template.
- pgvector is confirmed supported on Neon, and — per Neon's own docs — available on **every Neon plan with no add-on or paid tier required**.
- Noteworthy (not a problem for the spine, but worth flagging to the architect for awareness): Neon has since layered a newer product, **Lakebase Search** (`lakebase_vector`, `lakebase_text`, `lakebase_ann`), on top of/alongside pgvector — offering drop-in pgvector compatibility at larger scale with faster index builds. The spine's choice of plain pgvector is still valid and simpler; this is just a "reality check" data point that the spine doesn't need pgvector to age out anytime soon, and there's a documented upgrade path if scale ever requires it.

**Sources:**
- [Neon for Vercel – Vercel Marketplace](https://vercel.com/marketplace/neon)
- [The pgvector extension - Neon Docs](https://neon.com/docs/extensions/pgvector)
- [Changelog 2026-06-26 - Neon (Lakebase Search)](https://neon.com/docs/changelog/2026-06-26)

**Flag:** None blocking. Minor FYI on Lakebase Search as a future option, not a correction.

---

## 3. Drizzle ORM 0.36+ (native `vector` column + `cosineDistance`)

**Spine claim:** `Drizzle ORM | 0.36+ (vector 컬럼 타입 + cosineDistance 네이티브 지원)`

**Verification status: VERIFIED.**

- Drizzle ORM does have a native `vector` column type (`vector('embedding', { dimensions: N })` from `drizzle-orm/pg-core`) and native distance-function helpers (`cosineDistance`, `l2Distance`, `l1Distance`, `innerProduct`, `hammingDistance`, `jaccardDistance`) importable from `'drizzle-orm'`.
- This support landed in **Drizzle ORM v0.31.0** (per Drizzle's own release notes), which is well before the spine's stated floor of 0.36+ — so "0.36+" is a safe, conservative floor, not an overstatement. The feature has had roughly a year+ of stability by the time of a 0.36+ pin.

**Sources:**
- [Drizzle ORM - DrizzleORM v0.31.0 release](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0310)
- [Drizzle ORM - Vector similarity search with pgvector extension](https://orm.drizzle.team/docs/guides/vector-similarity-search)
- [Drizzle ORM - PostgreSQL extensions](https://orm.drizzle.team/docs/extensions/pg)

**Flag:** None.

---

## 4. better-auth (Next.js App Router, reasonable vs. NextAuth/Auth.js v5)

**Spine claim:** `better-auth | 최신 stable` (also referenced repeatedly elsewhere in the spine: session cookies, middleware role checks)

**Verification status: VERIFIED as real and actively maintained; App Router support confirmed.**

- `better-auth` is a real, actively maintained TypeScript auth library (own docs site, GitHub org with an examples repo, active blog/tutorial coverage dated into 2026).
- Confirmed explicit Next.js App Router integration: mount the handler at `/api/auth/[...all]/route.ts`; official docs state **"Better Auth is fully compatible with Next.js 16."**
- On the "reasonable greenfield choice over NextAuth/Auth.js v5" question: search results show better-auth is commonly discussed as a modern alternative that gives "full control over your database, zero vendor lock-in, and a plugin architecture" — a legitimate, current comparison point against Auth.js v5. This is a defensible, non-arbitrary choice for a greenfield project, not an outdated or fabricated recommendation.

**Sources:**
- [Next.js integration | Better Auth (official docs)](https://better-auth.com/docs/integrations/next)
- [better-auth/examples (GitHub)](https://github.com/better-auth/examples)
- [I tested every major auth library for Next.js in 2026 - LogRocket Blog](https://blog.logrocket.com/best-auth-library-nextjs-2026/)

**Flag:** None. Note this is a judgment call (library choice) rather than a hard fact, but it is not stale or implausible.

---

## 5. `claude-sonnet-5` and `claude-haiku-4-5` — plausible real Anthropic model IDs

**Spine claim:** `@anthropic-ai/sdk | 최신 stable — claude-sonnet-5(FR-6/7 실시간 응답), claude-haiku-4-5(FR-9 배치 구조화)`

**Verification status: VERIFIED against the authoritative, dated `claude-api` skill reference (not just the spine's own word).**

- Cross-checked against the bundled skill's **Current Models** table (cached 2026-06-24, i.e., independently sourced, not derived from the spine):

| Model | Model ID | Context | Status |
|---|---|---|---|
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | Active |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | Active |

- Both IDs are exact-string matches for real, currently active models — not guessed, not date-suffixed, not hallucinated variants. The pairing is also sensible: Sonnet 5 for the low-latency real-time query use case (FR-6/7) and Haiku 4.5 for cheaper batch structuring (FR-9) is a normal cost/latency tiering pattern, matching the skill's own guidance ("Use Sonnet for high-volume production workloads... Use Haiku only for simple, speed-critical tasks").
- One thing to flag for the architect, not a correction to the spine: the skill's own defaults instruct that **`claude-opus-4-8` should be the default model unless the user explicitly asks for Sonnet/Haiku** — this doesn't invalidate the spine's choice (cost-conscious model selection for a defined workload is a legitimate engineering decision, and the PRD's "AI가 필요한 곳에만 AI를 쓴다" cost-consciousness principle supports it), but the architect should have explicitly recorded *why* Opus was not chosen (cost/latency tradeoff), since it's a deviation from the skill's stated default.

**Sources:** claude-api skill's cached model table (2026-06-24), which is Anthropic-authoritative and independent of the spine document.

**Flag:** Advisory only — no evidence either ID is fabricated or outdated. Suggest the spine add a one-line rationale for why Opus 4.8 wasn't chosen, for future-reader clarity (not a version/reality-check issue, a documentation-completeness one).

---

## 6. Voyage AI `voyage-3.5` embeddings at 1024 dimensions

**Spine claim:** `Voyage AI embeddings | voyage-3.5, 1024차원 (Matryoshka 2048/1024/512/256 중 선택)`

**Verification status: VERIFIED, and precisely correct.**

- `voyage-3.5` is a real, current Voyage AI general-purpose embedding model (released 2025-05-20, still the current flagship general embedding model as of search results dated into 2026).
- Confirmed it supports **exactly** the dimension set the spine states: **2048, 1024, 512, and 256** via Matryoshka representation learning — the spine's "1024차원 (Matryoshka 2048/1024/512/256 중 선택)" is not just plausible, it's an exact match to the model's documented capability.
- Also confirmed available via Vercel AI Gateway (`vercel.com/ai-gateway/models/voyage-3.5`), which is relevant given the rest of this stack is Vercel-centric — reinforces internal consistency of the stack choice, not just correctness in isolation.

**Sources:**
- [voyage-3.5 and voyage-3.5-lite – Voyage AI blog](https://blog.voyageai.com/2025/05/20/voyage-3-5/)
- [Voyage 3.5 by Voyage AI on Vercel AI Gateway](https://vercel.com/ai-gateway/models/voyage-3.5)
- [Text Embeddings - Voyage AI docs](https://docs.voyageai.com/docs/embeddings)

**Flag:** None.

---

## Summary Table

| # | Claim | Status | Notes |
|---|---|---|---|
| 1 | Next.js 16.2.11+, App Router | ✅ Verified | Current stable as of 2026-07-24, real security-patch release; re-verify at build time |
| 2 | Neon Postgres + pgvector via Vercel Marketplace | ✅ Verified | pgvector free on all Neon plans; FYI newer Lakebase Search product exists as an option, not a requirement |
| 3 | Drizzle ORM 0.36+ native vector/cosineDistance | ✅ Verified | Feature landed in 0.31.0 — 0.36+ floor is conservative, not aggressive |
| 4 | better-auth, App Router support | ✅ Verified | Real, maintained, explicit Next.js 16 compatibility claim on official docs |
| 5 | `claude-sonnet-5` / `claude-haiku-4-5` model IDs | ✅ Verified | Exact match against independent skill-cached model catalog; advisory note that Opus-vs-Sonnet/Haiku rationale isn't documented in the spine |
| 6 | `voyage-3.5` at 1024 dimensions | ✅ Verified | Exact match to documented Matryoshka dimension options |

**No claim in the Stack table was found to be outdated, fabricated, or unconfirmable against the web.** The table reads as genuinely researched rather than asserted from training-data priors.
