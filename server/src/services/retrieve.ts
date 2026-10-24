import { ai } from "../ai/index.js";
import { pool, toVector } from "../db.js";
import { reciprocalRankFusion } from "../rag/fusion.js";

export interface RetrievedChunk {
  id: number;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  similarity: number | null; // cosine similarity, when the vector search found it
  fusedScore: number;
}

const CANDIDATES = 20; // per search, before fusion

/**
 * Hybrid retrieval: semantic (vector) search + keyword (full-text) search, merged with RRF.
 *
 * Vector search understands meaning ("backend role" ~ "server-side engineer") but can miss exact
 * terms like "Laravel 11" or a company name. Keyword search nails exact terms but misses
 * paraphrases. Running both and fusing the rankings covers each one's blind spot.
 */
export async function retrieve(question: string, k = 5, documentIds?: string[]): Promise<RetrievedChunk[]> {
  const [queryVector] = await ai.embed([question], "query");
  const filter = documentIds?.length ? documentIds : null;

  const [vectorHits, keywordHits] = await Promise.all([
    pool.query(
      `SELECT c.id, c.document_id, d.title, c.chunk_index, c.content,
              1 - (c.embedding <=> $1::vector) AS similarity
       FROM chunks c JOIN documents d ON d.id = c.document_id
       WHERE ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
       ORDER BY c.embedding <=> $1::vector
       LIMIT ${CANDIDATES}`,
      [toVector(queryVector), filter],
    ),
    pool.query(
      `SELECT c.id, c.document_id, d.title, c.chunk_index, c.content
       FROM chunks c JOIN documents d ON d.id = c.document_id,
            websearch_to_tsquery('english', $1) q
       WHERE c.tsv @@ q AND ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
       ORDER BY ts_rank(c.tsv, q) DESC
       LIMIT ${CANDIDATES}`,
      [question, filter],
    ),
  ]);

  const similarityById = new Map<number, number>(
    vectorHits.rows.map((r) => [Number(r.id), Number(r.similarity)]),
  );
  const toChunk = (r: Record<string, unknown>) => ({
    id: Number(r.id),
    documentId: String(r.document_id),
    documentTitle: String(r.title),
    chunkIndex: Number(r.chunk_index),
    content: String(r.content),
  });

  return reciprocalRankFusion([vectorHits.rows.map(toChunk), keywordHits.rows.map(toChunk)])
    .slice(0, k)
    .map((c) => ({ ...c, similarity: similarityById.get(c.id) ?? null }));
}
