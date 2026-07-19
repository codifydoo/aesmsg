"use client";

import type { WrappedKey } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PasswordField } from "@/src/components/PasswordField";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useIdentity } from "@/src/identity/use-identity";
import { formatBackupSize, readBackupFile, restoreIdentity } from "@/src/onboarding/import-backup";

// Restore an identity from an encrypted backup (parity with apps/mobile ImportBackupScreen). Reached
// ONLY from `no_identity` (onboarding / reader NoIdentityScreen) — a restore can never silently
// overwrite an existing, otherwise-unrecoverable identity; the identity context's importIdentity
// guard enforces this. Errors are terminal, no recovery (spec §5): a wrong passphrase or an invalid
// file gets calm inline copy, never a "forgot passphrase" / attempt-counter / fallback. Zero network:
// the file is read + decrypted entirely on this device.

export interface ImportBackupScreenProps {
  /** Back to the create-identity flow. */
  onBack: () => void;
}

interface Selected {
  readonly file: File;
  readonly name: string;
  readonly size: number;
}

export function ImportBackupScreen({ onBack }: ImportBackupScreenProps) {
  const { importIdentity } = useIdentity();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    setSelected(file ? { file, name: file.name, size: file.size } : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected === null || passphrase.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const contents = await readBackupFile(selected.file);
      const result = await restoreIdentity(contents, passphrase);
      if (!result.ok) {
        setBusy(false);
        setError(
          result.reason === "bad-passphrase"
            ? "That passphrase didn't unlock this backup. No backup data is recoverable without it."
            : "This isn't a valid backup file.",
        );
        return;
      }
      // Adopt the envelope VERBATIM (already DEFAULT_WRAP_KDF_PARAMS) → lands unlocked.
      await importIdentity(contents as WrappedKey, result.identity);
      router.replace("/identity");
    } catch {
      setBusy(false);
      setError("This isn't a valid backup file.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="font-display text-h1 text-on-surface">Restore from a backup</h1>
        <p className="text-body-md text-on-surface-variant">
          Restore your identity from an encrypted backup. Your backup is decrypted on this device —
          nothing is uploaded.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-outline-variant bg-surface-container p-6"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".aesmsg,application/octet-stream"
          onChange={handlePick}
          className="hidden"
          aria-label="Choose a backup file"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant bg-surface-container-low font-medium text-on-surface transition-colors hover:bg-surface-container-high"
        >
          <MaterialIcon name="upload_file" size={20} />
          {selected ? "Choose a different file" : "Choose backup file"}
        </button>

        {selected ? (
          <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <MaterialIcon name="description" size={20} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-md text-on-surface">{selected.name}</p>
              <p className="text-label-sm text-on-surface-variant">
                {formatBackupSize(selected.size)}
              </p>
            </div>
          </div>
        ) : null}

        <PasswordField
          label="Backup passphrase"
          value={passphrase}
          onChange={(v) => {
            setPassphrase(v);
            if (error) setError(null);
          }}
          autoComplete="current-password"
          error={error ?? undefined}
        />
        <p className="text-label-sm text-on-surface-variant">
          This passphrase never leaves your device.
        </p>

        <PrimaryButton
          type="submit"
          icon="lock_open"
          loading={busy}
          disabled={selected === null || passphrase.length === 0}
        >
          {busy ? "Restoring…" : "Restore identity"}
        </PrimaryButton>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="flex h-12 w-full items-center justify-center rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-50"
        >
          Create a new identity instead
        </button>
      </form>

      <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <div className="shrink-0 rounded-lg bg-primary-container/20 p-2 text-primary">
          <MaterialIcon name="info" size={20} />
        </div>
        <div className="space-y-1">
          <h2 className="text-label-sm font-semibold text-on-surface">No recovery by design</h2>
          <p className="text-label-sm text-on-surface-variant">
            The backup passphrase is the only thing that can open this file. If you don't have it,
            the backup can't be restored — there is no reset and no backdoor.
          </p>
        </div>
      </div>
    </div>
  );
}
