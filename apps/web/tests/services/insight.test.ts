import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql, eq } from "drizzle-orm";
import { resetDb, createTestHall, createConfirmedVariableCase } from "../helpers/db";

// Story 3.2가 확립한 방식 — 실제 벤더를 호출하지 않고 가짜 포트를 주입한다.
// vi.mock은 파일 상단으로 호이스팅되므로 아래 static import보다 먼저 적용된다.
const generateMock = vi.fn();
const embedMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  getLLMPort: () => ({ generate: generateMock, generateStream: vi.fn() }),
  getEmbeddingPort: () => ({ embed: embedMock }),
}));

import {
  recomputeInsights,
  getInsights,
  InsightLockedError,
  MIN_CLUSTER_SIMILARITY,
  MIN_CLUSTER_SIZE,
} from "@/lib/services/insight";
import * as insightRepo from "@/lib/db/repositories/insight";
import { db } from "@/lib/db";
import { variableCases } from "@/lib/db/schema";

function unitVector(axis: number): number[] {
  const v = Array.from({ length: 1024 }, () => 0);
  v[axis] = 1;
  return v;
}

function labelResponse(label: string) {
  return { text: JSON.stringify({ label }) };
}

/** 같은 벡터를 공유해 반드시 한 클러스터가 되는 케이스 2건. */
async function seedOneCluster(hallName = "그랜드홀") {
  const hall = await createTestHall({ name: hallName });
  const a = await createConfirmedVariableCase(hall.id, unitVector(0), {
    situation: "축가 반주가 늦게 나왔다",
    stepName: "축가",
  });
  const b = await createConfirmedVariableCase(hall.id, unitVector(0), {
    situation: "MR 페이더를 미리 올려두지 않았다",
    stepName: "축가",
  });
  return { hall, a, b };
}

beforeEach(async () => {
  await resetDb();
  generateMock.mockReset();
  embedMock.mockReset();
});

