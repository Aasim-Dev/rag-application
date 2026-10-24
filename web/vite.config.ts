import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // In local dev, /api goes to the Express server so no CORS setup is needed.
  server: { proxy: { "/api": "http://localhost:4000" } },
});
