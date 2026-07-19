"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { useState } from "react";

export interface SecureLinkBlockProps {
  /** The server-returned shareable link (aesmsg.com/l/<id>). */
  url: string;
}

/**
 * The full secure link rendered in `font-mono` (JetBrains Mono is reserved for links/keys/
 * fingerprints) on a low surface, with a Copy affordance. The link is a pointer, not a secret — but
 * it is still the one artifact the sender pastes into any app, so it gets the mono treatment.
 */
export function SecureLinkBlock({ url }: SecureLinkBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable/denied — the value is still visible to select manually */
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
          Secure access link
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-label-sm text-primary">
          <MaterialIcon name="lock" size={14} filled />
          Encrypted
        </span>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all font-mono text-mono-code text-primary">
          {url}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy secure link"
          className="flex shrink-0 items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-label-sm font-medium text-on-primary transition-opacity hover:opacity-90"
        >
          <MaterialIcon name={copied ? "check" : "content_copy"} size={18} />
          <span>{copied ? "Copied" : "Copy link"}</span>
        </button>
      </div>
    </div>
  );
}
