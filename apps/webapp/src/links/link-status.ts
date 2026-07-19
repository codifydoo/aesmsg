import type { ListMessageResult } from "@/src/api/client";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

// Pure reconciliation of a locally-tracked sent link against its /api/messages/list result → a
// display status + effective metadata. Extracted so the branching is unit-tested directly and the
// .tsx screens stay thin.
//
// The server only echoes a live row as { status: "active", … }; not_found / revoked / expired /
// exhausted all collapse to an explicit { status: "gone" }. A missing per-id result (id absent, or
// the whole /list fetch failed → passed as `null`) is NOT a revoke signal (FE-4): it resolves to
// last-known, and only the deterministic local-expiry clock may downgrade it. So the red "revoked"
// chip can never be a false alarm — it comes only from an explicit server "gone" on a still-future
// link. `now` is injected for determinism.

export type DisplayStatus = "active" | "expiring" | "expired" | "revoked" | "opened_out";

/** Effective expiry within which a still-active link reads as "expiring soon" (amber). */
export const EXPIRING_SOON_MS = 60 * 60 * 1000; // 1 hour

export interface DisplayLink {
  record: SentLinkRecord;
  status: DisplayStatus;
  /** Live opens consumed (server-reported) when active; null when gone / last-known. */
  opensCount: number | null;
  /** Effective maxOpens (server when active, else the local record). */
  maxOpens: number;
  /** Effective expiry ISO (server when active, else the local record). */
  expiresAt: string;
}

/**
 * Reconcile one record against its server result (or `null` when absent/offline) into a display link.
 */
export function reconcileLink(
  record: SentLinkRecord,
  serverResult: ListMessageResult | null,
  now: number,
): DisplayLink {
  if (serverResult && serverResult.status === "gone") {
    // Explicit server "gone": a genuinely past-expiry local record reads "expired"; otherwise the
    // sender revoked it (or its opens ran out) — a still-future gone link → "revoked".
    const locallyExpired = new Date(record.expiresAt).getTime() <= now;
    return {
      record,
      status: locallyExpired ? "expired" : "revoked",
      opensCount: null,
      maxOpens: record.maxOpens,
      expiresAt: record.expiresAt,
    };
  }

  // Active, or last-known (null): the local clock is the only permitted downgrade.
  const active = serverResult && serverResult.status === "active" ? serverResult : null;
  const expiresAt = active ? active.expiresAt : record.expiresAt;
  const maxOpens = active ? active.maxOpens : record.maxOpens;
  const opensCount = active ? active.opensCount : null;
  const msLeft = new Date(expiresAt).getTime() - now;

  let status: DisplayStatus;
  if (msLeft <= 0) {
    status = "expired";
  } else if (active && active.maxOpens !== -1 && active.opensCount >= active.maxOpens) {
    status = "opened_out";
  } else if (msLeft <= EXPIRING_SOON_MS) {
    status = "expiring";
  } else {
    status = "active";
  }
  return { record, status, opensCount, maxOpens, expiresAt };
}

/** "In 2 days" / "In 5 hours" / "In 12 minutes" / "Expired". */
export function expiresInLabel(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return "Expired";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `In ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(ms / 86_400_000);
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

/** "1/3" (known) · "1/∞" (unlimited) · "—/3" (opens unknown, e.g. offline or gone). */
export function opensLabel(opensCount: number | null, maxOpens: number): string {
  const cap = maxOpens === -1 ? "∞" : String(maxOpens);
  const used = opensCount === null ? "—" : String(opensCount);
  return `${used}/${cap}`;
}
