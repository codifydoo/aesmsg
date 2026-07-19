"use client";

import { type Fingerprint, fingerprint, type PublicKeyString } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useEffect, useState } from "react";
import { FingerprintBlock } from "@/src/components/FingerprintBlock";
import { QrCode } from "@/src/components/QrCode";

// Rotate success (parity with apps/mobile RotateSuccessScreen). Surface the NEW public key + its new
// AM- fingerprint prominently (QR + mono block) so the user can immediately re-share it and their
// contacts can re-verify. The amber caution restates the one real caveat: contacts must re-verify
// this new fingerprint — their device will flag the key as changed, which is the intended MitM
// defense working as designed. Presentational: rotation already happened.

export interface RotateSuccessScreenProps {
  /** The NEW active public key (returned by rotate()). */
  newPublicKey: PublicKeyString;
  /** Dismiss back to the identity screen. */
  onDone: () => void;
}

export function RotateSuccessScreen({ newPublicKey, onDone }: RotateSuccessScreenProps) {
  const [fp, setFp] = useState<Fingerprint | null>(null);

  useEffect(() => {
    let cancelled = false;
    fingerprint(newPublicKey).then((f) => {
      if (!cancelled) setFp(f);
    });
    return () => {
      cancelled = true;
    };
  }, [newPublicKey]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-label-sm text-success">
          <MaterialIcon name="check_circle" size={16} />
          Your new key is active
        </span>
        <h1 className="font-display text-h1 text-on-surface">Key rotated</h1>
      </header>

      <section className="space-y-6 rounded-xl border border-outline-variant bg-surface-container p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-fit rounded-xl bg-white p-3">
            <QrCode value={newPublicKey} />
          </div>
          <p className="text-center text-label-sm text-on-surface-variant">
            Let a contact scan this to re-verify your new key.
          </p>
        </div>

        {fp ? (
          <FingerprintBlock
            label="New public fingerprint"
            value={fp}
            copyLabel="Copy new public fingerprint"
          />
        ) : (
          <p className="text-label-sm text-on-surface-variant">Deriving fingerprint…</p>
        )}

        <FingerprintBlock
          label="New public key"
          value={newPublicKey}
          copyLabel="Copy new public key"
        />
      </section>

      {/* AMBER caution — contacts must re-verify; their app flags the change (intended). */}
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
        <MaterialIcon name="verified_user" size={20} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-label-sm text-on-surface-variant">
          Share this new fingerprint so your contacts can re-verify you. Their app will show your
          key as changed until they do — that's the check working as intended.
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
