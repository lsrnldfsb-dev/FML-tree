import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Consume the engine as source so Vite transpiles it with the app.
      "@mm/engine": fileURLToPath(new URL("../../packages/engine/src/index.ts", import.meta.url)),
      "@mm/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Talk to the local server during development.
    proxy: {
      "/api": "http://localhost:8080",
      "/socket": { target: "ws://localhost:8080", ws: true },
    },
  },
});
