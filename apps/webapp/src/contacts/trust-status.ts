import type { TrustStatus } from "@/src/contacts/contacts-display";

// Pure logic: map a contact's TrustStatus to its trailing trust-indicator presentation. Direct port
// of apps/mobile/src/contacts/trust-status.ts. Extracted so the list row stays presentational while
// the non-negotiable COLOR SEMANTICS are unit-tested here:
//   verified   → green "verified" glyph  (green = verified | safe)
//   unverified → amber "Unverified" chip (amber = unverified)
//   changed    → amber "Key changed" chip (amber = key changed; NOT red — an ambient state; red is
//                reserved for destructive actions only)

export type TrustIndicatorKind = "glyph" | "chip";

export interface TrustIndicator {
  /** "glyph" → render a single icon; "chip" → render a labelled chip. */
  kind: TrustIndicatorKind;
  /** Chip tone — always green/amber, NEVER error/red, for these ambient trust states. */
  tone: "green" | "amber";
  /** Material Symbols glyph name (the chip's leading icon, or the standalone verified glyph). */
  icon: string;
  /** Use the filled glyph variant. The verified glyph is filled; the amber chips are outline. */
  fill: boolean;
  /** Chip label. Empty for the verified glyph (which shows no text). */
  label: string;
  /** Spoken/screen-reader description of the trust state. */
  a11yLabel: string;
}

const INDICATORS: Record<TrustStatus, TrustIndicator> = {
  verified: {
    kind: "glyph",
    tone: "green",
    icon: "verified",
    fill: true,
    label: "Verified",
    a11yLabel: "Verified",
  },
  unverified: {
    kind: "chip",
    tone: "amber",
    icon: "priority_high",
    fill: false,
    label: "Unverified",
    a11yLabel: "Unverified",
  },
  changed: {
    kind: "chip",
    tone: "amber",
    icon: "priority_high",
    fill: false,
    label: "Key changed",
    a11yLabel: "Key changed — re-verify before trusting",
  },
};

/** Resolve the trailing trust indicator for a contact's status. Total over TrustStatus. */
export function trustIndicator(status: TrustStatus): TrustIndicator {
  return INDICATORS[status];
}
