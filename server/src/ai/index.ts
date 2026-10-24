import { config } from "../config.js";
import { GeminiProvider } from "./gemini.js";
import type { AiProvider } from "./provider.js";

export const ai: AiProvider = new GeminiProvider(
  config.GEMINI_API_KEY,
  config.EMBED_MODEL,
  config.CHAT_MODEL,
  config.EMBED_DIM,
);
