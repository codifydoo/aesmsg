"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { DECRYPTION_FAILED_COPY } from "@/src/reader/copy";

// 29 · Decryption Failed (per decryption_failed_aesmsg). The wrong-key terminal. Per the product
// invariant a wrong private key is unrecoverable on this device — NO retry (a wrong key can never
// become the right one, and a retry would burn another open on a live link) and NO recovery
// affordance. It surfaces NO server-derived metadata (no fingerprint, status, or counts) — the
// error medallion + the fixed no-recovery copy only.

export interface DecryptionFailedScreenProps {
  onClose: () => void;
}

export function DecryptionFailedScreen({ onClose }: DecryptionFailedScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-error/30 bg-surface-container-high text-error">
          <MaterialIcon name="lock_reset" size={40} />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-h1 text-on-surface">Decryption failed</h1>
          <p className="text-body-md text-on-surface-variant">{DECRYPTION_FAILED_COPY}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-outline-variant px-6 font-medium text-on-surface transition-colors hover:bg-surface-container"
        >
          Close
        </button>
        <p className="text-label-sm text-on-surface-variant">
          Keys never leave the device that created them. There's no way to recover this without the
          matching private key — trying again won't help.
        </p>
      </div>
    </div>
  );
}
