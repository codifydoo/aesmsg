import { existsSync } from "node:fs";
import { join } from "node:path";
import { closePool, getPool, PgLinkMetadataStore } from "@aesmsg/server-store";
import { loadWorkerConfig } from "./config";
import { createExpirySweepJob } from "./jobs/expiry-sweep";
import { consoleLogger } from "./logger";
import { createScheduler } from "./scheduler";
import { createShutdownController } from "./shutdown";

// Load apps/worker/.env for local runs; vars already set in the environment win (platform-injected
// DATABASE_URL and the inline vars in the root worker:prod script still take precedence).
const envFile = join(import.meta.dirname, "..", ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const logger = consoleLogger;

// The worker MUST run against Postgres. A separate process's in-memory store shares no state with
// the API and would purge nothing, so refuse to start (loud failure) rather than silently no-op.
if (!process.env.DATABASE_URL) {
  logger.error({}, "DATABASE_URL is required: the worker only operates against Postgres");
  process.exit(1);
}

const config = loadWorkerConfig(process.env);

// Constructing the store eagerly surfaces a bad DATABASE_URL via getPool() before we start ticking.
const links = new PgLinkMetadataStore(getPool());

const scheduler = createScheduler({
  jobs: [
    createExpirySweepJob({
      links,
      intervalMs: config.expirySweepIntervalMs,
      runOnStart: config.sweepRunOnStart,
    }),
  ],
  logger,
});

scheduler.start();
logger.info(
  { expirySweepIntervalMs: config.expirySweepIntervalMs, sweepRunOnStart: config.sweepRunOnStart },
  "aesmsg worker started",
);

// Graceful shutdown (BE-8): stop the scheduler first — createScheduler.stop() clears the interval
// and awaits any in-flight sweep so a redeploy never abandons a half-done purge — then close the pg
// pool, then exit. A wedged sweep still exits via the force-exit deadline. Exactly-once and the
// step ordering live in createShutdownController (unit-tested in tests/shutdown.test.ts).
const shutdown = createShutdownController({
  steps: [
    { name: "scheduler", run: () => scheduler.stop() },
    { name: "pg pool", run: () => closePool() },
  ],
  log: (message) => logger.info({}, message),
  exit: (code) => process.exit(code),
  forceExitAfterMs: 15_000,
});

process.on("SIGINT", () => shutdown.requestShutdown("SIGINT"));
process.on("SIGTERM", () => shutdown.requestShutdown("SIGTERM"));
