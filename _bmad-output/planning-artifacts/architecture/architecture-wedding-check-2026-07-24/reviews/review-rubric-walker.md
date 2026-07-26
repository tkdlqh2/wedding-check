# Architecture Spine Review — Rubric Walker

**Reviewed:** `ARCHITECTURE-SPINE.md` (웨딩홀 스캔 오퍼레이터 인수인계 시스템, 2026-07-24, status: final)
**Reviewed against:** `prd.md` (2026-07-23/24) and `.memlog.md` (2026-07-24T17:13)
**Reviewer stance:** independent, read-only. Spine file was not modified.

**Overall verdict: PASS-WITH-NOTES.** The six ADs are correctly derived from the PRD, each names a real divergence point and a testable rule, and the two places where the checklist explicitly asks me to hunt for hidden contradictions (AD-5 vs §5 availability, AD-6 vs multi-hall isolation) turn out to be honestly flagged rather than swept under the rug. However, the spine has one whole-dimension gap (deployment/environments/operations) that the task brief specifically warns is a known failure mode, one FR whose core mechanism (FR-5 conditional item inclusion) has no data-model home anywhere in the ERD, and one place where precise version numbers appear in the Stack table with no corresponding entry in the decision log they were supposedly distilled from. None of these are fatal to the document's overall soundness, but they are exactly the kind of thing that lets two independently-built stories diverge, so I'd stop short of an unqualified pass given the doc's own `status: final`.

---

## 1. Divergence coverage — do the 6 ADs hit the real fault lines?

Mostly yes. Each AD maps to a genuine place where two implementers, working from the PRD alone, would plausibly make different structural choices:

- AD-1 (ports-and-adapters for AI) — correctly targets PRD §6 Cost's "vendor-neutral" requirement, which has no other place to live.
- AD-2 (repository layer owns `hall_id` filtering) — correctly targets PRD §3's "홀 간 절대 섞이지 않아야 함" invariant, which is easy to violate ad hoc if left to per-query discipline.
- AD-3 (2 roles only) — correctly forecloses a real risk: the PRD itself describes a legacy 신입/선임 split that was only *just* collapsed (2026-07-24, PRD §12), so a future implementer skimming interview material or old drafts could easily reintroduce a third tier. Good catch.
- AD-4 (blob client-upload bypass) — correctly targets a real, easy-to-miss Vercel platform constraint (4.5MB body limit vs up to 500MB video per PRD §12).
- AD-5 / AD-6 — see §4 and §5 below.

**Gap found (see §3):** FR-5's "계약 형태에 맞는 항목만 조합" mechanism has no AD and no ERD entity — it is real product logic, not a UI nicety, and it is currently unhomed.

**Gap found (see §6):** the deployment/environments/operations dimension is essentially silent.

## 2. Are the ADs' Rules enforceable, and do they prevent what they claim to prevent?

| AD | Enforceable? | Notes |
| --- | --- | --- |
| AD-1 | Partially | The rule ("`lib/services/*` cannot import vendor SDKs directly") is stated as a convention only. Nothing in the spine names an enforcement mechanism (e.g., an ESLint `no-restricted-imports` rule scoped to `lib/services/**`, or a CI grep gate). For a document whose stated purpose is to bind independently-built stories, a text-only convention is weaker than what the "Prevents" column implies. **Minor finding.** |
| AD-2 | Yes | "`hallId` required first arg" + "every query includes `WHERE hall_id = $hallId`" is concrete enough to code-review against, and TypeScript can enforce the signature shape. |
| AD-3 | Yes | Binary role check in middleware is straightforward to enforce and verify. |
| AD-4 | Yes | Naming a specific library entry point (`@vercel/blob/client`) and prohibiting server-side byte proxying is unambiguous. |
| AD-5 | Yes, with an honestly-stated residual gap | See §4. |
| AD-6 | Yes | "No hall filter in the vector query, `hall_id` shown as display tag only" is concrete and testable. |

## 3. Deferred items — anything that should have been an AD?

Walked the full Deferred list against "could two independently-built units diverge incompatibly here":

