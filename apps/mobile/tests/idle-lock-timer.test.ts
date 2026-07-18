import { describe, expect, it, vi } from "vitest";
import { createIdleLockTimer } from "@/src/identity/idle-lock-timer";

// The inactivity auto-lock timer must RESET on every user interaction so active use never triggers a
// lock — only genuine idleness does. The reset/expire lifecycle was extracted into the pure
// createIdleLockTimer so it can be exercised in Node (no React renderer). We drive it with a
// deterministic manual clock where now() and setTimeout share ONE timeline, which is exactly what the
// deadline-based self-rescheduling design requires — vitest's fake timers do not couple Date.now to
// setTimeout by default, so a hand-rolled clock keeps the assertions unambiguous.

const TIMEOUT = 60_000;

interface FakeClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /** Advance the clock by `ms`, firing every timeout that comes due (in order), including any that a
   *  firing timeout reschedules within the same window. */
  advance: (ms: number) => void;
}

function makeClock(): FakeClock {
  let current = 0;
  let nextId = 1;
  let tasks: { id: number; due: number; fn: () => void }[] = [];
  return {
    now: () => current,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      tasks.push({ id, due: current + ms, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      tasks = tasks.filter((t) => t.id !== (handle as unknown as number));
    },
    advance: (ms) => {
      const target = current + ms;
      // Fire due tasks one at a time, advancing `current` to each task's due time first so now()
      // inside the callback reflects the moment it runs. A rescheduled task may enter this loop.
      while (true) {
        const ready = tasks.filter((t) => t.due <= target).sort((a, b) => a.due - b.due);
        const next = ready[0];
        if (!next) break;
        tasks = tasks.filter((t) => t.id !== next.id);
        current = next.due;
        next.fn();
      }
      current = target;
    },
  };
}

function makeTimer(clock: FakeClock, onExpire: () => void) {
  return createIdleLockTimer({
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onExpire,
    timeoutMs: TIMEOUT,
  });
}

describe("createIdleLockTimer", () => {
  it("locks after a full idle window with no interaction", () => {
    const clock = makeClock();
    const onExpire = vi.fn();
    const timer = makeTimer(clock, onExpire);

    timer.reset(); // arm
    clock.advance(TIMEOUT - 1);
    expect(onExpire).not.toHaveBeenCalled();

    clock.advance(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("resets on interaction — a reset just before expiry extends the window; no lock yet", () => {
    const clock = makeClock();
    const onExpire = vi.fn();
    const timer = makeTimer(clock, onExpire);

    timer.reset();
    clock.advance(TIMEOUT - 1);
    expect(onExpire).not.toHaveBeenCalled();

    // Interaction 1ms before the original deadline: the window slides forward by TIMEOUT.
    timer.reset();
    clock.advance(1); // crosses the ORIGINAL deadline — must NOT fire (it was superseded)
    expect(onExpire).not.toHaveBeenCalled();

    clock.advance(TIMEOUT - 1); // reach the NEW deadline
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("continuous interaction never triggers a lock, then idle finally does", () => {
    const clock = makeClock();
    const onExpire = vi.fn();
    const timer = makeTimer(clock, onExpire);

    timer.reset();
    // Ten near-window intervals, each followed by an interaction — active use for ~10 windows.
    for (let i = 0; i < 10; i++) {
      clock.advance(TIMEOUT - 1);
      expect(onExpire).not.toHaveBeenCalled();
      timer.reset();
    }
    // Now go idle: a full untouched window elapses.
    clock.advance(TIMEOUT);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("stop() cancels the pending lock", () => {
    const clock = makeClock();
    const onExpire = vi.fn();
    const timer = makeTimer(clock, onExpire);

    timer.reset();
    clock.advance(TIMEOUT / 2);
    timer.stop();
    clock.advance(TIMEOUT * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("reset() after stop() re-arms the timer (unlock-after-idle path)", () => {
    const clock = makeClock();
    const onExpire = vi.fn();
    const timer = makeTimer(clock, onExpire);

    timer.reset();
    timer.stop();
    expect(onExpire).not.toHaveBeenCalled();

    timer.reset(); // re-arm
    clock.advance(TIMEOUT);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("fires onExpire exactly once and does not repeat", () => {
    const clock = makeClock();
    const onExpire = vi.fn();
    const timer = makeTimer(clock, onExpire);

    timer.reset();
    clock.advance(TIMEOUT);
    expect(onExpire).toHaveBeenCalledTimes(1);

    clock.advance(TIMEOUT * 3);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("stop() with nothing armed is a safe no-op", () => {
    const clock = makeClock();
    const timer = makeTimer(clock, vi.fn());
    expect(() => {
      timer.stop();
      timer.stop();
    }).not.toThrow();
  });
});
