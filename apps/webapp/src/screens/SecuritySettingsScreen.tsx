"use client";

import { type Fingerprint, fingerprint } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FingerprintBlock } from "@/src/components/FingerprintBlock";
import { WipeConfirmDialog } from "@/src/components/WipeConfirmDialog";
import { WipeFailuresDialog } from "@/src/components/WipeFailuresDialog";
import { useIdentity } from "@/src/identity/use-identity";
import { useSettings } from "@/src/settings/settings-context";
import {
  APP_LOCK_TIMEOUT_OPTIONS,
  type AppLockTimeout,
  CLIPBOARD_CLEAR_MAX_SECONDS,
  CLIPBOARD_CLEAR_MIN_SECONDS,
  formatClipboardClear,
} from "@/src/settings/settings-format";
import { useLocalWipe } from "@/src/settings/use-local-wipe";

// 45/46 · Security Settings (per security_settings_aesmsg_1/2). A calm SaaS settings surface. It
// wires the two actionable device prefs (clipboard auto-clear duration, app-lock timeout) into the
// persisted settings blob, exposes a "Lock now", surfaces IndexedDB storage-persistence status, links
// to the /identity key-management flows (rotate + export), states the HONEST web-tier gap (D9 — native
// offers stronger delivery guarantees, with a link), and carries the red Danger Zone (revoke-before-
// wipe, D10). NO server-account copy — there is no account, only per-link revocation.

// The product/app origin advertised for "get the native app". Build-time overridable; defaults to the
// marketing/app site (never Vercel) — the same origin the reader uses.
const APP_SITE_ORIGIN = process.env.NEXT_PUBLIC_AESMSG_SITE_ORIGIN ?? "https://aesmsg.com";

type PersistState = "unknown" | "unsupported" | "persisted" | "not-persisted";

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <MaterialIcon name={icon} size={20} className="text-primary" />
      <h2 className="text-label-sm uppercase tracking-widest text-on-surface-variant">{title}</h2>
    </div>
  );
}

