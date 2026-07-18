// Type definitions for the Links tab. The actual records now come from the encrypted on-device
// sent-links store, reconciled with the server's live status (see sent-links-store.ts /
// link-reconciliation.ts / link-display.ts). This module is types-only — no sample data.
//
// PRODUCT INVARIANT: a Link carries encrypted-message metadata only (id, recipient fingerprint,
// expiry, max opens, status, opaque pointer URL) — never plaintext.

import type { LinkStatus } from "@/src/links/link-status";

export type { LinkStatus } from "@/src/links/link-status";

/** A recipient as shown on the link detail screen (verified contact). */
export interface LinkRecipient {
  /** Display name (e.g. "Elena Rodriguez"). */
  name: string;
  /** Short fingerprint, mono-styled (e.g. "A1B2 C3D4"). */
  shortFingerprint: string;
  /** Whether the recipient's key is verified (emerald check). */
  verified: boolean;
}

export interface Link {
  id: string;
  /** Row title, "<subject> → <recipient>" exactly as the design shows it. */
  to: string;
  /** Recipient detail shown on the link detail screen. */
  recipient: LinkRecipient;
  /** Absolute "Created" value from the detail screen. */
  createdAt: string;
  /** Relative time shown in the list row (e.g. "2h ago"). */
  time: string;
  status: LinkStatus;
  /** Opens consumed so far. */
  opensUsed: number;
  /** Max opens; null = unlimited (rendered as ∞). */
  opensMax: number | null;
  // ── Detail-only metadata (mirrors S_LinkDetails) ──────────────────────────
  /** Opaque pointer link, mono-styled, truncated in the middle (e.g. "aesmsg.to/l/9fA2·…·tdN0"). */
  url: string;
  /** "Expires" value shown on the detail screen (amber when expiring, e.g. "in 3h 42m"). */
  expiresLabel: string;
}
