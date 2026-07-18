import { useCallback, useEffect, useState } from "react";
import { listMessages as apiListMessages, revokeLink as apiRevokeLink } from "@/src/api/client";
import { toDisplayLink } from "@/src/links/link-display";
import { type ListMessagesResponse, reconcileSentLinks } from "@/src/links/link-reconciliation";
import type { Link } from "@/src/links/links-data";
import type { RecipientContactRef } from "@/src/links/recipient-resolution";
import { reminderCancelTarget } from "@/src/links/reminder-cancel";
import { isAlreadyGone, type RevokeResult } from "@/src/links/revoke-outcome";
import {
  recordSentLink,
  type SentLinkRecord,
  deleteSentLink as storeDeleteSentLink,
  getSentLink as storeGetSentLink,
  listSentLinks as storeListSentLinks,
} from "@/src/links/sent-links-store";

// useSentLinks — the Links tab's data hook. Loads locally-tracked records, fetches their live
// server status in one bulk call, reconciles, and exposes the resulting display links plus
// loading/error flags and the mutating actions. The pure load+reconcile pipeline is extracted as
// loadAndReconcile(deps, now) so it is node-testable via DI (store + api + injected clock); the hook
// is the thin React wrapper exercised on-device.
//
// Refresh strategy: load on mount + manual refresh() (pull-to-refresh). No background sync (YAGNI).

/** Injected dependencies for the pure pipeline (store + api). */
export interface SentLinksDeps {
  listSentLinks: () => Promise<SentLinkRecord[]>;
  listMessages: (ids: string[]) => Promise<ListMessagesResponse>;
  /** Reads one tracked record so revoke can recover its secret revocation token (BE-1 / R2). */
  getSentLink: (id: string) => Promise<SentLinkRecord | null>;
  /** Revokes a link; `revocationToken` authenticates it (omit/null → un-tokened legacy revoke). */
  revokeLink: (id: string, revocationToken?: string | null) => Promise<void>;
  deleteSentLink: (id: string) => Promise<void>;
  /**
   * Optional: the on-device contacts directory, used only to resolve each link's recipient card
   * (name + verified state) from the fingerprint it was sealed to. Omitted (or a read failure) →
   * links still render with a neutral "Unknown recipient".
   */
  listContacts?: () => Promise<readonly RecipientContactRef[]>;
  /**
   * Optional: cancel a scheduled local "expiring soon" reminder by its notification id when its link
   * is revoked early (the nudge is pointless once the link is dead). No-op for records that never
   * scheduled one. Kept optional so the pure pipeline + its node tests need not supply it.
   */
  cancelReminder?: (notificationId: string) => Promise<void>;
}

/**
 * The real store + API wiring. Exported so other shell-level loaders can drive the same reconcile
 * pipeline via loadAndReconcile() without reconstructing the dependency set.
 *
 * `listContacts` / `cancelReminder` use LAZY dynamic imports so the pure module graph (and its
 * node-env tests) never statically pull in the contacts store's native storage deps or
 * expo-notifications — they load only when actually invoked on-device.
 */
export const productionSentLinksDeps: SentLinksDeps = {
  listSentLinks: storeListSentLinks,
  listMessages: apiListMessages,
  getSentLink: storeGetSentLink,
  revokeLink: apiRevokeLink,
  deleteSentLink: storeDeleteSentLink,
  listContacts: async () => {
    const { listContacts } = await import("@/src/contacts/contacts-store");
    return listContacts();
  },
  cancelReminder: async (notificationId: string) => {
    const { cancel } = await import("@/src/notifications/notifications");
    await cancel(notificationId);
  },
};

/** Best-effort cancel of a link's scheduled "expiring soon" reminder (null id / no dep → no-op). */
async function cancelLinkReminder(
  deps: SentLinksDeps,
  record: SentLinkRecord | null,
): Promise<void> {
  const reminderId = reminderCancelTarget(record);
  if (reminderId && deps.cancelReminder) {
    try {
      await deps.cancelReminder(reminderId);
    } catch {
      // best-effort: a still-scheduled reminder for a dead link is harmless noise, not a failure.
    }
  }
}

/**
 * Revoke a tracked link, then drop its local record. Pure + DI so it is node-testable without a
 * React renderer. Looks up the record to recover its secret revocation token (BE-1 / R2) and passes
 * it to revokeLink. Records with no token — legacy records written before authenticated revocation,
 * or a lookup that returns null — revoke un-tokened (legacy server rows honor that). On a successful
 * revoke it cancels the link's now-pointless "expiring soon" reminder, then removes the local record.
 * A real revoke failure THROWS (the record is left intact so the caller can retry).
 */
export async function revokeTrackedLink(deps: SentLinksDeps, id: string): Promise<void> {
  const record = await deps.getSentLink(id);
  await deps.revokeLink(id, record?.revocationToken ?? null);
  await cancelLinkReminder(deps, record);
  await deps.deleteSentLink(id);
}

/**
 * Revoke a tracked link and classify the outcome for the Links-tab revoke UX. An already-gone
 * (404/410) server response is folded into "revoked" — the sender's goal (recipients can no longer
 * open it) is already met — and the orphaned local record is cleaned up (revokeTrackedLink skips its
 * delete when the revoke call throws). Every other failure resolves to "error" so the caller keeps
 * the link visible as still-live and offers a retry. Never throws.
 */
export async function revokeTrackedLinkOutcome(
  deps: SentLinksDeps,
  id: string,
): Promise<RevokeResult> {
  try {
    await revokeTrackedLink(deps, id);
    return "revoked";
  } catch (err) {
    if (isAlreadyGone(err)) {
      const record = await deps.getSentLink(id).catch(() => null);
      await cancelLinkReminder(deps, record);
      try {
        await deps.deleteSentLink(id);
      } catch {
        // Local cleanup is secondary — the link is already unavailable to recipients.
      }
      return "revoked";
    }
    return "error";
  }
}

