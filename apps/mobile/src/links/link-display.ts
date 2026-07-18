import { LINK_ORIGIN } from "@/src/api/client";
import { isExpiringSoon } from "@/src/links/expiring-window";
import type { ReconciledLink } from "@/src/links/link-reconciliation";
import type { Link, LinkStatus } from "@/src/links/links-data";
import { type RecipientContactRef, resolveRecipient } from "@/src/links/recipient-resolution";
import { relativeTime } from "@/src/system/activity-data";

// Pure presentation layer for the Links tab: maps a reconciled (local + server) link onto the
// existing LinkStatus enum and the presentational `Link` shape the screens already consume. All
// time math reuses the existing relativeTime() helper (no date-fns). `now` is injected everywhere
// so the derivations are deterministic in tests.
//
// Status semantics (mirrors the design's chip map; see link-status.ts):
//   server unknown (offline/unreachable)      -> "unknown"   (neutral — NEVER "revoked"; FE-4/R4)
//   server gone + already past expiry         -> "expired"  (timed out)
//   server gone otherwise                      -> "revoked"  (purged before timeout)
//   server active + opens consumed            -> "opened"
//   server active + unopened + in its final    -> "expiring"  (PROPORTIONAL window; see below)
//     proportional window of its lifetime
//   server active + unopened + plenty of time  -> "available"
//
// "Expiring soon" is PROPORTIONAL to each link's own lifetime (createdAt → expiresAt), not a fixed
// 24h cutoff: a 10-minute link and a 7-day link each go amber only in their final stretch, so amber
// stays meaningful instead of a short link being "born amber" (see expiring-window.ts).

const HOUR = 3_600_000;

/** Derive the design LinkStatus from a reconciled link relative to `now`. */
export function deriveLinkStatus(link: ReconciledLink, now: number): LinkStatus {
  const expiresMs = new Date(link.expiresAt).getTime();

  // Server unreachable: liveness could not be confirmed. Render neutral "Status unknown" — a failed
  // fetch is not evidence of revocation, so this must never collapse to the red "Revoked" alarm.
  if (link.serverStatus === "unknown") return "unknown";

  if (link.serverStatus === "gone") {
    return expiresMs <= now ? "expired" : "revoked";
  }

  if ((link.opensCount ?? 0) > 0) return "opened";

  // Proportional "expiring soon": amber only once the link is within the last fraction of its own
  // lifetime (clamped 1m..24h), so short and long links each warn at a sensible point.
  const createdMs = new Date(link.record.createdAt).getTime();
  if (isExpiringSoon({ createdAtMs: createdMs, expiresAtMs: expiresMs, nowMs: now })) {
    return "expiring";
  }
  return "available";
}

/** List-row relative time, e.g. "2h ago" / "Yesterday" (no " ago" suffix on Yesterday/Now). */
export function formatTimeLabel(createdAtIso: string, now: number): string {
  const rel = relativeTime(new Date(createdAtIso).getTime(), now);
  // relativeTime returns compact tokens ("Now" | "12m" | "2h" | "Yesterday" | "3d" | "2w").
  // The design's list rows read "2h ago" / "3d ago"; "Now" and "Yesterday" stand alone.
  if (rel === "Now" || rel === "Yesterday") return rel;
  return `${rel} ago`;
}

/** Detail-screen "Expires" value: remaining time for live links; "Revoked"/"Expired" otherwise. */
export function formatExpiresLabel(link: ReconciledLink, now: number): string {
  const expiresMs = new Date(link.expiresAt).getTime();
  if (link.serverStatus === "gone") {
    return expiresMs <= now ? "Expired" : "Revoked";
  }
  return formatRemaining(expiresMs - now);
}

/** Detail-screen "Created" value: an absolute, human date/time (locale string). */
export function formatCreatedAtLabel(createdAtIso: string): string {
  const d = new Date(createdAtIso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Assemble the presentational `Link` the Links screens consume from a reconciled record. The optional
 * `contacts` directory resolves the recipient card (name + real verified state + truncated
 * fingerprint) from the key the link was sealed to; with no match — or no directory supplied — it
 * collapses to a neutral "Unknown recipient" (see recipient-resolution.ts).
 */
export function toDisplayLink(
  link: ReconciledLink,
  now: number,
  contacts: readonly RecipientContactRef[] = [],
): Link {
  const status = deriveLinkStatus(link, now);
  const opensMax = link.maxOpens === -1 ? null : link.maxOpens;
  // Resolve the recipient from the Contacts directory by the sealed-to fingerprint: a known contact
  // contributes its name + verified state; an unknown one is a neutral "Unknown recipient". The
  // fingerprint is truncated (mono) either way, so the detail card stays compact.
  const recipient = resolveRecipient(link.record.recipientFingerprint, contacts);
  return {
    id: link.record.id,
    to: link.record.label && link.record.label.length > 0 ? link.record.label : "Secure link",
    recipient,
    createdAt: formatCreatedAtLabel(link.record.createdAt),
    time: formatTimeLabel(link.record.createdAt, now),
    status,
    opensUsed: link.opensCount ?? 0,
    opensMax,
    // Shareable link points at the web/universal-link host (LINK_ORIGIN), not the API host.
    url: `${LINK_ORIGIN}/l/${link.record.id}`,
    expiresLabel: formatExpiresLabel(link, now),
  };
}

// ── Remaining-time formatting ──────────────────────────────────────────────────
// "in 3h 42m" / "in 4 days" / "in 12m". Compact, matching the design's S_LinkDetails examples.
const MINUTE = 60_000;
const DAY = 24 * HOUR;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY);
    return days === 1 ? "in 1 day" : `in ${days} days`;
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes > 0 ? `in ${hours}h ${minutes}m` : `in ${hours}h`;
  }
  const minutes = Math.max(1, Math.floor(ms / MINUTE));
  return `in ${minutes}m`;
}
