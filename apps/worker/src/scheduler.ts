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
  let started = false;
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
      if (started) {
        logger.info({}, "scheduler already started; ignoring duplicate start()");
        return;
      }
      started = true;
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
      started = false;
      for (const handle of handles) {
        clearTimer(handle);
      }
      handles.length = 0;
      // Best-effort: let any in-flight runs finish so shutdown does not abandon a partial sweep.
      await Promise.allSettled(Array.from(inFlight.values()));
    },
  };
}
