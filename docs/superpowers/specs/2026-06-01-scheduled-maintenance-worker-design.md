# Scheduled maintenance worker (`apps/worker`) — design

**Date:** 2026-06-01
**Status:** Approved, pending implementation plan

## Problem

`PgLinkMetadataStore.expirePastDue()`
(`packages/server-store/src/pg/link-metadata-store.ts`) already does the correct
thing: it flips past-due `active` rows to `expired`, then `DELETE`s the ciphertext
for **every** row in a terminal status (`expired` / `revoked`), returning the
number of ciphertext blobs purged.

It has **no production caller.** `grep -rn expirePastDue apps packages` shows only
the interface, the two store implementations, and tests. There is no cron, worker,
`setInterval`, or API route that invokes it.

Net effect today: when a link reaches its expiry or its max-opens limit,
`incrementOpens()` / the GET / open handlers correctly stop serving it (404 / 410),
but the encrypted blob stays in Postgres indefinitely. Only a **manual** `revoke()`
ever physically deletes ciphertext. This contradicts the product's
"links self-destruct / expire" privacy promise: an expired link still leaves opaque
(but real) ciphertext at rest on the server.

`revoke()` is unaffected — it already purges ciphertext inline in a transaction and
must keep doing so. This work is purely about the **expiry / open-limit** path.

## Goal

Run `expirePastDue()` periodically in production, against the Postgres store, so
expired and limit-reached links leave **no ciphertext** on the server — restoring
the privacy-policy claim. Make the cadence configurable, log the purge count, and
prove via tests that the sweep is invoked on schedule.

## Decisions (locked)

- **Mechanism:** a **separate, long-running worker app** (`apps/worker`,
  `@aesmsg/worker`) deployed as its own Sproobo service. Built around a generic
  multi-job scheduler so additional scheduled maintenance jobs slot in later
  ("various schedules"). The expiry sweep is the first and currently only job.
- **Default cadence:** 15 minutes, overridable by env. A link stops *serving*
  the instant it expires (handlers return 410/404); the sweep only controls how
  soon the opaque blob is *physically purged*, so a few minutes of lag is
  acceptable.
- **Privacy copy:** re-strengthen the `/privacy` data-retention wording in the
  same change so it honestly states expired / limit-reached links have their
  ciphertext purged automatically (not only on manual revoke).

## Architecture

A new pnpm workspace, `apps/worker` (`@aesmsg/worker`): a standalone Node process
(run via `tsx`, consistent with `apps/api`) whose sole responsibility is running
scheduled maintenance jobs against the production database.

```
apps/worker/
  package.json        deps: @aesmsg/server-store (workspace), tsx
                      devDeps: @types/node, typescript, vitest
  tsconfig.json       extends ../../tsconfig.base.json, types: ["node"]
  vitest.config.ts    environment: "node", include tests/**/*.test.ts
  .env.example
  src/
    logger.ts         minimal structured logger
    config.ts         loadWorkerConfig(env) — pure parse
    scheduler.ts      generic multi-job scheduler (the reusable core)
    jobs/
      expiry-sweep.ts createExpirySweepJob({ links, intervalMs, runOnStart })
    index.ts          entrypoint: env → require DATABASE_URL → PgLinkMetadataStore
                      → register jobs → start → graceful shutdown
  tests/
    scheduler.test.ts
    config.test.ts
    jobs/
      expiry-sweep.test.ts
```

### Components and their boundaries

**`src/scheduler.ts` — generic, dependency-free job scheduler.**

```ts
export interface JobResult {
  /** Free-form structured detail logged after a successful run, e.g. { purged: 3 }. */
  detail?: Record<string, unknown>;
}

export interface Job {
  name: string;
  intervalMs: number;
  /** Run once immediately on start in addition to the interval. Default false. */
  runOnStart?: boolean;
  run(): Promise<JobResult>;
}

export interface Scheduler {
  start(): void;
  stop(): Promise<void>;
}

export interface SchedulerDeps {
  jobs: Job[];
  logger: Logger;
  // Injectable for tests; default to global setInterval/clearInterval.
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  clearTimer?: (h: TimerHandle) => void;
}

export function createScheduler(deps: SchedulerDeps): Scheduler;
```

Behavior:

- For each job with `intervalMs > 0`: if `runOnStart`, invoke once immediately;
  then schedule on `intervalMs`.
