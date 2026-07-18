# Slice 11 — Security Settings (`/settings`) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/settings` route at `apps/web/app/(app)/settings/page.tsx`, the 6th SideNav item, the four-section `<SettingsScreen>`, and the `useAppLockTimeout` idle-auto-lock hook — closing out the web identity surface per [Slice 11 spec](../specs/2026-05-11-security-settings-design.md).

**Architecture:** UI-only slice in `apps/web/`. No `@aesmsg/crypto`, `@aesmsg/key-store`, `@aesmsg/server-store`, or API changes. New code lives in `apps/web/src/settings/`; tests live in `apps/web/tests/settings/`. The App Lock Timeout splits into two pieces — a `useAppLockTimeoutSetting()` hook for the UI (value + setValue, no side effects) and a separate `<AppLockTimer />` component that the shell mounts only when `status === "unlocked"` to run the idle detector + auto-lock. The split avoids duplicate listeners if Settings ever re-uses the hook for the dropdown.

**Tech Stack:** Next.js 16 App Router (no extensions on static imports per `apps/web/AGENTS.md`), TypeScript strict, Tailwind 4 (numeric scale only — `p-4`, `space-y-6`, never `p-md`), React 19 hooks, `@aesmsg/ui` (`Surface`, `GlassCard`, `MaterialIcon`, `FingerprintDisplay`, `Button`, `DangerZone`), Vitest browser mode (Playwright Chromium headless), `@testing-library/react` v16, `@testing-library/user-event`. Material Symbols Outlined icons.

**Working directory note:** This plan assumes execution in a worktree (recommended by `superpowers:subagent-driven-development`) or directly on `main` with a per-task push. Either is fine; the per-task commits are designed to be safely reorderable as a stack.

---

## File map

**Create:**
```
apps/web/app/(app)/settings/page.tsx
apps/web/src/settings/AppLockTimer.tsx
apps/web/src/settings/ComingSoonRow.tsx
apps/web/src/settings/DangerZoneSection.tsx
apps/web/src/settings/DeviceSecuritySection.tsx
apps/web/src/settings/KeyManagementSection.tsx
apps/web/src/settings/SettingsScreen.tsx
apps/web/src/settings/UserSessionHeader.tsx
apps/web/src/settings/use-app-lock-timeout.ts
apps/web/tests/settings/ComingSoonRow.test.tsx
apps/web/tests/settings/DangerZoneSection.test.tsx
apps/web/tests/settings/DeviceSecuritySection.test.tsx
apps/web/tests/settings/KeyManagementSection.test.tsx
apps/web/tests/settings/SettingsScreen.test.tsx
apps/web/tests/settings/UserSessionHeader.test.tsx
apps/web/tests/settings/use-app-lock-timeout.test.ts
apps/web/tests/settings-flow.e2e.test.tsx
```

**Modify:**
```
apps/web/src/lib/identity-context.tsx     (add `unlockedAt: Date` to unlocked variant)
apps/web/src/lib/nav-items.ts             (append Settings entry; extend getActiveNavId)
apps/web/src/lib/authenticated-shell.tsx  (render <AppLockTimer /> when unlocked)
apps/web/tests/identity-context.test.tsx  (assert unlockedAt set on setupNew + unlock)
```

---

## Task 1: Add `unlockedAt: Date` to IdentityContext's unlocked state

**Why:** `<UserSessionHeader>` needs a starting timestamp to compute "Active for Xh Ym". The field is in-memory only, set on every transition into the `unlocked` state.

**Files:**
- Modify: `apps/web/src/lib/identity-context.tsx`
- Modify: `apps/web/tests/identity-context.test.tsx`

- [ ] **Step 1: Write a failing test** — assert `unlockedAt` is present and recent after `setupNew`.

Append to `apps/web/tests/identity-context.test.tsx` (after the existing "transitions to unlocked after setupNew" test):

```tsx
  it("sets unlockedAt to a fresh Date when setupNew transitions to unlocked", async () => {
    let actions!: ReturnType<typeof useIdentityContext>["actions"];
    let observedState: { status: string; unlockedAt?: Date } | null = null;
    function Probe() {
      const { state } = useIdentityContext();
      observedState = state as typeof observedState;
      return null;
    }
    render(
      <IdentityProvider>
        <Probe />
        <ActionTrigger
          onActions={(a) => {
            actions = a;
          }}
        />
      </IdentityProvider>,
    );
    await waitFor(() => expect(observedState?.status).toBe("no_identity"));
    const before = Date.now();
    await act(async () => {
      await actions.setupNew("twelve chars-passphrase");
    });
    const after = Date.now();
    expect(observedState?.status).toBe("unlocked");
    expect(observedState?.unlockedAt).toBeInstanceOf(Date);
    expect(observedState?.unlockedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(observedState?.unlockedAt!.getTime()).toBeLessThanOrEqual(after);
  });

  it("sets a fresh unlockedAt on each unlock() call (not the previous unlock time)", async () => {
    let actions!: ReturnType<typeof useIdentityContext>["actions"];
    let observedState: { status: string; unlockedAt?: Date } | null = null;
    function Probe() {
      const { state } = useIdentityContext();
      observedState = state as typeof observedState;
      return null;
    }
    const passphrase = "twelve chars-passphrase";
    const { unmount } = render(
      <IdentityProvider>
        <Probe />
        <ActionTrigger
          onActions={(a) => {
            actions = a;
          }}
        />
      </IdentityProvider>,
    );
    await waitFor(() => expect(observedState?.status).toBe("no_identity"));
    await act(async () => {
      await actions.setupNew(passphrase);
    });
    unmount();
    render(
      <IdentityProvider>
        <Probe />
        <ActionTrigger
          onActions={(a) => {
            actions = a;
          }}
        />
      </IdentityProvider>,
    );
    await waitFor(() => expect(observedState?.status).toBe("locked"));
    const before = Date.now();
    await act(async () => {
      await actions.unlock(passphrase);
    });
    const after = Date.now();
    expect(observedState?.status).toBe("unlocked");
    expect(observedState?.unlockedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(observedState?.unlockedAt!.getTime()).toBeLessThanOrEqual(after);
  });
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter web test --run -t "sets unlockedAt"
```

Expected: 2 FAIL (`unlockedAt` undefined, not a Date).