/** Result of the pure load pipeline: the display links plus whether the server was reachable. */
export interface LoadResult {
  links: Link[];
  /**
   * False when the live-status fetch failed (offline/unreachable). Drives the offline banner and
   * guarantees links render their last-known/"unknown" status rather than a false "Revoked" (FE-4).
   */
  serverReachable: boolean;
}

/**
 * Pure load pipeline: read local records, fetch live status, reconcile, map to display links.
 * If the server fetch fails (offline/unreachable), we reconcile against `null` — the links still
 * render, but as "Status unknown" (or "Expired" purely from the local clock), NEVER "Revoked" — and
 * `serverReachable` is false so the caller can show an offline banner. `now` is injected for
 * determinism. A later successful load reconciles every link back to the server's truth.
 */
export async function loadAndReconcile(deps: SentLinksDeps, now: number): Promise<LoadResult> {
  const records = await deps.listSentLinks();
  if (records.length === 0) return { links: [], serverReachable: true };

  let server: ListMessagesResponse | null;
  try {
    server = await deps.listMessages(records.map((r) => r.id));
  } catch {
    // Transport failure is NOT evidence of revocation — reconcile as "unknown", never "gone".
    server = null;
  }

  // The contacts directory only decorates each link's recipient card; a read failure (or no
  // directory) must never block the link list, so it degrades to an empty directory (→ "Unknown
  // recipient").
  let contacts: readonly RecipientContactRef[] = [];
  try {
    contacts = (await deps.listContacts?.()) ?? [];
  } catch {
    contacts = [];
  }

  const links = reconcileSentLinks(records, server, now).map((r) =>
    toDisplayLink(r, now, contacts),
  );
  return { links, serverReachable: server !== null };
}

/** The (error, offline) flag pair a settled refresh applies to the hook state. */
export interface SentLinksLoadFlags {
  /** True only when the local-store read itself failed (server failures degrade to gone/unknown). */
  error: boolean;
  /** True when the server was unreachable (offline) while there were links to reconcile. */
  offline: boolean;
}

/**
 * The (error, offline) pair a settled refresh must apply. Extracted pure + node-testable so the two
 * flags are ALWAYS derived together and can never go stale relative to each other:
 *   - a completed load clears `error` and mirrors server reachability into `offline`;
 *   - a local-store throw sets `error` AND resets `offline`, so a store failure that follows a prior
 *     offline load can't leave BOTH flags true at once.
 * The hook applies exactly this result on every refresh (both the success and the catch paths).
 */
export function sentLinksLoadFlags(
  outcome: { ok: true; serverReachable: boolean } | { ok: false },
): SentLinksLoadFlags {
  if (outcome.ok) return { error: false, offline: !outcome.serverReachable };
  return { error: true, offline: false };
}

export interface UseSentLinksResult {
  links: Link[];
  loading: boolean;
  /** True only when the last load failed at the local-store level (server failures degrade to gone). */
  error: boolean;
  /**
   * True when the last load couldn't reach the server (offline/unreachable) while there were links
   * to reconcile. Links then render last-known/"unknown"; the Links tab shows an offline banner.
   */
  offline: boolean;
  refresh: () => Promise<void>;
  recordNewLink: (record: Omit<SentLinkRecord, "schemaVersion">) => Promise<void>;
  /**
   * Revoke a link then refresh. Resolves to "revoked" on a confirmed revoke OR an already-gone
   * (404/410) response; "error" on any other failure — the caller drives busy/error UX off this and
   * keeps the link visible on "error".
   */
  revokeAndDelete: (id: string) => Promise<RevokeResult>;
  deleteLocal: (id: string) => Promise<void>;
}

export function useSentLinks(deps: SentLinksDeps = productionSentLinksDeps): UseSentLinksResult {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { links: loaded, serverReachable } = await loadAndReconcile(deps, Date.now());
      setLinks(loaded);
      const flags = sentLinksLoadFlags({ ok: true, serverReachable });
      setError(flags.error);
      setOffline(flags.offline);
    } catch {
      // Only a local-store read failure reaches here (server failures are swallowed inside the
      // pipeline). sentLinksLoadFlags({ ok: false }) surfaces the non-fatal "couldn't load" state AND
      // resets `offline`, so a store throw after a prior offline load can't leave both flags
      // stale-true at once.
      const flags = sentLinksLoadFlags({ ok: false });
      setError(flags.error);
      setOffline(flags.offline);
    } finally {
      setLoading(false);
    }
  }, [deps]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recordNewLink = useCallback(
    async (record: Omit<SentLinkRecord, "schemaVersion">) => {
      await recordSentLink(record);
      await refresh();
    },
    [refresh],
  );

  const revokeAndDelete = useCallback(
    async (id: string): Promise<RevokeResult> => {
      // Revoke (authenticated by the record's revocation token) purges the ciphertext server-side and
      // cancels the link's expiry reminder; already-gone (404/410) counts as success. On a real
      // failure the record is left intact so refresh() keeps the link visible for a retry.
      const result = await revokeTrackedLinkOutcome(deps, id);
      await refresh();
      return result;
    },
    [deps, refresh],
  );

  const deleteLocal = useCallback(
    async (id: string) => {
      await deps.deleteSentLink(id);
      await refresh();
    },
    [deps, refresh],
  );

  return { links, loading, error, offline, refresh, recordNewLink, revokeAndDelete, deleteLocal };
}
