"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PasswordField } from "@/src/components/PasswordField";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { WipeConfirmDialog } from "@/src/components/WipeConfirmDialog";
import { useIdentity } from "@/src/identity/use-identity";

export function UnlockScreen() {
  const { state, wrongPassphrase, unlock, wipe, clearWrongPassphrase } = useIdentity();
  const router = useRouter();

  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reconcile direct navigation: only a `locked` identity belongs on this screen.
  useEffect(() => {
    if (state === "unlocked") router.replace("/identity");
    else if (state === "no_identity") router.replace("/onboarding");
  }, [state, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length === 0 || submitting) return;
    setSubmitting(true);
    // Argon2id at m=64 MiB runs here — intentionally slow; the button shows a spinner meanwhile.
    await unlock(passphrase);
    setSubmitting(false);
  }

  async function handleWipe() {
    setWiping(true);
    await wipe();
    setWiping(false);
    setConfirmOpen(false);
    router.replace("/onboarding");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="font-display text-h1 text-on-surface">Unlock your identity</h1>
        <p className="text-body-md text-on-surface-variant">
          Enter your passphrase to decrypt your private key for this session.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-outline-variant bg-surface-container p-6"
      >
        <PasswordField
          label="Passphrase"
          value={passphrase}
          onChange={(v) => {
            setPassphrase(v);
            if (wrongPassphrase) clearWrongPassphrase();
          }}
          autoComplete="current-password"
          error={wrongPassphrase ? "That passphrase didn't work." : undefined}
        />
        <PrimaryButton
          type="submit"
          icon="lock_open"
          loading={submitting}
          disabled={passphrase.length === 0}
        >
          Unlock
        </PrimaryButton>
      </form>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={submitting}
        className="text-center text-label-sm text-error transition-colors hover:text-error/80 disabled:pointer-events-none disabled:opacity-50"
      >
        Wipe and start over
      </button>

      <WipeConfirmDialog
        open={confirmOpen}
        busy={wiping}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleWipe}
      />
    </div>
  );
}
