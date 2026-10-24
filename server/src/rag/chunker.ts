/**
 * Split a document into overlapping chunks for embedding.
 *
 * Why chunk at all: an embedding is one vector per input, so embedding a whole document blurs
 * every topic in it together. Small chunks give precise retrieval; too-small chunks lose context.
 *
 * Strategy (a simple version of "recursive" splitting):
 *   1. split on paragraphs, keeping natural boundaries;
 *   2. split paragraphs longer than `size` into sentences (and hard-cut absurdly long sentences);
 *   3. greedily pack those pieces into chunks of at most ~`size` characters;
 *   4. start each new chunk with the last ~`overlap` characters of the previous one, so a fact
 *      that straddles a boundary is still fully present in at least one chunk.
 *
 * Sizes are in characters (~4 characters per token for English): 1800 chars ≈ 450 tokens.
 */
export interface Chunk {
  index: number;
  content: string;
}

export interface ChunkOptions {
  size?: number;
  overlap?: number;
}

export function chunkText(text: string, { size = 1800, overlap = 250 }: ChunkOptions = {}): Chunk[] {
  if (overlap >= size) throw new Error("overlap must be smaller than size");
  const clean = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return [];

  const pieces: string[] = [];
  for (const para of clean.split(/\n\n+/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= size) {
      pieces.push(p);
      continue;
    }
    const sentences = p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [p];
    for (const raw of sentences) {
      const s = raw.trim();
      if (!s) continue;
      if (s.length <= size) pieces.push(s);
      else for (let i = 0; i < s.length; i += size - overlap) pieces.push(s.slice(i, i + size));
    }
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + 1 + piece.length > size) {
      chunks.push(current);
      current = tail(current, overlap);
    }
    current = current ? `${current}\n${piece}` : piece;
  }
  if (current) chunks.push(current);

  return chunks.map((content, index) => ({ index, content }));
}

/** The last ~n characters of text, starting at a word boundary so no word is cut in half. */
export function tail(text: string, n: number): string {
  if (n <= 0 || text.length <= n) return n <= 0 ? "" : text;
  const slice = text.slice(-n);
  const firstSpace = slice.search(/\s/);
  return (firstSpace === -1 ? slice : slice.slice(firstSpace + 1)).trim();
}
