/**
 * The app depends on this interface, not on a vendor. Swapping Gemini for OpenAI, Claude or a
 * local model means writing one new class; nothing else changes.
 *
 * `kind` matters: some embedding models (Gemini included) embed documents and queries slightly
 * differently ("asymmetric" retrieval), which improves search quality.
 */
export interface AiProvider {
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
  generate(system: string, prompt: string): Promise<string>;
}
