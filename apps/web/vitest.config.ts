import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname),
    },
  },
  define: {
    "process.env": {},
  },
  test: {
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.tsx", "src/**/*.ts", "app/**/*.tsx", "app/**/*.ts"],
      exclude: ["app/layout.tsx", "**/*.d.ts"],
      thresholds: {
        lines: 80,
      },
    },
  },
});
