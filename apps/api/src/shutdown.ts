// Graceful-shutdown orchestration (BE-8).
//
// On SIGTERM/SIGINT (a redeploy, an orchestrator draining the container) the process must:
//   1. stop accepting new connections and let in-flight requests finish (Fastify `app.close()`),
//   2. release the shared store resources (the pg pool and the redis client) so a rolling deploy
//      neither drops a live upload/open nor leaks backend connections,
//   3. exit — and, if the drain hangs (a stuck request, a wedged socket), FORCE an exit after a
//      bound so the orchestrator's own kill deadline is never the thing that finally reaps us.
//
// The orchestration is extracted here (rather than living inline in index.ts) so it is unit-testable
// with injected close fns, a fake timer, and a fake exit — see tests/shutdown.test.ts. Logging is
// deliberately string-only and secret-free: the signal name and step labels carry no IP, link ID,
// credential, or ciphertext, preserving the zero-knowledge logging posture.

type Timer = ReturnType<typeof setTimeout>;

/** One ordered teardown step. Steps run sequentially in the order given (drain BEFORE close). */
export interface ShutdownStep {
  /** Non-sensitive label used only in logs, e.g. "http server", "pg pool", "redis". */
  name: string;
  /** Releases the resource. May reject; a rejection is logged and does not abort later steps. */
  run: () => Promise<void>;
}

export interface ShutdownDeps {
  /**
   * Teardown steps in execution order. For the API this is
   * [http server (drain), pg pool, redis] — the server MUST come first so no in-flight request is
   * still using a pool/client we then tear out from under it.
   */
  steps: ShutdownStep[];
  /** Secret-free structured-free log sink (a plain message). Must not throw. */
  log: (message: string) => void;
  /** Process exit. Injected so tests can assert the code without killing the runner. */
  exit: (code: number) => void;
  /** Hard deadline: if the ordered drain has not finished within this many ms, force `exit(1)`. */
  forceExitAfterMs: number;
  /** Timer seam (defaults to an unref'd setTimeout so the timer never itself keeps us alive). */
  setTimer?: (fn: () => void, ms: number) => Timer;
  clearTimer?: (handle: Timer) => void;
}

export interface ShutdownController {
  /**
   * Begin shutdown. EXACTLY-ONCE: the first call runs the drain; any later call (a second signal,
   * SIGINT racing SIGTERM) is a logged no-op so we never tear down twice or exit mid-drain.
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

    // Arm the force-exit deadline FIRST, before any await, so even a step that never settles cannot
    // strand the process. The timer is unref'd (default seam) so it is not itself a reason to stay up.
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
        // Best-effort: log (no error object — it may embed a connection string) and keep going so a
        // failing pool close still lets us try to close redis, then exit non-zero.
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
