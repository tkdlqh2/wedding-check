import * as insightRepo from "../db/repositories/insight";
import * as variableCaseRepo from "../db/repositories/variable-case";
import type { ClusteringCase } from "../db/repositories/variable-case";
import { getLLMPort } from "../ai";
import { toSafeErrorLabel } from "../safe-error";
import { buildClusters, type BuiltCluster } from "./insight-clustering";

// Story 4.1(FR-10, AD-7): 반복 패턴 인사이트. **`insight_clusters`에 쓰는 것은 이 파일의
// recomputeInsights() 하나뿐이다**(AD-7) — 다른 서비스·라우트·Server Action에서
// insightRepo의 쓰기 함수를 호출하지 말 것.

/**
 * 두 변수 케이스를 "같은 원인"으로 묶는 기준(문서↔문서, 대칭).
 *
 * **`query.ts`의 MIN_SIMILARITY(0.42)와 다른 값이며 공유해서는 안 된다.** 그쪽은
 * 질의↔문서(비대칭, inputType이 다름)이고 판정하는 질문도 "관련 있는가?"인 반면,
 * 여기는 문서↔문서이고 "같은 원인인가?"라는 더 엄격한 질문이다.
 *
 * 값의 근거 — 현 벤더(OpenAI text-embedding-3-large, 1024차원)로 실제 임베딩을 호출해
 * 측정했다(2026-07-28, 웨딩홀 도메인 피드백 10건 = 같은 원인 8쌍 + 다른 원인 37쌍):
 *
 *   같은 원인   0.2353 ~ 0.6722
 *   다른 원인   0.1693 ~ 0.5328
 *
 * 3.4의 질의 임계값과 달리 **두 분포가 크게 겹친다**(0.2353~0.5328). 즉 "같은 원인을
 * 전부 묶으면서 다른 원인을 하나도 안 묶는" 임계값은 존재하지 않는다. 다만 0.5328
 * 위로는 다른 원인 쌍이 하나도 없어, 과병합을 0으로 만드는 구간은 존재한다.
 *
 * 그 구간에서 0.58을 택한다 — 다른 원인 최댓값(0.5328)에서 +0.047, 이 값으로 살아남는
 * 가장 낮은 같은 원인 쌍(0.6063)에서 -0.026. 정중앙(0.570)보다 위인 이유는 두 가지다:
 *   1. 과병합의 대가가 더 크다. 대표 화면에 "이 원인이 5회 반복"이라고 떠 있는데 그중
 *      2건이 사실 다른 원인이면 그건 잘못된 근거를 제시하는 것이다(§12 원칙 4). 반면
 *      과분할은 횟수를 과소 보고할 뿐 거짓말을 하지 않는다.
 *   2. 클러스터링이 단일 연결이라 **거짓 엣지 하나가 두 클러스터 전체를 합친다** —
 *      거짓 양성의 피해가 쌍 하나에 그치지 않고 증폭된다.
 *
 * [알려진 한계] 이 임계값에서 위 측정 세트의 같은 원인 8쌍 중 3쌍만 살아남는다. 특히
 * PRD가 NFR-4 예시로 든 "주례자가 순서를 바꿈" ≒ "목사님이 애드리브함"은 doc-doc에서도
 * 0.2353으로, 어떤 임계값에서도 다른 원인 쌍을 함께 들이지 않고는 묶이지 않는다
 * (3.4에서 query-doc 0.277로 확인한 것과 같은 한계의 재확인). 프로토타입이 이 쌍을 한
 * 클러스터로 보여주는 수준의 병합은 임베딩만으로는 재현되지 않는다 — deferred-work.md
 * 참고(하이브리드 검색/동의어 확장).
 *
 * 환경변수로 덮어쓰지 않는다(3.4와 동일 원칙): 설정 한 줄로 집계 기준이 바뀌면 결과의
 * 재현성이 사라진다. 실데이터가 쌓이면 scripts/measure-cluster-threshold.ts로 재보정한다.
 */
