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
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ detail: {} });
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

  it("isolates jobs: a slow job's skipped tick does not block a fast job", async () => {
    let resolveSlow: (() => void) | undefined;
    const slowRun = vi.fn().mockImplementation(
      () =>
        new Promise<{ detail: Record<string, unknown> }>((resolve) => {
          resolveSlow = () => resolve({ detail: {} });
        }),
    );
    const fastRun = vi.fn().mockResolvedValue({ detail: {} });
    const slow: Job = { name: "slow", intervalMs: 1000, run: slowRun };
    const fast: Job = { name: "fast", intervalMs: 1000, run: fastRun };
    const scheduler = createScheduler({ jobs: [slow, fast], logger: fakeLogger() });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000); // both tick: slow starts (hangs), fast completes
    expect(slowRun).toHaveBeenCalledTimes(1);
    expect(fastRun).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // slow tick skipped (still in flight), fast runs again
    expect(slowRun).toHaveBeenCalledTimes(1);
    expect(fastRun).toHaveBeenCalledTimes(2);

    resolveSlow?.();
    await scheduler.stop();
  });

  it("ignores a duplicate start() (no double scheduling)", async () => {
    const run = vi.fn().mockResolvedValue({ detail: {} });
    const job: Job = { name: "j", intervalMs: 1000, run };
    const scheduler = createScheduler({ jobs: [job], logger: fakeLogger() });

    scheduler.start();
    scheduler.start(); // duplicate must not add a second timer
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });
});
