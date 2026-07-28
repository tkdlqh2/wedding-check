import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../index";
import { insightClusters, insightRecomputeState } from "../schema";
import type { BuiltCluster } from "../../services/insight-clustering";

// Story 4.1(FR-10, AD-7): insight_clusters / insight_recompute_state 접근 계층.
//
// **AD-7: 이 테이블들에 쓰는 것은 lib/services/insight.ts::recomputeInsights() 하나뿐이다.**
// 이 파일의 쓰기 함수를 다른 서비스·라우트·Server Action에서 호출하지 말 것.

const SINGLETON_ID = "singleton";

export interface RecomputeState {
  runningSince: Date | null;
  lockExpiresAt: Date | null;
  lastCompletedAt: Date | null;
  lastError: string | null;
}

export interface StoredCluster {
  id: string;
  rootCaseId: string;
  label: string;
  stepName: string;
  memberCaseIds: string[];
  membersHash: string;
  computedAt: Date;
}

/**
 * AC 3 — 동시 실행 차단. 조건부 UPDATE **한 문장**이 곧 원자적 획득이다: 두 요청이
 * 동시에 들어오면 뒤에 도착한 쪽이 앞선 요청의 커밋을 기다렸다가 갱신된 상태
 * (running_since IS NOT NULL)를 기준으로 재평가되어 0행을 반환한다
 * (member.ts::demoteIfNotLastActiveAdmin과 동일한 단일 문 패턴).
 *
 * advisory lock을 쓰지 않는 이유는 schema.ts의 insightRecomputeState 주석 참고
 * (neon-http는 문장마다 별개 HTTP 요청이라 세션 스코프 락이 유지되지 않는다).
 *
 * `lock_expires_at`이 지난 락은 빼앗는다 — 배치가 중간에 죽어도 다음 실행이 영구히
 * 막히지 않아야 한다.
 *
 * @returns 획득했으면 이 실행의 **펜싱 토큰**, 이미 실행 중이면 null.
 *   토큰은 `releaseLock`에 그대로 넘겨야 한다(소유권 확인용, 코덱스 2차 P1).
 */
export async function acquireLock(ttlMinutes: number): Promise<string | null> {
  const token = randomUUID();
  const result = await db.execute<{ id: string }>(sql`
    update ${insightRecomputeState}
    set running_since = now(),
        lock_expires_at = now() + make_interval(mins => ${ttlMinutes}),
        run_token = ${token},
        last_error = null
    where id = ${SINGLETON_ID}
      and (running_since is null or lock_expires_at < now())
    returning id
  `);
  return result.rows.length > 0 ? token : null;
}

/**
 * 락 해제. `recomputeInsights()`의 finally에서 호출되며, **어떤 경로로 실패해도 반드시
 * 실행되어야 한다** — 그러지 않으면 TTL이 만료될 때까지(최대 ttlMinutes) 다음 배치가 막힌다.
 *
 * **`token`이 일치할 때만 해제한다**(코덱스 2차 P1). 해제 문장이 DB에서 커밋됐는데
 * 응답만 유실되면 호출부가 재시도하는데, 그 사이 다음 실행이 락을 가져갔을 수 있다.
 * 소유권 확인 없이 해제하면 그 새 실행의 락까지 지워 동시 실행이 열린다(AC 3 위반).
 * TTL 만료로 락을 빼앗긴 뒤 뒤늦게 끝난 실행도 같은 이유로 여기서 걸러진다.
 *
 * `error`에는 오류 **메시지가 아니라** `toSafeErrorLabel()`이 만든 라벨만 넣는다
 * (NFR-5 — lib/safe-error.ts 주석 참고).
 *
 * @returns 이 실행이 소유한 락을 실제로 해제했으면 true. false는 실패가 아니라
 *   "이미 내 락이 아니다"라는 뜻이므로 재시도해서는 안 된다.
 */
