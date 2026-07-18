import { ApiError } from "@/src/api/client";

// Pure classification of a revoke attempt's outcome, shared by the Links tab's revoke UX.
//
// Revoke is the product's kill-switch, so its failures must be classified deliberately: an
// already-gone (404/410) response is SUCCESS from the sender's point of view — the ciphertext is
// already unavailable to recipients — while any other failure (offline, 5xx, malformed) is a real
// error that must keep the link visible as still-live and offer a retry (UX §B: "Revoke flow has no
// busy/error handling").

export type RevokeResult = "revoked" | "error";

/**
 * Whether a thrown revoke error means the link is ALREADY GONE server-side (404 not-found / 410
 * gone). Such a response is treated as a successful revoke: the sender's goal (recipients can no
 * longer open the link) is already achieved. Every other error is a genuine failure.
 */
export function isAlreadyGone(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 410);
}
