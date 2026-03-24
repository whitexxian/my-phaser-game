import { defineConfig } from "vite";

export default defineConfig({
  server: {
    headers: {
      "Content-Security-Policy": "script-src 'self' 'unsafe-eval'",
    },
  },
});
