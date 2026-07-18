import type { LinkStatus } from "@/src/links/links-data";

// Pure copy decision for the "Delete from this device?" confirmation. Local delete only UNTRACKS the
// link on this device — it never touches the server. Whether the confirmation warns that the link
// "keeps working for recipients" depends solely on whether the link is still live: a revoked/expired
// link is already dead server-side, so that warning would be misleading. Kept side-effect-free (no
// React) so the branch is node-testable.

/** True when a link is still openable server-side (not revoked, not expired). */
export function isLinkStillLive(status: LinkStatus): boolean {
  return status !== "revoked" && status !== "expired";
}

/**
 * Body copy for the local-delete confirmation. A still-live link warns that deleting only untracks
 * locally and Revoke is the real kill-switch; a dead link states plainly that nothing lives on the
 * server.
 */
export function deleteLinkConfirmCopy(status: LinkStatus | null): string {
  if (status !== null && isLinkStillLive(status)) {
    return "This only removes the link from your history on this device. It keeps working for recipients until it expires — use Revoke to purge it from the server.";
  }
  return "This removes the link from your history on this device. Nothing is stored on the server.";
}
