"use client";

import { type Fingerprint, fingerprint, type PublicKeyString } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useEffect, useState } from "react";
import { PasswordField } from "@/src/components/PasswordField";
import { WrongPassphraseError } from "@/src/identity/identity-context";
import { useIdentity } from "@/src/identity/use-identity";

// Rotate-key confirm (parity with apps/mobile RotateKeyScreen). Real rotation: generate a new active
// keypair, retire the old one, and RETAIN the old private key so messages already sent to it still
// open.
//
// TONE: AMBER, not red. Rotation is NOT destructive — it deletes nothing and it does not cost access
// to already-received messages (the old key is retained on this device). Red is reserved for the
// irreversible wipe. The one honest caveat: rotation does NOT transfer your contacts' existing trust
// — they must re-verify your NEW fingerprint. Spec §5: rotation requires an explicit passphrase
// re-prompt (also needed to wrap the new key); a wrong passphrase leaves the identity untouched.

export interface RotateKeyScreenProps {
  /** Called with the NEW active public key after a successful rotation. */
  onRotated: (newPublicKey: PublicKeyString) => void;
  /** Backed out without rotating. */
  onCancel: () => void;
}

export function RotateKeyScreen({ onRotated, onCancel }: RotateKeyScreenProps) {
  const { publicKeyString, rotate } = useIdentity();
  const [currentFp, setCurrentFp] = useState<Fingerprint | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the CURRENT (soon-to-be-retired) fingerprint so the user sees exactly what changes.
  useEffect(() => {
    if (publicKeyString === null) return;
    let cancelled = false;
    fingerprint(publicKeyString).then((f) => {
      if (!cancelled) setCurrentFp(f);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKeyString]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length === 0 || rotating) return;
    setRotating(true);
    setError(null);
    try {
      const newPk = await rotate(passphrase);
      onRotated(newPk);
    } catch (err) {
      setRotating(false);
      if (err instanceof WrongPassphraseError) {
        setError("That passphrase didn't match.");
        return;
      }
      setError("Something went wrong rotating your key. Please try again.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
          <MaterialIcon name="autorenew" size={26} />
        </div>
        <h1 className="font-display text-h1 text-on-surface">Rotate your key?</h1>
        <p className="max-w-sm text-body-md text-on-surface-variant">
          This creates a new encryption key and makes it active. New messages will be sealed to your
          new key.
        </p>
      </header>

      {currentFp ? (
        <div className="space-y-2">
          <span className="block text-center text-label-sm uppercase tracking-widest text-on-surface-variant">
            Current key
          </span>
          <p className="break-all text-center font-mono text-mono-code text-on-surface-variant">
            {currentFp}
          </p>
        </div>
      ) : null}

      {/* AMBER caution — the one real limitation, stated honestly. */}
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
        <MaterialIcon name="verified_user" size={20} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-label-sm text-on-surface-variant">
          Your contacts will need to re-verify your new fingerprint — rotation doesn't transfer the
          trust they've already given your old key. Your saved contacts stay as they are.
        </p>
      </div>

      {/* EMERALD reassurance — this is not a wipe; already-received messages stay readable. */}
      <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success/5 p-4">
        <MaterialIcon name="lock" size={18} className="mt-0.5 shrink-0 text-success" />
        <p className="text-label-sm text-on-surface-variant">
          Messages already sent to your old key can still be opened. Your old key stays on this
          device for that.
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

        <button
          type="submit"
          disabled={passphrase.length === 0 || rotating}
          aria-busy={rotating || undefined}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-tertiary font-display font-semibold text-on-tertiary transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          <MaterialIcon
            name={rotating ? "progress_activity" : "autorenew"}
            size={20}
            className={rotating ? "animate-spin" : ""}
          />
          {rotating ? "Rotating…" : "Rotate key"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={rotating}
          className="flex h-12 w-full items-center justify-center rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-50"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}
