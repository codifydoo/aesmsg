"use client";

import { useState } from "react";

export interface WipeConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

const CONFIRM_WORD = "WIPE";

/**
 * Destructive confirmation for wiping the local identity (per wipe_identity_confirm_aesmsg).
 * The action is irreversible and unrecoverable, so it is gated behind typing the confirm word.
 * Red is used ONLY here because this is genuinely destructive. Not mono — the design rule reserves
 * the mono font for fingerprints / public keys / secure links.
 */
export function WipeConfirmDialog({
  open,
  onCancel,
  onConfirm,
  busy = false,
}: WipeConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  if (!open) return null;

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  function handleCancel() {
    setTyped("");
    onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wipe-dialog-title"
    >
      <div className="w-full max-w-md space-y-6 rounded-xl border border-error/30 bg-surface-container p-6">
        <div className="space-y-2">
          <h2 id="wipe-dialog-title" className="font-display text-h2 text-error">
            Wipe private key
          </h2>
          <p className="text-body-md text-on-surface-variant">
            Every message encrypted to this identity will become unreadable forever. This cannot be
            undone — there is no recovery.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="block text-label-sm uppercase tracking-widest text-on-surface-variant">
            Type {CONFIRM_WORD} to confirm
          </span>
          <input
            type="text"
            value={typed}
            autoComplete="off"
            placeholder={CONFIRM_WORD}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface transition-colors focus:border-error focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="flex h-12 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed || busy}
            aria-busy={busy || undefined}
            className="flex h-12 items-center justify-center rounded-lg bg-error font-semibold text-on-error transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-50"
          >
            Wipe private key
          </button>
        </div>
      </div>
    </div>
  );
}
