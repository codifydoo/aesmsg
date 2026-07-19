"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  classifyApiError,
  type ListMessageResult,
  listMessages,
  revokeLink,
} from "@/src/api/client";
import { type DisplayLink, reconcileLink } from "@/src/links/link-status";
import { getSentLink, listSentLinks, type SentLinkRecord } from "@/src/links/sent-links-store";

// The Links tab data hook. Loads locally-tracked records, fetches their live server status in one (or
// a few, chunked) bulk call(s), reconciles each to a display status, and exposes the mutating revoke.
// A server-fetch failure degrades to last-known (never a false "revoked"); only a local-store read
// failure surfaces `error`.

const LIST_CHUNK = 100; // server accepts 1–100 ids per /list call.

export type RevokeResult = "revoked" | "error";

export interface UseSentLinksResult {
  links: DisplayLink[];
  loading: boolean;
  /** True only when the local-store read itself failed (server failures degrade to last-known). */
  error: boolean;
  refresh: () => Promise<void>;
  /**
   * Revoke a link (server purge), authenticated by its stored token. Returns "revoked" on a confirmed
   * revoke OR an already-gone (404/410) response; "error" on any other failure. Never throws to render.
   * On success the link is optimistically marked revoked so the row transitions immediately.
   */
  revoke: (id: string) => Promise<RevokeResult>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Fetch live status for every id, chunked. A transport failure degrades to an empty map (last-known). */
async function fetchServerMap(ids: string[]): Promise<Map<string, ListMessageResult>> {
  const map = new Map<string, ListMessageResult>();
  for (const batch of chunk(ids, LIST_CHUNK)) {
    try {
      const { results } = await listMessages(batch);
      for (const result of results) map.set(result.id, result);
    } catch {
      // Transport failure is NOT a revoke signal — leave these ids absent → reconcile as last-known.
    }
  }
  return map;
}

export function useSentLinks(): UseSentLinksResult {
  const [rawLinks, setRawLinks] = useState<DisplayLink[]>([]);
  const [revokedIds, setRevokedIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const records = await listSentLinks();
      const now = Date.now();
      const serverMap =
        records.length === 0 ? new Map() : await fetchServerMap(records.map((r) => r.id));
      setRawLinks(records.map((r) => reconcileLink(r, serverMap.get(r.id) ?? null, now)));
    } catch {
      // Only a local-store read failure reaches here (server failures are swallowed above).
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = useCallback(
    async (id: string): Promise<RevokeResult> => {
      let record: SentLinkRecord | null = rawLinks.find((l) => l.record.id === id)?.record ?? null;
      if (!record) record = await getSentLink(id).catch(() => null);
      try {
        await revokeLink(id, record?.revocationToken ?? null);
        setRevokedIds((prev) => new Set(prev).add(id));
        return "revoked";
      } catch (err) {
        const kind = classifyApiError(err);
        if (kind === "not_found" || kind === "gone") {
          // Already unavailable to recipients — the sender's goal is met.
          setRevokedIds((prev) => new Set(prev).add(id));
          return "revoked";
        }
        return "error";
      }
    },
    [rawLinks],
  );

  // Apply optimistic revoke overrides at render so a just-revoked row reads "revoked" regardless of
  // what a later reconcile reports. The local record is retained (revoked links stay visible).
  const links = useMemo<DisplayLink[]>(
    () => rawLinks.map((l) => (revokedIds.has(l.record.id) ? { ...l, status: "revoked" } : l)),
    [rawLinks, revokedIds],
  );

  return { links, loading, error, refresh, revoke };
}
