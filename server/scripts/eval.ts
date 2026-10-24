/**
 * Retrieval evaluation. Usage: npm run eval            (retrieval only, cheap)
 *                              npm run eval -- --answers (also generates answers and checks them)
 *
 * For each question in samples/eval-set.json we check whether the top-k retrieved chunks include the
 * expected document AND the expected fact. Metrics:
 *   - hit@k: share of questions where a correct chunk is in the top k
 *   - MRR (mean reciprocal rank): 1/rank of the first correct chunk, averaged; rewards ranking it first
 * Off-topic questions show the best similarity for things NOT in the documents, which is how the
 * MIN_SIMILARITY guardrail in services/answer.ts is chosen.
 */
import { readFile } from "node:fs/promises";
import { pool } from "../src/db.js";
import { answerQuestion } from "../src/services/answer.js";
import { retrieve } from "../src/services/retrieve.js";

const K = 5;
const withAnswers = process.argv.includes("--answers");
const cases: { question: string; expectDocument: string; expectText: string }[] = JSON.parse(
  await readFile("samples/eval-set.json", "utf8"),
);

let hits = 0;
let reciprocalRanks = 0;
let grounded = 0;
for (const c of cases) {
  const chunks = await retrieve(c.question, K);
  const rank = chunks.findIndex(
    (ch) =>
      ch.documentTitle.includes(c.expectDocument) &&
      ch.content.toLowerCase().includes(c.expectText.toLowerCase()),
  );
  if (rank >= 0) {
    hits++;
    reciprocalRanks += 1 / (rank + 1);
  }
  let note = "";
  if (withAnswers) {
    const result = await answerQuestion(c.question);
    const ok = result.grounded && result.citedSources.length > 0;
    if (ok) grounded++;
    note = ok ? "  answer cited" : "  answer NOT grounded";
  }
  console.log(`${rank >= 0 ? `hit @${rank + 1}` : "MISS  "}  ${c.question}${note}`);
}

console.log(`\nhit@${K}: ${((100 * hits) / cases.length).toFixed(0)}%   MRR: ${(reciprocalRanks / cases.length).toFixed(2)}`);
if (withAnswers) console.log(`grounded answers with citations: ${grounded}/${cases.length}`);

console.log("\nOff-topic questions (best similarity should stay below MIN_SIMILARITY):");
for (const q of ["What is the capital of France?", "Give me a recipe for pasta", "Who won the 2018 World Cup?"]) {
  const best = Math.max(...(await retrieve(q, K)).map((c) => c.similarity ?? 0), 0);
  console.log(`  ${best.toFixed(3)}  ${q}`);
}
await pool.end();
