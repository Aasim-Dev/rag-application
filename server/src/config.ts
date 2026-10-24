import "dotenv/config";
import { z } from "zod";

// Fail fast at startup with a clear message instead of failing on the first request.
const Env = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Postgres with pgvector)"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required (free key from Google AI Studio)"),
  EMBED_MODEL: z.string().default("gemini-embedding-001"),
  EMBED_DIM: z.coerce.number().int().positive().default(768),
  CHAT_MODEL: z.string().default("gemini-2.5-flash"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  for (const issue of parsed.error.issues) console.error(`Config error: ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const config = parsed.data;