- [ ] **Step 3: Implement the field**

In `apps/web/src/lib/identity-context.tsx`:

Update the `IdentityState` type — change the `unlocked` variant to include `unlockedAt`:

```ts
export type IdentityState =
  | { status: "loading" }
  | { status: "no_identity" }
  | { status: "locked"; storedIdentity: StoredIdentity }
  | {
      status: "unlocked";
      storedIdentity: StoredIdentity;
      identity: IdentityKeypair;
      unlockedAt: Date;
    };
```

In `setupNew`, change the final `setState({ status: "unlocked", ... })` call to:

```ts
    setState({
      status: "unlocked",
      storedIdentity: record,
      identity: id,
      unlockedAt: new Date(),
    });
```

In `unlock`, change the `setState({ status: "unlocked", ... })` call to:

```ts
    setState({
      status: "unlocked",
      storedIdentity: current.storedIdentity,
      identity,
      unlockedAt: new Date(),
    });
```

- [ ] **Step 4: Run all identity-context tests**

```bash
pnpm --filter web test --run identity-context
```

Expected: ALL PASS (the new two tests plus all existing ones — `unlockedAt` is additive, no existing assertions break).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/identity-context.tsx apps/web/tests/identity-context.test.tsx
git commit -m "feat(web): IdentityContext exposes unlockedAt on the unlocked state"
```

---

## Task 2: Add `Settings` to `NAV_ITEMS` and extend `getActiveNavId`

**Files:**
- Modify: `apps/web/src/lib/nav-items.ts`
- Create: `apps/web/tests/settings/nav-items.test.ts`

- [ ] **Step 1: Write failing test for `getActiveNavId`**

Create `apps/web/tests/settings/nav-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getActiveNavId, NAV_ITEMS } from "@/src/lib/nav-items";

