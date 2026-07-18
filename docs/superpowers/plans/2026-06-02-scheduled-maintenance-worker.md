# Scheduled Maintenance Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `@aesmsg/worker` service that periodically runs `expirePastDue()` against Postgres so expired / open-limit-reached links leave no ciphertext on the server, restoring the privacy-policy promise.

**Architecture:** A new `apps/worker` pnpm workspace runs a long-lived Node process (via `tsx`) built around a generic multi-job scheduler. Its first job, `expiry-sweep`, calls `LinkMetadataStore.expirePastDue()` on a configurable interval (default 15 min). The entrypoint requires `DATABASE_URL` and wires a `PgLinkMetadataStore`, so the sweep always runs against Postgres, never a disconnected in-memory store. The web `/privacy` data-retention copy is updated to reflect automatic purge.

**Tech Stack:** TypeScript (ESM, `tsconfig.base.json`), `tsx`, Vitest (node env), Biome, `@aesmsg/server-store` (`PgLinkMetadataStore`, `getPool`, `closePool`).

**Spec:** `docs/superpowers/specs/2026-06-01-scheduled-maintenance-worker-design.md`

---

## File Structure

New workspace `apps/worker`:

- `apps/worker/package.json` — `@aesmsg/worker`; scripts (dev/start/typecheck/test); deps `@aesmsg/server-store`, `tsx`; devDeps `@types/node`, `typescript`, `vitest`.
- `apps/worker/tsconfig.json` — extends root base, `types: ["node"]`.
- `apps/worker/vitest.config.ts` — node environment.
- `apps/worker/.env.example` — documents `DATABASE_URL`, `AESMSG_EXPIRY_SWEEP_INTERVAL_MS`, `AESMSG_SWEEP_RUN_ON_START`.
- `apps/worker/src/logger.ts` — `Logger` interface + console JSON-line default.
- `apps/worker/src/config.ts` — `loadWorkerConfig(env)` pure parse.
- `apps/worker/src/scheduler.ts` — generic multi-job scheduler (`Job`, `JobResult`, `createScheduler`).
- `apps/worker/src/jobs/expiry-sweep.ts` — `createExpirySweepJob({ links, intervalMs, runOnStart })`.
- `apps/worker/src/index.ts` — entrypoint (env, DB guard, store wiring, start, shutdown).
- `apps/worker/tests/config.test.ts`, `apps/worker/tests/scheduler.test.ts`, `apps/worker/tests/jobs/expiry-sweep.test.ts`.

Modified existing files:

- Root `package.json` — add `worker:dev` and `worker:prod` scripts.
- `apps/web/src/privacy/PrivacyContent.tsx` — data-retention copy.

Build order: scaffold workspace → logger → config → scheduler → expiry-sweep job → entrypoint → root scripts → privacy copy → full-suite verification.

---

