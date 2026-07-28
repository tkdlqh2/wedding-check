// lib/services/insight.ts::MIN_CLUSTER_SIMILARITY 재보정 도구(Story 4.1).
//
//   npx tsx --env-file=.env.local scripts/measure-cluster-threshold.ts
//
// 실제 OPENAI_API_KEY로 임베딩을 호출해 문서↔문서 유사도 분포를 측정한다. 3.4의
// MIN_SIMILARITY(0.42)는 질의↔문서(비대칭, inputType 다름)이고 판정 질문도 "관련
// 있는가?"인 반면, 클러스터링은 문서↔문서(대칭)이고 "같은 원인인가?"라는 더 엄격한
// 질문이라 값을 공유할 수 없다.
//
// 실데이터가 쌓이면 아래 GROUPS를 실제 확정 피드백으로 교체해 다시 재보정한다 —
// 지금 값은 도메인을 모사한 표본이라 표본이 작다(deferred-work.md).
// 주의: 실제 임베딩 API를 호출한다(비용 발생). CI에서 실행되지 않는다.
import { getEmbeddingPort } from "../lib/ai";

// 실제 웨딩홀 스캔 오퍼레이터 피드백을 모사한 문장들.
// 그룹 안 = 같은 원인의 다른 표현, 그룹 간 = 같은 도메인의 다른 원인.
const GROUPS: { name: string; docs: string[] }[] = [
  {
    name: "축가 MR 큐 지연",
    docs: [
      "축가 반주가 늦게 나와서 축가자가 어색하게 서 있었다. MR은 사회자 소개 멘트 시작할 때 미리 걸어놔야 한다.",
      "반주를 틀었는데 소리가 한 박자 늦게 올라왔다. 페이더를 미리 올려두고 큐만 누르면 된다.",
      "MR 준비가 안 된 상태에서 축가자가 마이크를 잡았다. 30초 전 대기를 습관화해야 한다.",
    ],
  },
  {
    name: "주례·사회자 즉흥 순서 변경",
    docs: [
      "주례자가 성혼 선언을 축가 앞으로 당겼다. 큐시트 순서를 무시하고 지금 말하는 사람 기준으로 따라가면 된다.",
      "목사님이 애드리브로 기도를 추가했다. 마이크만 유지하고 조명 전환은 보류하는 게 맞았다.",
      "사회자가 협의 없이 양가 인사를 앞으로 옮겼다. 큐시트를 덮고 진행자 멘트를 따라갔다.",
    ],
  },
  {
    name: "식전 영상 송출 신호 끊김",
    docs: [
      "식전 영상이 스크린에 안 나왔다. HDMI 셀렉터가 2번 입력으로 넘어가 있었다.",
      "영상 송출이 중간에 끊겼다. 셀렉터 케이블 접촉 불량이라 식전 점검에 확인을 추가해야 한다.",
    ],
  },
  {
    name: "입장 조명 타이밍",
    docs: [
      "신부 입장 때 스팟 조명을 늦게 올려 초반 몇 초가 어두웠다. 도어 오픈 신호에 맞춰 미리 올려야 한다.",
      "신랑 입장 조명을 너무 일찍 올려서 대기 중인 모습이 그대로 보였다.",
    ],
  },
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const flat = GROUPS.flatMap((g, gi) => g.docs.map((d) => ({ gi, text: d })));
  // 문서↔문서 비교이므로 양쪽 모두 "document"로 임베딩한다(실제 저장 경로와 동일).
  const vectors = await getEmbeddingPort().embed(
    flat.map((f) => f.text),
    { inputType: "document" },
  );

  const same: number[] = [];
  const diff: number[] = [];
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const sim = cosine(vectors[i], vectors[j]);
      (flat[i].gi === flat[j].gi ? same : diff).push(sim);
      if (flat[i].gi === flat[j].gi) {
        console.log(
          `[같은원인] ${sim.toFixed(4)}  ${GROUPS[flat[i].gi].name}  #${i}-#${j}`,
        );
      }
    }
  }
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[i].gi !== flat[j].gi) {
        console.log(
          `[다른원인] ${cosine(vectors[i], vectors[j]).toFixed(4)}  ${GROUPS[flat[i].gi].name} ↔ ${GROUPS[flat[j].gi].name}`,
        );
      }
    }
  }

  const stat = (xs: number[]) => ({
    min: Math.min(...xs).toFixed(4),
    max: Math.max(...xs).toFixed(4),
    n: xs.length,
  });
  console.log("\n===== 요약 =====");
  console.log("같은 원인(병합되어야 함):", stat(same));
  console.log("다른 원인(갈라져야 함):  ", stat(diff));
  console.log(
    `\n분리 간격: 다른원인 최댓값 ${Math.max(...diff).toFixed(4)} ↔ 같은원인 최솟값 ${Math.min(...same).toFixed(4)}`,
  );
  process.exit(0);
}

void main();
