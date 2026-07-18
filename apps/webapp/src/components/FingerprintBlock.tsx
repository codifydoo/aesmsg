"use client";

import { MaterialIcon } from "@aesmsg/ui";
import { useState } from "react";

export interface FingerprintBlockProps {
  /** Section label, e.g. "Public fingerprint" or "Public key". */
  label: string;
  /** The canonical value to display + copy (a fingerprint or a public-key string). */
  value: string;
  /** Accessible name for the copy button. */
  copyLabel: string;
}

/**
 * A mono block for a fingerprint or public-key string with a copy affordance. The mono font
 * (JetBrains Mono, `font-mono`) is used ONLY for these cryptographic values — never for general UI
 * text — per the design rules. Copy writes the full canonical value to the clipboard.
 */
export function FingerprintBlock({ label, value, copyLabel }: FingerprintBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable/denied — no-op, the value is still visible to select manually */
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copyLabel}
          className="flex items-center gap-1 text-label-sm text-on-surface-variant transition-colors hover:text-primary"
        >
          <MaterialIcon name={copied ? "check" : "content_copy"} size={18} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="break-all rounded-lg border border-outline-variant bg-surface-container-lowest p-4 font-mono text-mono-code leading-relaxed text-on-surface">
        {value}
      </div>
    </div>
  );
}
