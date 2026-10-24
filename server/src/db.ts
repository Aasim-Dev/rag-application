import pg from "pg";
import { config } from "./config.js";

const isLocal = /localhost|127\.0\.0\.1/.test(config.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
});

/** pgvector accepts vectors as a string literal like "[0.1,0.2,...]". */
export const toVector = (values: number[]): string => `[${values.join(",")}]`;

/**
 * Idempotent schema setup, run on boot. Small enough that a migration tool would be overkill;
 * every statement is IF NOT EXISTS so restarts are safe.
 *
 * - chunks.embedding: vector(EMBED_DIM) with an HNSW index for fast approximate cosine search.
 * - chunks.tsv: a generated full-text column with a GIN index, for the keyword half of hybrid search.
 */
export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS documents (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title       text NOT NULL,
      source_type text NOT NULL,
      chars       integer NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id          bigserial PRIMARY KEY,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index integer NOT NULL,
      content     text NOT NULL,
      embedding   vector(${config.EMBED_DIM}) NOT NULL,
      tsv         tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
      UNIQUE (document_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS chunks_tsv_gin ON chunks USING gin (tsv);
  `);
}
