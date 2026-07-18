import { describe, expect, it, vi } from "vitest";
import { createShutdownController, type ShutdownStep } from "../src/shutdown";

// Drains the microtask chain the async `run()` builds (log → for-loop of awaited steps → exit).
// One real macrotask tick empties all pending microtasks; we do NOT fake global timers here — the
// controller's own timer is the injected `setTimer` seam, so real setTimeout is free for flushing.
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

describe("createShutdownController (API)", () => {
  it("runs steps in order, closes them, clears the force timer, and exits(0)", async () => {
    const order: string[] = [];
    const h = harness([
      { name: "http server", run: async () => void order.push("http server") },
      { name: "pg pool", run: async () => void order.push("pg pool") },
      { name: "redis", run: async () => void order.push("redis") },
    ]);

    h.controller.requestShutdown("SIGTERM");
    expect(h.controller.isShuttingDown).toBe(true);
    await flush();

    expect(order).toEqual(["http server", "pg pool", "redis"]);
    expect(h.exit).toHaveBeenCalledWith(0);
    expect(h.exit).toHaveBeenCalledTimes(1);
    expect(h.clearTimer).toHaveBeenCalledWith(h.handle);
    expect(h.logs).toContain("received SIGTERM: starting graceful shutdown");
    expect(h.logs).toContain("graceful shutdown complete");
  });

  it("is exactly-once: a second signal is a logged no-op, steps run only once", async () => {
    const serverClose = vi.fn(async () => {});
    const h = harness([{ name: "http server", run: serverClose }]);

    h.controller.requestShutdown("SIGTERM");
    h.controller.requestShutdown("SIGINT"); // racing second signal
    await flush();

    expect(serverClose).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledTimes(1);
    expect(h.setTimer).toHaveBeenCalledTimes(1);
    expect(h.logs).toContain("already shutting down; ignoring SIGINT");
  });

  it("force-exits(1) when the drain hangs, and does not clear the timer", async () => {
    const h = harness([{ name: "http server", run: () => new Promise<void>(() => {}) }]); // never settles

    h.controller.requestShutdown("SIGTERM");
    await flush();
    expect(h.exit).not.toHaveBeenCalled(); // still draining

    h.fireForceTimer();
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.clearTimer).not.toHaveBeenCalled();
  });

  it("continues past a failing step and exits(1)", async () => {
    const poolClose = vi.fn(async () => {});
    const h = harness([
      {
        name: "http server",
        run: async () => {
          throw new Error("boom"); // must not leak into logs
        },
      },
      { name: "pg pool", run: poolClose },
    ]);

    h.controller.requestShutdown("SIGTERM");
    await flush();

    expect(poolClose).toHaveBeenCalledTimes(1); // later step still ran
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.logs).toContain("error closing http server");
    expect(h.logs).toContain("closed pg pool");
    // The thrown Error's message is never logged (could embed a connection string).
    expect(h.logs.join("\n")).not.toContain("boom");
  });
});