export function SecuritySettingsScreen() {
  const { publicKeyString, lock } = useIdentity();
  const { settings, update } = useSettings();
  const router = useRouter();
  const wipeFlow = useLocalWipe({ onWiped: () => router.replace("/onboarding") });

  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [persist, setPersist] = useState<PersistState>("unknown");

  // Derive the AM- fingerprint for the key-management summary.
  useEffect(() => {
    if (publicKeyString === null) {
      setFp(null);
      return;
    }
    let cancelled = false;
    fingerprint(publicKeyString).then((value) => {
      if (!cancelled) setFp(value);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKeyString]);

  // Best-effort storage-persistence status. Degrades calmly where the API is unavailable.
  useEffect(() => {
    let cancelled = false;
    const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!storage || typeof storage.persisted !== "function") {
      setPersist("unsupported");
      return;
    }
    storage
      .persisted()
      .then((yes) => {
        if (!cancelled) setPersist(yes ? "persisted" : "not-persisted");
      })
      .catch(() => {
        if (!cancelled) setPersist("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function requestPersistence() {
    const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!storage || typeof storage.persist !== "function") {
      setPersist("unsupported");
      return;
    }
    try {
      const granted = await storage.persist();
      setPersist(granted ? "persisted" : "not-persisted");
    } catch {
      setPersist("unsupported");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="space-y-1">
        <h1 className="font-display text-h1 text-on-surface">Security settings</h1>
        <p className="text-body-md text-on-surface-variant">
          Controls for how this browser handles your keys and decrypted messages.
        </p>
      </header>

      {/* Unlock / app-lock */}
      <section className="space-y-3">
        <SectionHeader icon="lock_clock" title="Unlock & app lock" />
        <div className="space-y-4 rounded-xl border border-outline-variant bg-surface-container p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-body-md font-medium text-on-surface">Auto-lock timeout</p>
              <p className="text-label-sm text-on-surface-variant">
                Re-lock your identity after a period of inactivity.
              </p>
            </div>
            <select
              aria-label="Auto-lock timeout"
              value={settings.appLockTimeout}
              onChange={(e) => update({ appLockTimeout: e.target.value as AppLockTimeout })}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 font-sans text-body-md text-on-surface focus:border-primary focus:outline-none"
            >
              {APP_LOCK_TIMEOUT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={lock}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest sm:w-auto sm:px-6"
          >
            <MaterialIcon name="lock" size={18} />
            Lock now
          </button>
        </div>
      </section>

      {/* Clipboard protection */}
      <section className="space-y-3">
        <SectionHeader icon="content_paste_off" title="Clipboard protection" />
        <div className="space-y-3 rounded-xl border border-outline-variant bg-surface-container p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-body-md font-medium text-on-surface">Auto-clear the clipboard</p>
              <p className="text-label-sm text-on-surface-variant">
                Erase a copied message after a set time (when the browser allows a verified clear).
              </p>
            </div>
            <span className="font-sans text-body-md text-primary">
              {formatClipboardClear(settings.clipboardClearSeconds)}
            </span>
          </div>
          <input
            type="range"
            aria-label="Clipboard auto-clear duration in seconds"
            min={CLIPBOARD_CLEAR_MIN_SECONDS}
            max={CLIPBOARD_CLEAR_MAX_SECONDS}
            step={1}
            value={settings.clipboardClearSeconds}
            onChange={(e) => update({ clipboardClearSeconds: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
      </section>

      {/* Storage persistence */}
      <section className="space-y-3">
        <SectionHeader icon="database" title="Storage" />
        <div className="rounded-xl border border-outline-variant bg-surface-container p-5">
          {persist === "persisted" ? (
            <div className="flex items-start gap-3">
              <MaterialIcon
                name="verified_user"
                size={20}
                className="mt-0.5 shrink-0 text-success"
              />
              <p className="text-body-md text-success">
                Your keys are stored persistently on this device.
              </p>
            </div>
          ) : persist === "unsupported" ? (
            <p className="text-body-md text-on-surface-variant">
              This browser doesn't expose persistent-storage controls. Your keys are stored with
              best-effort durability.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-body-md text-on-surface-variant">
                Ask the browser to keep your encrypted keys from being evicted under storage
                pressure.
              </p>
              <button
                type="button"
                onClick={requestPersistence}
                className="h-11 shrink-0 rounded-lg border border-outline-variant bg-surface-container-high px-6 font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
              >
                Request persistent storage
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Key management */}
      <section className="space-y-3">
        <SectionHeader icon="vpn_key" title="Key management" />
        <div className="space-y-4 rounded-xl border border-outline-variant bg-surface-container p-5">
          {fp ? (
            <FingerprintBlock
              label="Public fingerprint"
              value={fp}
              copyLabel="Copy public fingerprint"
            />
          ) : (
            <p className="text-label-sm text-on-surface-variant">Deriving fingerprint…</p>
          )}
          <Link
            href="/identity"
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
          >
            <MaterialIcon name="key" size={18} />
            Rotate key or export a backup
          </Link>
        </div>
      </section>

      {/* Honest web-tier disclosure (D9) — amber/neutral, never a red ambient state, never "≡ native". */}
      <section className="space-y-3">
        <SectionHeader icon="phonelink_lock" title="Web vs the native app" />
        <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-5">
          <p className="text-body-md text-on-surface">
            This web client encrypts and decrypts entirely on your device. The native aesmsg app
            adds stronger delivery guarantees on top of the same encryption:
          </p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-body-md text-on-surface-variant">
              <MaterialIcon name="verified" size={18} className="mt-0.5 shrink-0 text-warning" />
              <span>
                <span className="font-medium text-on-surface">Signed builds</span> — the code
                arrives as a signed binary, not a page load that could be swapped out.
              </span>
            </li>
            <li className="flex items-start gap-2 text-body-md text-on-surface-variant">
              <MaterialIcon name="fingerprint" size={18} className="mt-0.5 shrink-0 text-warning" />
              <span>
                <span className="font-medium text-on-surface">A biometric gate</span> on every open.
              </span>
            </li>
            <li className="flex items-start gap-2 text-body-md text-on-surface-variant">
              <MaterialIcon name="screenshot" size={18} className="mt-0.5 shrink-0 text-warning" />
              <span>
                <span className="font-medium text-on-surface">Screenshot blocking.</span> Screenshot
                blocking is not possible in a browser — the native app enforces it.
              </span>
            </li>
          </ul>
          <a
            href={APP_SITE_ORIGIN}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high px-6 font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
          >
            <MaterialIcon name="open_in_new" size={18} />
            Get the native app
          </a>
        </div>
      </section>

      {/* Danger zone (D10) — red, destructive only. No server-account deletion (no web analogue). */}
      <section className="space-y-3 rounded-xl border border-error/20 bg-error-container/10 p-6">
        <h2 className="font-display text-h2 text-error">Danger zone</h2>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-label-sm font-semibold text-on-surface">Wipe private key</p>
            <p className="text-label-sm text-on-surface-variant">
              Permanently delete this identity from this device. Every message encrypted to it will
              be lost forever.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="h-12 shrink-0 rounded-lg bg-error px-6 font-semibold text-on-error transition-colors hover:bg-error/90"
          >
            Wipe private key
          </button>
        </div>
      </section>

      <WipeConfirmDialog
        open={confirmOpen}
        busy={wipeFlow.busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          wipeFlow.start();
        }}
      />

      {wipeFlow.pendingFailures !== null ? (
        <WipeFailuresDialog
          failures={wipeFlow.pendingFailures}
          busy={wipeFlow.busy}
          onProceed={wipeFlow.proceedAnyway}
          onCancel={wipeFlow.cancelFailures}
        />
      ) : null}
    </div>
  );
}