export async function releaseLock(outcome: {
  token: string;
  completed: boolean;
  error?: string | null;
}): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    update ${insightRecomputeState}
    set running_since = null,
        lock_expires_at = null,
        run_token = null,
        last_completed_at = case when ${outcome.completed} then now() else last_completed_at end,
        last_error = ${outcome.error ?? null}
    where id = ${SINGLETON_ID}
      and run_token = ${outcome.token}
    returning id
  `);
  return result.rows.length > 0;
}

export async function readState(): Promise<RecomputeState> {
  const rows = await db
    .select({
      runningSince: insightRecomputeState.runningSince,
      lockExpiresAt: insightRecomputeState.lockExpiresAt,
      lastCompletedAt: insightRecomputeState.lastCompletedAt,
      lastError: insightRecomputeState.lastError,
    })
    .from(insightRecomputeState);
  return (
    rows[0] ?? {
      runningSince: null,
      lockExpiresAt: null,
      lastCompletedAt: null,
      lastError: null,
    }
  );
}

export interface ClusterToStore extends BuiltCluster {
  label: string;
}

/**
 * AD-7 — 기존 클러스터를 **먼저 지우지 않고** 계산 결과로 원자적으로 교체한다.
 * delete-then-reinsert였다면 그 사이에 화면을 보는 관리자에게 빈 목록이 노출된다
 * (§14 "기존 인사이트는 갱신 중에도 계속 보임" 계약 위반).
 *
 * db.transaction()이 프로덕션 드라이버(neon-http)에서 throw하므로 원자성은 **단일
 * 문장**으로만 얻을 수 있다(Story 1.3/2.1/3.2에서 확정된 제약). upsert와 삭제를 한
 * 문장의 두 CTE로 묶는다.
 *
 * 최종 select가 두 데이터 변경 CTE를 **모두 참조**한다 — 참조되지 않는 데이터 변경
 * CTE가 실행되지 않는 것으로 관측된 Story 5.5 선례를 그대로 방어한다.
 *
 * 입력이 비면(확정 케이스 0건 또는 전부 1건짜리) 전체 삭제가 맞다 — `not exists`가
 * 빈 input에 대해 항상 참이므로 자연히 그렇게 동작한다.
 */
export async function replaceAll(
  clusters: ClusterToStore[],
): Promise<{ upserted: number; deleted: number }> {
  const payload = JSON.stringify(
    clusters.map((c) => ({
      root_case_id: c.rootCaseId,
      label: c.label,
      step_name: c.stepName,
      member_case_ids: c.memberCaseIds,
      members_hash: c.membersHash,
    })),
  );

  const result = await db.execute<{ upserted: number; deleted: number }>(sql`
    with input as (
      select * from json_to_recordset(${payload}::json) as x(
        root_case_id uuid,
        label text,
        step_name text,
        member_case_ids jsonb,
        members_hash text
      )
    ),
    upserted as (
      insert into ${insightClusters}
        (root_case_id, label, step_name, member_case_ids, members_hash, computed_at)
      select root_case_id, label, step_name, member_case_ids, members_hash, now() from input
      on conflict (root_case_id) do update set
        label = excluded.label,
        step_name = excluded.step_name,
        member_case_ids = excluded.member_case_ids,
        members_hash = excluded.members_hash,
        computed_at = now()
      returning id
    ),
    deleted as (
      delete from ${insightClusters}
      where not exists (
        select 1 from input i where i.root_case_id = insight_clusters.root_case_id
      )
      returning id
    )
    select
      (select count(*) from upserted)::int as upserted,
      (select count(*) from deleted)::int as deleted
  `);

  const row = result.rows[0];
  return { upserted: row?.upserted ?? 0, deleted: row?.deleted ?? 0 };
}

export async function listClusters(): Promise<StoredCluster[]> {
  const rows = await db
    .select({
      id: insightClusters.id,
      rootCaseId: insightClusters.rootCaseId,
      label: insightClusters.label,
      stepName: insightClusters.stepName,
      memberCaseIds: insightClusters.memberCaseIds,
      membersHash: insightClusters.membersHash,
      computedAt: insightClusters.computedAt,
    })
    .from(insightClusters);

  // 반복 횟수 DESC, rootCaseId ASC — buildClusters와 같은 기준(반복 횟수는 저장하지
  // 않고 멤버에서 파생하므로 SQL ORDER BY 대신 여기서 정렬한다).
  return rows.sort(
    (x, y) =>
      y.memberCaseIds.length - x.memberCaseIds.length ||
      (x.rootCaseId < y.rootCaseId ? -1 : x.rootCaseId > y.rootCaseId ? 1 : 0),
  );
}

export async function countClusters(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(insightClusters);
  return rows[0]?.count ?? 0;
}