export const MIN_CLUSTER_SIMILARITY = 0.58;

/**
 * FR-10의 산출물은 "이 원인이 N번째 반복되고 있다"이다 — 멤버 1건은 반복이 아니다.
 * 이 하한이 없으면 인사이트 화면이 그냥 확정 케이스 전체 목록으로 변질되고, 라벨 LLM
 * 호출도 패턴이 아닌 것에까지 쓰인다.
 */
export const MIN_CLUSTER_SIZE = 2;

// 배치가 중간에 죽어도 이 시간이 지나면 다음 실행이 락을 빼앗는다(영구 교착 방지).
const LOCK_TTL_MINUTES = 10;

// 라벨 생성 프롬프트에 넣는 최대 사례 수 — 비용·컨텍스트 상한. 큰 클러스터라도 상황
// 설명 몇 건이면 원인 이름을 짓기에 충분하다.
const MAX_LABEL_SOURCE_CASES = 8;
const MAX_LABEL_LENGTH = 40;
const FALLBACK_LABEL_LENGTH = 30;

/** 최근 N일 신규 확정 피드백 통계 카드의 기준 기간. */
const RECENT_WINDOW_DAYS = 30;

export class InsightLockedError extends Error {}

export interface InsightEvidence {
  id: string;
  situation: string;
  outcome: string;
  rationale: string;
  hallName: string;
  stepName: string;
  createdAt: Date;
}

export interface InsightHallCount {
  hallName: string;
  count: number;
}

export interface InsightItem {
  rootCaseId: string;
  label: string;
  stepName: string;
  /** 반복 횟수 = 실제 조회된 근거 건수. 저장된 카운트가 아니라 파생값이다. */
  count: number;
  hallDistribution: InsightHallCount[];
  evidence: InsightEvidence[];
}

export interface InsightsView {
  items: InsightItem[];
  /** AC 2 — 갱신 중이면 화면이 스켈레톤만 덧붙이고 기존 목록은 그대로 둔다. */
  isRecomputing: boolean;
  lastCompletedAt: Date | null;
  totalCases: number;
  recentCases: number;
}

const LABEL_SCHEMA = {
  type: "object",
  properties: {
    label: {
      type: "string",
      description: "반복되는 원인을 가리키는 짧은 한국어 명사구",
    },
  },
  required: ["label"],
  additionalProperties: false,
} as const;

function buildLabelPrompt(situations: string[]): string {
  const numbered = situations.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return [
    "다음은 웨딩홀 스캔(조명·음향·영상) 오퍼레이터들이 서로 다른 예식에서 남긴,",
    "같은 원인으로 판단된 변수 상황 기록입니다.",
    "",
    numbered,
    "",
    "이 기록들이 공유하는 '반복되는 원인'을 짧은 한국어 명사구 하나로 이름 붙이세요.",
    "규칙:",
    "- 20자 이내. 문장이 아니라 목록에 걸 제목처럼.",
    "- 기록에 실제로 나타난 내용만 쓰고, 없는 원인을 추측해 덧붙이지 마세요.",
    "- 대처법이 아니라 '무엇이 반복되는가'를 쓰세요.",
    "- 예: '축가 반주(MR) 큐 지연', '식전 영상 송출 신호 끊김'",
  ].join("\n");
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

/**
 * 클러스터의 원인 이름 한 줄. **실패해도 배치를 중단시키지 않는다** — AI 한 건 실패로
 * 집계 전체가 날아가면 관리자는 아무것도 못 본다. 폴백은 대표 케이스의 상황 설명
 * 앞부분이라, 라벨이 어색할지언정 항상 실제 데이터에 근거한다.
 */
async function generateLabel(
  cluster: BuiltCluster,
  caseById: Map<string, ClusteringCase>,
): Promise<string> {
  const members = cluster.memberCaseIds
    .map((id) => caseById.get(id))
    .filter((c): c is ClusteringCase => c !== undefined);
  const fallback = truncate(
    members[0]?.situation ?? cluster.stepName,
    FALLBACK_LABEL_LENGTH,
  );

  try {
    const result = await getLLMPort().generate({
      prompt: buildLabelPrompt(
        members.slice(0, MAX_LABEL_SOURCE_CASES).map((m) => m.situation),
      ),
      responseSchema: LABEL_SCHEMA,
      // NFR-1 관례 — 같은 멤버 집합이면 같은 라벨이 나와야 한다.
      temperature: 0,
    });
    const parsed: unknown = JSON.parse(result.text);
    const label =
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { label?: unknown }).label === "string"
        ? (parsed as { label: string }).label.trim()
        : "";
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
      throw new Error(`라벨 길이가 유효하지 않습니다: ${label.length}`);
    }
    return label;
  } catch {
    // AD-10 구조화 로그. **상황 설명 원문은 넣지 않는다**(NFR-5) — 클러스터 식별자만.
    console.warn(
      JSON.stringify({ event: "insight_label_failed", rootCaseId: cluster.rootCaseId }),
    );
    return fallback;
  }
}

