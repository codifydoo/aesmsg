// Revoke-before-wipe orchestration (PG-14 / R11).
//
// Wiping this device's identity destroys the private key AND the per-link secret revocation tokens
// (BE-1 / R2) that are stored, encrypted-at-rest, alongside each tracked sent link. Those tokens are
// the ONLY thing that can revoke a link — so wiping first would permanently strand every outstanding
// link as live-and-unrevokable (a free "Never expires" link would then live forever with no kill
// switch). Users reach for "wipe" precisely to kill their outstanding links, so this is their LAST
// chance to revoke.
//
// Therefore the sequencing is: best-effort revoke every tracked LIVE link FIRST, then purge the
// identity/keys/blobs/DEK. A 404/410 from the server means the link is already gone — that is a
// SUCCESS, not a failure. Genuine failures (offline, 5xx) must NOT silently wipe: the caller is asked
// to explicitly acknowledge which links will remain live and unrevokable before we proceed, or to
// abort (leaving the identity intact so the user can retry later).
//
// This module is PURE + dependency-injected (no React, no expo, no network imports) so the whole
// orchestration — including the acknowledgement gate — is node-testable. The actual link source,
// revoke call, progress reporting, acknowledgement UI, and identity purge are all injected by the
// screen (PrivacySettingsScreen). The identity machine deliberately stays links-agnostic; this
// caller-level orchestration is what enforces revoke-before-wipe.

/** A tracked link considered for revocation, reduced to what the failure UI needs to name it. */
export interface WipeLinkRef {
  id: string;
  /** The sender's local label for the link (or null) — shown when a revoke fails. */
  label: string | null;
}

/** A link whose revoke genuinely failed (offline / server error). It stays live after the wipe. */
export interface RevokeFailure {
  link: WipeLinkRef;
  /** The underlying error, kept for logging. Never rendered raw to the user. */
  error: unknown;
}

export interface RevokeThenWipeDeps {
  /**
   * The tracked LIVE links to attempt to revoke before wiping. Already filtered to still-live
   * records (see selectLiveTrackedLinks) — already-expired links need no revoke.
   */
  listLinksToRevoke: () => Promise<WipeLinkRef[]>;
  /**
   * Revoke one link (authenticated by its stored revocation token). Rejects on failure; a rejection
   * carrying HTTP 404/410 (the link is already gone server-side) is treated as SUCCESS.
   */
  revoke: (id: string) => Promise<void>;
  /** Fired after each revoke attempt so the UI can show "Revoking {done} of {total}…". */
  onProgress?: ((done: number, total: number) => void) | undefined;
  /**
   * Asked ONLY when one or more revokes genuinely failed. The UI MUST warn which links will stay
   * live and unrevokable once the tokens are destroyed, and require an explicit acknowledgement.
   * Resolve true to wipe anyway; resolve false to abort the wipe (identity left intact for a retry).
   */
  confirmProceedDespiteFailures: (failures: RevokeFailure[]) => Promise<boolean>;
  /** Purge identity + keys + blobs + DEK. Called LAST — only after revokes + any required ack. */
  wipe: () => Promise<void>;
}

export interface RevokeThenWipeResult {
  /** Whether the identity was actually wiped. False only when the user declined after failures. */
  wiped: boolean;
  /** Links revoked, counting a 404/410 "already gone" as a success. */
  revokedCount: number;
  /** Links whose revoke failed — they stay LIVE and unrevokable after the wipe. */
  failures: RevokeFailure[];
}

/** The minimal record shape selectLiveTrackedLinks needs (a subset of SentLinkRecord). */
export interface TrackedLinkForSelection {
  id: string;
  label: string | null;
  /** ISO 8601 expiry. A link whose expiry is at or before `now` is already dead — skip it. */
  expiresAt: string;
}

/**
 * Reduce the locally-tracked links to the ones still worth revoking: those whose own recorded
 * expiry is strictly in the future at `now`. Already-expired links (including the past) are dropped
 * — revoking them would only waste calls and risk spurious offline failures that falsely warn the
 * user. "Never expires" links carry a far-future expiry and are therefore always included. `now` is
 * injected for determinism.
 */
export function selectLiveTrackedLinks(
  records: readonly TrackedLinkForSelection[],
  now: number,
): WipeLinkRef[] {
  return records
    .filter((r) => new Date(r.expiresAt).getTime() > now)
    .map((r) => ({ id: r.id, label: r.label }));
}

/**
 * True when a revoke rejection means the link is already gone server-side (HTTP 404/410), which we
 * count as a successful revoke rather than a failure. Duck-typed on `.status` so this stays free of
 * the ApiError import (which would drag expo-constants into this pure module).
 */
export function isAlreadyGoneRevokeError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return status === 404 || status === 410;
}

/**
 * Best-effort revoke every tracked live link, then wipe — the revoke-before-wipe orchestration.
 *
 * - Empty link list → straight to wipe (no acknowledgement prompt).
 * - Every link revoked (incl. 404/410 already-gone) → wipe proceeds.
 * - Some revokes failed → confirmProceedDespiteFailures is asked; true wipes anyway, false aborts
 *   (identity left intact so the user can retry or cancel).
 *
 * Never throws for a revoke failure — those are collected into `failures`. It DOES propagate a throw
 * from listLinksToRevoke, confirmProceedDespiteFailures, or wipe itself (real infra errors the
 * caller must surface).
 */
export async function revokeAllThenWipe(deps: RevokeThenWipeDeps): Promise<RevokeThenWipeResult> {
  const links = await deps.listLinksToRevoke();
  const total = links.length;
  const failures: RevokeFailure[] = [];
  let revokedCount = 0;

  for (let i = 0; i < total; i++) {
    const link = links[i] as WipeLinkRef;
    try {
      await deps.revoke(link.id);
      revokedCount++;
    } catch (error) {
      if (isAlreadyGoneRevokeError(error)) {
        // 404/410: the ciphertext is already gone — the kill switch already fired. Success.
        revokedCount++;
      } else {
        failures.push({ link, error });
      }
    }
    deps.onProgress?.(i + 1, total);
  }

  if (failures.length > 0) {
    // These links stay LIVE and unrevokable once the tokens are destroyed. Do NOT silently wipe:
    // require an explicit acknowledgement. Declining aborts — the identity (and its tokens) survive.
    const proceed = await deps.confirmProceedDespiteFailures(failures);
    if (!proceed) {
      return { wiped: false, revokedCount, failures };
    }
  }

  await deps.wipe();
  return { wiped: true, revokedCount, failures };
}
