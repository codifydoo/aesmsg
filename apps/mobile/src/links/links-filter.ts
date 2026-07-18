// Pure segmented-filter logic for the Links list (segmented control: All / Active / Expired).
//
// Extracted (per the node-env / no-React-renderer test convention) so LinksListScreen stays thin
// and the bucket membership is unit-tested directly (see tests/links-filter.test.ts).
//
//   All     -> every link
//   Active  -> links the recipient can still open: available | opened | expiring | unknown
//   Expired -> inert end-states the user can no longer act on: expired | revoked
//
// (The design's segmented control in S_LinksList shows All / Active / Expired; the bucketing here
// is the natural mapping of the statuses onto those three tabs. "unknown" — the offline/unreachable
// state where liveness could not be confirmed — is presumed still-open, so it lands in Active rather
// than being hidden under a filter or lumped with the inert Expired end-states.)

import type { LinkStatus } from "@/src/links/link-status";

export type LinkFilter = "all" | "active" | "expired";

const ACTIVE: ReadonlySet<LinkStatus> = new Set<LinkStatus>([
  "available",
  "opened",
  "expiring",
  "unknown",
]);
const EXPIRED: ReadonlySet<LinkStatus> = new Set<LinkStatus>(["expired", "revoked"]);

/** Whether a link with the given status belongs in the given filter bucket. */
export function matchesFilter(status: LinkStatus, filter: LinkFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE.has(status);
  return EXPIRED.has(status);
}

/** Filter a list of status-bearing items by the active segmented value. */
export function filterByStatus<T extends { status: LinkStatus }>(
  items: readonly T[],
  filter: LinkFilter,
): T[] {
  return items.filter((item) => matchesFilter(item.status, filter));
}

// ── Filtered-empty state ─────────────────────────────────────────────────────
// Distinct from the first-run "No secure links yet" screen (LinksEmptyScreen): this is the "you HAVE
// links, but none match the current segment" state. Choosing Active/Expired with no matches must read
// as a deliberate "no matches" — not a blank area (empty states are first-class in the design).
//
// `all` is intentionally excluded: LinksFlow only renders the list when at least one link exists, and
// the `all` segment shows every link, so an empty `all` bucket cannot occur here.

export interface FilterEmptyCopy {
  title: string;
  body: string;
}

const FILTER_EMPTY: Record<Exclude<LinkFilter, "all">, FilterEmptyCopy> = {
  active: {
    title: "No active links",
    body: "None of your links are currently active. Switch to All to see expired and revoked links.",
  },
  expired: {
    title: "No expired links",
    body: "None of your links have expired or been revoked yet.",
  },
};

/** Copy for the "no matches in this segment" empty state, or null for the `all` segment. */
export function filterEmptyCopy(filter: LinkFilter): FilterEmptyCopy | null {
  return filter === "all" ? null : FILTER_EMPTY[filter];
}