// 락 해제 문장 자체가 일시적으로 실패할 수 있다(네트워크/DB). 재시도 없이 포기하면
// 상태 행이 "실행 중"으로 남아 TTL(10분)까지 다음 배치가 막히고, 더 나쁘게는 finally에서
// throw가 나면서 **이미 성공한 replaceAll의 결과까지 실패로 보고된다**(코덱스 1차 P2).
// 제한된 재시도 후에도 실패하면 삼키고 구조화 로그만 남긴다 — 데이터는 이미 쓰였고,
// 남은 락은 TTL이 회수한다.
const RELEASE_MAX_ATTEMPTS = 3;
const RELEASE_RETRY_DELAY_MS = 200;

async function releaseLockBestEffort(token: string, failure: string | null): Promise<void> {
  for (let attempt = 1; attempt <= RELEASE_MAX_ATTEMPTS; attempt++) {
    try {
      const released = await insightRepo.releaseLock({
        token,
        completed: failure === null,
        error: failure,
      });
      if (!released) {
        // 내 락이 아니다 — 앞선 시도가 DB에서는 성공했는데 응답만 유실됐거나, TTL이
        // 만료돼 다른 실행이 가져간 경우다. **재시도하면 그 실행의 락을 지운다**(AC 3
        // 위반). 실패가 아니라 정상 종료 상태이므로 조용히 멈춘다.
        console.info(
          JSON.stringify({ event: "insight_lock_release_superseded", attempts: attempt }),
        );
      }
      return;
    } catch (err) {
      if (attempt === RELEASE_MAX_ATTEMPTS) {
        console.error(
          JSON.stringify({
            event: "insight_lock_release_failed",
            attempts: attempt,
            error: toSafeErrorLabel(err),
          }),
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, RELEASE_RETRY_DELAY_MS * attempt));
    }
  }
}

/**
 * AD-7의 유일한 쓰기 경로. Vercel Cron(`/api/cron/insight-recompute`)이 일 1회 호출한다.
 *
 * @throws {InsightLockedError} 이미 실행 중일 때(AC 3) — 라우트가 409로 변환한다.
 */
