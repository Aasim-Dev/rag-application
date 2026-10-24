import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "./config.js";
import { pool } from "./db.js";
import { answerQuestion } from "./services/answer.js";
import { extractText } from "./services/extract.js";
import { ingestDocument } from "./services/ingest.js";

export const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 } });

// The AI provider's free tier has a quota; limit expensive endpoints per IP so one visitor can't burn it.
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false });

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

router.get("/health", asyncHandler(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
}));

router.get("/documents", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.source_type AS "sourceType", d.chars, d.created_at AS "createdAt",
            count(c.id)::int AS chunks
     FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
     GROUP BY d.id ORDER BY d.created_at DESC`,
  );
  res.json(rows);
}));

const PastedDoc = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().min(30, "Paste at least a few sentences").max(200_000),
});

/** Upload a file (multipart field "file") or paste text as JSON { title, text }. */
router.post("/documents", aiLimiter, upload.single("file"), asyncHandler(async (req, res) => {
  if (req.file) {
    const { text, sourceType } = await extractText(req.file);
    const title = (typeof req.body?.title === "string" && req.body.title.trim()) || req.file.originalname;
    res.status(201).json(await ingestDocument(title.slice(0, 200), sourceType, text));
    return;
  }
  const { title, text } = PastedDoc.parse(req.body);
  res.status(201).json(await ingestDocument(title, "pasted", text));
}));

router.delete("/documents/:id", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { rowCount } = await pool.query("DELETE FROM documents WHERE id = $1", [id]);
  if (!rowCount) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.status(204).end();
}));

const Ask = z.object({
  question: z.string().trim().min(3, "Ask a longer question").max(500),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
});

router.post("/ask", aiLimiter, asyncHandler(async (req, res) => {
  const { question, documentIds } = Ask.parse(req.body);
  res.json(await answerQuestion(question, documentIds));
}));
