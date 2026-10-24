import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AiError } from "./ai/gemini.js";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { router } from "./routes.js";
import { UnsupportedFileError } from "./services/extract.js";
import { EmptyDocumentError } from "./services/ingest.js";

const app = express();
app.set("trust proxy", 1); // behind Render's / Vercel's proxy: lets rate limiting see the real client IP
app.use(cors({ origin: config.CORS_ORIGIN.split(",").map((o) => o.trim()) }));
app.use(express.json({ limit: "1mb" }));

// Create the schema once per process, before the first request is handled. Lazy instead of at
// startup because on Vercel the app runs as a serverless function with no separate startup step.
// A failed attempt is forgotten so the next request retries instead of failing forever.
let schemaReady: Promise<void> | undefined;
app.use((_req, _res, next) => {
  schemaReady ??= migrate().catch((err) => {
    schemaReady = undefined;
    throw err;
  });
  schemaReady.then(() => next(), next);
});

app.use("/api", router);

/** One place that turns errors into clean JSON responses with the right status code. */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((i) => i.message).join("; ") });
  } else if (err instanceof UnsupportedFileError || err instanceof EmptyDocumentError) {
    res.status(422).json({ error: err.message });
  } else if (err instanceof multer.MulterError) {
    res.status(413).json({ error: `Upload rejected: ${err.message} (max ${config.MAX_UPLOAD_MB} MB)` });
  } else if (err instanceof AiError) {
    console.error(err.message);
    const busy = err.status === 429;
    res.status(busy ? 503 : 502).json({
      error: busy ? "The AI service is busy (free-tier limit). Try again in a minute." : "The AI service failed. Try again.",
    });
  } else {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// On Vercel the platform calls the exported app; everywhere else (local dev, Render) we listen ourselves.
if (!process.env.VERCEL) {
  const server = app.listen(config.PORT, () => console.log(`API listening on :${config.PORT}`));
  // Graceful shutdown: finish in-flight requests, then close DB connections (Render sends SIGTERM on deploy).
  process.on("SIGTERM", () => server.close(() => pool.end().then(() => process.exit(0))));
}

export default app;
