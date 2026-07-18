import { saltConfigError } from "./lib/hash-ip";
import { missingProductionStoreVars } from "./stores/store-backend";

/**
 * Fail-closed boot guard (ARCH-1 / BE-3). Validates the two production misconfigurations that
 * otherwise boot green and then either lose all data (missing Postgres/Redis → silent in-memory
 * stores) or 500 every request (missing/short RATE_LIMIT_IP_SALT → hash-ip fails closed). On a
 * violation it writes one operator-facing line via `log` and calls `exit(1)`; dev/non-production is
 * unaffected (no stores, no salt required).
 *
 * Extracted from index.ts — which calls it at module load with `process.exit` — so the actual exit
 * wiring is unit-testable without spawning a process: inject `env` plus a spy `exit`/`log`. The store
 * guard runs first and `return`s after `exit(1)`, mirroring production (where `process.exit` never
 * returns) so a non-terminating test spy can't fall through and double-report the salt guard.
 */
export function assertProductionConfig(
  env: NodeJS.ProcessEnv,
  exit: (code: number) => void,
  log: (message: string) => void = console.error,
): void {
  const missingStoreVars = missingProductionStoreVars(env);
  if (missingStoreVars.length > 0) {
    log(
      `[aesmsg-api] refusing to boot: NODE_ENV=production requires ${missingStoreVars.join(
        " and ",
      )} to be set (Postgres + Redis). Without ${
        missingStoreVars.length > 1 ? "them" : "it"
      } the API would silently run on in-memory stores and lose every link on restart. ` +
        "Set the missing variable(s), or unset NODE_ENV=production to use in-memory stores in dev.",
    );
    exit(1);
    return;
  }

  const saltError = saltConfigError(env.RATE_LIMIT_IP_SALT, env.NODE_ENV === "production");
  if (saltError) {
    log(`[aesmsg-api] refusing to boot: ${saltError}`);
    exit(1);
  }
}
