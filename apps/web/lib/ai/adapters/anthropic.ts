import Anthropic from "@anthropic-ai/sdk";
import type { GenerateChunk, GenerateInput, GenerateResult, LLMPort } from "../ports";

const GENERATE_MODEL = "claude-sonnet-5";
const STRUCTURE_MODEL = "claude-haiku-4-5";

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다");
  }
  return key;
}

function extractText(content: Anthropic.Message["content"]): string {
  const block = content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) {
    throw new Error("Claude 응답에 text 블록이 없습니다");
  }
  return block.text;
}

export class AnthropicLLMAdapter implements LLMPort {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: requireApiKey() });
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const response = await this.client.messages.create({
      model: input.responseSchema ? STRUCTURE_MODEL : GENERATE_MODEL,
      max_tokens: 1024,
      temperature: input.temperature ?? 0,
      messages: [{ role: "user", content: input.prompt }],
      ...(input.responseSchema
        ? { output_config: { format: { type: "json_schema" as const, schema: input.responseSchema } } }
        : {}),
    });
    return { text: extractText(response.content) };
  }

  async *generateStream(input: GenerateInput): AsyncIterable<GenerateChunk> {
    const stream = this.client.messages.stream({
      model: GENERATE_MODEL,
      max_tokens: 1024,
      temperature: input.temperature ?? 0,
      messages: [{ role: "user", content: input.prompt }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { text: event.delta.text };
      }
    }
  }
}
