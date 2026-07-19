"use client";

import { MaterialIcon } from "@aesmsg/ui";
import type { TrustStatus } from "@/src/contacts/contacts-display";
import { trustIndicator } from "@/src/contacts/trust-status";

// Presentational trust chip. Maps the pure `trustIndicator` semantics to design-token classes:
//   green (verified) → success tokens; amber (unverified | key-changed) → warning tokens.
// NEVER uses `text-error`/red: these are ambient trust states, and red is reserved for destructive
// actions only (D7/D11).
const TONE_CLASS: Record<"green" | "amber", string> = {
  green: "border-success/30 bg-success/10 text-success",
  amber: "border-warning/30 bg-warning/10 text-warning",
};

export function TrustChip({ status }: { status: TrustStatus }) {
  const indicator = trustIndicator(status);
  return (
    <span
      role="img"
      aria-label={indicator.a11yLabel}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-label-sm ${TONE_CLASS[indicator.tone]}`}
    >
      <MaterialIcon name={indicator.icon} size={14} filled={indicator.fill} />
      {indicator.label}
    </span>
  );
}
