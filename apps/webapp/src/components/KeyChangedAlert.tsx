"use client";

import { MaterialIcon } from "@aesmsg/ui";

// Contact-side security alert (per security_alert_key_changed_aesmsg + mobile KeyChangedAlertScreen).
// Raised in the contact RE-KEY flow when a scanned/pasted key differs from the one on file — the
// classic MitM signal. AMBER throughout (attention, not danger): an amber warning header, an honest
// explanation, and a side-by-side Previous (neutral) vs New (amber) fingerprint compare in mono.
//
// Mobile parity: exactly TWO actions, and this alert makes NO store decision — it only gates one:
//   - "Update to new key" (primary) → onUpdateKey: the caller persists the new key via
//     updateContactKey, which RESETS the contact to unverified and pushes the old fingerprint onto
//     the rotation history. Verification then happens from the detail screen against the now-STORED
//     key, after the user compares the new fingerprint out-of-band.
//   - "Keep current key" (quiet link) → onKeepCurrent: discard the candidate; the stored key is
//     left untouched.
// There is deliberately no in-alert "Verify" adopt-then-compare path (adopting is trust-destroying,
// not "the safe path"). NO ambient red — red is reserved for destructive actions only (D7).

export interface KeyChangedAlertProps {
  contactName: string;
  /** Previously-verified fingerprint (short, mono) — neutral cell. */
  previousFingerprint: string;
  /** Newly-detected fingerprint (short, mono) — amber cell; the value to re-verify out-of-band. */
  newFingerprint: string;
  /** Adopt the new key: persists it and resets the contact to unverified (must re-verify). */
  onUpdateKey: () => void;
  /** Discard the scanned/pasted key; keep the current stored key unchanged. */
  onKeepCurrent: () => void;
}

export function KeyChangedAlert({
  contactName,
  previousFingerprint,
  newFingerprint,
  onUpdateKey,
  onKeepCurrent,
}: KeyChangedAlertProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="key-changed-title"
    >
      <div className="w-full max-w-md space-y-5 rounded-xl border border-warning/30 bg-surface-container p-6">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <MaterialIcon name="gpp_maybe" className="text-warning" />
          <div className="space-y-1">
            <h2 id="key-changed-title" className="text-body-md font-semibold text-warning">
              Public key changed
            </h2>
            <p className="text-label-sm text-on-surface-variant">
              The key you just entered is different from the one on file for {contactName}. This
              could mean they have a new device, or their identity was compromised. Updating
              replaces the saved key and marks this contact unverified until you compare the new
              fingerprint over a channel you trust.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 rounded-lg border border-outline-variant bg-surface-container-high p-3">
            <span className="block text-label-sm uppercase tracking-widest text-on-surface-variant">
              Previous
            </span>
            <span className="block break-all font-mono text-mono-code text-on-surface-variant">
              {previousFingerprint}
            </span>
          </div>
          <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <span className="block text-label-sm uppercase tracking-widest text-warning">New</span>
            <span className="block break-all font-mono text-mono-code text-warning">
              {newFingerprint}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onUpdateKey}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-container font-display font-semibold text-on-primary-container transition-all active:scale-[0.98]"
          >
            <MaterialIcon name="key" size={20} />
            Update to new key
          </button>
          <button
            type="button"
            onClick={onKeepCurrent}
            className="mx-auto text-label-sm text-on-surface-variant transition-colors hover:text-on-surface"
          >
            Keep current key
          </button>
        </div>
      </div>
    </div>
  );
}
