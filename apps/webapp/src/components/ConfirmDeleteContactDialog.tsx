"use client";

export interface ConfirmDeleteContactDialogProps {
  open: boolean;
  contactName: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

/**
 * Destructive confirm for removing a contact. Deleting removes the saved public key from this device
 * (it can be added again later). Red (`error` tokens) is used ONLY here because deleting a contact is
 * genuinely destructive (D11). Not mono — the mono font is reserved for links/keys/fingerprints.
 */
export function ConfirmDeleteContactDialog({
  open,
  contactName,
  onCancel,
  onConfirm,
  busy = false,
}: ConfirmDeleteContactDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-contact-title"
    >
      <div className="w-full max-w-md space-y-6 rounded-xl border border-error/30 bg-surface-container p-6">
        <div className="space-y-2">
          <h2 id="delete-contact-title" className="font-display text-h2 text-error">
            Delete this contact?
          </h2>
          <p className="text-body-md text-on-surface-variant">
            This removes {contactName}'s saved key from this device. You can add it again later.
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
            Delete contact
          </button>
        </div>
      </div>
    </div>
  );
}
