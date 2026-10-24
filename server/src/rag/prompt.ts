/**
 * Prompt building and citation parsing. Kept free of I/O so it can be unit-tested.
 *
 * Grounding rules in the system prompt are what make this RAG rather than "chat with extra text":
 * answer only from the numbered sources, cite them, and admit when the answer isn't there.
 */
export interface SourceChunk {
  id: number;
  documentTitle: string;
  chunkIndex: number;
  content: string;
}

export const SYSTEM_PROMPT = [
  "You answer questions about the user's uploaded documents (job descriptions, resumes, notes).",
  "Use ONLY the numbered sources provided. Do not use outside knowledge.",
  "Cite every claim with the source number in square brackets, e.g. [1] or [2][3].",
  "If the sources do not contain the answer, reply exactly: I couldn't find that in the uploaded documents.",
  "Be concise: a short paragraph or a few bullet points.",
].join("\n");

export const NOT_FOUND = "I couldn't find that in the uploaded documents.";

export function buildPrompt(question: string, sources: SourceChunk[]): string {
  const blocks = sources.map(
    (s, i) => `[${i + 1}] (from "${s.documentTitle}", part ${s.chunkIndex + 1})\n${s.content}`,
  );
  return `Sources:\n\n${blocks.join("\n\n")}\n\nQuestion: ${question}`;
}

/** Source numbers (1-based) the answer actually cited, deduplicated, in order of first use. */
export function citedSourceNumbers(answer: string, sourceCount: number): number[] {
  const seen = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= sourceCount) seen.add(n);
  }
  return [...seen];
}
