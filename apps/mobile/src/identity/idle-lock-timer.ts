// Framework-agnostic inactivity ("idle") auto-lock timer, extracted from identity-context so the
// arm / reset-on-interaction / stop lifecycle can be unit-tested in plain Node (no React renderer,
// no react-native module load). The React provider injects the real globals (Date.now / setTimeout)
// and drives reset() from an app-root touch observer + AppState "active" transitions.
//
// SEPARATE from shouldLockOnAppState (the background lock, which drops the key the instant the app
// backgrounds). This timer governs ONLY the "foregrounded-but-idle" case: it fires machine.lock()
// after `timeoutMs` of no interaction, and MUST be reset on every user interaction so active use
// never triggers a lock — only genuine idleness does.

export interface IdleLockTimerDeps {
  /** Monotonic-ish clock in ms (Date.now in production; a controllable counter in tests). */
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /** Called once the idle window has fully elapsed with no reset — the app should lock here. */
  onExpire: () => void;
  /** The idle window in ms. */
  timeoutMs: number;
}

export interface IdleLockTimer {
  /**
   * (Re)start the countdown from now. Called on mount, on AppState "active", and — crucially — on
   * every user interaction. Cheap and debounced by design: while a timer is already scheduled this
   * only moves the deadline forward (O(1), no setState, no timer churn); the single in-flight
   * timeout self-reschedules against the deadline when it fires. This is what lets a high-frequency
   * interaction source call reset() freely without thrashing the event loop.
   */
  reset(): void;
  /** Stop the countdown entirely (app backgrounded / effect teardown). Idempotent. */
  stop(): void;
}

export function createIdleLockTimer(deps: IdleLockTimerDeps): IdleLockTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;
  // Absolute ms timestamp the lock should fire at. Interactions push this forward; the running
  // timeout compares against it and either locks (deadline reached) or reschedules for the remainder.
  let deadline = 0;

  const tick = () => {
    handle = null;
    const remaining = deadline - deps.now();
    if (remaining <= 0) {
      // Fully idle for the whole window — lock. We do NOT reschedule; a later reset() re-arms.
      deps.onExpire();
    } else {
      // A reset() moved the deadline forward while we were waiting — wait out the remainder.
      handle = deps.setTimeout(tick, remaining);
    }
  };

  return {
    reset() {
      deadline = deps.now() + deps.timeoutMs;
      // Only schedule when nothing is in flight; an already-running timeout will pick up the new
      // deadline when it fires. After a fire-and-stop (handle === null) this re-arms.
      if (handle === null) {
        handle = deps.setTimeout(tick, deps.timeoutMs);
      }
    },
    stop() {
      if (handle !== null) {
        deps.clearTimeout(handle);
        handle = null;
      }
    },
  };
}
