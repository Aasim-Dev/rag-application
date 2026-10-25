import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Read the API address at build time from API_URL (the name used on Vercel) or VITE_API_URL.
  // Only this single value is injected into the browser bundle, so no other env variable leaks.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const apiUrl = (env.API_URL || env.VITE_API_URL || "").replace(/\/$/, "");

  return {
    plugins: [react()],
    define: { __API_URL__: JSON.stringify(apiUrl) },
    // In local dev (no API_URL), /api goes to the Express server so no CORS setup is needed.
    server: { proxy: { "/api": "http://localhost:4000" } },
  };
});
