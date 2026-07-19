"use client";

import { useCallback, useRef, useState } from "react";
import { revokeLink } from "@/src/api/client";
import { useIdentity } from "@/src/identity/use-identity";
import { listSentLinks } from "@/src/links/sent-links-store";
import {
  type RevokeFailure,
  revokeAllThenWipe,
  selectLiveTrackedLinks,
  wipeAllLocalStores,
} from "./wipe-local";

// React glue for the revoke-before-wipe orchestration (D10), shared by the /identity and /settings
// Danger Zones. It builds the concrete deps for `revokeAllThenWipe` (list live tracked links → revoke
// each with its stored token → purge all local stores + drop the in-memory keypair) and exposes the
// acknowledgement gate as state: when some revokes genuinely fail, `pendingFailures` is set so the
// caller can render the "wipe anyway — these links stay live" acknowledgement; `proceedAnyway()` /
// `cancelFailures()` resolve the injected confirm promise.

export interface LocalWipeController {
  /** True while the revoke-and-wipe is running. */
  busy: boolean;
  /** Non-null while awaiting the failure acknowledgement (render the "wipe anyway" prompt then). */
  pendingFailures: RevokeFailure[] | null;
  /** Begin the revoke-before-wipe. On a completed wipe, calls `onWiped`. */
  start: () => void;
  /** Acknowledge the failures and proceed to wipe anyway (links stay live). */
  proceedAnyway: () => void;
  /** Decline: abort the wipe, leaving the identity + its revoke tokens intact. */
  cancelFailures: () => void;
}

export function useLocalWipe(opts: { onWiped: () => void }): LocalWipeController {
  const { wipe: wipeIdentity } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [pendingFailures, setPendingFailures] = useState<RevokeFailure[] | null>(null);
  // Resolver for the confirm-despite-failures promise, set while the acknowledgement UI is shown.
  const resolverRef = useRef<((proceed: boolean) => void) | null>(null);
  const onWipedRef = useRef(opts.onWiped);
  onWipedRef.current = opts.onWiped;

  const proceedAnyway = useCallback(() => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setPendingFailures(null);
    resolve?.(true);
  }, []);

  const cancelFailures = useCallback(() => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setPendingFailures(null);
    resolve?.(false);
  }, []);

  const start = useCallback(() => {
    setBusy(true);
    void (async () => {
      try {
        const records = await listSentLinks();
        const live = selectLiveTrackedLinks(records, Date.now());
        const tokenById = new Map(records.map((r) => [r.id, r.revocationToken]));
        const result = await revokeAllThenWipe({
          listLinksToRevoke: async () => live,
          // A best-effort revoke per link, authenticated by its stored token. A 404/410 is treated as
          // success inside revokeAllThenWipe (isAlreadyGoneRevokeError).
          revoke: async (id) => {
            await revokeLink(id, tokenById.get(id) ?? null);
          },
          confirmProceedDespiteFailures: (failures) =>
            new Promise<boolean>((resolve) => {
              resolverRef.current = resolve;
              setPendingFailures(failures);
            }),
          // Full local purge THEN drop the in-memory keypair + flip to no_identity via the context.
          wipe: async () => {
            await wipeAllLocalStores();
            await wipeIdentity();
          },
        });
        if (result.wiped) onWipedRef.current();
      } finally {
        setBusy(false);
      }
    })();
  }, [wipeIdentity]);

  return { busy, pendingFailures, start, proceedAnyway, cancelFailures };
}
