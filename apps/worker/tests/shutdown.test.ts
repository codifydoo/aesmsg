import { describe, expect, it, vi } from "vitest";
import { createShutdownController, type ShutdownStep } from "../src/shutdown";

// See apps/api/tests/shutdown.test.ts — same orchestration, worker step set (scheduler then pool).
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness(steps: ShutdownStep[], forceExitAfterMs = 1000) {
  const logs: string[] = [];
  const exit = vi.fn<(code: number) => void>();
  const clearTimer = vi.fn();
  let forceFn: () => void = () => {
    throw new Error("force timer never armed");
  };
  const handle = Symbol("timer") as unknown as ReturnType<typeof setTimeout>;
  const setTimer = vi.fn((fn: () => void) => {
    forceFn = fn;
    return handle;
  });
  const controller = createShutdownController({
    steps,
    log: (m) => logs.push(m),
    exit,
    forceExitAfterMs,
    setTimer,
    clearTimer,
  });
  return { controller, logs, exit, clearTimer, setTimer, handle, fireForceTimer: () => forceFn() };
}

describe("createShutdownController (worker)", () => {
  it("stops the scheduler before closing the pool, then exits(0)", async () => {
    const order: string[] = [];
    const h = harness([
      { name: "scheduler", run: async () => void order.push("scheduler") },
      { name: "pg pool", run: async () => void order.push("pg pool") },
    ]);

    h.controller.requestShutdown("SIGTERM");
    await flush();

    expect(order).toEqual(["scheduler", "pg pool"]); // sweep drained before the pool is torn out
    expect(h.exit).toHaveBeenCalledWith(0);
    expect(h.clearTimer).toHaveBeenCalledWith(h.handle);
  });

  it("is exactly-once across a second signal", async () => {
    const stop = vi.fn(async () => {});
    const h = harness([{ name: "scheduler", run: stop }]);

    h.controller.requestShutdown("SIGTERM");
    h.controller.requestShutdown("SIGTERM");
    await flush();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledTimes(1);
  });

  it("force-exits(1) when a sweep wedges the scheduler stop", async () => {
    const h = harness([{ name: "scheduler", run: () => new Promise<void>(() => {}) }]);

    h.controller.requestShutdown("SIGTERM");
    await flush();
    expect(h.exit).not.toHaveBeenCalled();

    h.fireForceTimer();
    expect(h.exit).toHaveBeenCalledWith(1);
  });

  it("continues to close the pool if scheduler stop rejects, then exits(1)", async () => {
    const poolClose = vi.fn(async () => {});
    const h = harness([
      {
        name: "scheduler",
        run: async () => {
          throw new Error("boom");
        },
      },
      { name: "pg pool", run: poolClose },
    ]);

    h.controller.requestShutdown("SIGTERM");
    await flush();

    expect(poolClose).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.logs.join("\n")).not.toContain("boom");
  });
});
