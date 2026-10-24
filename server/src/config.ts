import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Postgres with pgvector)"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required (free key from Google AI Studio)"),
  EMBED_MODEL: z.string().default("gemini-embedding-001"),
  EMBED_DIM: z.coerce.number().int().positive().default(768),
  CHAT_MODEL: z.string().default("gemini-3.5-flash"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // 4 MB keeps uploads under Vercel's 4.5 MB request-body limit for functions.
  MAX_UPLOAD_MB: z.coerce.number().positive().default(4),
});

const parsed = Env.safeParse(process.env);

/**
 * A readable description of missing/invalid settings, or null when the config is valid.
 * Locally we fail fast at startup. On Vercel a crash while loading the function only shows up as an
 * empty 500, so instead the app stays up and every request answers with this message (see index.ts).
 */
export const configError = parsed.success
  ? null
  : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

if (configError) {
  console.error(`Config error: ${configError}`);
  if (!process.env.VERCEL) process.exit(1);
}

// When invalid (Vercel only), fall back to the defaults so modules can load; requests are refused anyway.
export const config = (parsed.success ? parsed.data : Env.partial().parse({})) as z.infer<typeof Env>;
