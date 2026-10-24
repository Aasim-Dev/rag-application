import type { AiProvider } from "./provider.js";

const API = "https://generativelanguage.googleapis.com/v1beta";
const EMBED_BATCH = 100; // batchEmbedContents accepts up to 100 inputs per call
const MAX_ATTEMPTS = 4;

export class AiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** Google Gemini over plain REST (no SDK), so every request is visible and easy to explain. */
export class GeminiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly embedModel: string,
    private readonly chatModel: string,
    private readonly dimensions: number,
  ) {}

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const body = {
        requests: batch.map((text) => ({
          model: `models/${this.embedModel}`,
          content: { parts: [{ text }] },
          taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
          outputDimensionality: this.dimensions,
        })),
      };
      const data = await this.call<{ embeddings: { values: number[] }[] }>(
        `models/${this.embedModel}:batchEmbedContents`,
        body,
      );
      if (data.embeddings?.length !== batch.length) throw new AiError("Embedding response size mismatch");
      for (const e of data.embeddings) {
        if (e.values.length !== this.dimensions) {
          throw new AiError(`Expected ${this.dimensions}-dim embeddings, got ${e.values.length}`);
        }
        vectors.push(e.values);
      }
    }
    return vectors;
  }

  async generate(system: string, prompt: string): Promise<string> {
    const data = await this.call<{
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    }>(`models/${this.chatModel}:generateContent`, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // Low temperature: we want faithful, repeatable answers grounded in the sources, not creativity.
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    });
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!text) throw new AiError(`Empty answer from model (${data.candidates?.[0]?.finishReason ?? "no candidates"})`);
    return text;
  }

  /** POST with retries: exponential backoff on 429 (rate limit) and 5xx; other errors fail fast. */
  private async call<T>(path: string, body: unknown): Promise<T> {
    let lastError: AiError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await fetch(`${API}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      }).catch((err: Error) => {
        lastError = new AiError(`Network error calling Gemini: ${err.message}`);
        return undefined;
      });
      if (res?.ok) return (await res.json()) as T;
      if (res) {
        const detail = await res.text();
        lastError = new AiError(`Gemini ${res.status}: ${detail.slice(0, 300)}`, res.status);
        if (res.status !== 429 && res.status < 500) throw lastError;
      }
      if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1) + Math.random() * 250);
    }
    throw lastError ?? new AiError("Gemini call failed");
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
