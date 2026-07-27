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

    const body = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    return body.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