describe("nav-items", () => {
  it("includes a Settings entry pointing at /settings", () => {
    const settings = NAV_ITEMS.find((item) => item.id === "settings");
    expect(settings).toEqual({
      id: "settings",
      label: "Settings",
      icon: "settings",
      href: "/settings",
    });
  });

  it("places Settings last", () => {
    expect(NAV_ITEMS[NAV_ITEMS.length - 1]?.id).toBe("settings");
  });

  it("getActiveNavId returns 'settings' for /settings", () => {
    expect(getActiveNavId("/settings")).toBe("settings");
  });

  it("getActiveNavId returns 'settings' for nested /settings/* paths", () => {
    expect(getActiveNavId("/settings/anything")).toBe("settings");
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter web test --run nav-items
```

Expected: FAIL — `settings` entry does not exist; `getActiveNavId` returns `""`.

- [ ] **Step 3: Implement** — replace `apps/web/src/lib/nav-items.ts` with:

```ts
import type { SideNavItem } from "@aesmsg/ui";

export const NAV_ITEMS: SideNavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/" },
  { id: "create", label: "New Message", icon: "mail", href: "/create" },
  { id: "links", label: "Links", icon: "link", href: "/links" },
  { id: "contacts", label: "Contacts", icon: "group", href: "/contacts" },
  { id: "keys", label: "Keys", icon: "key", href: "/keys" },
  { id: "settings", label: "Settings", icon: "settings", href: "/settings" },
];

export function getActiveNavId(pathname: string): string {
  if (pathname === "/") return "dashboard";
  if (pathname.startsWith("/create")) return "create";
  if (pathname.startsWith("/links")) return "links";
  if (pathname.startsWith("/contacts")) return "contacts";
  if (pathname.startsWith("/keys")) return "keys";
  if (pathname.startsWith("/settings")) return "settings";
  return "";
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run nav-items
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/nav-items.ts apps/web/tests/settings/nav-items.test.ts
git commit -m "feat(web): add Settings entry to SideNav and getActiveNavId"
```

---

## Task 3: `ComingSoonRow` primitive component

**Why:** Four rows across Settings render as "Coming soon" placeholders with identical layout (left-aligned title + description, right-aligned neutral tag). Factor into a tiny shared component.

**Files:**
- Create: `apps/web/src/settings/ComingSoonRow.tsx`
- Create: `apps/web/tests/settings/ComingSoonRow.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/settings/ComingSoonRow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComingSoonRow } from "@/src/settings/ComingSoonRow";

describe("ComingSoonRow", () => {
  it("renders title and description", () => {
    render(<ComingSoonRow title="Biometric Authentication" description="Require FaceID" />);
    expect(screen.getByText("Biometric Authentication")).toBeInTheDocument();
    expect(screen.getByText("Require FaceID")).toBeInTheDocument();
  });

  it("renders a 'Coming soon' tag", () => {
    render(<ComingSoonRow title="X" description="Y" />);
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("has no interactive elements", () => {
    const { container } = render(<ComingSoonRow title="X" description="Y" />);
    expect(container.querySelectorAll("button, input, select, a")).toHaveLength(0);
  });

  it("applies error tone when `tone='danger'`", () => {
    render(<ComingSoonRow title="Delete Account" description="Erase" tone="danger" />);
    expect(screen.getByText("Delete Account")).toHaveClass("text-error");
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter web test --run ComingSoonRow
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/settings/ComingSoonRow.tsx`:

```tsx
"use client";

export interface ComingSoonRowProps {
  title: string;
  description: string;
  tone?: "neutral" | "danger";
}

export function ComingSoonRow({ title, description, tone = "neutral" }: ComingSoonRowProps) {
  const titleClass = tone === "danger" ? "font-body-md font-medium text-error" : "font-body-md font-medium text-on-surface";
  const descClass = tone === "danger" ? "text-xs text-error/60" : "text-xs text-on-surface-variant";
  const tagClass = tone === "danger" ? "font-label-sm text-error/60" : "font-label-sm text-on-surface-variant";

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="space-y-1">
        <p className={titleClass}>{title}</p>
        <p className={descClass}>{description}</p>
      </div>
      <span className={tagClass}>Coming soon</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run ComingSoonRow
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/settings/ComingSoonRow.tsx apps/web/tests/settings/ComingSoonRow.test.tsx
git commit -m "feat(web): add ComingSoonRow primitive for Settings placeholders"
```

---

## Task 4: `useAppLockTimeoutSetting` hook (value + setValue, no side effects)

**Why:** Settings UI needs a value + setter that reads/writes `localStorage["aesmsg.app-lock-timeout"]`. Split off from idle-detection logic so the dropdown can subscribe without attaching duplicate listeners.

**Files:**
- Create: `apps/web/src/settings/use-app-lock-timeout.ts`
- Create: `apps/web/tests/settings/use-app-lock-timeout.test.ts`

- [ ] **Step 1: Write failing tests for the setting hook**

Create `apps/web/tests/settings/use-app-lock-timeout.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AppLockTimeout,
  STORAGE_KEY,
  useAppLockTimeoutSetting,
} from "@/src/settings/use-app-lock-timeout";

describe("useAppLockTimeoutSetting", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("defaults to 'never' when localStorage is empty", () => {
    const { result } = renderHook(() => useAppLockTimeoutSetting());
    expect(result.current.value).toBe("never");
  });

  it("returns the stored value when localStorage holds a valid AppLockTimeout", () => {
    localStorage.setItem(STORAGE_KEY, "5m");
    const { result } = renderHook(() => useAppLockTimeoutSetting());
    expect(result.current.value).toBe("5m");
  });

  it("falls back to 'never' for an unparseable stored value", () => {
    localStorage.setItem(STORAGE_KEY, "garbage");
    const { result } = renderHook(() => useAppLockTimeoutSetting());
    expect(result.current.value).toBe("never");
  });

  it("setValue updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useAppLockTimeoutSetting());
    act(() => {
      result.current.setValue("15m");
    });
    expect(result.current.value).toBe("15m");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("15m");
  });

  it("setValue to 'never' writes 'never' (not null) to localStorage", () => {
    const { result } = renderHook(() => useAppLockTimeoutSetting());
    act(() => {
      result.current.setValue("5m");
    });
    act(() => {
      result.current.setValue("never");
    });
    expect(result.current.value).toBe("never");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("never");
  });

  it("exposes a stable list of valid values", () => {
    const valid: AppLockTimeout[] = ["never", "1m", "5m", "15m", "1h"];
    for (const v of valid) {
      localStorage.setItem(STORAGE_KEY, v);
      const { result } = renderHook(() => useAppLockTimeoutSetting());
      expect(result.current.value).toBe(v);
    }
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter web test --run use-app-lock-timeout
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the setting hook**

Create `apps/web/src/settings/use-app-lock-timeout.ts`:

```ts
"use client";

import { useCallback, useState } from "react";

export type AppLockTimeout = "never" | "1m" | "5m" | "15m" | "1h";

export const STORAGE_KEY = "aesmsg.app-lock-timeout";

const VALID: ReadonlySet<AppLockTimeout> = new Set(["never", "1m", "5m", "15m", "1h"]);

function readStored(): AppLockTimeout {
  if (typeof window === "undefined") return "never";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw && VALID.has(raw as AppLockTimeout)) return raw as AppLockTimeout;
  return "never";
}

export interface UseAppLockTimeoutSettingResult {
  value: AppLockTimeout;
  setValue: (next: AppLockTimeout) => void;
}

export function useAppLockTimeoutSetting(): UseAppLockTimeoutSettingResult {
  const [value, setLocal] = useState<AppLockTimeout>(readStored);

  const setValue = useCallback((next: AppLockTimeout) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    setLocal(next);
  }, []);

  return { value, setValue };
}

export const TIMEOUT_MS: Record<Exclude<AppLockTimeout, "never">, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
};
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run use-app-lock-timeout
```

Expected: ALL 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/settings/use-app-lock-timeout.ts apps/web/tests/settings/use-app-lock-timeout.test.ts
git commit -m "feat(web): useAppLockTimeoutSetting hook (localStorage-backed)"
```

---

## Task 5: `useAppLockTimer` hook (idle detection + auto-lock)

**Why:** The behavioral half of App Lock Timeout. Reads the setting, attaches idle listeners, manages the countdown with visibility-aware pause/resume, fires `IdentityContext.lock()` on expiry.

**Files:**
- Modify: `apps/web/src/settings/use-app-lock-timeout.ts` (extend with `useAppLockTimer`)
- Modify: `apps/web/tests/settings/use-app-lock-timeout.test.ts` (append behavior tests)

- [ ] **Step 1: Write failing tests for the timer hook**

Append to `apps/web/tests/settings/use-app-lock-timeout.test.ts`:

```ts
import { useAppLockTimer } from "@/src/settings/use-app-lock-timeout";
import { vi } from "vitest";

describe("useAppLockTimer", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(STORAGE_KEY);
  });

  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("'never' attaches no listeners and never calls lock()", () => {
    const lock = vi.fn();
    renderHook(() => useAppLockTimer({ status: "unlocked", lock, value: "never" }));
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
    expect(lock).not.toHaveBeenCalled();
  });

  it("'1m' fires lock() after 60 seconds of inactivity", () => {
    const lock = vi.fn();
    renderHook(() => useAppLockTimer({ status: "unlocked", lock, value: "1m" }));
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("'1m' resets when a keydown event fires", () => {
    const lock = vi.fn();
    renderHook(() => useAppLockTimer({ status: "unlocked", lock, value: "1m" }));
    vi.advanceTimersByTime(50_000);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    vi.advanceTimersByTime(50_000); // 100s total, only 50s since keydown
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000); // now 60s since keydown
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("'5m' tab hidden for 2 minutes then visible: resumes with ~3 minutes remaining", () => {
    const lock = vi.fn();
    renderHook(() => useAppLockTimer({ status: "unlocked", lock, value: "5m" }));
    // 1 minute elapses, then hidden
    vi.advanceTimersByTime(60_000);
    setHidden(true);
    // 2 minutes pass hidden — timer must NOT fire
    vi.advanceTimersByTime(120_000);
    expect(lock).not.toHaveBeenCalled();
    setHidden(false);
    // Resume — original 5m budget had 4m left at hide; minus 2m hidden = 2m remaining
    vi.advanceTimersByTime(120_000 - 1);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("'5m' tab hidden for 6 minutes then visible: lock fires immediately on visible", () => {
    const lock = vi.fn();
    renderHook(() => useAppLockTimer({ status: "unlocked", lock, value: "5m" }));
    setHidden(true);
    vi.advanceTimersByTime(6 * 60_000);
    expect(lock).not.toHaveBeenCalled();
    setHidden(false);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("changing value from '5m' to 'never' cancels the timer and detaches listeners", () => {
    const lock = vi.fn();
    const { rerender } = renderHook(
      ({ value }: { value: AppLockTimeout }) =>
        useAppLockTimer({ status: "unlocked", lock, value }),
      { initialProps: { value: "5m" as AppLockTimeout } },
    );
    vi.advanceTimersByTime(60_000);
    rerender({ value: "never" });
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(lock).not.toHaveBeenCalled();
  });

  it("status !== 'unlocked' attaches nothing and never calls lock()", () => {
    const lock = vi.fn();
    renderHook(() => useAppLockTimer({ status: "locked", lock, value: "5m" }));
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(lock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter web test --run use-app-lock-timeout
```

Expected: FAIL — `useAppLockTimer` does not exist.

- [ ] **Step 3: Implement `useAppLockTimer`**

In `apps/web/src/settings/use-app-lock-timeout.ts`, **merge** `useEffect` and `useRef` into the existing React import (do NOT add a second `import { … } from "react"` line — it will fail lint):

```ts
import { useCallback, useEffect, useRef, useState } from "react";
```

Then append, after the existing `TIMEOUT_MS` export:

```ts
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

export interface UseAppLockTimerInput {
  status: "loading" | "no_identity" | "locked" | "unlocked";
  value: AppLockTimeout;
  lock: () => void;
}

export function useAppLockTimer({ status, value, lock }: UseAppLockTimerInput): void {
  const lockRef = useRef(lock);
  lockRef.current = lock;

  useEffect(() => {
    if (status !== "unlocked" || value === "never") return;
    const timeoutMs = TIMEOUT_MS[value];
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let timerStartedAt = Date.now();
    let remainingAtHide: number | null = null;

    const scheduleLock = (durationMs: number) => {
      if (timerId !== null) clearTimeout(timerId);
      timerStartedAt = Date.now();
      timerId = setTimeout(() => {
        lockRef.current();
      }, durationMs);
    };

    const resetTimer = () => {
      if (document.visibilityState === "hidden") return;
      scheduleLock(timeoutMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timerId !== null) {
          const elapsed = Date.now() - timerStartedAt;
          remainingAtHide = Math.max(0, timeoutMs - elapsed);
          clearTimeout(timerId);
          timerId = null;
        } else {
          remainingAtHide = timeoutMs;
        }
      } else {
        if (remainingAtHide === null) {
          scheduleLock(timeoutMs);
          return;
        }
        if (remainingAtHide <= 0) {
          remainingAtHide = null;
          lockRef.current();
          return;
        }
        scheduleLock(remainingAtHide);
        remainingAtHide = null;
      }
    };

    scheduleLock(timeoutMs);
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timerId !== null) clearTimeout(timerId);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, resetTimer);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status, value]);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run use-app-lock-timeout
```

Expected: ALL PASS (6 setting tests + 7 timer tests).

If the visibility-hidden-then-fire-immediately test fails, the most likely cause is that `setTimeout(0)` callbacks still run under `vi.advanceTimersByTime(0)`. In that case, replace the synchronous `lockRef.current()` call inside `onVisibilityChange` with `scheduleLock(0)` — the test will still pass because the assertion runs after the visibility event has been dispatched and the microtask flushed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/settings/use-app-lock-timeout.ts apps/web/tests/settings/use-app-lock-timeout.test.ts
git commit -m "feat(web): useAppLockTimer idle-detection hook with visibility pause/resume"
```

---

## Task 6: `<AppLockTimer />` component + mount in `AuthenticatedShell`

**Why:** The shell is the only sensible mount point — it has access to `IdentityContext` and lives above every route. The component composes the two hooks (setting + timer) and renders nothing.

**Files:**
- Create: `apps/web/src/settings/AppLockTimer.tsx`
- Modify: `apps/web/src/lib/authenticated-shell.tsx`

- [ ] **Step 1: Write failing integration test**

Append to `apps/web/tests/settings/use-app-lock-timeout.test.ts`:

```tsx
import { render } from "@testing-library/react";
import { AppLockTimer } from "@/src/settings/AppLockTimer";
import { IdentityProvider } from "@/src/lib/identity-context";
import { waitFor } from "@testing-library/react";

describe("<AppLockTimer />", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    vi.useRealTimers();
  });

  it("renders nothing and does not throw when mounted under IdentityProvider", async () => {
    const { container } = render(
      <IdentityProvider>
        <AppLockTimer />
      </IdentityProvider>,
    );
    await waitFor(() => {
      // IdentityProvider has resolved to no_identity — AppLockTimer must still be a no-op
      expect(container.innerHTML).toBe("");
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter web test --run AppLockTimer
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/settings/AppLockTimer.tsx`:

```tsx
"use client";

import { useIdentity } from "@/src/hooks/use-identity";
import { useAppLockTimer, useAppLockTimeoutSetting } from "./use-app-lock-timeout";

export function AppLockTimer() {
  const { state, actions } = useIdentity();
  const { value } = useAppLockTimeoutSetting();
  useAppLockTimer({ status: state.status, value, lock: actions.lock });
  return null;
}
```

- [ ] **Step 4: Wire into `AuthenticatedShell`**

Modify `apps/web/src/lib/authenticated-shell.tsx`. Add the import and render `<AppLockTimer />` next to `<SideNav>` in the unlocked branch:

```tsx
import { AppLockTimer } from "@/src/settings/AppLockTimer";
```

In the `state.status === "unlocked"` branch, insert `<AppLockTimer />` as a sibling of `<SideNav>`:

```tsx
  if (state.status === "unlocked") {
    return (
      <div className="min-h-dvh bg-background text-on-surface">
        <AppLockTimer />
        <SideNav items={NAV_ITEMS} activeId={getActiveNavId(pathname)} LinkComponent={NextLink} />
        <div className="md:ml-64 min-h-dvh">{children}</div>
      </div>
    );
  }
```

(Mount only when unlocked is the cleanest approach — the hook returns early in other states anyway, but skipping the mount avoids running the effect tear-up/down at all.)

- [ ] **Step 5: Run tests**

```bash
pnpm --filter web test --run AppLockTimer
pnpm --filter web test --run keys-page
```

Expected: ALL PASS. (`keys-page.e2e.test.tsx` exercises the unlocked branch end-to-end; regression check that `<AppLockTimer />` doesn't crash the shell.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/settings/AppLockTimer.tsx apps/web/src/lib/authenticated-shell.tsx apps/web/tests/settings/use-app-lock-timeout.test.ts
git commit -m "feat(web): mount <AppLockTimer /> inside AuthenticatedShell"
```

---

## Task 7: `<UserSessionHeader />`

**Files:**
- Create: `apps/web/src/settings/UserSessionHeader.tsx`
- Create: `apps/web/tests/settings/UserSessionHeader.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/settings/UserSessionHeader.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserSessionHeader } from "@/src/settings/UserSessionHeader";

describe("UserSessionHeader", () => {
  it("renders the brand label and VERIFIED SESSION pill", () => {
    render(<UserSessionHeader unlockedAt={new Date()} />);
    expect(screen.getByText("aesmsg")).toBeInTheDocument();
    expect(screen.getByText("VERIFIED SESSION")).toBeInTheDocument();
  });

  it("renders 'Active for' duration in hours and minutes", () => {
    const past = new Date(Date.now() - (2 * 60 * 60 * 1000 + 15 * 60 * 1000)); // 2h 15m ago
    render(<UserSessionHeader unlockedAt={past} />);
    expect(screen.getByText("Active for 2h 15m")).toBeInTheDocument();
  });

  it("renders 'Active for 0h Xm' for under-one-hour sessions", () => {
    const past = new Date(Date.now() - 7 * 60 * 1000);
    render(<UserSessionHeader unlockedAt={past} />);
    expect(screen.getByText("Active for 0h 7m")).toBeInTheDocument();
  });

  it("renders the person material icon as the avatar placeholder", () => {
    const { container } = render(<UserSessionHeader unlockedAt={new Date()} />);
    expect(container.querySelector("[data-icon='person']")).toBeInTheDocument();
  });
});
```

(Note: `MaterialIcon` renders the icon name as element text. We check `data-icon` attribute if available; if not, adjust to `expect(container.textContent).toContain("person")` after inspecting the actual rendered output.)

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter web test --run UserSessionHeader
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/settings/UserSessionHeader.tsx`:

```tsx
"use client";

import { GlassCard, MaterialIcon } from "@aesmsg/ui";
import { useEffect, useState } from "react";

export interface UserSessionHeaderProps {
  unlockedAt: Date;
}

function formatDuration(unlockedAt: Date): string {
  const totalMinutes = Math.max(0, Math.floor((Date.now() - unlockedAt.getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `Active for ${hours}h ${minutes}m`;
}

export function UserSessionHeader({ unlockedAt }: UserSessionHeaderProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <GlassCard className="p-4 flex items-center gap-4">
      <div className="w-16 h-16 rounded-full border-2 border-primary/20 bg-surface-container flex items-center justify-center text-on-surface-variant">
        <MaterialIcon name="person" className="text-[32px]" />
      </div>
      <div className="space-y-1">
        <h2 className="font-h2 text-h2 font-semibold text-on-surface">aesmsg</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-emerald-500 border border-emerald-500/30 px-2 py-[1px] rounded-full uppercase font-bold tracking-tighter">
            VERIFIED SESSION
          </span>
          <p className="font-label-sm text-on-surface-variant">{formatDuration(unlockedAt)}</p>
        </div>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run UserSessionHeader
```

If the `data-icon` selector fails, inspect the actual `MaterialIcon` markup via `screen.debug()` and adjust the assertion (typical fix: query for the element with text content `"person"` since Material Symbols Outlined renders the icon name as the element's text).

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/settings/UserSessionHeader.tsx apps/web/tests/settings/UserSessionHeader.test.tsx
git commit -m "feat(web): UserSessionHeader with Active-for duration and Verified Session pill"
```

---

## Task 8: `<DeviceSecuritySection />`

**Files:**
- Create: `apps/web/src/settings/DeviceSecuritySection.tsx`
- Create: `apps/web/tests/settings/DeviceSecuritySection.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/settings/DeviceSecuritySection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DeviceSecuritySection } from "@/src/settings/DeviceSecuritySection";
import { STORAGE_KEY } from "@/src/settings/use-app-lock-timeout";

describe("DeviceSecuritySection", () => {
  it("renders the DEVICE SECURITY heading", () => {
    render(<DeviceSecuritySection />);
    expect(screen.getByText("DEVICE SECURITY")).toBeInTheDocument();
  });

  it("renders Biometric Authentication as 'Coming soon'", () => {
    render(<DeviceSecuritySection />);
    expect(screen.getByText("Biometric Authentication")).toBeInTheDocument();
    expect(
      screen
        .getByText("Biometric Authentication")
        .closest("div")
        ?.parentElement?.textContent,
    ).toContain("Coming soon");
  });

  it("renders App Lock Timeout with a select defaulting to 'Never'", () => {
    localStorage.removeItem(STORAGE_KEY);
    render(<DeviceSecuritySection />);
    const select = screen.getByLabelText("App Lock Timeout") as HTMLSelectElement;
    expect(select.value).toBe("never");
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "never",
      "1m",
      "5m",
      "15m",
      "1h",
    ]);
  });

  it("changing the select persists the new value to localStorage", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(<DeviceSecuritySection />);
    const select = screen.getByLabelText("App Lock Timeout") as HTMLSelectElement;
    await userEvent.selectOptions(select, "5m");
    expect(select.value).toBe("5m");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("5m");
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter web test --run DeviceSecuritySection
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/settings/DeviceSecuritySection.tsx`:

```tsx
"use client";

import { GlassCard, MaterialIcon } from "@aesmsg/ui";
import { ComingSoonRow } from "./ComingSoonRow";
import { type AppLockTimeout, useAppLockTimeoutSetting } from "./use-app-lock-timeout";

const TIMEOUT_LABELS: Record<AppLockTimeout, string> = {
  never: "Never",
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "1h": "1 hour",
};

const OPTIONS: AppLockTimeout[] = ["never", "1m", "5m", "15m", "1h"];

export function DeviceSecuritySection() {
  const { value, setValue } = useAppLockTimeoutSetting();

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-2">
        <MaterialIcon name="shield_lock" className="text-primary text-[20px]" />
        <h3 className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">
          DEVICE SECURITY
        </h3>
      </div>
      <div className="space-y-2">
        <GlassCard className="p-0">
          <ComingSoonRow
            title="Biometric Authentication"
            description="Require FaceID or TouchID before accessing messages."
          />
        </GlassCard>
        <GlassCard className="p-0">
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="space-y-1">
              <label htmlFor="app-lock-timeout" className="font-body-md font-medium text-on-surface block">
                App Lock Timeout
              </label>
              <p className="text-xs text-on-surface-variant">
                Lock the vault after this much inactivity.
              </p>
            </div>
            <select
              id="app-lock-timeout"
              value={value}
              onChange={(e) => setValue(e.target.value as AppLockTimeout)}
              className="bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface font-label-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {TIMEOUT_LABELS[opt]}
                </option>
              ))}
            </select>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run DeviceSecuritySection
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/settings/DeviceSecuritySection.tsx apps/web/tests/settings/DeviceSecuritySection.test.tsx
git commit -m "feat(web): DeviceSecuritySection with App Lock Timeout select"
```

---

## Task 9: `<KeyManagementSection />`

**Files:**
- Create: `apps/web/src/settings/KeyManagementSection.tsx`
- Create: `apps/web/tests/settings/KeyManagementSection.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/settings/KeyManagementSection.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KeyManagementSection } from "@/src/settings/KeyManagementSection";

const TEST_PK = "amk1:abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMN";

describe("KeyManagementSection", () => {
  it("renders the KEY MANAGEMENT heading", () => {
    render(<KeyManagementSection publicKeyString={TEST_PK} />);
    expect(screen.getByText("KEY MANAGEMENT")).toBeInTheDocument();
  });

  it("renders Rotate and Export Backup as Coming Soon rows", () => {
    render(<KeyManagementSection publicKeyString={TEST_PK} />);
    expect(screen.getByText("Rotate Encryption Key")).toBeInTheDocument();
    expect(screen.getByText("Export Encrypted Backup")).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
  });

  it("renders the fingerprint (asynchronously computed)", async () => {
    render(<KeyManagementSection publicKeyString={TEST_PK} />);
    await waitFor(() => {
      expect(screen.getByText(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/)).toBeInTheDocument();
    });
  });

  it("Copy button writes the public key to the clipboard and surfaces 'Copied'", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<KeyManagementSection publicKeyString={TEST_PK} />);
    await waitFor(() => screen.getByText(/^[0-9A-F]{4}/));
    const copyBtn = screen.getByRole("button", { name: /copy public key/i });
    await userEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith(TEST_PK);
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter web test --run KeyManagementSection
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/settings/KeyManagementSection.tsx`:

```tsx
"use client";

import { type Fingerprint, fingerprint, type PublicKeyString } from "@aesmsg/crypto";
import { Button, FingerprintDisplay, GlassCard, MaterialIcon } from "@aesmsg/ui";
import { useEffect, useState } from "react";
import { ComingSoonRow } from "./ComingSoonRow";

export interface KeyManagementSectionProps {
  publicKeyString: PublicKeyString;
}

export function KeyManagementSection({ publicKeyString }: KeyManagementSectionProps) {
  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const f = await fingerprint(publicKeyString);
      if (!cancelled) setFp(f);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKeyString]);

  const onCopy = async () => {
    await navigator.clipboard.writeText(publicKeyString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-2">
        <MaterialIcon name="vpn_key" className="text-primary text-[20px]" />
        <h3 className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">
          KEY MANAGEMENT
        </h3>
      </div>
      <div className="space-y-2">
        <GlassCard className="p-0">
          <ComingSoonRow
            title="Rotate Encryption Key"
            description="Generate a new primary keypair and replace your active identity."
          />
        </GlassCard>
        <GlassCard className="p-0">
          <ComingSoonRow
            title="Export Encrypted Backup"
            description="Download your wrapped private key as a password-protected JSON file."
          />
        </GlassCard>
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="font-body-md font-medium text-on-surface">Public Key Fingerprint</p>
            <Button
              variant="secondary"
              icon={copied ? "check" : "content_copy"}
              onClick={onCopy}
              aria-label="Copy public key"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          {fp && <FingerprintDisplay fingerprint={fp} truncate={4} />}
        </GlassCard>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run KeyManagementSection
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/settings/KeyManagementSection.tsx apps/web/tests/settings/KeyManagementSection.test.tsx
git commit -m "feat(web): KeyManagementSection with Fingerprint+Copy and Coming Soon rows"
```

---

## Task 10: `<DangerZoneSection />`

**Why:** Wipe row wired to existing `<WipeConfirmModal>`; Delete Account row is a "Coming soon" placeholder. Inlined container (not `<DangerZone>`) since the shared component handles one action only.

**Files:**
- Create: `apps/web/src/settings/DangerZoneSection.tsx`
- Create: `apps/web/tests/settings/DangerZoneSection.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/settings/DangerZoneSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DangerZoneSection } from "@/src/settings/DangerZoneSection";

describe("DangerZoneSection", () => {
  it("renders the DANGER ZONE heading", () => {
    render(<DangerZoneSection onWipe={() => {}} />);
    expect(screen.getByText("DANGER ZONE")).toBeInTheDocument();
  });

  it("renders Wipe Private Key row and Delete Account 'Coming soon' row", () => {
    render(<DangerZoneSection onWipe={() => {}} />);
    expect(screen.getByText("Wipe Private Key")).toBeInTheDocument();
    expect(screen.getByText("Delete Account")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("clicking Wipe Private Key row invokes onWipe", async () => {
    const onWipe = vi.fn();
    render(<DangerZoneSection onWipe={onWipe} />);
    await userEvent.click(screen.getByRole("button", { name: /wipe private key/i }));
    expect(onWipe).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter web test --run DangerZoneSection
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/settings/DangerZoneSection.tsx`:

```tsx
"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { ComingSoonRow } from "./ComingSoonRow";

export interface DangerZoneSectionProps {
  onWipe: () => void;
}

export function DangerZoneSection({ onWipe }: DangerZoneSectionProps) {
  return (
    <section className="space-y-4 pt-8">
      <div className="flex items-center gap-2 px-2">
        <MaterialIcon name="warning" className="text-error text-[20px]" />
        <h3 className="font-label-sm text-label-sm uppercase tracking-widest text-error">
          DANGER ZONE
        </h3>
      </div>
      <div className="rounded-xl overflow-hidden border border-error/20">
        <button
          type="button"
          onClick={onWipe}
          className="w-full flex items-center justify-between gap-4 p-4 bg-error/5 hover:bg-error/10 transition-colors border-b border-error/10 text-left"
          aria-label="Wipe Private Key"
        >
          <div className="space-y-1">
            <p className="font-body-md font-medium text-error">Wipe Private Key</p>
            <p className="text-xs text-error/60">
              Irreversible. All encrypted messages addressed to this identity will become
              unreadable.
            </p>
          </div>
          <MaterialIcon name="delete_forever" className="text-error" />
        </button>
        <ComingSoonRow
          title="Delete Account"
          description="Permanently erase server-side metadata."
          tone="danger"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run DangerZoneSection
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/settings/DangerZoneSection.tsx apps/web/tests/settings/DangerZoneSection.test.tsx
git commit -m "feat(web): DangerZoneSection with Wipe and Delete Account placeholder"
```

---

## Task 11: `<SettingsScreen />` assembly

**Files:**
- Create: `apps/web/src/settings/SettingsScreen.tsx`
- Create: `apps/web/tests/settings/SettingsScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/settings/SettingsScreen.test.tsx`:

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { IdentityProvider, useIdentityContext } from "@/src/lib/identity-context";
import { SettingsScreen } from "@/src/settings/SettingsScreen";

import { useEffect, type ReactNode } from "react";

function Setup({ children }: { children: ReactNode }) {
  return <IdentityProvider>{children}</IdentityProvider>;
}

function Bootstrap({ onReady }: { onReady: () => void }) {
  const { state, actions } = useIdentityContext();
  useEffect(() => {
    if (state.status === "no_identity") {
      void actions.setupNew("twelve chars-passphrase").then(onReady);
    }
  }, [state.status, actions, onReady]);
  return null;
}

async function renderWithIdentity() {
  let ready = false;
  const utils = render(
    <Setup>
      <Bootstrap onReady={() => (ready = true)} />
      <SettingsScreen />
    </Setup>,
  );
  await waitFor(() => expect(ready).toBe(true), { timeout: 5000 });
  await waitFor(() => expect(screen.queryByText("Settings & Security")).toBeInTheDocument());
  return utils;
}

describe("SettingsScreen", () => {
  it("renders the page header", async () => {
    await renderWithIdentity();
    expect(screen.getByText("Settings & Security")).toBeInTheDocument();
    expect(
      screen.getByText("Configure institutional-grade protection for your encrypted vault."),
    ).toBeInTheDocument();
  });

  it("renders all four sections", async () => {
    await renderWithIdentity();
    expect(screen.getByText("DEVICE SECURITY")).toBeInTheDocument();
    expect(screen.getByText("KEY MANAGEMENT")).toBeInTheDocument();
    expect(screen.getByText("DANGER ZONE")).toBeInTheDocument();
    expect(screen.getByText("VERIFIED SESSION")).toBeInTheDocument();
  });

  it("clicking Wipe Private Key opens the WipeConfirmModal", async () => {
    await renderWithIdentity();
    await userEvent.click(screen.getByRole("button", { name: /wipe private key/i }));
    expect(
      screen.getByRole("heading", { name: /wipe private key/i }),
    ).toBeInTheDocument();
    // Modal also has the "Type WIPE to confirm" label
    expect(screen.getByLabelText(/type wipe to confirm/i)).toBeInTheDocument();
  });

  it("renders 'no identity' fallback when state is not unlocked", () => {
    // SettingsScreen requires an unlocked state; this asserts we don't crash on the
    // intermediate states by reading useIdentity directly. AuthenticatedShell handles
    // the redirect in production; SettingsScreen rendering with a non-unlocked state
    // should produce a minimal "not unlocked" notice rather than crash.
    render(
      <Setup>
        <SettingsScreen />
      </Setup>,
    );
    // We don't bootstrap an identity; SettingsScreen sees status === "no_identity"
    // and should render nothing (or a no-op placeholder).
    expect(screen.queryByText("Settings & Security")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter web test --run SettingsScreen
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/settings/SettingsScreen.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useIdentity } from "@/src/hooks/use-identity";
import { WipeConfirmModal } from "@/src/keys/WipeConfirmModal";
import { DangerZoneSection } from "./DangerZoneSection";
import { DeviceSecuritySection } from "./DeviceSecuritySection";
import { KeyManagementSection } from "./KeyManagementSection";
import { UserSessionHeader } from "./UserSessionHeader";

export function SettingsScreen() {
  const { state, actions } = useIdentity();
  const [wipeOpen, setWipeOpen] = useState(false);

  if (state.status !== "unlocked") return null;

  return (
    <main className="px-4 md:px-12 py-12">
      <div className="max-w-[640px] mx-auto w-full space-y-8">
        <header className="space-y-2">
          <h1 className="font-h1 text-h1 font-semibold text-on-surface">Settings &amp; Security</h1>
          <p className="font-body-md text-on-surface-variant">
            Configure institutional-grade protection for your encrypted vault.
          </p>
        </header>

        <UserSessionHeader unlockedAt={state.unlockedAt} />
        <DeviceSecuritySection />
        <KeyManagementSection publicKeyString={state.storedIdentity.publicKeyString} />
        <DangerZoneSection onWipe={() => setWipeOpen(true)} />
      </div>

      <WipeConfirmModal
        open={wipeOpen}
        onCancel={() => setWipeOpen(false)}
        onConfirm={async () => {
          await actions.wipe();
          setWipeOpen(false);
        }}
      />
    </main>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter web test --run SettingsScreen
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/settings/SettingsScreen.tsx apps/web/tests/settings/SettingsScreen.test.tsx
git commit -m "feat(web): SettingsScreen assembles all four sections + WipeConfirmModal"
```

---

## Task 12: `/settings` route page

**Files:**
- Create: `apps/web/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create the route file**

(No standalone test — the page file just re-exports; coverage comes from the e2e flow in Task 13.)

Create `apps/web/app/(app)/settings/page.tsx`:

```tsx
import { SettingsScreen } from "@/src/settings/SettingsScreen";

export default function SettingsPage() {
  return <SettingsScreen />;
}
```

- [ ] **Step 2: Smoke-check the dev server**

```bash
pnpm --filter web dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/settings
```

Expected: `200`.

Kill the dev server when done: `kill %1`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/settings/page.tsx
git commit -m "feat(web): /settings route renders SettingsScreen"
```

---

## Task 13: End-to-end flow test

**Files:**
- Create: `apps/web/tests/settings-flow.e2e.test.tsx`

- [ ] **Step 1: Write the e2e test**

Create `apps/web/tests/settings-flow.e2e.test.tsx`:

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import SettingsPage from "../app/(app)/settings/page";
import { IdentityProvider, useIdentityContext } from "../src/lib/identity-context";

function Probe() {
  const { state } = useIdentityContext();
  return <div data-testid="status">{state.status}</div>;
}

function Bootstrap({ passphrase, onReady }: { passphrase: string; onReady: () => void }) {
  const { state, actions } = useIdentityContext();
  useEffect(() => {
    if (state.status === "no_identity") {
      void actions.setupNew(passphrase).then(onReady);
    }
  }, [state.status, actions, passphrase, onReady]);
  return null;
}

describe("/settings end-to-end happy path", () => {
  it("renders Settings & Security under an unlocked identity, changing App Lock Timeout persists", async () => {
    let ready = false;
    render(
      <IdentityProvider>
        <Probe />
        <Bootstrap passphrase="twelve chars-passphrase" onReady={() => (ready = true)} />
        <SettingsPage />
      </IdentityProvider>,
    );

    await waitFor(() => expect(ready).toBe(true), { timeout: 5000 });
    await waitFor(() => expect(screen.queryByText("Settings & Security")).toBeInTheDocument());

    const select = screen.getByLabelText("App Lock Timeout") as HTMLSelectElement;
    await userEvent.selectOptions(select, "1m");
    expect(select.value).toBe("1m");
    expect(localStorage.getItem("aesmsg.app-lock-timeout")).toBe("1m");

    // Reset to never so the rest of the suite doesn't inherit a 1-minute timer.
    await userEvent.selectOptions(select, "never");
  });

  it("wipe flow from /settings transitions identity to no_identity", async () => {
    let ready = false;
    render(
      <IdentityProvider>
        <Probe />
        <Bootstrap passphrase="twelve chars-passphrase" onReady={() => (ready = true)} />
        <SettingsPage />
      </IdentityProvider>,
    );
    await waitFor(() => expect(ready).toBe(true), { timeout: 5000 });
    await waitFor(() => expect(screen.queryByText("Settings & Security")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /wipe private key/i }));
    await userEvent.type(screen.getByLabelText(/type wipe to confirm/i), "WIPE");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^wipe private key$/i }));
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no_identity"));
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter web test --run settings-flow
```

Expected: BOTH PASS. If the wipe-button button-name lookup is ambiguous (one in the danger-zone row, one inside the modal), tighten the selector to disambiguate by section.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/settings-flow.e2e.test.tsx
git commit -m "test(web): /settings e2e — timeout select persistence + wipe flow"
```

---

## Task 14: Verification pass — typecheck, lint, full test, manual

**Files:** none — verification only.

- [ ] **Step 1: Typecheck the workspace**

```bash
pnpm typecheck
```

Expected: `0 errors`. If any errors surface in files Slice 11 touched, fix them. If errors surface in unrelated files, halt and ask — that's not Slice 11's responsibility.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: `0 errors`. Apply `pnpm lint:fix` for any auto-fixable issues; commit the fix as `chore(web): biome autofix on Slice 11 files`.

- [ ] **Step 3: Full test suite**

```bash
pnpm test
```

Expected: ALL PASS, including pre-existing tests (`identity-context`, `keys-page`, `links-flow`, `contacts-flow`, etc.). Pay attention to:
- `identity-context.test.tsx` — the new `unlockedAt` field must not break older assertions.
- `keys-page.e2e.test.tsx` — `<AppLockTimer />` mounting in the shell must not break the existing keys-page flow.
- The `MyKeysScreen` regression — wiping still works from `/keys`.

- [ ] **Step 4: Manual dev-server check**

```bash
pnpm --filter web dev
```

In a browser at `http://localhost:3000`:

1. Bootstrap a fresh identity at `/keys`.
2. Click `Settings` in the SideNav. Verify:
   - URL becomes `/settings`.
   - Sidebar `Settings` item is highlighted (active).
   - Page title is "Settings & Security".
   - All four sections render.
3. Change App Lock Timeout to `1 minute`. Reload the page. Verify the select still says `1 minute`.
4. Wait 70 seconds without interacting. Navigate to `/` (Dashboard). Verify the page redirects to the Unlock screen.
5. Re-unlock. Set timeout back to `Never`.
6. From Settings, click `Wipe Private Key`. Modal opens. Type `WIPE`. Confirm. Verify redirect to `<SetPassphraseScreen>`.

Kill the dev server when done.

- [ ] **Step 5: Visual fidelity spot-check**

Open [`all_design_screens/security_settings_aesmsg_2/screen.png`](../../../all_design_screens/security_settings_aesmsg_2/screen.png) side-by-side with `http://localhost:3000/settings`. Confirm:
- Section ordering matches: User Header → Device Security → Key Management → Danger Zone.
- Danger Zone has the red bordered container.
- "Coming soon" rows are visually subdued (less prominent than the live rows).
- The fingerprint section renders the public-key fingerprint in monospace.

If a visual gap is significant (not just a paint-pixel difference), file a follow-up task — do NOT silently extend Slice 11 to fix it. If trivial (Tailwind class tweak), patch and commit as `style(web): align Settings section spacing with mockup`.

- [ ] **Step 6: Final commit (if any fixes landed during verification)**

```bash
git status
# If files were modified during typecheck/lint/test/manual fixes, commit them now:
git add -p
git commit -m "fix(web): Slice 11 verification-pass adjustments"
```

If nothing was modified during verification, this step is a no-op — proceed.

---

## Slice 11 done

All commits should be on the branch. Open a PR titled `feat(web): Slice 11 — Security Settings (/settings)`. Reference [the spec](../specs/2026-05-11-security-settings-design.md) in the PR description.
