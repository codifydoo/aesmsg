"use client";

import { useEffect, useRef } from "react";

// App-lock auto-lock (D8): after `timeoutMs` of inactivity, call `lock()`. Any pointer/keyboard
// activity or a tab becoming visible resets the timer. A `null` timeout ("never") arms no timer at
// all. This replaces the SP1 `// TODO(SP2+)` auto-lock stub in the identity context — the timer lives
// in the view layer (where the DOM activity events are) and drives the existing identity `lock()`.
//
// `lock` is passed in (dependency-injected) rather than pulled from the identity context so the hook
// is trivially unit-testable with a spy and never forces a provider on its host.

export function useAutoLock(timeoutMs: number | null, lock: () => void): void {
  // Hold `lock` in a ref so changing the callback identity between renders does not re-arm the timer
  // (only a change to `timeoutMs` should).
  const lockRef = useRef(lock);
  lockRef.current = lock;

  useEffect(() => {
    if (timeoutMs === null) return; // "never" — no auto-lock timer.
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reset = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => lockRef.current(), timeoutMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };

    reset(); // arm immediately (and whenever the timeout changes)
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [timeoutMs]);
}