- A job with `intervalMs <= 0` is **disabled** — not scheduled — and that is
  logged once at start so it is visible in deploy logs.
- **Per-job overlap guard:** if a job's previous `run()` is still in flight when
  its next tick fires, the tick is skipped and logged (no stacking).
- **Per-job error isolation:** a rejected `run()` is caught and logged via
  `logger.error`; it never throws out of the scheduler, never crashes the
  process, and never affects other jobs' schedules.
- Each successful run logs `logger.info` with `{ job, ...detail, durationMs }`.
- `stop()` clears all intervals and best-effort awaits any in-flight runs, so a
  graceful shutdown does not leave a half-finished sweep dangling.
- Timer functions are injected so tests drive the schedule with fake timers
  without real wall-clock waits.

**`src/jobs/expiry-sweep.ts` — the expiry sweep as a `Job`.**

```ts
export function createExpirySweepJob(opts: {
  links: LinkMetadataStore; // depends on the INTERFACE, not the Pg class
  intervalMs: number;
  runOnStart?: boolean;
}): Job;
```

Its `run()` calls `links.expirePastDue()` and returns
`{ detail: { purged: count } }`. It depends only on the `LinkMetadataStore`
interface from `@aesmsg/server-store`, so it is trivially unit-testable with a
fake store and carries no knowledge of Postgres.

**`src/config.ts` — pure env parsing.**

```ts
export interface WorkerConfig {
  expirySweepIntervalMs: number; // AESMSG_EXPIRY_SWEEP_INTERVAL_MS, default 900_000
  sweepRunOnStart: boolean;      // AESMSG_SWEEP_RUN_ON_START, default true
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig;
```

Pure function over an env bag (mirrors `apps/api/src/stores/store-backend.ts`'s
testable-pure-core pattern). Invalid / non-numeric interval values fall back to
the default; `0` is honored as "disable".

**`src/logger.ts` — minimal structured logger.**

A small `Logger` interface (`{ info(obj, msg?): void; error(obj, msg?): void }`)
with a default console-backed JSON-line implementation. This keeps the worker free
of a logging dependency while emitting machine-parseable lines for Sproobo log
aggregation, and lets tests inject a fake logger to assert on calls. Only
aggregate, non-sensitive data is logged (job name, purge count, duration) —
consistent with the project's zero-knowledge logging posture (no IPs, no link IDs,
no payloads).

**`src/index.ts` — entrypoint.**

1. Load `apps/worker/.env` via `process.loadEnvFile` if present (mirrors
   `apps/api/src/index.ts`); environment-provided vars win.
2. **Require `DATABASE_URL`.** If absent, log a clear fatal error and
   `process.exit(1)`. This is the guard that guarantees the sweep runs against
   Postgres and never silently no-ops: a worker process has its own memory, so an
   in-memory store here would be a disconnected, pointless store that shares no
   state with the API. Refusing to start is the correct, loud failure.
3. Build `new PgLinkMetadataStore()` (its constructor resolves the shared pool via
   `getPool()` → `DATABASE_URL`). **Redis is not needed** — `expirePastDue()` is
   pure Postgres.
4. `loadWorkerConfig(process.env)`, build `[createExpirySweepJob(...)]`,
   `createScheduler({ jobs, logger })`, `scheduler.start()`.
5. Graceful shutdown on `SIGINT` / `SIGTERM`: `await scheduler.stop()`, then
   `await closePool()`, then exit 0.

### Data flow

```
Sproobo runs `pnpm --filter @aesmsg/worker start`
  → index.ts: require DATABASE_URL, build PgLinkMetadataStore
  → scheduler.start():
       (runOnStart) immediate sweep, then every 15 min:
         expiry-sweep.run() → links.expirePastDue()
           → UPDATE links SET status='expired' WHERE status='active' AND expires_at <= now()
           → DELETE FROM link_ciphertexts WHERE link_id IN (terminal rows)
           → returns purgeCount
         → logger.info({ job:'expiry-sweep', purged: purgeCount, durationMs })
```