export async function recomputeInsights(): Promise<{
  clusterCount: number;
  caseCount: number;
}> {
  const token = await insightRepo.acquireLock(LOCK_TTL_MINUTES);
  if (token === null) {
    throw new InsightLockedError("인사이트 재계산이 이미 실행 중입니다");
  }

  // 락은 어떤 경로로 실패해도 반드시 풀려야 한다 — finally에서 정확히 한 번 해제한다.
  let failure: string | null = null;
  try {
    // 두 조회를 병렬로 돌리면 서로 다른 DB 스냅샷을 보게 되고, 그 사이에 확정된 새
    // 케이스가 한쪽에만 나타난다(코덱스 1차 P2). 대상 목록을 먼저 확정한 뒤 **그 id
    // 집합 안에서만** 쌍을 조회해, 타이밍과 무관하게 항상 같은 그래프가 나오게 한다.
    const cases = await variableCaseRepo.listAllForClustering();
    const pairs = await variableCaseRepo.listSimilarPairs(
      MIN_CLUSTER_SIMILARITY,
      cases.map((c) => c.id),
    );
    const built = buildClusters(cases, pairs, MIN_CLUSTER_SIZE);

    // 멤버가 그대로인 클러스터는 라벨을 다시 만들지 않는다 — 비용 절감이자, 아무것도
    // 안 바뀐 날 라벨 문구만 흔들리는 것을 막는다(LLM은 temperature 0이어도 완전한
    // 재현성을 보장하지 않는다).
    const existing = await insightRepo.listClusters();
    const labelByHash = new Map(existing.map((c) => [c.membersHash, c.label]));
    const caseById = new Map(cases.map((c) => [c.id, c]));

    const toStore: insightRepo.ClusterToStore[] = [];
    for (const cluster of built) {
      const reused = labelByHash.get(cluster.membersHash);
      const label = reused ?? (await generateLabel(cluster, caseById));
      toStore.push({ ...cluster, label });
    }

    await insightRepo.replaceAll(toStore);
    return { clusterCount: toStore.length, caseCount: cases.length };
  } catch (err) {
    // 오류 **메시지**는 저장하지 않는다 — drizzle이 실패한 쿼리의 파라미터(상황 설명·
    // 라벨)를 메시지에 싣기 때문에 그대로 넣으면 NFR-5를 깬다(lib/safe-error.ts).
    failure = toSafeErrorLabel(err);
    throw err;
  } finally {
    await releaseLockBestEffort(token, failure);
  }
}

/** FR-11 화면용 읽기 경로. 반복 횟수·홀 분포는 저장값이 아니라 여기서 파생한다(AD-7 주석 참고). */
export async function getInsights(): Promise<InsightsView> {
  const [clusters, state, totalCases] = await Promise.all([
    insightRepo.listClusters(),
    insightRepo.readState(),
    variableCaseRepo.countCases(),
  ]);

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentCases = await variableCaseRepo.countCases(since);

  const allMemberIds = [...new Set(clusters.flatMap((c) => c.memberCaseIds))];
  const evidenceCases = await variableCaseRepo.listByIds(allMemberIds);
  const evidenceById = new Map(evidenceCases.map((c) => [c.id, c]));

  const items: InsightItem[] = clusters.map((cluster) => {
    // 조회되지 않는 id는 조용히 건너뛴다(jsonb 멤버십에는 FK가 없다 — schema.ts 주석).
    const evidence: InsightEvidence[] = cluster.memberCaseIds
      .map((id) => evidenceById.get(id))
      .filter((c) => c !== undefined)
      .map((c) => ({
        id: c.id,
        situation: c.situation,
        outcome: c.outcome,
        rationale: c.rationale,
        hallName: c.hallName,
        stepName: c.stepName,
        createdAt: c.createdAt,
      }));

    const hallCounts = new Map<string, number>();
    for (const e of evidence) {
      hallCounts.set(e.hallName, (hallCounts.get(e.hallName) ?? 0) + 1);
    }

    return {
      rootCaseId: cluster.rootCaseId,
      label: cluster.label,
      stepName: cluster.stepName,
      count: evidence.length,
      hallDistribution: [...hallCounts.entries()]
        .map(([hallName, count]) => ({ hallName, count }))
        .sort((a, b) => b.count - a.count || a.hallName.localeCompare(b.hallName, "ko")),
      evidence,
    };
  });

  // 만료된 락은 "실행 중"이 아니다 — 죽은 배치 때문에 화면에 스켈레톤이 영원히 남으면 안 된다.
  const isRecomputing =
    state.runningSince !== null &&
    (state.lockExpiresAt === null || state.lockExpiresAt.getTime() > Date.now());

  return {
    items,
    isRecomputing,
    lastCompletedAt: state.lastCompletedAt,
    totalCases,
    recentCases,
  };
}
