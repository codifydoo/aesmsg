// Revoke-before-wipe orchestration + full local purge (D10, port of apps/mobile/src/settings/
// wipe-orchestration.ts).
//
// Wiping this device's identity destroys the private key AND the per-link secret revocation tokens
// (stored cleartext in the `sent-links` store). Those tokens are the ONLY thing that can revoke a
// link, so wiping first would strand every outstanding link as live-and-unrevokable. Users reach for
// "wipe" precisely to kill their outstanding links, so this is their LAST chance to revoke.
//
// Sequencing: best-effort revoke every tracked LIVE link FIRST, then purge ALL local stores. A
// 404/410 means the link is already gone server-side — a SUCCESS, not a failure. Genuine failures
// (offline, 5xx) must NOT silently wipe: the caller is asked to explicitly acknowledge which links
// stay live before proceeding, or to abort (leaving the identity intact so the user can retry).
//
// The orchestration (`revokeAllThenWipe`) is PURE + dependency-injected (no React), so it — including
// the acknowledgement gate — is node/browser-testable with injected spies. The concrete
// `wipeAllLocalStores` clears every IndexedDB store at the storage layer; the in-memory keypair drop +
// state flip stays the identity context's `wipe()` (the screen composes both).

import { clearContacts } from "@/src/contacts/contacts-store";
import { deleteIdentity } from "@/src/identity/identity-store";
import { clearRetiredEntries } from "@/src/identity/retired-keys-store";
import { clearSentLinks } from "@/src/links/sent-links-store";
import { clearSettings } from "@/src/settings/settings-store";

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

/** The minimal record shape selectLiveTrackedLinks needs (a subset of SentLinkRecord). */
export interface TrackedLinkForSelection {
  id: string;
  label: string | null;
  /** ISO 8601 expiry. A link whose expiry is at or before `now` is already dead — skip it. */
  expiresAt: string;
}

export interface RevokeThenWipeDeps {
  /** The tracked LIVE links to attempt to revoke before wiping (already filtered to still-live). */
  listLinksToRevoke: () => Promise<WipeLinkRef[]>;
  /**
   * Revoke one link (authenticated by its stored revocation token). Rejects on failure; a rejection
   * carrying HTTP 404/410 (already gone server-side) is treated as SUCCESS.
   */
  revoke: (id: string) => Promise<void>;
  /** Fired after each revoke attempt so the UI can show progress. */
  onProgress?: ((done: number, total: number) => void) | undefined;
  /**
   * Asked ONLY when one or more revokes genuinely failed. The UI MUST warn which links stay live and
   * require an explicit acknowledgement. Resolve true to wipe anyway; false to abort (identity kept).
   */
  confirmProceedDespiteFailures: (failures: RevokeFailure[]) => Promise<boolean>;
  /** Purge all local data. Called LAST — only after revokes + any required acknowledgement. */
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

/**
 * Reduce the locally-tracked links to the ones still worth revoking: those whose recorded expiry is
 * strictly in the future at `now`. Already-expired links are dropped (revoking them only wastes calls
 * and risks spurious offline failures). "Never expires" links carry a far-future expiry and are always
 * included. `now` is injected for determinism.
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
 * count as a successful revoke. Duck-typed on `.status` so this stays free of the ApiError import.
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
 * - Some revokes failed → confirmProceedDespiteFailures is asked; true wipes anyway, false aborts.
 *
 * Never throws for a revoke failure — those are collected into `failures`. It DOES propagate a throw
 * from listLinksToRevoke, confirmProceedDespiteFailures, or wipe itself.
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
        revokedCount++;
      } else {
        failures.push({ link, error });
      }
    }
    deps.onProgress?.(i + 1, total);
  }

  if (failures.length > 0) {
    const proceed = await deps.confirmProceedDespiteFailures(failures);
    if (!proceed) {
      return { wiped: false, revokedCount, failures };
    }
  }

  await deps.wipe();
  return { wiped: true, revokedCount, failures };
}

/**
 * Purge EVERY local IndexedDB store — the "clean slate" of the wipe (mobile `wipeStorage` parity):
 * the identity row, the retired-keys blob, the settings blob, the sent-links, and the contacts. The
 * in-memory keypair drop + state flip to `no_identity` stays the identity context's `wipe()`; the
 * screen calls both. Deleting a missing key is a no-op, so this is idempotent + safe to call twice.
 */
export async function wipeAllLocalStores(): Promise<void> {
  await deleteIdentity("primary");
  await clearRetiredEntries();
  await clearSettings();
  await clearSentLinks();
  await clearContacts();
}
