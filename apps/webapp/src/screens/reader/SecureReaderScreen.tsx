"use client";

import type { PayloadAttachment } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import { useEffect, useRef, useState } from "react";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { formatSize } from "@/src/create/pick-attachment";
import { type CopyResult, useClipboardAutoClear } from "@/src/reader/use-clipboard-auto-clear";
import { usePrivacyShield } from "@/src/reader/use-privacy-shield";
import { useSettings } from "@/src/settings/settings-context";

// 27 · Secure Reader (per secure_reader_aesmsg). The decrypted plaintext AND any decrypted attachment
// bytes live ONLY in this component's props/state — they are NEVER written to the URL, history,
// localStorage, sessionStorage, IndexedDB, or any cache; leaving the reader drops them (React GC on
// unmount). Web-honest mechanics (D6): clipboard copy with a VERIFIED auto-clear whose duration comes
// from the on-device settings (D8); blur-on-visibilitychange cover; and — stated plainly — screenshot
// blocking is IMPOSSIBLE on the web platform (documented gap; not attempted).
//
// Attachments (D12): a decrypted attachment is offered as a real per-file DOWNLOAD via a Blob object
// URL (memory-only, ZERO network). Each created URL is tracked in `objectUrls` BEFORE the download
// handoff and revoked on close/unmount, so no decrypted bytes linger.

export interface SecureReaderScreenProps {
  text: string;
  attachments: PayloadAttachment[];
  onDone: () => void;
}

function copyLabel(state: CopyResult | "idle", clearSeconds: number): string {
  switch (state) {
    case "copied":
      return `Copied — clears in ${clearSeconds}s`;
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
  const { settings } = useSettings();
  const clearSeconds = settings.clipboardClearSeconds;
  const { copy } = useClipboardAutoClear(clearSeconds * 1000);
  const [copyState, setCopyState] = useState<CopyResult | "idle">("idle");
  const hasText = text.length > 0;

  // Track every attachment Blob object URL so we can revoke them all when the reader closes/unmounts —
  // decrypted bytes must not linger in a live object URL after the user leaves.
  const objectUrls = useRef<string[]>([]);
  const revokeAllObjectUrls = () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current = [];
  };
  // Belt-and-braces: revoke on unmount even if the parent never calls onDone (e.g. tab teardown).
  // Inlined (reads only the stable ref) so the effect needs no external dependency.
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current = [];
    },
    [],
  );

  function handleDownload(att: PayloadAttachment) {
    // Copy into a fresh ArrayBuffer-backed view for the Blob (and to keep the bytes memory-only).
    const blob = new Blob([new Uint8Array(att.bytes)], {
      type: att.mimetype || "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    // Track BEFORE the handoff (mirrors mobile's track-before-share) so a revoke can never miss it.
    objectUrls.current.push(url);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = att.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function handleDone() {
    revokeAllObjectUrls();
    onDone();
  }

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
          <div className="space-y-2">
            <span className="block text-label-sm uppercase tracking-widest text-on-surface-variant">
              {attachments.length === 1 ? "1 attachment" : `${attachments.length} attachments`}
            </span>
            {attachments.map((att) => (
              <div
                key={`${att.filename}-${att.bytes.length}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MaterialIcon name="description" size={20} className="shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-sans text-body-md text-on-surface">
                      {att.filename}
                    </span>
                    <span className="text-label-sm text-on-surface-variant">
                      {formatSize(att.bytes.length)}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(att)}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-outline-variant px-4 font-medium text-on-surface transition-colors hover:bg-surface-container"
                >
                  <MaterialIcon name="download" size={18} />
                  Download
                </button>
              </div>
            ))}
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
            {copyLabel(copyState, clearSeconds)}
          </button>
        ) : null}
        <div className="flex-1">
          <PrimaryButton icon="lock" onClick={handleDone}>
            Close and wipe
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
