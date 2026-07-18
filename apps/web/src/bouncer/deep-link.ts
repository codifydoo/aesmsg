// Local copy of the canonical link-id shape (the server's LINK_ID_REGEX lives in @aesmsg/api and is
// not a web dependency). A 12-byte base64url id is exactly 16 chars of [A-Za-z0-9_-].
const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;

export function isValidLinkId(id: string): boolean {
  return LINK_ID_REGEX.test(id);
}

// The native app registers the `aesmsg://` scheme and the https universal link. The bouncer only
// renders when the universal link did NOT open the app, so its button falls back to the scheme.
// Returns null for a malformed id so the caller shows the generic "not available" message and never
// constructs a misleading deep link.
export function appDeepLink(id: string): string | null {
  if (!isValidLinkId(id)) return null;
  return `aesmsg://l/${id}`;
}
