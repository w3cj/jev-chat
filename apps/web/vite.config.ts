import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  // Vite doesn't put .env values on process.env, and the root .env is outside this package.
  const env = loadEnv(mode, ROOT, "");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.WEB_PORT || 5173),
      proxy: { "/api": `http://127.0.0.1:${Number(env.PORT || 8787)}` },
    },
  };
});
