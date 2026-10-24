# Design decisions

Each choice, the alternatives considered, and why.

## 1. Postgres + pgvector instead of a dedicated vector database
**Alternatives:** Pinecone, Weaviate, Qdrant.
**Why pgvector:** one database for documents, chunks and vectors means one backup, one connection pool,
real transactions (a document and all its chunks are written atomically), foreign keys with
`ON DELETE CASCADE`, and SQL filters (e.g. "only these documents") in the same query as the vector search.
At this scale (thousands to low millions of chunks) an HNSW index in Postgres is fast enough.
**When I'd switch:** hundreds of millions of vectors, or when vector traffic needs to scale separately from the database.

## 2. HNSW index, cosine distance
HNSW gives fast approximate nearest-neighbour search with high recall and no training step (unlike IVFFlat,
which needs data before the index is built). Cosine distance (`<=>`) compares direction, not length, which is
what matters for text embeddings.

## 3. Hybrid search (vector + full-text) merged with Reciprocal Rank Fusion
Vector search understands paraphrases ("server-side role" ≈ "backend engineer") but can miss exact tokens:
version numbers, company names, "Blue Card". Postgres full-text search is the opposite. Running both and
merging covers each one's blind spot.
**Why RRF instead of adding scores:** cosine similarity (0–1) and `ts_rank` (unbounded) are on different
scales. RRF uses only each result's rank, `1 / (60 + rank)`, so no score normalisation or weight tuning is needed.

## 4. Chunking: ~1,800 characters (≈450 tokens) with ~250 characters of overlap
- **Too big:** one vector blurs several topics together and retrieval gets imprecise; it also wastes LLM context.
- **Too small:** a chunk loses the context needed to answer (e.g. a salary line without the job title).
- **Overlap:** a fact that falls on a boundary still appears whole in at least one chunk.
Splitting respects paragraphs, then sentences, and only hard-cuts pathological text. Sizes are in characters
to avoid a tokenizer dependency (about 4 characters per token for English).

## 5. Embeddings before the transaction
Creating embeddings is a network call that can take seconds. Doing it inside a transaction would hold a
connection and locks while waiting on the network, which is how connection pools get exhausted under load.
So: embed first, then write the document and all chunks in one short transaction. If embedding fails, nothing
is written. That keeps the operation atomic without a long transaction.

## 6. A relevance guardrail before calling the LLM, tuned with data
If the best chunk's cosine similarity is below `MIN_SIMILARITY`, the API returns "not found" **without**
calling the model. This stops the model from improvising answers to off-topic questions and saves quota.

I first guessed 0.3. Measuring proved that wrong. With `gemini-embedding-001` (768 dimensions),
`npm run eval` showed:

| Questions | Best similarity |
|---|---|
| 12 on-topic questions | 0.566 – 0.727 |
| 5 off-topic questions ("capital of France", "pasta recipe", ...) | 0.455 – 0.533 |

Everything scores fairly high with this model, so 0.3 would never trigger. **0.55** sits in the gap.
The gap is narrow, so the system prompt's rule (answer only from the sources, or say exactly
"I couldn't find that...") remains a second, independent layer. Changing the embedding model means
re-running the eval and re-tuning; the value is an environment variable for that reason.

## 7. Grounding and citations in the prompt
The system prompt restricts the model to the numbered sources, requires a citation per claim, and defines
an exact "not found" sentence. The API parses which source numbers were cited, and the UI highlights those
passages, so users can verify every claim. Temperature is 0.2: we want faithful, repeatable answers,
not creativity.

## 8. Provider interface, plain REST, retries with backoff
The app depends on an `AiProvider` interface (`embed`, `generate`), not on Gemini. Switching to OpenAI,
Claude or a local model means writing one class. Gemini was chosen because its free tier needs no credit card.
Calls use plain `fetch` (no SDK) so every request is visible. 429s and 5xx responses are retried with
exponential backoff and jitter; other 4xx errors fail fast because retrying them can't help.
Document and query embeddings use different task types (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`), which
these models are trained for.

## 9. Evaluation instead of eyeballing
Current result on the sample set: **hit@5 = 100%, MRR = 0.96** (the right passage ranked first for
11 of 12 questions, second for the other).

`samples/eval-set.json` holds labelled questions (expected document + expected fact). `npm run eval` reports:
- **hit@5:** did a correct chunk make the top 5?
- **MRR:** how high was it ranked (1.0 = always first)?
- `--answers` also checks that generated answers are grounded and cite sources.
Changing chunk size, overlap or the fusion constant can then be judged by numbers.

## 10. Protecting a free-tier service
- Per-IP rate limit (15/min) on the endpoints that cost AI quota.
- Upload size limit (5 MB) and an allowlist of file types.
- Zod validation on every input; one error handler that maps errors to clean status codes
  (400 validation, 413 too large, 422 unreadable, 503 when the AI quota is hit).
- Graceful shutdown on SIGTERM so deploys don't cut requests mid-flight.

## What I'd do next
- **Re-ranking:** a cross-encoder re-ranker over the top 20 fused results before taking the top 5.
- **Per-user data:** authentication, with `user_id` on documents and every query filtered by it (tenant isolation).
- **Async ingestion:** for large files, enqueue ingestion (BullMQ/SQS) and stream progress to the UI.
- **Streaming answers** to the UI, and caching embeddings for repeated questions.
- **Better PDF handling:** OCR for scanned PDFs, and keeping page numbers in citations.
- **Observability:** log retrieval scores and latency per request; track hit rate on real questions over time.
