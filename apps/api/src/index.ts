import { existsSync } from "node:fs";
import { join } from "node:path";
import { closePool, closeRedis } from "@aesmsg/server-store";
import { assertProductionConfig } from "./boot-config";
import { buildServer } from "./server";
import { createShutdownController } from "./shutdown";

// Load apps/api/.env for local dev (PORT, DATABASE_URL, REDIS_URL, …) when present.
// Variables already set in the environment take precedence over the file, so a
// platform-injected PORT and the inline vars in the root `api:prod` script still win.
const envFile = join(import.meta.dirname, "..", ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// Fail closed at boot on the two production misconfigurations that otherwise boot green and then
// either lose all data (ARCH-1) or 500 every request (BE-3). Dev/non-production is unaffected: it
// still boots on in-memory stores with no Postgres/Redis and no salt. The exit wiring lives in
// assertProductionConfig so it is unit-tested directly (tests/boot-config.test.ts).
assertProductionConfig(process.env, process.exit);

const port = Number(process.env.PORT ?? 4000);
const app = buildServer({ logger: true });

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`aesmsg API listening on ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

// Graceful shutdown (BE-8): on a redeploy the orchestrator sends SIGTERM. Drain in-flight requests
// (app.close stops accepting new connections and waits for open ones), THEN release the shared
// backend resources. closePool()/closeRedis() with no argument close every cached pool/client
// (see @aesmsg/server-store); in dev/in-memory mode nothing was ever created, so both are no-ops.
// A hung drain still exits via the force-exit deadline. The orchestration + its logging live in
// createShutdownController so they are unit-tested in tests/shutdown.test.ts.
const shutdown = createShutdownController({
  steps: [
    { name: "http server", run: () => app.close() },
    { name: "pg pool", run: () => closePool() },
    { name: "redis", run: () => closeRedis() },
  ],
  log: (message) => app.log.info(message),
  exit: (code) => process.exit(code),
  forceExitAfterMs: 15_000,
});

process.on("SIGTERM", () => shutdown.requestShutdown("SIGTERM"));
process.on("SIGINT", () => shutdown.requestShutdown("SIGINT"));
