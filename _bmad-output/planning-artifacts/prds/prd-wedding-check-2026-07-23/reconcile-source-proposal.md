# Input Reconciliation — 원문 제안서 vs PRD + Addendum

**Source:** `제안서-웨딩홀 스캔 인수인계 시스템.md`
**Compared against:** `prd.md`, `addendum.md` (same folder)
**Date:** 2026-07-23

Method: every claim, nuance, acceptance criterion, and exclusion in the source was traced to its destination (PRD / addendum / missing). Findings below are ordered by severity.

---

## Gap 1 (HIGH) — 검수 기준 #1 (템플릿 커버리지) is dropped entirely

Source §2, [검수 기준], bullet 1:
> "심어둔 조작 시나리오 N개가 템플릿에 빠짐없이 커버됨"

This is one of 5 explicit acceptance criteria in the source. Checking all 5 against the PRD:

| # | Source 검수 기준 | PRD destination |
|---|---|---|
| 1 | 심어둔 조작 시나리오 N개가 템플릿에 빠짐없이 커버됨 | **Not found anywhere** — not in FR-1/FR-2 Consequences, not in Success Metrics, not in MVP Scope. |
| 2 | 심어둔 변수 상황 N건이 자연어 입력만으로 정확히 구조화되어 저장됨 | FR-8 Consequences ("검수용으로 심어둔 변수 상황 N건이... 5개 필드 모두 정확히 채워져 저장된다") + SM-3. Preserved. |
| 3 | 자연어 질의에 관련 있는 과거 케이스를 근거로 응답(엉뚱한 매칭 없음) | FR-6 Consequences + SM-2 ("관련 없는 사례가 근거로 제시되는 비율 0%"). Preserved. |
| 4 | 표현이 다른 반복 피드백이 같은 주의사항으로 묶여 노출됨 | FR-9 Consequences, near-verbatim. Preserved. |
| 5 | 재실행 시 동일 결과 | §5 NFR "재현성". Preserved. |

4 of 5 acceptance criteria were carried into the PRD with equivalent (or better) testable rigor, each explicitly flagged "(원문서 검수 기준과 동일)." Criterion #1 — that a template built from FR-1/FR-2 must demonstrably cover a seeded set of N operation scenarios with no gaps — has no equivalent anywhere: not as an FR-1/FR-2 Consequence, not as a Success Metric, not in the Rollout section (which only discusses seeding template data from interviews, not verifying its completeness). This also connects to the source's "다음 단계" item "변수 상황 심어둔 샘플 케이스(정답지 포함) 준비 — 검수 기준 근거용," which implies test fixtures were planned for *both* the checklist-coverage and variable-case criteria; the PRD only carries forward the variable-case half.

**Recommendation:** Add a Consequence to FR-1 (or a new SM) stating something like: "관리자가 홀의 전체 조작 단계를 템플릿에 등록하면, 검수용으로 정의된 N개 시나리오가 모두 최소 1개 항목에 매핑된다(누락 0건)."

---

## Gap 2 (MEDIUM) — "실패 비용 낮음" fact is completely absent

Source diagnosis table:
> "실패 비용 | 낮음 — 고객 컴플레인은 현장에서 즉시 조치, 환불·악성리뷰 사례 없음"

Grep across `prd.md` and `addendum.md` for 컴플레인/환불/악성/실패 비용 returns zero matches. This fact does not appear anywhere.

This is a load-bearing piece of context in the source: it's the reason the whole engagement can be scoped as an internal training tool built with LLM-driven matching/clustering (§4.3/§4.5) without heavier guardrails — the downside of a wrong AI answer is bounded (no refunds, no reputational damage, immediate on-site correction), which is precisely why "모르면 모른다" (FR-6's safety behavior) is an adequate safety net rather than requiring, say, human-in-the-loop review before every query response. The PRD's Safety subsection (§6) justifies the "관련 사례 없음" behavior purely from a "라이브 예식 중 잘못된 대처법이... 실제 사고로 이어질 수 있으므로" angle, but never states the counterbalancing fact that even a failure here is not catastrophic for the business — which was the original reasoning that made the low-guardrail v1 scope defensible in the first place. A reader of the PRD alone would not know why the acceptance bar wasn't set higher (e.g., mandatory senior sign-off before showing any AI answer).

**Recommendation:** Add one sentence to §6 Safety or §1 Vision noting the low failure-cost context, so the reasoning behind FR-6's (relatively lightweight) safety design is traceable without the source doc.

---

## Gap 3 (LOW, confirmed NOT a gap on inspection — noted for completeness) — 근속 분포 reasoning behind turnover Non-Goal

Source: "근속 분포 | 1~2개월 내 다수 이탈(사회초년생 사정, **업무 강도와는 무관**), 그 이후는 1~2년 근무"

PRD §7 Non-Goals: "이직률 자체의 개선 — 인터뷰로 확인된 조기 이탈은 교육 강도와 무관한 사유이며 이 시스템의 스코프 밖이다."

