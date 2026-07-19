"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SETTINGS_DEFAULTS, type SettingsRecord } from "./settings-format";
import { loadSettings, saveSettings } from "./settings-store";

// App-root provider for the persisted preferences (parity with apps/mobile/src/settings/
// settings-context.tsx). It loads the blob once on mount (showing SETTINGS_DEFAULTS until the load
// resolves — fail-soft, never blocks the tree) and exposes an optimistic `update(patch)` that applies
// the change to React state AND fire-and-forget persists it via saveSettings. Screens just call
// update(); they never touch the store directly. It holds NO key material.
//
// It sits in app/layout.tsx (above IdentityProvider is unnecessary — it never races identity), so BOTH
// the /settings screen (inside AppShell) AND the recipient reader (outside AppShell) can read it.

export interface SettingsContextValue {
  settings: SettingsRecord;
  /** True until the first load resolves (defaults are shown meanwhile). */
  loading: boolean;
  /** Merge a partial change into the current settings and persist it. */
  update: (patch: Partial<SettingsRecord>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// A stable read-only fallback used when there is no provider in the tree (e.g. a unit test that renders
// a screen in isolation, or a route that renders before the provider mounts). `update` is a no-op so a
// missing provider degrades to SETTINGS_DEFAULTS and never crashes (D8/Task 12).
const FALLBACK: SettingsContextValue = {
  settings: SETTINGS_DEFAULTS,
  loading: false,
  update: () => {},
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsRecord>(SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadSettings().then((loaded) => {
      if (!cancelled) {
        setSettings(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<SettingsRecord>) => {
    setSettings((prev) => {
      const next: SettingsRecord = { ...prev, ...patch };
      // Fire-and-forget persist; a write failure leaves the optimistic UI state in place (the next
      // successful write reconciles it). Errors are swallowed so a toggle never crashes the screen.
      void saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loading, update }),
    [settings, loading, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/**
 * Read the on-device settings. Unlike the mobile hook (which throws without a provider), the web hook
 * DEGRADES to read-only SETTINGS_DEFAULTS when no provider is present — the reader must never crash on
 * a missing provider (D8/Task 12).
 */
export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext) ?? FALLBACK;
}