The API process is unchanged. It continues to return 410/404 the instant a link
is past expiry or over its open limit (`incrementOpens` / GET / open handlers); the
worker independently purges the now-useless blobs. The two never contend:
`expirePastDue()` only deletes ciphertext for rows already in a terminal status,
and `revoke()` (immediate purge) is untouched.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — (required) | Postgres connection. Missing ⇒ worker refuses to start. |
| `AESMSG_EXPIRY_SWEEP_INTERVAL_MS` | `900000` (15 min) | Sweep cadence. `0` disables the job. |
| `AESMSG_SWEEP_RUN_ON_START` | `true` | Run one sweep immediately on boot (clears backlog after a deploy). |

`apps/worker/.env.example` documents these. Root `package.json` gains:

- `worker:dev` → `pnpm --filter @aesmsg/worker dev` (`tsx watch`).
- `worker:prod` → a **local** prod-mode smoke recipe mirroring `api:prod`, but
  Postgres-only (no Redis, no rate-limit salt). As with `api:prod`, this is a
  local smoke recipe, not deployment config.

`pnpm -r typecheck` and `pnpm -r test` pick up the new workspace automatically.

### Deployment (Sproobo)

The worker is a **separate long-running service** from the API, started with
`pnpm --filter @aesmsg/worker start`, sharing the same `DATABASE_URL` as the API.
It needs no Redis and exposes no network surface (no HTTP server, no open ports) —
a closed, internal maintenance process, which keeps attack surface minimal on a
zero-knowledge service. This is documented in `apps/worker/.env.example` (and a
short note in the worker's package metadata / README as appropriate).

## Privacy copy update

Update the data-retention section in
`apps/web/src/privacy/PrivacyContent.tsx` (the `id: "data-retention"` block).
Today it says that when a link reaches its expiry or open limit it "stops working
at once and can no longer be opened or decrypted" — which is honest but silent on
ciphertext deletion for that path (only manual revoke is described as purging).

Revise so the expiry / open-limit path also states the ciphertext is
**automatically purged** from the server, parallel to manual revoke. Word it
honestly for the automatic path — the blob is removed automatically shortly after a
link reaches its limit (a brief sweep interval), not framed as literally
instantaneous — to avoid over-promising. The manual-revoke wording ("purges its
ciphertext immediately") stays as is, since revoke really is synchronous.

## Testing strategy

New tests live in `apps/worker/tests` (Vitest, node environment):

- **`jobs/expiry-sweep.test.ts` — the required "sweep is invoked" assertion.**
  A fake `LinkMetadataStore` whose `expirePastDue()` returns e.g. `3`. Assert the
  job's `run()` calls `expirePastDue()` exactly once and returns
  `{ detail: { purged: 3 } }`.
- **`scheduler.test.ts`** (injected fake timers / fake clock):
  - fires `run()` on each interval tick;
  - `runOnStart: true` invokes `run()` immediately on `start()`;
  - overlap guard: while a slow `run()` is pending, the next tick is skipped (not
    double-invoked) and logged;
  - error isolation: a job whose `run()` rejects is logged and the scheduler keeps
    running (subsequent ticks and other jobs unaffected);
  - `intervalMs <= 0` ⇒ job not scheduled;
  - `stop()` clears intervals ⇒ no further runs after stop.
- **`config.test.ts`** — defaults (15 min, `runOnStart` true), env overrides,
  `0` disables, and non-numeric input falls back to default.

The **actual Postgres purge correctness** (returns count, deletes the blob, leaves
future rows intact) is already covered by
`packages/server-store/tests/pg.test.ts` ("expirePastDue purges ciphertext rows
for expired links") and the shared metadata suite — so the worker tests focus on
scheduling and invocation, with no duplication.

All gates must pass: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Out of scope (deliberate)

- **In-memory `expirePastDue()` parity.** `MemoryLinkMetadataStore.expirePastDue()`
  currently flips status but does **not** purge ciphertext (returns 0), unlike its
  `revoke()`. The worker never uses the in-memory store (it requires Postgres, and
  a separate process's in-memory state is not shared with the API anyway), so
  fixing this yields no benefit here. The latent interface-doc/impl mismatch
  (`interfaces.ts` says `expirePastDue` "purges associated ciphertext") is noted as
  a follow-up rather than bundled, to keep this change cohesive.
- **Distributed scheduling / multi-instance coordination.** The worker is a single
  service; `expirePastDue()` is idempotent, so even an accidental second instance
  would be harmless. No leader election is needed at this scale.
- **No changes to the API process or `revoke()` semantics.**
