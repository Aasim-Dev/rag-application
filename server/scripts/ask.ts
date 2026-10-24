/** Ask questions from the terminal. Usage: npx tsx scripts/ask.ts "Which job offers visa sponsorship?" ["another question" ...] */
import { pool } from "../src/db.js";
import { answerQuestion } from "../src/services/answer.js";

const questions = process.argv.slice(2);
if (!questions.length) {
  console.log('Usage: npx tsx scripts/ask.ts "your question"');
  process.exit(1);
}
for (const q of questions) {
  const r = await answerQuestion(q);
  console.log(`Q: ${q}\nA: ${r.answer}`);
  console.log(`   cited sources: [${r.citedSources.join(", ")}] | grounded: ${r.grounded} | ${r.latencyMs} ms\n`);
}
await pool.end();