This is preserved adequately — the core reasoning ("무관한 사유") is present and the Non-Goal does not read as unexplained. The one dropped nuance is the second half of the source fact — that after the early 1–2 month filter, retained staff stay 1–2 years — which frames turnover as a one-time filtering event rather than a chronic pattern. Minor; does not change the Non-Goal's validity or make it unexplained. Flagging only because the task asked to check explicitly.

---

## Gap 4 (LOW) — "선임 본인도 변수 상황을 정형화해서 기억 못 함" reasoning: confirmed well-preserved, not a gap

Checked as requested. This reasoning is load-bearing in multiple places, not a single mention:
- §1 Vision: "선임 본인도 변수 상황을 정형화해서 기억하지 못한다는 사실이 인터뷰로 확인됐기 때문에, 자연어 입력이 이 시스템이 실제로 쓰이기 위한 전제조건이다."
- §4.4 Description: repeats it as the feature's design premise.
- FR-7 Consequences: ties the "임시 저장" behavior directly to the "지금 당장은 생각이 잘 안 난다" case.
- UJ-2 Edge case: dramatizes the same scenario.
- SM-C1 (counter-metric): explicitly reuses "폼을 주면 안 쓴다" as the failure pattern to guard against when tuning SM-3.

No action needed here.

---

## Gap 5 (LOW) — minor flattened details, informational only

- **"5시간 이론·관찰" initial training step**: source describes current onboarding as "5시간 이론·관찰 → 이후 약 1개월(예식 20~25회) 선임 동반." The PRD's Vision only mentions the 20–25회 shadowing figure; the preceding 5-hour theory/observation phase is dropped. Doesn't affect any FR, but slightly understates the current-state baseline that SM-1 measures against.
- **"기존 시도 없음... 것으로 추정" hedge**: source frames "홀마다 워크플로우가 달라 일반화가 어려웠다" as the consultant's *inference* ("추정"), not a confirmed fact. PRD JTBD (§2.1, 대표) states it as settled fact without the hedge. Low materiality.
- **"영상 촬영해서 넣는 방식 선호" (customer's stated preference, not settled decision)**: source lists this as one of three customer-stated needs — a *preference*. PRD (FR-2) implements it as a fixed feature without flagging that it originated as a stated preference rather than a technical requirement. Not wrong, but if video hosting cost/complexity becomes an issue at build time, it's worth knowing this was a nice-to-have preference rather than a hard requirement. (Addendum does correctly flag video storage as an undecided technical trade-off.)

---

## Confirmed fully preserved (no gap)

- All 5 v1 exclusions (다른 홀 확장, 실시간 음성인식/자동응대, 모바일 앱, 이직률 개선, ⑤→①자동반영) → PRD §7 Non-Goals, all five present.
- v2 확장 방향 (빈도 기반 자동 승격 — 3 components: 상태 누적/승격 정책/승인 절차; 다른 홀 확장 시 스키마 재사용) → addendum.md, in detail, plus the "계약서-시료제작예약시스템 v1.1 별도 계약" analogy explicitly retained.
- Core two-problem diagnosis (정형 조작법 vs 변수 상황 대응) → PRD §1 Vision, front and center.
- "의미 기반 매칭 필요, 키워드 매칭 불충분" reasoning + the "주례자가 순서를 바꿈" ≒ "목사님이 애드리브함" example → PRD §4.3, FR-5, FR-9, and addendum's tech-how candidates section — used consistently as a running example.
- 검수 기준 acceptance criteria #2–#5 → preserved with equivalent/superior testable rigor (see Gap 1 table).
- 계약서-시료제작예약시스템 reference → addendum explicitly notes the file could not be located in this repo and flags it needs separate confirmation — a reasonable, honest handling of a source reference that couldn't be resolved.

---

## Summary table

| Item | Status |
|---|---|
| 검수 기준 #1 (템플릿 시나리오 커버리지) | **Missing** — no FR consequence or SM equivalent |
| 검수 기준 #2–#5 | Preserved, testable |
| 실패 비용 낮음 (컴플레인/환불/악성리뷰 없음) | **Missing** — zero mentions in PRD or addendum |
| 근속 분포 → 이직률 Non-Goal reasoning | Preserved (core "무관" reasoning present; only the "이후 1-2년 근무" half dropped) |
| 선임 기억 못 함 → 자연어 입력 필수 reasoning | Preserved, load-bearing in 5 separate places |
| 5시간 이론·관찰 단계 | Dropped (minor, baseline description only) |
| "일반화 어려웠던 것으로 추정" hedge | Flattened to stated fact (minor) |
| "영상 방식 선호" (preference vs requirement) | Flattened to fixed feature (minor) |
| v1 제외 범위 (5개) | Fully preserved |
| v2 확장 방향 | Fully preserved (addendum) |