- RLS reconsideration, formal PWA, hall-deletion soft-delete mechanics, insight→template promotion, cost/rate-limit ceiling, data retention — all genuinely fine to defer; each is either v2-scope, a low-level schema detail appropriate to story level, or already has an interim behavior fully specified elsewhere in the doc (e.g., AD-5 for offline).
- Variable-case/insight hall-partitioning — correctly *not* purely deferred; AD-6 sets a concrete v1 default and the Deferred entry only covers the eventual reconsideration. Good.

**One item is miscategorized:** "계약 형태별 항목 포함/제외 규칙 설정 UI" is filed as a UX-stage concern (correctly quoting the PRD's own `[NOTE FOR PM]`), but the PRD's note is about the *configuration UI*, not the *underlying data representation*. FR-5 ("시스템은 예식이 속한 홀의 템플릿에서, 등록된 계약 형태에 맞는 항목만 골라 인스턴스를 구성한다") is core v1 functionality, and the Capability Map assigns it only to `lib/services/ceremony.ts` governed by AD-2 (hall isolation) — AD-2 says nothing about *how* contract-type-conditional inclusion is represented in the schema. The ERD (`핵심 엔티티 ERD`) has no entity or attribute for this at all: no `contract_type` field, no rule/condition table, nothing connecting `CHECKLIST_TEMPLATE_ITEM` to the "주례 없음 → 주례 항목 제외" logic described in FR-5's own consequences.

This is exactly the kind of thing the checklist warns about: two story implementers could independently invent incompatible representations (e.g., a JSON `applicable_contract_types` array on the item row vs. a normalized `template_item_contract_rules` join table vs. hardcoded `if` branches in `ceremony.ts`), and nothing downstream would force them to converge. The *UI* for editing these rules can legitimately wait for UX; the *data shape* that the UI will edit and that `lib/services/ceremony.ts` will read at instance-generation time cannot — it's a schema decision, which is architecture's job. **This should be at minimum promoted to an explicit Open Question in the spine (it currently isn't — it's silently absent from both Deferred's framing and the ERD), and arguably deserves a 7th AD given it's core v1 FR-5 logic, not a v2 nicety.**

## 4. AD-5 (offline) vs. PRD §5 availability NFR — contradiction check

No hidden contradiction. AD-5's rule (cache last-loaded checklist instance client-side; AI query/feedback always require network and fail loudly) matches PRD §5's own assumption text almost verbatim ("체크리스트 조회는 캐시/로컬 저장으로 네트워크 장애에도 동작, AI 질의만 영향받음"). AD-5 goes further than the PRD by naming the one gap the PRD's assumption doesn't spell out — a cold reload while offline has no cache to fall back to — and labels it explicitly as "알려진 한계" / "사용자가 명시적으로 선택한 트레이드오프," cross-referenced into Deferred ("정식 오프라인(PWA/Service Worker)"). This is the honest disclosure the task brief asked me to check for, and it's present. No finding here.

## 5. AD-6 (business-wide search/clustering) vs. multi-hall model — contradiction check

No hidden or unjustified contradiction. AD-2 establishes strict per-hall isolation for templates/ceremonies/instances (PRD §3: "템플릿은 홀 간 절대 섞이지 않아야 함"), and AD-6 deliberately breaks that isolation for a *different* entity class (변수 케이스/피드백), scoping search and clustering to the whole business with hall shown only as a display tag. This is not an architecture invention — it's a direct carry-forward of the PRD's own explicit assumption (§4.3 FR-7 consequences: "검색 범위는 [ASSUMPTION: ... 사업체 전체 변수 케이스를 대상으로 검색]") and is correctly tied back to the still-open PRD §11 Q7. The AD even states it will be revised once the owner confirms. This is the right way to carry an unresolved PRD assumption into an architecture default — flagged, sourced, reversible. No finding here, though I'd note the *justification* AD-6 gives ("변수 상황 대응은 장비보다 사람의 판단에 좌우된다") is the PRD author's assumption, not an independently-argued architectural rationale — acceptable at this altitude, but worth knowing it's inherited reasoning, not new analysis.

## 6. Deployment / environments / infra / operations envelope

**This is the most significant gap in the document.** The spine has exactly one line touching this dimension: the Stack table's `배포 | Vercel (Preview + Production)`, plus one clause in Consistency Conventions ("환경변수는 Vercel 프로젝트 env로 관리... 시크릿은 코드에 하드코딩 금지"). Beyond that, none of the following are decided, deferred, or even raised as an open question anywhere in the document:

- **Environment/DB topology:** Does each Vercel Preview deployment get its own Neon branch, or do all previews share the production database? This is directly consequential for a Postgres+pgvector schema with migrations — get it wrong and preview deploys either corrupt prod data or silently drift from it. Neon branching is the obvious answer given the stated Neon-via-Vercel-Marketplace choice, but the spine never says so.
- **Migration ownership/execution:** Drizzle is named as the ORM (with schema in `lib/db/schema.ts`), but nothing says who runs `drizzle-kit` migrations, when (CI step? manual? on-deploy hook?), or how migration failures are handled mid-deploy.
- **Scheduled/batch execution mechanism for FR-10:** The Capability Map states insight clustering runs "일 1회 배치" (daily batch), but no mechanism is named — Vercel Cron Jobs, an external scheduler, a Route Handler polled by something else? Two implementers could reasonably build this two incompatible ways (e.g., one as a Vercel Cron hitting a Route Handler, another as a long-running worker that doesn't fit the stated Vercel serverless deploy model at all).
- **Observability/monitoring/logging:** Not mentioned at all. Given AD-5's own requirement that AI query failures "must always surface, never fail silently," and given FR-7's safety-critical framing (wrong grounding = potential real-world harm during a live ceremony), the complete absence of any logging/alerting strategy for AI-answer failures or low-confidence "no case found" responses is notable.
- **Secrets rotation / per-environment key scoping:** touched only at the "don't hardcode" level, nothing about how `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` differ (or don't) between Preview and Production.

The task brief calls this out explicitly as "a known failure mode to check for," and it applies here: this is a silent whole-dimension gap at exactly the altitude (feature/build-substrate) that should own it, not push it to individual stories. Recommend adding either a 7th AD (if the environment/DB-branching and migration-execution choices are consequential enough to *prevent* divergence, which they are) or, at minimum, explicit Deferred/Open-Question entries naming these gaps so they're visible rather than absent. Right now a reader of this "final" spine would not know these questions exist.

## 7. Silent gap: feedback draft/autosave persistence (FR-8)

PRD FR-8's consequence — "입력을 완료하지 않고 나가도 임시 저장되어 이어 쓸 수 있다" (the "지금 당장은 생각이 잘 안 난다" case that motivated the whole feature, per DESIGN.md voice samples and PRD §0) — requires *some* durable persistence mechanism for partial feedback. It's unclear from the spine whether this is: a draft row in the `feedback`/`variable_case` table with a status flag, client-side-only local storage (which would not survive a device swap or app reinstall, undermining "나중에 이어 쓸 수 있다" if read on a different session/device), or something else. AD-5 covers offline caching for checklist *reads* only; it explicitly does not cover feedback writes ("AI 질의와 피드백 저장은 항상 네트워크가 필요하며"), which makes the draft-persistence question orthogonal to AD-5 and currently unaddressed anywhere — not decided, not deferred, not an open question. This is a smaller instance of the same "silent gap" pattern as §6 and should at least be added to Deferred or Open Questions.

## 8. Named tech — verified-current or stale/unsourced?

Cross-checked the Stack table against `.memlog.md`, which is the log this spine claims to be "distilled from":

- **voyage-3.5 (1024-dim), claude-sonnet-5, claude-haiku-4-5, better-auth (vs. NextAuth/Auth.js), Neon via Vercel Marketplace** — all trace cleanly to memlog decision lines with explicit "web-verified 2026-07-24" language (memlog lines 10, 12, 13). The `claude-sonnet-5` model ID also matches this very session's own runtime identity, which is at least internally consistent. No issue.
- **Next.js `16.2.11+ (2026-07 보안 패치 반영)` and Drizzle `0.36+`** — **these exact figures appear nowhere in `.memlog.md`.** The memlog's only touchpoint on this is line 15: *"(version) Stack versions to verify at Reviewer Gate: Next.js (App Router, latest stable)..."* — i.e., the log explicitly records these as **unverified and deferred to a later gate**, without committing to a specific number. The final spine then states a specific patch version (`16.2.11`) and a specific security-patch justification ("2026-07 보안 패치 반영") with no citation, and a specific Drizzle minor version (`0.36+`) with a specific capability claim ("`vector` 컬럼 타입 + `cosineDistance` 네이티브 지원"). Given my own knowledge cutoff (Jan 2026) I cannot independently confirm or deny these numbers, but that's exactly the problem: the spine presents them with a false air of having passed the "Reviewer Gate" the memlog itself says was still pending, and offers no verification trail (URL, date, method) the way the LLM/embedding decisions do. **This should be corrected to either (a) show actual verification provenance matching the other Stack rows, or (b) soften to "latest stable, verify at implementation start" the way better-auth and @vercel/blob are already worded**, rather than asserting unsourced precision.

## 9. FR-1 through FR-11 coverage (Capability → Architecture Map)

All eleven FRs appear in the map, and no FR is completely unmapped:

- FR-1 → AD-2. FR-2/3 → AD-2, AD-4. FR-4/5 → AD-2. FR-6/7 → AD-1, AD-5, AD-6. FR-8/9 → AD-1, AD-6. FR-10/11 → AD-1, AD-3, AD-6. Auth → AD-3.

The one weak link is FR-4/5, discussed in §3: the map cites AD-2 (hall isolation) but AD-2 doesn't actually govern FR-5's conditional-inclusion mechanism, which is FR-5's actual substance. The map entry is technically present but doesn't cover the capability's real complexity — closer to a placeholder than genuine governance.

---

## Summary of Findings

1. **(Significant)** Deployment/environments/infra/operations is a near-total silent gap: no Neon branching-per-environment decision, no migration execution ownership, no cron/batch mechanism for FR-10's daily clustering job, no observability/logging strategy — despite the doc's own safety-critical framing (AD-5, AD-6, FR-7) making silent AI-answer failures a real risk. Recommend a 7th AD or explicit Deferred/Open-Question entries.
2. **(Significant)** FR-5's contract-type conditional item-inclusion logic has no home in the ERD or any AD — only its *UI* is (correctly) deferred to UX per the PRD's own note, but the underlying data representation is an architecture-level decision that's currently invisible, risking incompatible schemas from independent implementers.
3. **(Moderate)** Stack table states precise, unsourced version numbers for Next.js (`16.2.11+`, with a specific "2026-07 보안 패치" claim) and Drizzle (`0.36+`) that do not appear in `.memlog.md`, which explicitly records these as "to verify at Reviewer Gate" rather than settled. This contradicts the sourcing standard the doc itself uses for the LLM/embedding vendor rows.
4. **(Minor)** Feedback draft/autosave persistence (FR-8's "임시 저장되어 이어 쓸 수 있다") has no stated mechanism and falls outside AD-5's scope (which explicitly excludes feedback writes) — not decided, deferred, or flagged anywhere.
5. **(Minor)** AD-1's rule has no named enforcement mechanism (e.g., an ESLint import-boundary rule) — it's a code-review-only convention, weaker than the "Prevents" framing implies for a binding build substrate.

## What's working well (worth preserving)

- AD-3's timing is well-judged — it forecloses reintroduction of a just-deprecated role tier before any story can resurrect it.
- AD-5 and AD-6 both model the right pattern for carrying a PRD-level open assumption into architecture: state a concrete default, name the mechanism precisely enough to be testable, and cross-reference the still-open PRD question rather than pretending it's settled.
- The dependency-direction rule and repository-layer isolation (AD-2) are concrete and directly testable against actual PRs.
