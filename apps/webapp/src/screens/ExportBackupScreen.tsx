"use client";

import { BadPassphraseError, unwrapPrivateKey, type WrappedKey } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useEffect, useState } from "react";
import { PasswordField } from "@/src/components/PasswordField";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { loadIdentity } from "@/src/identity/identity-store";
import { useIdentity } from "@/src/identity/use-identity";
import { buildBackup, downloadBackup } from "@/src/keys/export-backup";

// Encrypted backup export (parity with apps/mobile ExportBackupScreen). Spec §5: an explicit
// passphrase re-prompt gates the export. On web the login passphrase IS the backup passphrase — the
// resulting FILE is byte-format-identical regardless, which is all interop requires. The file is
// produced + downloaded entirely locally (Blob + <a download>), zero network. No "unbreakable" /
// "military-grade" / "forgot passphrase" / cloud-restore copy.

export interface ExportBackupScreenProps {
  /** Back to the identity screen. */
  onDone: () => void;
}

export function ExportBackupScreen({ onDone }: ExportBackupScreenProps) {
  const { identity } = useIdentity();
  const [storedWrapped, setStoredWrapped] = useState<WrappedKey | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Load the at-rest envelope so we can VERIFY the re-prompted passphrase against it (D5) — the
  // export passphrase must match the login passphrase, or the user backs up under a passphrase they
  // won't remember. Keyed on `identity` so it (re)loads once the identity is unlocked. No key
  // material is unwrapped until the user submits.
  useEffect(() => {
    if (identity === null) return;
    let cancelled = false;
    loadIdentity("primary").then((record) => {
      if (!cancelled) setStoredWrapped(record?.wrapped ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length === 0 || busy || identity === null || storedWrapped === null) return;
    setBusy(true);
    setError(null);
    try {
      // Verify: a wrong passphrase produces NO file (the re-prompt is a real gate, not a formality).
      await unwrapPrivateKey(storedWrapped, passphrase);
    } catch (err) {
      setBusy(false);
      if (err instanceof BadPassphraseError) {
        setError("That passphrase didn't match.");
        return;
      }
      setError("Something went wrong. Please try again.");
      return;
    }
    // Build the encrypted file (heavy KDF, mobile format) and hand it to the browser download.
    const backup = await buildBackup(identity, passphrase);
    downloadBackup(backup);
    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <MaterialIcon name="check_circle" size={26} />
          </div>
          <h1 className="font-display text-h1 text-on-surface">Encrypted backup ready</h1>
          <p className="max-w-sm text-body-md text-on-surface-variant">
            Share or save this file. Keep the passphrase separate — it is the only thing that can
            open the backup.
          </p>
        </header>

        <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <MaterialIcon name="lock" size={20} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-label-sm text-on-surface-variant">
            This is the only way a key leaves your device — and only in encrypted form. Store the
            passphrase somewhere safe; we can't recover it.
          </p>
        </div>

        <button
          type="button"
          onClick={onDone}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-container font-display font-semibold text-on-primary-container transition-all active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-container/20 text-primary">
          <MaterialIcon name="cloud_download" size={26} />
        </div>
        <h1 className="font-display text-h1 text-on-surface">Export an encrypted backup</h1>
        <p className="max-w-sm text-body-md text-on-surface-variant">
          Save an encrypted copy of your key so you can restore it later. Confirm your passphrase to
          continue — the file is encrypted with it.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <MaterialIcon name="info" size={20} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-label-sm text-on-surface-variant">
          Your backup is encrypted with a passphrase only you know. Without it, the file is useless.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="Confirm your passphrase"
          value={passphrase}
          onChange={(v) => {
            setPassphrase(v);
            if (error) setError(null);
          }}
          autoComplete="current-password"
          error={error ?? undefined}
        />

        <PrimaryButton
          type="submit"
          icon="cloud_download"
          loading={busy}
          disabled={passphrase.length === 0 || storedWrapped === null}
        >
          {busy ? "Encrypting backup…" : "Export backup"}
        </PrimaryButton>
        <button
          type="button"
          onClick={onDone}
          disabled={busy}
          className="flex h-12 w-full items-center justify-center rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-50"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}
