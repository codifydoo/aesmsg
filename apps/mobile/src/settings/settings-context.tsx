// apps/mobile/src/settings/settings-context.tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SETTINGS_DEFAULTS, type SettingsRecord } from "@/src/settings/settings-format";
import { loadSettings, saveSettings } from "@/src/settings/settings-store";

// App-root provider for the persisted preferences. It loads the encrypted blob once on mount (showing
// SETTINGS_DEFAULTS until the load resolves — fail-soft, never blocks the tree), and exposes an
// `update(patch)` that optimistically applies the change to React state AND persists it via
// saveSettings. Auto-persist means screens just call update(); they never touch the store directly.
//
// PROVIDER ORDERING: this sits ABOVE IdentityProvider in App.tsx so identity-context can read
// appLockTimeout without a settings<->identity render race (spec §4 Edits + Risks).

export interface SettingsContextValue {
  settings: SettingsRecord;
  /** True until the first load resolves (defaults are shown meanwhile). */
  loading: boolean;
  /** Merge a partial change into the current settings and persist it. */
  update: (patch: Partial<SettingsRecord>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

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
      void saveSettings(next).catch((err) => {
        console.warn("[settings] failed to persist settings update", err);
      });
      return next;
    });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loading, update }),
    [settings, loading, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}
