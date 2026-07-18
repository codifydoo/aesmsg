// Pure logic: revoke the link the sender just created, straight from the "Secure link created"
// success screen. This is the product's kill-switch for the "I pasted it in the wrong channel"
// moment, so it MUST go through the real, authenticated revoke path — not a stub.
//
// It reuses revokeTrackedLink (BE-1 / R2): that helper looks up the record's secret revocation token
// and sends it in the x-aesmsg-revocation-token header, then drops the local tracking record. We
// wrap it only to fold the "already gone" server responses (404/410) into success — if the ciphertext
// is already unavailable to recipients, the sender's goal is achieved — and to leave a real error as
// an error (offline / server fault) so the UI can keep the link visible as still-live.

import { ApiError } from "@/src/api/client";
import {
  productionSentLinksDeps,
  revokeTrackedLink,
  type SentLinksDeps,
} from "@/src/links/use-sent-links";

export type RevokeCreatedLinkResult = "revoked" | "error";

/**
 * Revoke a just-created link by id. Resolves to "revoked" on a confirmed revoke OR an already-gone
 * (404/410) response; "error" on any other failure (offline, 5xx, …) so the caller keeps the link
 * live. `deps` is injectable for tests; production uses the real store+API wiring.
 */
export async function revokeCreatedLink(
  id: string,
  deps: SentLinksDeps = productionSentLinksDeps,
): Promise<RevokeCreatedLinkResult> {
  try {
    await revokeTrackedLink(deps, id);
    return "revoked";
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
      // Already gone server-side = success. revokeTrackedLink skips its local delete when the revoke
      // call throws, so clean up the now-orphaned tracking record here (best-effort).
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
