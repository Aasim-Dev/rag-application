/** Load the sample job descriptions in ./samples (skips ones already loaded). Usage: npm run seed */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { migrate, pool } from "../src/db.js";
import { ingestDocument } from "../src/services/ingest.js";

const dir = path.resolve("samples");
await migrate();
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md"))) {
  const text = await readFile(path.join(dir, file), "utf8");
  const title = text.split("\n")[0].replace(/^#\s*/, "").trim();
  const { rowCount } = await pool.query("SELECT 1 FROM documents WHERE title = $1", [title]);
  if (rowCount) {
    console.log(`skip   ${title}`);
    continue;
  }
  const doc = await ingestDocument(title, "sample", text);
  console.log(`loaded ${title} (${doc.chunks} chunks)`);
}
await pool.end();
