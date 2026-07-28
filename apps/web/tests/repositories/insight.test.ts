import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { resetDb, createTestHall, createConfirmedVariableCase } from "../helpers/db";
import * as insightRepo from "@/lib/db/repositories/insight";
import { hashMembers } from "@/lib/services/insight-clustering";
import { db } from "@/lib/db";

function unitVector(axis: number): number[] {
  const v = Array.from({ length: 1024 }, () => 0);
  v[axis] = 1;
  return v;
}

async function makeCluster(rootCaseId: string, memberCaseIds: string[], label: string) {
  return {
    rootCaseId,
    label,
    stepName: "주례사",
    memberCaseIds,
    membersHash: hashMembers(memberCaseIds),
  };
}

describe("insightRepo — 동시 실행 락 (AC 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function acquire(ttl = 10): Promise<string> {
    const token = await insightRepo.acquireLock(ttl);
    if (token === null) throw new Error("테스트 셋업 실패: 락 획득 실패");
    return token;
  }

  it("첫 획득은 토큰을 주고, 이미 실행 중이면 두 번째는 null이다", async () => {
    expect(await insightRepo.acquireLock(10)).toEqual(expect.any(String));
    expect(await insightRepo.acquireLock(10)).toBeNull();
  });

  it("해제하면 다시 획득할 수 있다", async () => {
    const token = await acquire();
    expect(await insightRepo.releaseLock({ token, completed: true })).toBe(true);
    expect(await insightRepo.acquireLock(10)).toEqual(expect.any(String));
  });

  // 배치가 중간에 죽어도 다음 실행이 영구히 막히면 안 된다.
  it("만료된 락은 빼앗는다", async () => {
    await acquire();
    // 락을 과거 시점으로 만료시킨다.
    await db.execute(
      sql`update insight_recompute_state set lock_expires_at = now() - interval '1 minute'`,
    );
    expect(await insightRepo.acquireLock(10)).toEqual(expect.any(String));
  });

  // 코덱스 2차 P1: 해제 문장이 DB에서는 커밋됐는데 응답만 유실되면 호출부가 재시도하는데,
  // 그 사이 다음 실행이 락을 가져갔을 수 있다. 소유권 확인이 없으면 그 락까지 지워
  // 동시 실행이 열린다.
  it("남의 토큰으로는 해제되지 않는다 (펜싱 토큰)", async () => {
    const first = await acquire();
    await insightRepo.releaseLock({ token: first, completed: true });
    const second = await acquire();

    // 첫 실행이 "응답 유실"로 착각하고 재시도하는 상황.
    const released = await insightRepo.releaseLock({ token: first, completed: true });

    expect(released).toBe(false);
    // 두 번째 실행의 락은 그대로 살아 있어야 한다 — 아니면 세 번째가 끼어든다.
    expect(await insightRepo.acquireLock(10)).toBeNull();
    expect(await insightRepo.releaseLock({ token: second, completed: true })).toBe(true);
  });

  // TTL 만료로 락을 빼앗긴 뒤 뒤늦게 끝난 실행도 같은 경로로 걸러져야 한다.
  it("TTL 만료로 빼앗긴 뒤 뒤늦게 해제해도 새 실행의 락을 지우지 않는다", async () => {
    const stale = await acquire();
    await db.execute(
      sql`update insight_recompute_state set lock_expires_at = now() - interval '1 minute'`,
    );
    await acquire(); // 새 실행이 빼앗음

    expect(await insightRepo.releaseLock({ token: stale, completed: true })).toBe(false);
    expect(await insightRepo.acquireLock(10)).toBeNull();
  });

  it("성공 해제는 last_completed_at을 기록하고 오류를 비운다", async () => {
    const token = await acquire();
    await insightRepo.releaseLock({ token, completed: true, error: null });

    const state = await insightRepo.readState();
    expect(state.runningSince).toBeNull();
    expect(state.lockExpiresAt).toBeNull();
    expect(state.lastCompletedAt).toBeInstanceOf(Date);
    expect(state.lastError).toBeNull();
  });

  // 실패한 배치가 "방금 갱신됨"으로 보이면 안 된다.
  it("실패 해제는 last_completed_at을 건드리지 않고 오류만 남긴다", async () => {
    const first = await acquire();
    await insightRepo.releaseLock({ token: first, completed: true });
    const afterSuccess = await insightRepo.readState();

    const second = await acquire();
    await insightRepo.releaseLock({
      token: second,
      completed: false,
      error: "EmbeddingError",
    });
    const afterFailure = await insightRepo.readState();

    expect(afterFailure.lastCompletedAt?.getTime()).toBe(
      afterSuccess.lastCompletedAt?.getTime(),
    );
    expect(afterFailure.lastError).toBe("EmbeddingError");
  });

  it("획득 시 직전 오류를 비운다", async () => {
    const token = await acquire();
    await insightRepo.releaseLock({ token, completed: false, error: "PreviousError" });
    await acquire();

    expect((await insightRepo.readState()).lastError).toBeNull();
  });
});

