// Pure logic: map a contact's TrustStatus to its trailing trust-indicator presentation.
//
// Extracted (per the node-env / no-React-renderer test convention) so the list row stays a thin
// presentational component while the branching — and the non-negotiable COLOR SEMANTICS — are
// unit-tested here:
//   verified   → emerald "verified" glyph (green = verified | safe)
//   unverified → amber "Unverified" chip   (amber = unverified)
//   changed    → amber "Key changed" chip  (amber = key changed; NOT red — this is an ambient
//                state, and red is reserved for destructive actions only)
//
// `kind` lets the row decide whether to draw a glyph (verified) or a chip (the two amber states)
// without re-deriving the semantics in JSX.

import type { TrustStatus } from "@/src/contacts/contacts-data";

export type TrustIndicatorKind = "glyph" | "chip";

export interface TrustIndicator {
  /** "glyph" → render a single icon; "chip" → render a labelled Chip. */
  kind: TrustIndicatorKind;
  /** Chip tone — always emerald(green)/amber, never error/red, for these ambient trust states. */
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
    label: "",
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