describe("recomputeInsights — 클러스터 생성 (AC 1)", () => {
  it("유사한 케이스를 한 클러스터로 묶고 LLM 라벨을 붙여 저장한다", async () => {
    const { a } = await seedOneCluster();
    generateMock.mockResolvedValue(labelResponse("축가 반주(MR) 큐 지연"));

    const result = await recomputeInsights();

    expect(result).toEqual({ clusterCount: 1, caseCount: 2 });
    const stored = await insightRepo.listClusters();
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe("축가 반주(MR) 큐 지연");
    expect(stored[0].rootCaseId).toBe(a.id);
    expect(stored[0].stepName).toBe("축가");
  });

  it("확정 케이스가 없으면 클러스터도 없다", async () => {
    const result = await recomputeInsights();

    expect(result).toEqual({ clusterCount: 0, caseCount: 0 });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("서로 무관한 케이스만 있으면 1건짜리는 저장되지 않는다 (MIN_CLUSTER_SIZE)", async () => {
    const hall = await createTestHall();
    await createConfirmedVariableCase(hall.id, unitVector(0));
    await createConfirmedVariableCase(hall.id, unitVector(500));

    const result = await recomputeInsights();

    expect(result.clusterCount).toBe(0);
    expect(await insightRepo.listClusters()).toEqual([]);
    // 패턴이 아닌 것에 라벨 비용을 쓰지 않는다.
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("성공하면 락이 풀리고 last_completed_at이 기록된다", async () => {
    await seedOneCluster();
    generateMock.mockResolvedValue(labelResponse("라벨"));

    await recomputeInsights();

    const state = await insightRepo.readState();
    expect(state.runningSince).toBeNull();
    expect(state.lastCompletedAt).toBeInstanceOf(Date);
    expect(state.lastError).toBeNull();
  });
});

describe("recomputeInsights — 라벨 생성 실패는 배치를 막지 않는다", () => {
  // AI 한 건 실패로 집계 전체가 날아가면 관리자는 아무것도 못 본다.
  it("LLM이 throw해도 대표 케이스 상황 설명으로 폴백하고 클러스터는 저장된다", async () => {
    await seedOneCluster();
    generateMock.mockRejectedValue(new Error("OpenAI 502"));

    const result = await recomputeInsights();

    expect(result.clusterCount).toBe(1);
    const [stored] = await insightRepo.listClusters();
    expect(stored.label).toContain("축가 반주가 늦게 나왔다");
    // 실패했어도 배치 자체는 성공으로 마감된다.
    expect((await insightRepo.readState()).lastError).toBeNull();
  });

  it.each([
    ["빈 문자열", JSON.stringify({ label: "" })],
    ["공백만", JSON.stringify({ label: "   " })],
    ["40자 초과", JSON.stringify({ label: "가".repeat(41) })],
    ["label이 문자열이 아님", JSON.stringify({ label: 42 })],
    ["label 키 없음", JSON.stringify({ title: "축가 지연" })],
    ["JSON이 아님", "축가 반주 큐 지연"],
  ])("응답이 계약을 어기면(%s) 폴백 라벨을 쓴다", async (_name, text) => {
    await seedOneCluster();
    generateMock.mockResolvedValue({ text });

    await recomputeInsights();

    const [stored] = await insightRepo.listClusters();
    expect(stored.label).toContain("축가 반주가 늦게 나왔다");
  });
});

describe("recomputeInsights — 라벨 재사용", () => {
  it("멤버가 그대로면 LLM을 다시 호출하지 않고 기존 라벨을 유지한다", async () => {
    await seedOneCluster();
    generateMock.mockResolvedValue(labelResponse("축가 반주(MR) 큐 지연"));
    await recomputeInsights();
    expect(generateMock).toHaveBeenCalledTimes(1);

    await recomputeInsights();

    expect(generateMock).toHaveBeenCalledTimes(1);
    const [stored] = await insightRepo.listClusters();
    expect(stored.label).toBe("축가 반주(MR) 큐 지연");
  });

  it("멤버가 늘면 라벨을 새로 만든다", async () => {
    const { hall } = await seedOneCluster();
    generateMock.mockResolvedValue(labelResponse("첫 라벨"));
    await recomputeInsights();

    await createConfirmedVariableCase(hall.id, unitVector(0), { stepName: "축가" });
    generateMock.mockResolvedValue(labelResponse("갱신된 라벨"));
    await recomputeInsights();

    expect(generateMock).toHaveBeenCalledTimes(2);
    const [stored] = await insightRepo.listClusters();
    expect(stored.label).toBe("갱신된 라벨");
    expect(stored.memberCaseIds).toHaveLength(3);
  });
});

describe("recomputeInsights — 동시 실행 차단 (AC 3)", () => {
  it("이미 실행 중이면 InsightLockedError를 던진다", async () => {
    await insightRepo.acquireLock(10);

    await expect(recomputeInsights()).rejects.toBeInstanceOf(InsightLockedError);
  });

  // 락이 풀리지 않으면 TTL이 만료될 때까지 다음 배치가 전부 막힌다.
  it("중간에 실패해도 finally에서 락을 풀고 오류를 남긴다", async () => {
    const { a } = await seedOneCluster();
    // 라벨 생성은 케이스 조회와 replaceAll 사이에 일어난다 — 그 사이에 근거 케이스가
    // 사라지는 상황을 흉내내 replaceAll의 FK 위반(진짜 실패)을 유발한다.
    generateMock.mockImplementation(async () => {
      await db.delete(variableCases).where(eq(variableCases.id, a.id));
      return labelResponse("라벨");
    });

    await expect(recomputeInsights()).rejects.toThrow();

    const state = await insightRepo.readState();
    expect(state.runningSince).toBeNull();
    expect(state.lockExpiresAt).toBeNull();
    expect(state.lastError).not.toBeNull();
    expect(state.lastCompletedAt).toBeNull();
    // 실패했으면 다음 배치가 곧바로 다시 시도할 수 있어야 한다.
    expect(await insightRepo.acquireLock(10)).toEqual(expect.any(String));
  });

  // 코덱스 1차 P1: drizzle은 실패한 쿼리의 파라미터를 오류 메시지에 싣는다. 그 메시지를
  // 그대로 저장하면 상황 설명 원문이 상태 행에 남아 NFR-5를 깬다.
  it("실패를 기록할 때 상황 설명 원문이 last_error에 남지 않는다 (NFR-5)", async () => {
    const { a } = await seedOneCluster();
    generateMock.mockImplementation(async () => {
      await db.delete(variableCases).where(eq(variableCases.id, a.id));
      return labelResponse("라벨");
    });

    await expect(recomputeInsights()).rejects.toThrow();

    const { lastError } = await insightRepo.readState();
    expect(lastError).not.toBeNull();
    // 시드한 두 케이스의 상황 설명 어느 조각도 들어 있으면 안 된다.
    expect(lastError).not.toContain("축가 반주가 늦게 나왔다");
    expect(lastError).not.toContain("MR 페이더");
    // 저장되는 것은 오류 종류(+SQLSTATE) 라벨뿐이다.
    expect(lastError).toMatch(/^[A-Za-z]+(\(\w+\))?$/);
  });
});

describe("getInsights — 표시값은 저장값이 아니라 파생값이다", () => {
  it("반복 횟수와 발생 홀 분포를 멤버에서 계산한다 (AC 1)", async () => {
    const hallA = await createTestHall({ name: "A홀" });
    const hallB = await createTestHall({ name: "B홀" });
    await createConfirmedVariableCase(hallA.id, unitVector(0), { stepName: "축가" });
    await createConfirmedVariableCase(hallA.id, unitVector(0), { stepName: "축가" });
    await createConfirmedVariableCase(hallB.id, unitVector(0), { stepName: "축가" });
    generateMock.mockResolvedValue(labelResponse("축가 반주 큐 지연"));
    await recomputeInsights();

    const view = await getInsights();

    expect(view.items).toHaveLength(1);
    expect(view.items[0].count).toBe(3);
    expect(view.items[0].hallDistribution).toEqual([
      { hallName: "A홀", count: 2 },
      { hallName: "B홀", count: 1 },
    ]);
    expect(view.items[0].evidence).toHaveLength(3);
    expect(view.totalCases).toBe(3);
  });

  it("근거 목록에 상황·홀·단계가 실려 온다 (AC 4)", async () => {
    await seedOneCluster("리버사이드홀");
    generateMock.mockResolvedValue(labelResponse("라벨"));
    await recomputeInsights();

    const view = await getInsights();
    const evidence = view.items[0].evidence[0];

    expect(evidence.situation).toBe("축가 반주가 늦게 나왔다");
    expect(evidence.hallName).toBe("리버사이드홀");
    expect(evidence.stepName).toBe("축가");
    expect(evidence.createdAt).toBeInstanceOf(Date);
  });

  it("클러스터가 없으면 빈 목록을 반환한다", async () => {
    const view = await getInsights();

    expect(view.items).toEqual([]);
    expect(view.totalCases).toBe(0);
    expect(view.lastCompletedAt).toBeNull();
    expect(view.isRecomputing).toBe(false);
  });

  it("실행 중이면 isRecomputing이 true다 (AC 2)", async () => {
    await insightRepo.acquireLock(10);

    expect((await getInsights()).isRecomputing).toBe(true);
  });

  // 죽은 배치 때문에 화면에 스켈레톤이 영원히 남으면 안 된다.
  it("만료된 락은 실행 중으로 치지 않는다", async () => {
    await insightRepo.acquireLock(10);
    await db.execute(
      sql`update insight_recompute_state set lock_expires_at = now() - interval '1 minute'`,
    );

    expect((await getInsights()).isRecomputing).toBe(false);
  });
});

describe("클러스터 임계값 상수", () => {
  // 2026-07-28 실측(scripts/measure-cluster-threshold.ts, 같은 원인 8쌍 / 다른 원인 37쌍).
  // 두 분포가 겹치므로 "완벽한" 값은 없지만, 다른 원인 최댓값 위여야 과병합이 0이 된다.
  const MEASURED_DIFFERENT_CAUSE_MAX = 0.5328;
  // 이 값으로 살아남는 가장 낮은 같은 원인 쌍 — 이보다 높이면 그마저 놓친다.
  const MEASURED_SAME_CAUSE_RETAINED_MIN = 0.6063;

  it("MIN_CLUSTER_SIMILARITY가 실측 구간 안에 있다 (과병합 0 보장)", () => {
    expect(MIN_CLUSTER_SIMILARITY).toBeGreaterThan(MEASURED_DIFFERENT_CAUSE_MAX);
    expect(MIN_CLUSTER_SIMILARITY).toBeLessThan(MEASURED_SAME_CAUSE_RETAINED_MIN);
  });

  // 질의 임계값과 같아지면 문서-문서 판정에 질의-문서 기준을 쓰는 셈이 된다.
  it("질의 임계값(query.ts MIN_SIMILARITY)보다 엄격하다", async () => {
    const { MIN_SIMILARITY } = await import("@/lib/services/query");
    expect(MIN_CLUSTER_SIMILARITY).toBeGreaterThan(MIN_SIMILARITY);
  });

  it("1건짜리는 반복이 아니므로 최소 크기가 2 이상이다", () => {
    expect(MIN_CLUSTER_SIZE).toBeGreaterThanOrEqual(2);
  });
});