describe("insightRepo.replaceAll — AD-7 원자 교체", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("신규 클러스터를 삽입한다", async () => {
    const hall = await createTestHall();
    const a = await createConfirmedVariableCase(hall.id, unitVector(0));
    const b = await createConfirmedVariableCase(hall.id, unitVector(1));

    const result = await insightRepo.replaceAll([
      await makeCluster(a.id, [a.id, b.id], "축가 반주 큐 지연"),
    ]);

    expect(result).toEqual({ upserted: 1, deleted: 0 });
    const stored = await insightRepo.listClusters();
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe("축가 반주 큐 지연");
    expect(stored[0].memberCaseIds).toEqual([a.id, b.id]);
  });

  // AD-7의 핵심: 기존 행을 지웠다 다시 넣는 게 아니라 제자리에서 갱신한다.
  it("같은 root_case_id는 삭제 후 재삽입이 아니라 제자리 갱신된다", async () => {
    const hall = await createTestHall();
    const a = await createConfirmedVariableCase(hall.id, unitVector(0));
    const b = await createConfirmedVariableCase(hall.id, unitVector(1));
    const c = await createConfirmedVariableCase(hall.id, unitVector(2));

    await insightRepo.replaceAll([await makeCluster(a.id, [a.id, b.id], "예전 라벨")]);
    const before = await insightRepo.listClusters();

    const result = await insightRepo.replaceAll([
      await makeCluster(a.id, [a.id, b.id, c.id], "새 라벨"),
    ]);

    expect(result).toEqual({ upserted: 1, deleted: 0 });
    const after = await insightRepo.listClusters();
    // 행 id가 유지된다 = 삭제 후 재삽입이 아니다.
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].label).toBe("새 라벨");
    expect(after[0].memberCaseIds).toEqual([a.id, b.id, c.id]);
  });

  it("계산 결과에 없는 클러스터는 같은 문장에서 삭제된다", async () => {
    const hall = await createTestHall();
    const a = await createConfirmedVariableCase(hall.id, unitVector(0));
    const b = await createConfirmedVariableCase(hall.id, unitVector(1));
    const c = await createConfirmedVariableCase(hall.id, unitVector(2));
    const d = await createConfirmedVariableCase(hall.id, unitVector(3));

    await insightRepo.replaceAll([
      await makeCluster(a.id, [a.id, b.id], "유지될 클러스터"),
      await makeCluster(c.id, [c.id, d.id], "사라질 클러스터"),
    ]);

    const result = await insightRepo.replaceAll([
      await makeCluster(a.id, [a.id, b.id], "유지될 클러스터"),
    ]);

    expect(result).toEqual({ upserted: 1, deleted: 1 });
    const stored = await insightRepo.listClusters();
    expect(stored.map((s) => s.rootCaseId)).toEqual([a.id]);
  });

  // 확정 케이스가 전부 사라지거나 전부 1건짜리가 되면 인사이트도 비어야 한다.
  it("빈 입력이면 전부 삭제된다", async () => {
    const hall = await createTestHall();
    const a = await createConfirmedVariableCase(hall.id, unitVector(0));
    const b = await createConfirmedVariableCase(hall.id, unitVector(1));
    await insightRepo.replaceAll([await makeCluster(a.id, [a.id, b.id], "라벨")]);

    const result = await insightRepo.replaceAll([]);

    expect(result).toEqual({ upserted: 0, deleted: 1 });
    expect(await insightRepo.listClusters()).toEqual([]);
  });

  it("반복 횟수 DESC, rootCaseId ASC로 정렬해 반환한다", async () => {
    const hall = await createTestHall();
    const cases = [];
    for (let i = 0; i < 5; i++) {
      cases.push(await createConfirmedVariableCase(hall.id, unitVector(i)));
    }
    const [big1, big2, big3, small1, small2] = cases;

    await insightRepo.replaceAll([
      await makeCluster(small1.id, [small1.id, small2.id], "2건"),
      await makeCluster(big1.id, [big1.id, big2.id, big3.id], "3건"),
    ]);

    const stored = await insightRepo.listClusters();
    expect(stored.map((s) => s.memberCaseIds.length)).toEqual([3, 2]);
  });

  it("countClusters가 저장된 클러스터 수를 센다", async () => {
    const hall = await createTestHall();
    const a = await createConfirmedVariableCase(hall.id, unitVector(0));
    const b = await createConfirmedVariableCase(hall.id, unitVector(1));

    expect(await insightRepo.countClusters()).toBe(0);
    await insightRepo.replaceAll([await makeCluster(a.id, [a.id, b.id], "라벨")]);
    expect(await insightRepo.countClusters()).toBe(1);
  });
});
