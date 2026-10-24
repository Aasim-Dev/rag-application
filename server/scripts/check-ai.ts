/** Quick check that the Gemini key and model names in .env work. Usage: npx tsx scripts/check-ai.ts */
import "dotenv/config";
import { GeminiProvider } from "../src/ai/gemini.js";

const ai = new GeminiProvider(
  process.env.GEMINI_API_KEY ?? "",
  process.env.EMBED_MODEL ?? "gemini-embedding-001",
  process.env.CHAT_MODEL ?? "gemini-3.5-flash",
  Number(process.env.EMBED_DIM ?? 768),
);

try {
  const [v] = await ai.embed(["Laravel developer with MySQL experience"], "document");
  console.log(`embeddings OK: ${v.length} dimensions`);
} catch (e) {
  console.log(`embeddings FAILED: ${(e as Error).message}`);
}
try {
  const text = await ai.generate("Reply in one short sentence.", "Say hello to a job seeker.");
  console.log(`generation OK: ${text}`);
} catch (e) {
  console.log(`generation FAILED: ${(e as Error).message}`);
}
