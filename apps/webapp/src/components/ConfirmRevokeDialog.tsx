"use client";

export interface ConfirmRevokeDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

/**
 * Destructive confirm for revoking a link. Revoke permanently purges the ciphertext server-side, so
 * it is gated behind an explicit confirm. Red (`error` tokens) is used ONLY here because this is
 * genuinely destructive (D8). Not mono — the mono font is reserved for links/keys/fingerprints.
 */
export function ConfirmRevokeDialog({
  open,
  onCancel,
  onConfirm,
  busy = false,
}: ConfirmRevokeDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-dialog-title"
    >
      <div className="w-full max-w-md space-y-6 rounded-xl border border-error/30 bg-surface-container p-6">
        <div className="space-y-2">
          <h2 id="revoke-dialog-title" className="font-display text-h2 text-error">
            Revoke this link?
          </h2>
          <p className="text-body-md text-on-surface-variant">
            This permanently purges the ciphertext from the server. Anyone with the link will see
            “This secure link is no longer available.” This cannot be undone.
          </p>
        </div>

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
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            className="flex h-12 items-center justify-center rounded-lg bg-error font-semibold text-on-error transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-50"
          >
            Revoke link
          </button>
        </div>
      </div>
    </div>
  );
}
