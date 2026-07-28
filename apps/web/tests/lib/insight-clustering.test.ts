import { describe, it, expect } from "vitest";
import {
  buildClusters,
  hashMembers,
  type ClusterableCase,
  type SimilarPair,
} from "@/lib/services/insight-clustering";

// Story 4.1: 클러스터링 규칙 자체는 DB도 벤더 키도 없이 검증된다 — 순수 함수라서.

function makeCase(id: string, minutesOffset: number, stepName = "주례사"): ClusterableCase {
  return {
    id,
    stepName,
    createdAt: new Date(Date.UTC(2026, 7, 1, 0, minutesOffset, 0)),
  };
}

describe("buildClusters", () => {
  it("엣지로 연결된 케이스를 한 클러스터로 묶고, 연결되지 않은 것은 분리한다", () => {
    const cases = [makeCase("a", 0), makeCase("b", 1), makeCase("c", 2), makeCase("d", 3)];
    const pairs: SimilarPair[] = [
      { aId: "a", bId: "b" },
      { aId: "c", bId: "d" },
    ];

    const clusters = buildClusters(cases, pairs, 2);

    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.memberCaseIds)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  // 단일 연결의 의도된 동작 — A–C 엣지가 없어도 B를 통해 한 클러스터가 된다.
  // 과병합 위험이 있어 임계값을 높게 잡은 근거이기도 하다(insight.ts 상수 주석).
  it("체이닝: A–B와 B–C만 있어도 셋이 한 클러스터가 된다", () => {
    const cases = [makeCase("a", 0), makeCase("b", 1), makeCase("c", 2)];
    const pairs: SimilarPair[] = [
      { aId: "a", bId: "b" },
      { aId: "b", bId: "c" },
    ];

    const clusters = buildClusters(cases, pairs, 2);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberCaseIds).toEqual(["a", "b", "c"]);
  });

  // FR-10의 산출물은 "N번째 반복"이다 — 1건은 반복이 아니다.
  it("minSize 미만 성분은 버린다 (1건짜리는 인사이트가 아니다)", () => {
    const cases = [makeCase("a", 0), makeCase("b", 1), makeCase("lonely", 2)];
    const pairs: SimilarPair[] = [{ aId: "a", bId: "b" }];

    const clusters = buildClusters(cases, pairs, 2);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberCaseIds).toEqual(["a", "b"]);
  });

  it("엣지가 하나도 없으면 전부 버려진다", () => {
    const cases = [makeCase("a", 0), makeCase("b", 1)];
    expect(buildClusters(cases, [], 2)).toEqual([]);
  });

  it("케이스가 없으면 빈 배열을 반환한다", () => {
    expect(buildClusters([], [], 2)).toEqual([]);
  });

  // D-4: 클러스터가 자라기만 하는 통상 경로에서 upsert 키가 유지되려면 root가
  // "가장 오래된 멤버"여야 한다.
  it("rootCaseId는 가장 오래된 멤버이며 memberCaseIds[0]과 같다", () => {
    const cases = [makeCase("newer", 10), makeCase("oldest", 0), makeCase("middle", 5)];
    const pairs: SimilarPair[] = [
      { aId: "newer", bId: "oldest" },
      { aId: "oldest", bId: "middle" },
    ];

    const [cluster] = buildClusters(cases, pairs, 2);

    expect(cluster.rootCaseId).toBe("oldest");
    expect(cluster.memberCaseIds).toEqual(["oldest", "middle", "newer"]);
  });

  it("created_at이 같으면 id ASC로 갈라 결정적으로 정렬한다 (NFR-1 관례)", () => {
    const cases = [makeCase("zzz", 0), makeCase("aaa", 0)];
    const pairs: SimilarPair[] = [{ aId: "zzz", bId: "aaa" }];

    const [cluster] = buildClusters(cases, pairs, 2);

    expect(cluster.memberCaseIds).toEqual(["aaa", "zzz"]);
    expect(cluster.rootCaseId).toBe("aaa");
  });

  // 이 스토리가 k-means/LLM 그룹핑을 배제한 이유가 바로 이 성질이다.
  it("입력 순서를 바꿔도 같은 결과가 나온다 (결정성)", () => {
    const cases = [makeCase("a", 0), makeCase("b", 1), makeCase("c", 2), makeCase("d", 3)];
    const pairs: SimilarPair[] = [
      { aId: "a", bId: "b" },
      { aId: "b", bId: "c" },
      { aId: "c", bId: "d" },
    ];

    const forward = buildClusters(cases, pairs, 2);
    const reversed = buildClusters([...cases].reverse(), [...pairs].reverse(), 2);

    expect(reversed).toEqual(forward);
  });

  it("대상에 없는 id를 참조하는 엣지는 무시한다 (배치 전체를 실패시키지 않는다)", () => {
    const cases = [makeCase("a", 0), makeCase("b", 1)];
    const pairs: SimilarPair[] = [
      { aId: "a", bId: "b" },
      { aId: "a", bId: "ghost" },
      { aId: "ghost", bId: "phantom" },
    ];

    const clusters = buildClusters(cases, pairs, 2);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberCaseIds).toEqual(["a", "b"]);
  });

  it("대표 단계는 최빈값이다", () => {
    const cases = [
      makeCase("a", 0, "축가"),
      makeCase("b", 1, "주례사"),
      makeCase("c", 2, "주례사"),
    ];
    const pairs: SimilarPair[] = [
      { aId: "a", bId: "b" },
      { aId: "b", bId: "c" },
    ];

    const [cluster] = buildClusters(cases, pairs, 2);

    expect(cluster.stepName).toBe("주례사");
  });

  it("클러스터는 멤버 수 DESC로 정렬된다 (많이 반복된 원인이 위로)", () => {
    const cases = [
      makeCase("s1", 0),
      makeCase("s2", 1),
      makeCase("b1", 2),
      makeCase("b2", 3),
      makeCase("b3", 4),
    ];
    const pairs: SimilarPair[] = [
      { aId: "s1", bId: "s2" },
      { aId: "b1", bId: "b2" },
      { aId: "b2", bId: "b3" },
    ];

    const clusters = buildClusters(cases, pairs, 2);

    expect(clusters.map((c) => c.memberCaseIds.length)).toEqual([3, 2]);
  });
});

describe("hashMembers", () => {
  // 해시가 멤버 순서에 흔들리면 아무것도 안 바뀐 날에도 라벨을 새로 만들게 된다.
  it("멤버 순서가 달라도 같은 해시가 나온다", () => {
    expect(hashMembers(["a", "b", "c"])).toBe(hashMembers(["c", "a", "b"]));
  });

  it("멤버가 하나라도 다르면 해시가 달라진다", () => {
    expect(hashMembers(["a", "b"])).not.toBe(hashMembers(["a", "b", "c"]));
  });
});
