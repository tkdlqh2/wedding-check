import type { EmbeddingPort, EmbedOptions } from "../ports";
import { EXPECTED_DIMENSIONS, parseEmbeddingsResponse } from "./embedding-response";

export class VoyageEmbeddingAdapter implements EmbeddingPort {
  async embed(texts: string[], options?: EmbedOptions): Promise<number[][]> {
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
        // Story 3.3: 확정 시점의 변수 케이스 임베딩은 "document", 실행 중 질의는
        // "query" — Voyage 공식 권장 비대칭 검색 조합(NFR-4 매칭 품질에 직결).
        input_type: options?.inputType ?? "document",
        output_dimension: EXPECTED_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      throw new Error(`Voyage 임베딩 API 실패: ${res.status} ${await res.text()}`);
    }

    // 응답 검증(코덱스 리뷰 1~4라운드 계약)은 OpenAI 어댑터와 공유한다 — embedding-response.ts 참고.
    return parseEmbeddingsResponse(await res.json(), texts.length, "Voyage");
  }
}