## Task 1: Scaffold the `apps/worker` workspace

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/vitest.config.ts`
- Create: `apps/worker/.env.example`

- [ ] **Step 1: Create `apps/worker/package.json`**

```json
{
  "name": "@aesmsg/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts"
  },
  "dependencies": {
    "@aesmsg/server-store": "workspace:*",
    "tsx": "^4.19.2"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `apps/worker/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `apps/worker/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `apps/worker/.env.example`**

```bash
# Postgres connection. REQUIRED — the worker refuses to start without it (an in-memory
# store in a separate process shares no state with the API and would purge nothing).
# Local dev (see docker-compose.yml — non-default host ports):
# DATABASE_URL=postgres://aesmsg:aesmsg@localhost:55432/aesmsg

# Expiry-sweep cadence in milliseconds. Default 900000 (15 min). Set to 0 to disable the job.
# A link stops serving the instant it expires; this only controls how soon the opaque
# ciphertext blob is physically purged from Postgres.
# AESMSG_EXPIRY_SWEEP_INTERVAL_MS=900000

# Run one sweep immediately on boot (clears any backlog right after a deploy). Default true.
# AESMSG_SWEEP_RUN_ON_START=true

# The worker needs NO Redis and exposes NO network ports — it is a closed internal
# maintenance process. Deploy it on Sproobo as its own long-running service:
#   pnpm --filter @aesmsg/worker start
```

- [ ] **Step 5: Install so pnpm links the new workspace**

Run: `pnpm install`
Expected: completes successfully; `@aesmsg/worker` appears as a workspace project (no errors about the new package).

- [ ] **Step 6: Commit**

```bash
git add apps/worker/package.json apps/worker/tsconfig.json apps/worker/vitest.config.ts apps/worker/.env.example pnpm-lock.yaml
git commit -m "chore(worker): scaffold @aesmsg/worker workspace"
```

---

## Task 2: Minimal structured logger

**Files:**
- Create: `apps/worker/src/logger.ts`

No dedicated test file — the logger is an injection seam asserted on via fakes in later tasks. It is a thin console wrapper with no branching logic worth a unit test.

- [ ] **Step 1: Create `apps/worker/src/logger.ts`**

```ts
// Minimal structured logger. Kept dependency-free (no pino/Fastify) — the worker only ever logs
// aggregate, non-sensitive data (job name, purge count, duration), consistent with the project's
// zero-knowledge logging posture (no IPs, link IDs, or payloads). The Logger interface is the
// injection seam the scheduler/jobs depend on, so tests can pass a fake and assert on calls.
export interface Logger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

function emit(level: "info" | "error", fields: Record<string, unknown>, message: string): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const consoleLogger: Logger = {
  info: (fields, message) => emit("info", fields, message),
  error: (fields, message) => emit("error", fields, message),
};
```

- [ ] **Step 2: Typecheck the workspace**

Run: `pnpm --filter @aesmsg/worker typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/logger.ts
git commit -m "feat(worker): minimal structured logger"
```

---

## Task 3: Config parsing (`loadWorkerConfig`)

**Files:**
- Create: `apps/worker/src/config.ts`
- Test: `apps/worker/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "../src/config";

describe("loadWorkerConfig", () => {
  it("uses defaults when env is empty", () => {
    const cfg = loadWorkerConfig({});
    expect(cfg.expirySweepIntervalMs).toBe(900_000);
    expect(cfg.sweepRunOnStart).toBe(true);
  });

  it("honors a numeric interval override", () => {
    const cfg = loadWorkerConfig({ AESMSG_EXPIRY_SWEEP_INTERVAL_MS: "60000" });
    expect(cfg.expirySweepIntervalMs).toBe(60_000);
  });

  it("treats 0 as a valid (disabled) interval", () => {
    const cfg = loadWorkerConfig({ AESMSG_EXPIRY_SWEEP_INTERVAL_MS: "0" });
    expect(cfg.expirySweepIntervalMs).toBe(0);
  });

  it("falls back to the default for non-numeric or negative intervals", () => {
    expect(loadWorkerConfig({ AESMSG_EXPIRY_SWEEP_INTERVAL_MS: "abc" }).expirySweepIntervalMs).toBe(
      900_000,
    );
    expect(loadWorkerConfig({ AESMSG_EXPIRY_SWEEP_INTERVAL_MS: "-5" }).expirySweepIntervalMs).toBe(
      900_000,
    );
  });

  it("parses AESMSG_SWEEP_RUN_ON_START=false as false, everything else true", () => {
    expect(loadWorkerConfig({ AESMSG_SWEEP_RUN_ON_START: "false" }).sweepRunOnStart).toBe(false);
    expect(loadWorkerConfig({ AESMSG_SWEEP_RUN_ON_START: "true" }).sweepRunOnStart).toBe(true);
    expect(loadWorkerConfig({ AESMSG_SWEEP_RUN_ON_START: "anything" }).sweepRunOnStart).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/worker test`
Expected: FAIL — cannot resolve `../src/config` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `apps/worker/src/config.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/worker test`
Expected: PASS (all `loadWorkerConfig` cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/config.ts apps/worker/tests/config.test.ts
git commit -m "feat(worker): config parsing for sweep interval and run-on-start"
```

---

## Task 4: Generic multi-job scheduler

**Files:**
- Create: `apps/worker/src/scheduler.ts`
- Test: `apps/worker/tests/scheduler.test.ts`

This is the reusable "various schedules" core. It owns timing, overlap-guarding, error isolation, and logging. Jobs themselves are dumb async functions.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/scheduler.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../src/logger";
import { createScheduler, type Job } from "../src/scheduler";

function fakeLogger(): Logger & { infos: unknown[][]; errors: unknown[][] } {
  const infos: unknown[][] = [];
  const errors: unknown[][] = [];
  return {
    infos,
    errors,
    info: (fields, message) => infos.push([fields, message]),
    error: (fields, message) => errors.push([fields, message]),
  };
}

describe("createScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("runs a job on each interval tick", async () => {
    const run = vi.fn().mockResolvedValue({ detail: { purged: 0 } });
    const job: Job = { name: "j", intervalMs: 1000, run };
    const scheduler = createScheduler({ jobs: [job], logger: fakeLogger() });

    scheduler.start();
    expect(run).toHaveBeenCalledTimes(0); // runOnStart not set

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    await scheduler.stop();
  });

  it("runs immediately on start when runOnStart is true", async () => {
    const run = vi.fn().mockResolvedValue({ detail: {} });
    const job: Job = { name: "j", intervalMs: 1000, runOnStart: true, run };
    const scheduler = createScheduler({ jobs: [job], logger: fakeLogger() });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0); // flush the immediate microtask
    expect(run).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it("skips a tick while the previous run is still in flight (overlap guard)", async () => {
    let resolveRun: (() => void) | undefined;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise<{ detail: Record<string, unknown> }>((resolve) => {
          resolveRun = () => resolve({ detail: {} });
        }),
    );
    const logger = fakeLogger();
    const job: Job = { name: "slow", intervalMs: 1000, run };
    const scheduler = createScheduler({ jobs: [job], logger });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000); // first tick — run starts, never resolves
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // second tick — should be skipped
    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.infos.some(([, msg]) => String(msg).includes("skipped"))).toBe(true);

    resolveRun?.();
    await scheduler.stop();
  });

  it("isolates errors: a rejecting job is logged and the schedule survives", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ detail: {} });
    const logger = fakeLogger();
    const job: Job = { name: "flaky", intervalMs: 1000, run };
    const scheduler = createScheduler({ jobs: [job], logger });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000); // first tick rejects
    expect(logger.errors.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); // second tick still fires
    expect(run).toHaveBeenCalledTimes(2);

    await scheduler.stop();
  });

  it("does not schedule a job with intervalMs <= 0", async () => {
    const run = vi.fn().mockResolvedValue({ detail: {} });
    const job: Job = { name: "disabled", intervalMs: 0, runOnStart: true, run };
    const logger = fakeLogger();
    const scheduler = createScheduler({ jobs: [job], logger });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(0);
    expect(logger.infos.some(([, msg]) => String(msg).includes("disabled"))).toBe(true);

    await scheduler.stop();
  });

  it("stop() prevents further runs", async () => {
    const run = vi.fn().mockResolvedValue({ detail: {} });
    const job: Job = { name: "j", intervalMs: 1000, run };
    const scheduler = createScheduler({ jobs: [job], logger: fakeLogger() });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/worker test`
Expected: FAIL — cannot resolve `../src/scheduler`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/worker/src/scheduler.ts`:

```ts
import type { Logger } from "./logger";

export interface JobResult {
  /** Free-form structured detail logged after a successful run, e.g. { purged: 3 }. */
  detail?: Record<string, unknown>;
}

export interface Job {
  name: string;
  intervalMs: number;
  /** Run once immediately on start, in addition to the interval. Default false. */
  runOnStart?: boolean;
  run(): Promise<JobResult>;
}

export interface Scheduler {
  start(): void;
  stop(): Promise<void>;
}

// Injection seam for tests; defaults to global timers. ReturnType keeps it engine-agnostic.
type TimerHandle = ReturnType<typeof setInterval>;

export interface SchedulerDeps {
  jobs: Job[];
  logger: Logger;
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const { jobs, logger } = deps;
  const setTimer = deps.setTimer ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearInterval(h));

  const handles: TimerHandle[] = [];
  // Tracks the in-flight run per job so a slow run never stacks with its next tick.
  const inFlight = new Map<string, Promise<void>>();

  async function execute(job: Job): Promise<void> {
    if (inFlight.has(job.name)) {
      logger.info({ job: job.name }, "scheduled run skipped: previous run still in flight");
      return;
    }
    const started = Date.now();
    const promise = (async () => {
      try {
        const result = await job.run();
        logger.info(
          { job: job.name, ...result.detail, durationMs: Date.now() - started },
          "scheduled job completed",
        );
      } catch (err) {
        logger.error(
          { job: job.name, error: err instanceof Error ? err.message : String(err) },
          "scheduled job failed",
        );
      }
    })().finally(() => {
      inFlight.delete(job.name);
    });
    inFlight.set(job.name, promise);
    await promise;
  }

  return {
    start() {
      for (const job of jobs) {
        if (job.intervalMs <= 0) {
          logger.info({ job: job.name }, "scheduled job disabled (intervalMs <= 0)");
          continue;
        }
        if (job.runOnStart) {
          void execute(job);
        }
        handles.push(setTimer(() => void execute(job), job.intervalMs));
      }
    },
    async stop() {
      for (const handle of handles) {
        clearTimer(handle);
      }
      handles.length = 0;
      // Best-effort: let any in-flight runs finish so shutdown does not abandon a partial sweep.
      await Promise.allSettled(Array.from(inFlight.values()));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/worker test`
Expected: PASS (all scheduler cases green, plus config from Task 3).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/scheduler.ts apps/worker/tests/scheduler.test.ts
git commit -m "feat(worker): generic multi-job scheduler with overlap guard and error isolation"
```

---

## Task 5: Expiry-sweep job

**Files:**
- Create: `apps/worker/src/jobs/expiry-sweep.ts`
- Test: `apps/worker/tests/jobs/expiry-sweep.test.ts`

This is the required "assert the sweep is invoked" coverage.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/jobs/expiry-sweep.test.ts`:

```ts
import type { LinkMetadataStore } from "@aesmsg/server-store";
import { describe, expect, it, vi } from "vitest";
import { createExpirySweepJob } from "../../src/jobs/expiry-sweep";

// Minimal fake store: only expirePastDue matters here; the rest throw if unexpectedly called.
function fakeLinks(purged: number): LinkMetadataStore {
  return {
    expirePastDue: vi.fn().mockResolvedValue(purged),
    create: vi.fn(),
    get: vi.fn(),
    incrementOpens: vi.fn(),
    revoke: vi.fn(),
  } as unknown as LinkMetadataStore;
}

describe("createExpirySweepJob", () => {
  it("builds a job named expiry-sweep carrying the configured interval and runOnStart", () => {
    const job = createExpirySweepJob({ links: fakeLinks(0), intervalMs: 60_000, runOnStart: true });
    expect(job.name).toBe("expiry-sweep");
    expect(job.intervalMs).toBe(60_000);
    expect(job.runOnStart).toBe(true);
  });

  it("run() invokes expirePastDue once and reports the purge count", async () => {
    const links = fakeLinks(3);
    const job = createExpirySweepJob({ links, intervalMs: 60_000 });

    const result = await job.run();

    expect(links.expirePastDue).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ detail: { purged: 3 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/worker test`
Expected: FAIL — cannot resolve `../../src/jobs/expiry-sweep`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/worker/src/jobs/expiry-sweep.ts`:

```ts
import type { LinkMetadataStore } from "@aesmsg/server-store";
import type { Job } from "../scheduler";

// Depends only on the LinkMetadataStore INTERFACE (not the Pg class) so it is testable with a fake
// and carries no knowledge of Postgres. The Pg wiring happens in index.ts.
export function createExpirySweepJob(opts: {
  links: LinkMetadataStore;
  intervalMs: number;
  runOnStart?: boolean;
}): Job {
  return {
    name: "expiry-sweep",
    intervalMs: opts.intervalMs,
    ...(opts.runOnStart !== undefined ? { runOnStart: opts.runOnStart } : {}),
    async run() {
      const purged = await opts.links.expirePastDue();
      return { detail: { purged } };
    },
  };
}
```

> Note: the conditional spread for `runOnStart` is required because the root tsconfig sets
> `exactOptionalPropertyTypes: true` — passing an explicit `undefined` to the optional `Job.runOnStart`
> is a type error.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/worker test`
Expected: PASS (expiry-sweep cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/expiry-sweep.ts apps/worker/tests/jobs/expiry-sweep.test.ts
git commit -m "feat(worker): expiry-sweep job calling expirePastDue"
```

---

## Task 6: Entrypoint (env, DB guard, wiring, shutdown)

**Files:**
- Create: `apps/worker/src/index.ts`

No unit test: this is the thin composition root (env loading, `process.exit`, signal handlers, real `PgLinkMetadataStore`). Its pieces — config, scheduler, job — are each tested in isolation; exercising it end-to-end requires a live Postgres and is covered manually in Task 8 / the existing Pg store tests.

- [ ] **Step 1: Write the entrypoint**

Create `apps/worker/src/index.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { closePool, getPool, PgLinkMetadataStore } from "@aesmsg/server-store";
import { loadWorkerConfig } from "./config";
import { createExpirySweepJob } from "./jobs/expiry-sweep";
import { consoleLogger } from "./logger";
import { createScheduler } from "./scheduler";

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

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "aesmsg worker shutting down");
  await scheduler.stop();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
```

- [ ] **Step 2: Typecheck the workspace**

Run: `pnpm --filter @aesmsg/worker typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Verify the DB guard at runtime (no Postgres needed)**

Run: `node --import tsx apps/worker/src/index.ts`
Expected: prints a JSON error line containing `"DATABASE_URL is required"` and exits non-zero. Confirm the exit code:

Run: `node --import tsx apps/worker/src/index.ts; echo "exit=$?"`
Expected: `exit=1`.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat(worker): entrypoint wiring PgLinkMetadataStore with DB guard and graceful shutdown"
```

---

## Task 7: Root scripts for the worker

**Files:**
- Modify: `package.json` (root) — add `worker:dev` and `worker:prod`

- [ ] **Step 1: Add the scripts**

In root `package.json`, inside `"scripts"`, add these two entries after the existing `"api:prod"` line:

```json
    "worker:dev": "pnpm --filter @aesmsg/worker dev",
    "worker:prod": "DATABASE_URL=postgres://aesmsg:aesmsg@localhost:55432/aesmsg pnpm migrate && DATABASE_URL=postgres://aesmsg:aesmsg@localhost:55432/aesmsg AESMSG_EXPIRY_SWEEP_INTERVAL_MS=900000 pnpm --filter @aesmsg/worker start",
```

> Mirrors `api:prod` as a LOCAL prod-mode smoke recipe (DB-only; no Redis, no rate-limit salt — the
> worker needs neither). It runs `migrate` first so the schema exists, then starts the worker against
> the local Docker Postgres on host port 55432.

- [ ] **Step 2: Verify the scripts are registered**

Run: `pnpm run 2>&1 | grep worker`
Expected: lists `worker:dev` and `worker:prod`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add worker:dev and worker:prod root scripts"
```

---

## Task 8: Strengthen the `/privacy` data-retention copy

**Files:**
- Modify: `apps/web/src/privacy/PrivacyContent.tsx` (the `id: "data-retention"` block, around lines 163-169)

- [ ] **Step 1: Read the current block to anchor the edit**

Run: `sed -n '154,176p' apps/web/src/privacy/PrivacyContent.tsx`
Expected: shows the `data-retention` section, including the paragraph that currently reads:
"You can also revoke a link manually at any time. Revoking a link purges its ciphertext from our servers immediately. When a link reaches its expiry or its open limit, it stops working at once and can no longer be opened or decrypted by anyone through the service. Anything we hold is only ever opaque ciphertext sealed to the recipient — useless without the recipient's private key, which never reaches us."

- [ ] **Step 2: Replace the paragraph**

Replace exactly this text:

```
          You can also revoke a link manually at any time. Revoking a link purges its ciphertext
          from our servers immediately. When a link reaches its expiry or its open limit, it stops
          working at once and can no longer be opened or decrypted by anyone through the service.
          Anything we hold is only ever opaque ciphertext sealed to the recipient — useless without
          the recipient&apos;s private key, which never reaches us.
```

with:

```
          You can also revoke a link manually at any time. Revoking a link purges its ciphertext
          from our servers immediately. When a link reaches its expiry or its open limit, it stops
          working at once — it can no longer be opened or decrypted by anyone through the service —
          and its ciphertext is then purged automatically by a routine cleanup process shortly
          afterwards. Anything we hold in the meantime is only ever opaque ciphertext sealed to the
          recipient — useless without the recipient&apos;s private key, which never reaches us.
```

> Honest wording: manual revoke stays "immediately" (it is synchronous); the expiry / open-limit
> path says "purged automatically … shortly afterwards" to reflect the sweep interval rather than
> over-promising instant deletion.

- [ ] **Step 3: Typecheck and test the web app**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS. (Web tests cover only the bouncer; the copy change must not break them.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/privacy/PrivacyContent.tsx
git commit -m "docs(web): privacy copy — expired links' ciphertext is purged automatically"
```

---

## Task 9: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck every workspace**

Run: `pnpm typecheck`
Expected: PASS across all workspaces (web, api, worker, crypto, server-store, ui, design-tokens, mobile).

- [ ] **Step 2: Lint + format check**

Run: `pnpm lint`
Expected: PASS (0 errors). If Biome reports safe fixes, run `pnpm lint:fix`, re-run `pnpm lint`, and amend/commit.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS in every workspace, including the new `@aesmsg/worker` suite (config + scheduler + expiry-sweep).

- [ ] **Step 4: Optional — live local sweep smoke test (requires Docker)**

Only if Docker is available:

Run: `pnpm db:up && pnpm worker:prod`
Expected: worker logs `aesmsg worker started`, then (because `runOnStart` defaults true) an
`{"level":"info",...,"job":"expiry-sweep","purged":0,...}` line. Stop with Ctrl-C and confirm a
clean `shutting down` log. Then `pnpm db:down`.

- [ ] **Step 5: Final commit (only if Steps 2 produced fixups)**

```bash
git add -A
git commit -m "chore(worker): lint/format fixups"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** periodic run in prod (Tasks 4-6), configurable interval (Task 3), logs purge count (Task 4 logging + Task 5 detail), runs against Pg not in-memory (Task 6 DB guard + `PgLinkMetadataStore`), test asserting the sweep is invoked (Task 5), privacy copy (Task 8). All spec sections map to a task.
- **Type consistency:** `Job` / `JobResult` / `Scheduler` / `SchedulerDeps` (Task 4) are consumed unchanged by `createExpirySweepJob` (Task 5) and `index.ts` (Task 6). `Logger` (Task 2) is the same shape used by the scheduler and the fake in tests. `loadWorkerConfig` returns `{ expirySweepIntervalMs, sweepRunOnStart }` (Task 3), consumed verbatim in Task 6.
- **exactOptionalPropertyTypes:** handled by the conditional spread in Task 5 and the `runOnStart?` optional in `Job`.
- **Out of scope (per spec):** in-memory `expirePastDue` parity, multi-instance coordination, any API/`revoke` change.
