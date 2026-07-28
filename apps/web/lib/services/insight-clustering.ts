import { createHash } from "node:crypto";

// Story 4.1(FR-10): 반복 패턴 클러스터링의 순수 알고리즘. **DB·AI 의존성이 없다** —
// import는 node:crypto 하나뿐이며, 그래야 클러스터링 규칙 자체를 격리 DB나 벤더 키
// 없이 테스트할 수 있다.
//
// 알고리즘: 유사도 임계값을 넘는 케이스 쌍을 엣지로 보고 **연결 성분**(union-find)을
// 구한다. k-means는 k를 요구하고 초기화에 따라 결과가 흔들리며, LLM 그룹핑은 재실행마다
// 답이 달라진다. 연결 성분은 입력 순서와 무관하게 결정적이다.
//
// [알려진 한계 — 체이닝] 단일 연결이라 A–B, B–C가 각각 임계값을 넘으면 A–C가 멀어도
// 한 클러스터가 된다. 평균 연결/완전 연결은 병합 순서에 의존해 결정성을 잃으므로
// 파일럿 규모에서는 이 한계를 받아들인다. 실데이터에서 과병합이 관측되면 재검토.

export interface ClusterableCase {
  id: string;
  stepName: string;
  createdAt: Date;
}

export interface SimilarPair {
  aId: string;
  bId: string;
}

export interface BuiltCluster {
  /** 가장 오래된 멤버의 case id — 클러스터의 자연키(upsert 충돌 대상). */
  rootCaseId: string;
  /** 대표 단계(최빈값). 화면 부제 "{단계} 단계 · ..."에 쓰인다. */
  stepName: string;
  /** created_at ASC, id ASC 순. memberCaseIds[0] === rootCaseId가 항상 성립한다. */
  memberCaseIds: string[];
  /** 멤버 집합의 해시 — 멤버가 그대로면 라벨을 다시 만들지 않기 위한 판단 근거. */
  membersHash: string;
}

// 멤버 정렬 기준을 함수 안에서 강제한다(호출자가 어떤 순서로 넘기든 동일 결과).
// created_at 동률은 id ASC로 갈라 NFR-1 관례를 따른다.
function compareCases(a: ClusterableCase, b: ClusterableCase): number {
  const at = a.createdAt.getTime();
  const bt = b.createdAt.getTime();
  if (at !== bt) return at - bt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// 경로 압축 + union by size. find/union 호출 순서는 최종 분할에 영향을 주지 않는다.
class UnionFind {
  private parent: number[];
  private size: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = new Array<number>(n).fill(1);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    // 경로 압축
    let cur = x;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur];
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  union(x: number, y: number): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    // 큰 쪽에 붙인다. 어느 쪽이 부모가 되든 분할 결과는 같으므로 결정성에 영향 없음.
    const [big, small] = this.size[rx] >= this.size[ry] ? [rx, ry] : [ry, rx];
    this.parent[small] = big;
    this.size[big] += this.size[small];
  }
}

// 최빈 단계. 동률이면 멤버 순서(= created_at ASC)에서 먼저 나온 쪽 — 결정적.
function pickStepName(members: ClusterableCase[]): string {
  const counts = new Map<string, number>();
  for (const m of members) {
    counts.set(m.stepName, (counts.get(m.stepName) ?? 0) + 1);
  }
  let best = members[0].stepName;
  let bestCount = counts.get(best) ?? 0;
  for (const m of members) {
    const c = counts.get(m.stepName) ?? 0;
    if (c > bestCount) {
      best = m.stepName;
      bestCount = c;
    }
  }
  return best;
}

/**
 * 멤버 id 집합의 해시. **정렬 후** 해시하므로 멤버 순서가 달라도 같은 값이 나온다 —
 * 이 해시가 흔들리면 아무것도 안 바뀐 날에도 라벨을 새로 만들게 된다.
 */
export function hashMembers(memberCaseIds: string[]): string {
  return createHash("sha256").update([...memberCaseIds].sort().join(",")).digest("hex");
}

/**
 * @param cases 클러스터링 대상 전체(AD-6: 홀 필터 없이 사업체 전체).
 * @param pairs 유사도 임계값을 넘는 쌍. `cases`에 없는 id를 참조하는 쌍은 무시한다.
 * @param minSize 이 크기 미만의 성분은 버린다. FR-10의 산출물은 "N번째 반복"이므로
 *   1건짜리는 반복이 아니다(호출부에서 MIN_CLUSTER_SIZE = 2).
 * @returns 멤버 수 DESC, rootCaseId ASC 정렬(동점도 결정적).
 */
export function buildClusters(
  cases: ClusterableCase[],
  pairs: SimilarPair[],
  minSize: number,
): BuiltCluster[] {
  if (cases.length === 0) return [];

  const sorted = [...cases].sort(compareCases);
  const indexById = new Map<string, number>();
  sorted.forEach((c, i) => indexById.set(c.id, i));

  const uf = new UnionFind(sorted.length);
  for (const { aId, bId } of pairs) {
    const ai = indexById.get(aId);
    const bi = indexById.get(bId);
    // 클러스터링 대상 조회와 엣지 조회 사이에 케이스가 추가되면 모르는 id가 올 수 있다.
    // 엣지 한 줄 때문에 배치 전체를 실패시키지 않는다.
    if (ai === undefined || bi === undefined) continue;
    uf.union(ai, bi);
  }

  // sorted 순회 순서를 그대로 유지하면 각 성분의 멤버도 created_at ASC, id ASC가 된다.
  const components = new Map<number, ClusterableCase[]>();
  sorted.forEach((c, i) => {
    const root = uf.find(i);
    const bucket = components.get(root);
    if (bucket) bucket.push(c);
    else components.set(root, [c]);
  });

  const clusters: BuiltCluster[] = [];
  for (const members of components.values()) {
    if (members.length < minSize) continue;
    const memberCaseIds = members.map((m) => m.id);
    clusters.push({
      rootCaseId: memberCaseIds[0],
      stepName: pickStepName(members),
      memberCaseIds,
      membersHash: hashMembers(memberCaseIds),
    });
  }

  // 화면이 "많이 반복된 원인" 순으로 보여야 한다(프로토타입 6회 → 5회 → 3회).
  return clusters.sort(
    (x, y) =>
      y.memberCaseIds.length - x.memberCaseIds.length ||
      (x.rootCaseId < y.rootCaseId ? -1 : x.rootCaseId > y.rootCaseId ? 1 : 0),
  );
}
