import { fileURLToPath } from "node:url";
import { PgLinkMetadataStore } from "../pg/link-metadata-store";
import { closePool } from "../pg/pool";
import { purgeLink, renderPurgeResult } from "./purge";

/**
 * CLI entry for the operator abuse purge (PG-17 / R25):
 *
 *     DATABASE_URL=postgres://… pnpm --filter @aesmsg/server-store purge <link-id>
 *
 * Purges the ciphertext for exactly one reported id and marks the row terminal, reusing the same
 * transactional revoke/delete path (`adminPurge`). Idempotent — safe to re-run. Requires DATABASE_URL
 * (getPool() throws without it, so it fails closed rather than touching a phantom store). See
 * docs/ops-runbook.md for the full runbook.
 */

/* v8 ignore start -- CLI entry point exercised manually / documented in the ops runbook */
async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id || id.trim().length === 0) {
    console.error("usage: DATABASE_URL=… pnpm --filter @aesmsg/server-store purge <link-id>");
    process.exit(2);
    return;
  }
  const store = new PgLinkMetadataStore();
  try {
    const result = await purgeLink(store, id);
    console.log(renderPurgeResult(id, result));
  } finally {
    await closePool();
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      // Print only the message (never the connection string / stack details) to keep secrets out.
      console.error("purge failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
/* v8 ignore stop */
