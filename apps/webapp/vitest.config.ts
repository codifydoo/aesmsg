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
  // Pre-bundle @aesmsg/crypto's transitive deps so Vite doesn't discover + re-optimize them
  // mid-run (which triggers an unexpected reload and can flake the browser-mode suite). These
  // are nested deps of the workspace @aesmsg/crypto source package, so they use Vite's
  // `parent > child` include syntax to be resolvable from the webapp's Vite root.
  optimizeDeps: {
    include: [
      "@aesmsg/crypto > hash-wasm",
      "@aesmsg/crypto > @hpke/core",
      "@aesmsg/crypto > @hpke/common",
      "@aesmsg/crypto > @noble/hashes/argon2",
      "@aesmsg/crypto > @noble/curves/ed25519",
    ],
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
