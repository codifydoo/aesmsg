import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Pure-logic units only (crypto adapters, codecs). Native-module-backed code
// (secure-store, biometrics, screen-capture) is exercised manually on device.
export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.ts", "plugins/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
