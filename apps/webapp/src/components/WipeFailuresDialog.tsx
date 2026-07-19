"use client";

import type { RevokeFailure } from "@/src/settings/wipe-local";

// The revoke-before-wipe acknowledgement gate (D10). Shown ONLY when one or more links could not be
// revoked (offline / server error) right before a wipe: once the identity is wiped its revocation
// tokens are destroyed, so those links stay LIVE and unrevokable forever. The user must explicitly
// acknowledge that before proceeding, or abort (leaving the identity + its tokens intact to retry).
// Red-toned because proceeding is a genuinely destructive, irreversible loss of control over live
// links. Not mono — the design rule reserves mono for fingerprints / keys / links.

export interface WipeFailuresDialogProps {
  failures: RevokeFailure[];
  busy?: boolean;
  onProceed: () => void;
  onCancel: () => void;
}

export function WipeFailuresDialog({
  failures,
  busy = false,
  onProceed,
  onCancel,
}: WipeFailuresDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wipe-failures-title"
    >
      <div className="w-full max-w-md space-y-6 rounded-xl border border-error/30 bg-surface-container p-6">
        <div className="space-y-2">
          <h2 id="wipe-failures-title" className="font-display text-h2 text-error">
            Some links couldn't be revoked
          </h2>
          <p className="text-body-md text-on-surface-variant">
            {failures.length === 1
              ? "1 link couldn't be revoked — likely because you're offline."
              : `${failures.length} links couldn't be revoked — likely because you're offline.`}{" "}
            If you wipe now, these links stay live and can no longer be revoked from this device.
          </p>
        </div>

        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {failures.map((f) => (
            <li key={f.link.id} className="text-label-sm text-on-surface-variant">
              {f.link.label ?? "Untitled link"}
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-12 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onProceed}
            disabled={busy}
            aria-busy={busy || undefined}
            className="flex h-12 items-center justify-center rounded-lg bg-error font-semibold text-on-error transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-50"
          >
            Wipe anyway
          </button>
        </div>
      </div>
    </div>
  );
}
