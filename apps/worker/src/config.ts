// Pure env parsing (mirrors apps/api/src/stores/store-backend.ts's testable pure-core pattern).
// Takes an env bag rather than reading process.env directly so it is trivially unit-testable.

const DEFAULT_INTERVAL_MS = 900_000; // 15 minutes

export interface WorkerConfig {
  /** AESMSG_EXPIRY_SWEEP_INTERVAL_MS. Default 900000. 0 disables the sweep job. */
  expirySweepIntervalMs: number;
  /** AESMSG_SWEEP_RUN_ON_START. Default true. */
  sweepRunOnStart: boolean;
}

export function loadWorkerConfig(env: Record<string, string | undefined>): WorkerConfig {
  return {
    expirySweepIntervalMs: parseIntervalMs(env.AESMSG_EXPIRY_SWEEP_INTERVAL_MS),
    // Only an explicit "false" disables run-on-start; default and any other value enable it.
    sweepRunOnStart: env.AESMSG_SWEEP_RUN_ON_START !== "false",
  };
}

function parseIntervalMs(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_INTERVAL_MS;
  const n = Number(raw);
  // Non-numeric or negative is a config mistake — fall back to the default rather than disabling.
  // 0 is intentional ("disable"), so it is allowed through.
  if (!Number.isFinite(n) || n < 0) return DEFAULT_INTERVAL_MS;
  return n;
}
