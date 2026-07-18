import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.tsx", "src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 85,
      },
    },
  },
});
