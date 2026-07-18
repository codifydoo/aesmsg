import type { ListMessageResult, ListMessagesResponse } from "@/src/api/client";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

// Pure reconciliation of locally-tracked sent links against the server's live status.
//
// POST /api/messages/list returns one result per requested id. The API handler
// (createListMessagesHandler in apps/api/src/handlers/messages-handler.ts) only echoes a row as
// { status: "active", expiresAt, maxOpens, opensCount } when it is still active AND unexpired;
// everything else (not_found, revoked, expired, past-expiry) collapses to an explicit
// { status: "gone" }. That explicit "gone" is the ONLY server signal that downgrades a still-future
// link (→ red "Revoked"). A local record whose id is entirely ABSENT from an otherwise-successful
// response is NOT such a signal — the server simply returned no row for it (a truncated/proxied
// response, a version skew) — so it resolves to "unknown", never "gone". We do still fail a record
// to "gone" if its own locally-recorded expiresAt is already past `now`, so a stale/clock-skewed
// server row cannot resurrect an expired link in the list. No Date.now() here — `now` is injected
// for determinism.
//
// OFFLINE / UNREACHABLE (FE-4 / R4): `serverResponse` is `null` when the live-status fetch failed
// (airplane mode, flaky network, captive portal, DNS/host down). A failed fetch is NOT evidence
// that a link was revoked — we simply don't know. In that case a record resolves to "unknown"
// (neutral "Status unknown"), NOT "gone". The ONLY downgrade permitted while offline is the
// deterministic local-expiry clock: a record whose own expiresAt has already passed is genuinely
// "gone" (→ "Expired") regardless of the network. "gone" for a still-future link therefore only
// ever comes from a real server response, so the red "Revoked" chip can never be a false alarm.

// Re-export so existing importers can continue to reference these types from this module.
export type { ListMessageResult, ListMessagesResponse } from "@/src/api/client";

/**
 * The server-derived liveness of a tracked link after reconciliation:
 * - "active"  — a real /list response confirmed it live (and it isn't locally expired).
 * - "gone"    — a real /list response marked it gone, OR its own expiresAt is already past.
 * - "unknown" — the /list fetch failed (offline/unreachable) and the link isn't locally expired,
 *               so liveness could not be confirmed. Never rendered as "Revoked".
 */
export type ServerStatus = "active" | "gone" | "unknown";

export interface ReconciledLink {
  /** The local tracking record (id, recipient fingerprint, label, original expiry/max-opens). */
  record: SentLinkRecord;
  /** Liveness as resolved against the server (and local-expiry guard). */
  serverStatus: ServerStatus;
  /** Live opens consumed (server-reported); null when gone. */
  opensCount: number | null;
  /** Live max opens (server-reported); falls back to the local record's value when gone. */
  maxOpens: number;
  /** Live expiry ISO (server-reported); falls back to the local record's value when gone. */
  expiresAt: string;
}

export function reconcileSentLinks(
  localRecords: SentLinkRecord[],
  /** The /list response, or `null` when the fetch failed (offline/unreachable). */
  serverResponse: ListMessagesResponse | null,
  now: number,
): ReconciledLink[] {
  const byId = new Map<string, ListMessageResult>();
  if (serverResponse) {
    for (const r of serverResponse.results) byId.set(r.id, r);
  }

  return localRecords.map((record) => {
    const locallyExpired = new Date(record.expiresAt).getTime() <= now;

    // Server unreachable: we cannot assert liveness. Only the deterministic local-expiry clock may
    // downgrade a link — a genuinely past-expiry record is "gone" (→ "Expired"); everything else is
    // "unknown", NEVER "gone"/"revoked". A later successful refresh reconciles back to truth.
    if (serverResponse === null) {
      return {
        record,
        serverStatus: locallyExpired ? "gone" : "unknown",
        opensCount: null,
        maxOpens: record.maxOpens,
        expiresAt: record.expiresAt,
      };
    }

    // A genuinely past-expiry local record is "gone" regardless of the server response — defensive
    // against a stale/clock-skewed server row resurrecting an expired link.
    if (locallyExpired) {
      return {
        record,
        serverStatus: "gone",
        opensCount: null,
        maxOpens: record.maxOpens,
        expiresAt: record.expiresAt,
      };
    }

    const server = byId.get(record.id);
    if (server && server.status === "active") {
      return {
        record,
        serverStatus: "active",
        opensCount: server.opensCount,
        maxOpens: server.maxOpens,
        expiresAt: server.expiresAt,
      };
    }
    if (server) {
      // Explicit per-id { status: "gone" } — a real server signal of revoked/expired-server-side.
      return {
        record,
        serverStatus: "gone",
        opensCount: null,
        maxOpens: record.maxOpens,
        expiresAt: record.expiresAt,
      };
    }

    // Successful response, but this id was omitted from `results`. That is NOT an explicit "gone"
    // signal, so we resolve to "unknown" (neutral) rather than the red "Revoked" chip — a still-future
    // link only ever reads "gone" from an explicit result or genuine local expiry (handled above).
    return {
      record,
      serverStatus: "unknown",
      opensCount: null,
      maxOpens: record.maxOpens,
      expiresAt: record.expiresAt,
    };
  });
}
