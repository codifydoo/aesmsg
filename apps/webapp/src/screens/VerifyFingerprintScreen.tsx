"use client";

import { useState } from "react";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { type ContactView, contactInitials } from "@/src/contacts/contacts-display";
import { setContactVerified } from "@/src/contacts/contacts-store";

// Manual out-of-band fingerprint verification (per the contact_detail / add_new_contact verify
// sections + mobile VerifyFingerprintScreen). Verification is comparing characters over a channel you
// trust — the screen never asserts the key is trusted on the user's behalf. The big block uses the
// JetBrains-mono treatment (fingerprints only). Marking verified flips the derived status to green;
// marking unverified (or a later key change) means compose re-gates — trust is not sticky.

export interface VerifyFingerprintScreenProps {
  contact: ContactView;
  /** Called after the contact is marked verified (status → green). */
  onDone: () => void;
  /** Leave verification without changing the trust state. */
  onCancel: () => void;
}

/** Group the canonical AM- fingerprint into readable mono lines (4 groups per line). */
function fingerprintLines(fp: string): string[] {
  const groups = fp.replace(/^AM-/, "").split("-").filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += 4) {
    lines.push(groups.slice(i, i + 4).join(" "));
  }
  return lines;
}

export function VerifyFingerprintScreen({
  contact,
  onDone,
  onCancel,
}: VerifyFingerprintScreenProps) {
  const [busy, setBusy] = useState(false);
  const lines = fingerprintLines(contact.fullFingerprint);

  async function markVerified() {
    setBusy(true);
    try {
      await setContactVerified(contact.id, true);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="font-display text-h1 text-on-surface">Verify identity</h1>
        <p className="text-body-md text-on-surface-variant">
          Compare this fingerprint with {contact.name} over a channel you trust — read it aloud on a
          call, or check it in person. Mark verified only if every group matches.
        </p>
      </header>

      <section className="space-y-5 rounded-xl border border-outline-variant bg-surface-container p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-label-sm font-semibold text-on-surface">
            {contactInitials(contact.name)}
          </span>
          <span className="font-sans text-body-md font-medium text-on-surface">{contact.name}</span>
        </div>

        <div className="rounded-lg border border-outline-variant bg-surface-container-high p-6 text-center">
          <div
            data-testid="contact-fingerprint"
            className="font-mono text-mono-code leading-loose tracking-widest text-on-surface"
          >
            {lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>

        <p className="text-center text-label-sm text-on-surface-variant">
          Only the intended recipient can open a message you seal to a verified key.
        </p>
      </section>

      <div className="flex flex-col gap-3">
        <PrimaryButton icon="verified" onClick={markVerified} loading={busy}>
          Mark as verified
        </PrimaryButton>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="mx-auto text-label-sm text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
