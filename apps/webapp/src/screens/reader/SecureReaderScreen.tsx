"use client";

import type { PayloadAttachment } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useState } from "react";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { type CopyResult, useClipboardAutoClear } from "@/src/reader/use-clipboard-auto-clear";
import { usePrivacyShield } from "@/src/reader/use-privacy-shield";

// 27 · Secure Reader (per secure_reader_aesmsg). The decrypted plaintext lives ONLY in this
// component's props/state — it is NEVER written to the URL, history, localStorage, sessionStorage,
// IndexedDB, or any cache; leaving the reader drops it (React GC on unmount). Web-honest mechanics
// (D6): clipboard copy with a VERIFIED auto-clear; blur-on-visibilitychange cover; and — stated
// plainly — screenshot blocking is IMPOSSIBLE on the web platform (documented gap; not attempted).
//
// Attachments (D7): SP3 is text-first. If a mobile-sealed message carries attachments we render the
// text normally and show a CALM notice with the count — never a download control, and never a crash.

const CLIPBOARD_CLEAR_MS = 45_000;
const CLIPBOARD_CLEAR_SECONDS = CLIPBOARD_CLEAR_MS / 1000;

export interface SecureReaderScreenProps {
  text: string;
  attachments: PayloadAttachment[];
  onDone: () => void;
}

function copyLabel(state: CopyResult | "idle"): string {
  switch (state) {
    case "copied":
      return `Copied — clears in ${CLIPBOARD_CLEAR_SECONDS}s`;
    case "copied-no-autoclear":
      return "Copied";
    case "failed":
      return "Couldn't copy";
    default:
      return "Copy";
  }
}

export function SecureReaderScreen({ text, attachments, onDone }: SecureReaderScreenProps) {
  const { isObscured } = usePrivacyShield();
  const { copy } = useClipboardAutoClear(CLIPBOARD_CLEAR_MS);
  const [copyState, setCopyState] = useState<CopyResult | "idle">("idle");
  const hasText = text.length > 0;

  async function handleCopy() {
    setCopyState(await copy(text));
  }

  // Blur-on-background: paint an opaque cover INSTEAD of the plaintext, so decrypted text is not in
  // the painted DOM while the tab is hidden/unfocused (mirrors mobile's isObscured early return).
  if (isObscured) {
    return <div data-testid="privacy-cover" className="min-h-screen bg-surface" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface px-6 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-label-sm text-success">
            <MaterialIcon name="lock_open" size={14} />
            Decrypted on this device
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container p-3 text-on-surface-variant">
          <MaterialIcon name="visibility" size={18} />
          <span className="text-label-sm">Anyone who can see your screen can read this now.</span>
        </div>

        {hasText ? (
          <div className="whitespace-pre-wrap break-words rounded-xl border border-outline-variant bg-surface-container-lowest p-5 text-body-lg text-on-surface">
            {text}
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <div className="space-y-1 rounded-xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-center gap-2 text-warning">
              <MaterialIcon name="info" size={18} />
              <span className="text-label-sm font-medium uppercase tracking-widest">
                {attachments.length === 1 ? "1 attachment" : `${attachments.length} attachments`}
              </span>
            </div>
            <p className="text-body-md text-on-surface-variant">
              Saving attachments in the browser isn't supported yet — open it in the aesmsg app to
              download them.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
        {hasText ? (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant px-6 font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <MaterialIcon name="content_copy" size={18} />
            {copyLabel(copyState)}
          </button>
        ) : null}
        <div className="flex-1">
          <PrimaryButton icon="lock" onClick={onDone}>
            Close and wipe
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
