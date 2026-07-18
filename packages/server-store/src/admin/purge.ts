import type { AdminPurgeResult, LinkMetadataStore } from "../interfaces";
import type { LinkId } from "../types";

/**
 * Operator abuse purge (PG-17 / R25). Validates the id, then unconditionally purges the ciphertext
 * for it and marks the row terminal via {@link LinkMetadataStore.adminPurge} — the operator override,
 * NOT the token-gated user revoke. Idempotent, so a reported id can be purged (and re-purged) safely.
 *
 * The store is zero-knowledge: the operator supplies a specific link id (from an abuse report / legal
 * order), and this removes exactly that ciphertext. The server can never read the plaintext, so a
 * reported id is the only thing it can act on. This is a pure orchestration helper (no `pg` import) so
 * it can be unit-tested against the in-memory store; the Pg wiring lives in `purge-cli.ts`.
 */
export async function purgeLink(store: LinkMetadataStore, id: string): Promise<AdminPurgeResult> {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new Error("purgeLink: a non-empty link id is required");
  }
  return store.adminPurge(trimmed as LinkId);
}

/**
 * Human-readable, operator-facing summary of a purge. Printed to the operator's own terminal (this is
 * an interactive admin command, not a server log or metric), so echoing the id they just typed is
 * fine and useful — it never leaks to a client or to the metrics surface.
 */
export function renderPurgeResult(id: string, result: AdminPurgeResult): string {
  const trimmed = id.trim();
  if (!result.found) {
    return `link ${trimmed}: no row found — nothing to purge (already purged, expired-and-pruned, or never existed).`;
  }
  const blob = result.ciphertextRemoved
    ? "ciphertext deleted"
    : "no ciphertext remained (already purged)";
  const status = result.wasActive
    ? "row was active — now marked revoked (terminal)"
    : "row was already terminal — left terminal";
  return `link ${trimmed}: PURGED. ${status}; ${blob}.`;
}
