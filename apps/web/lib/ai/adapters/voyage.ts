import type { EmbeddingPort } from "../ports";

export class VoyageEmbeddingAdapter implements EmbeddingPort {
  async embed(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error("VOYAGE_API_KEY 환경변수가 설정되지 않았습니다");
    }

    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "voyage-3.5",
        input: texts,
        input_type: "document",
        output_dimension: 1024,
      }),
    });

    if (!res.ok) {
      throw new Error(`Voyage 임베딩 API 실패: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as { data?: Array<{ embedding: number[]; index: number }> };
    // 코덱스 리뷰: res.ok=true라도 응답 shape가 기대와 다를 수 있다(부분 실패 응답 등) —
    // 검증 없이 body.data를 바로 쓰면 undefined 임베딩이 조용히 흘러가 이후
    // ::vector 캐스팅에서야 불명확한 DB 에러로 드러난다. 여기서 명확한 에러로 막는다.
    if (!Array.isArray(body.data) || body.data.length !== texts.length) {
      throw new Error(
        `Voyage 임베딩 API 응답 형식이 올바르지 않습니다(요청 ${texts.length}건, 응답 ${body.data?.length ?? 0}건)`,
      );
    }
    return body.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
