import { ai } from "../ai/index.js";
import { buildPrompt, citedSourceNumbers, NOT_FOUND, SYSTEM_PROMPT } from "../rag/prompt.js";
import { retrieve } from "./retrieve.js";

/**
 * Minimum cosine similarity for the best chunk before we bother asking the model at all.
 * Tuned with scripts/eval.ts on gemini-embedding-001 (768-dim): on-topic questions scored 0.566-0.727,
 * off-topic ones 0.455-0.533, so 0.55 sits in the gap. The gap is narrow, which is why the prompt's
 * "answer only from the sources" rule stays as a second layer.
 */
const MIN_SIMILARITY = Number(process.env.MIN_SIMILARITY ?? 0.55);

export async function answerQuestion(question: string, documentIds?: string[]) {
  const started = Date.now();
  const sources = await retrieve(question, 5, documentIds);

  // Guardrail: if nothing relevant was retrieved, don't let the model improvise an answer.
  const best = Math.max(...sources.map((s) => s.similarity ?? 0), 0);
  if (sources.length === 0 || best < MIN_SIMILARITY) {
    return { answer: NOT_FOUND, sources, citedSources: [], latencyMs: Date.now() - started, grounded: false };
  }

  const answer = await ai.generate(SYSTEM_PROMPT, buildPrompt(question, sources));
  const cited = citedSourceNumbers(answer, sources.length);
  return {
    answer,
    sources,
    citedSources: cited,
    latencyMs: Date.now() - started,
    grounded: answer.trim() !== NOT_FOUND,
  };
}
