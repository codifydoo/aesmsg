// Pure data + logic for the Home hub's "Recent links" section.
//
// The hub shows the user's REAL most-recent sent links (from the encrypted sent-links store,
// surfaced via useSentLinks() in HomeFlow), not a fixture. This module stays pure (no React, no
// store) so the slice + status->Chip mapping is unit-tested here, per the node-env / no-renderer
// test convention; HomeScreen stays presentational.
//
// COLOR SEMANTICS (non-negotiable): green = available/safe, violet = opened (informational),
// amber = expiring soon, error = revoked (destructive end-state), neutral = expired (inert).

import type { ChipTone } from "@/src/components";
import { type LinkStatus, statusDescriptor } from "@/src/links/link-status";
import type { Link } from "@/src/links/links-data";

/** A recent-link row as shown on the Home hub (metadata only — never plaintext). */
export interface RecentLinkView {
  id: string;
  title: string;
  sub: string;
  status: LinkStatus;
}

/** How a status renders as a Home status Chip. */
export interface RecentChip {
  tone: ChipTone;
  icon: string;
  label: string;
  /** Filled glyph variant — the design fills only the "available" (green check) chip. */
  fill: boolean;
}

/**
 * Map a link status to its Home Chip presentation. Reuses the Links tab's statusDescriptor (single
 * source for tone/icon/label across all five statuses) and adds the design's fill rule.
 */
export function recentLinkChip(status: LinkStatus): RecentChip {
  const d = statusDescriptor(status);
  return { tone: d.tone, icon: d.icon, label: d.label, fill: status === "available" };
}

/**
 * Take the most-recent links for the Home hub. listSentLinks() returns newest-first by createdAt
 * and reconciliation preserves that order, so this just maps + slices to `limit`.
 */
export function toRecentLinks(links: readonly Link[], limit = 3): RecentLinkView[] {
  return links.slice(0, Math.max(0, limit)).map((link) => ({
    id: link.id,
    title: link.to,
    sub: link.time,
    status: link.status,
  }));
}
