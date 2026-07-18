// Graceful-shutdown orchestration for the worker (BE-8).
//
// On SIGTERM/SIGINT (a redeploy) the worker must stop its scheduler (clear the interval AND let any
// in-flight expiry sweep finish so a redeploy does not abandon a half-done purge), then close the pg
// pool, then exit. If a sweep wedges, a bound force-exit still reaps the process.
//
// This mirrors apps/api/src/shutdown.ts by design; the two live in separate packages that cannot
// share an internal module, so the small orchestrator is duplicated rather than depended on across
// the app boundary. Logging is a plain, secret-free message string (the worker never logs IPs, link
// IDs, or payloads — only signal/step labels).

type Timer = ReturnType<typeof setTimeout>;

/** One ordered teardown step. Steps run sequentially in the order given (stop sweeps BEFORE close). */
export interface ShutdownStep {
  /** Non-sensitive label used only in logs, e.g. "scheduler", "pg pool". */
  name: string;
  /** Releases the resource. May reject; a rejection is logged and does not abort later steps. */
  run: () => Promise<void>;
}

export interface ShutdownDeps {
  /**
   * Teardown steps in execution order. For the worker this is [scheduler, pg pool] — the scheduler
   * MUST stop first (clearing its interval and draining the in-flight sweep) so the pool is not
   * closed out from under a sweep still issuing DELETEs.
   */
  steps: ShutdownStep[];
  /** Secret-free log sink (a plain message). Must not throw. */
  log: (message: string) => void;
  /** Process exit. Injected so tests can assert the code without killing the runner. */
  exit: (code: number) => void;
  /** Hard deadline: if the ordered teardown has not finished within this many ms, force `exit(1)`. */
  forceExitAfterMs: number;
  /** Timer seam (defaults to an unref'd setTimeout so the timer never itself keeps us alive). */
  setTimer?: (fn: () => void, ms: number) => Timer;
  clearTimer?: (handle: Timer) => void;
}

export interface ShutdownController {
  /**
   * Begin shutdown. EXACTLY-ONCE: the first call runs the teardown; any later call (a second signal)
   * is a logged no-op so we never tear down twice.
   */
  requestShutdown(signal: string): void;
  /** True once a shutdown has begun (first `requestShutdown`). */
  readonly isShuttingDown: boolean;
}

export function createShutdownController(deps: ShutdownDeps): ShutdownController {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms).unref());
  const clearTimer =
    deps.clearTimer ??
    ((handle) => {
      clearTimeout(handle);
    });

  let shuttingDown = false;

  async function run(signal: string): Promise<void> {
    deps.log(`received ${signal}: starting graceful shutdown`);

    // Arm the force-exit deadline FIRST, before any await, so even a wedged sweep cannot strand us.
    const forceTimer = setTimer(() => {
      deps.log(`graceful shutdown exceeded ${deps.forceExitAfterMs}ms; forcing exit`);
      deps.exit(1);
    }, deps.forceExitAfterMs);

    let hadError = false;
    for (const step of deps.steps) {
      try {
        await step.run();
        deps.log(`closed ${step.name}`);
      } catch {
        // Best-effort: log without the error object (it may embed a connection string) and keep
        // going so a failing scheduler stop still lets us try to close the pool, then exit non-zero.
        hadError = true;
        deps.log(`error closing ${step.name}`);
      }
    }

    clearTimer(forceTimer);
    if (hadError) {
      deps.log("graceful shutdown finished with errors");
      deps.exit(1);
      return;
    }
    deps.log("graceful shutdown complete");
    deps.exit(0);
  }

  return {
    get isShuttingDown() {
      return shuttingDown;
    },
    requestShutdown(signal: string) {
      if (shuttingDown) {
        deps.log(`already shutting down; ignoring ${signal}`);
        return;
      }
      shuttingDown = true;
      void run(signal);
    },
  };
}
