"use client";

import { useState } from "react";
import { PasswordField } from "@/src/components/PasswordField";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useIdentity } from "@/src/identity/use-identity";

// In-context passphrase unlock for the recipient reader (D5). A LOCKED recipient unlocks IN PLACE —
// no navigation to /unlock (which would offer wipe and blow away the reader's link context). On a
// successful unlock the identity context flips to `unlocked`; the reader flow's gate effect then
// auto-continues to the single open POST (the tap's intent-to-open carries through the unlock). This
// deliberately reuses the low-level PasswordField + PrimaryButton primitives rather than the full
// UnlockScreen, keeping the recipient on the link.

export function InlineUnlock() {
  const { wrongPassphrase, unlock, clearWrongPassphrase } = useIdentity();
  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length === 0 || submitting) return;
    setSubmitting(true);
    // Argon2id at m=64 MiB runs here — intentionally slow; the button shows a spinner meanwhile.
    await unlock(passphrase);
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        <header className="space-y-2 text-center">
          <h1 className="font-display text-h1 text-on-surface">Unlock to open this message</h1>
          <p className="text-body-md text-on-surface-variant">
            Enter your passphrase to decrypt your private key for this session. It never leaves your
            device.
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
      </div>
    </div>
  );
}
