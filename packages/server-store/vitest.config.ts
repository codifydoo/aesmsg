import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/types.ts",
        "src/interfaces.ts",
        // Manual operator CLI entry (PG-17 / R25): its testable logic lives in src/admin/purge.ts;
        // this file is just the DATABASE_URL/argv wiring, exercised by hand per docs/ops-runbook.md.
        "src/admin/purge-cli.ts",
      ],
      thresholds: {
        lines: 85,
      },
    },
  },
});
