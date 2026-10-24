import { ai } from "../ai/index.js";
import { pool, toVector } from "../db.js";
import { chunkText } from "../rag/chunker.js";

export class EmptyDocumentError extends Error {}

const MIN_CHARS = 30;

/**
 * Ingestion pipeline: text -> chunks -> embeddings -> one transaction.
 *
 * Embeddings are created BEFORE opening the transaction: a network call to the AI provider can
 * take seconds, and holding a database transaction (and its locks) open while waiting on the
 * network is a classic way to exhaust a connection pool. If embedding fails, nothing is written.
 */
export async function ingestDocument(title: string, sourceType: string, text: string) {
  const chunks = chunkText(text);
  const totalChars = chunks.reduce((n, c) => n + c.content.length, 0);
  if (chunks.length === 0 || totalChars < MIN_CHARS) {
    throw new EmptyDocumentError("The document has no readable text (scanned PDFs need OCR first).");
  }

  const vectors = await ai.embed(chunks.map((c) => c.content), "document");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; created_at: Date }>(
      "INSERT INTO documents (title, source_type, chars) VALUES ($1, $2, $3) RETURNING id, created_at",
      [title, sourceType, text.length],
    );
    const documentId = rows[0].id;
    // One multi-row INSERT via unnest instead of N round trips.
    await client.query(
      `INSERT INTO chunks (document_id, chunk_index, content, embedding)
       SELECT $1, idx, content, emb::vector
       FROM unnest($2::int[], $3::text[], $4::text[]) AS t(idx, content, emb)`,
      [documentId, chunks.map((c) => c.index), chunks.map((c) => c.content), vectors.map(toVector)],
    );
    await client.query("COMMIT");
    return { id: documentId, title, sourceType, chunks: chunks.length, createdAt: rows[0].created_at };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
