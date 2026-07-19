// Parse the recipient link id from the reader URL. PURE (no React, no router, no window) so it is
// unit-testable in Node/browser without a DOM. Mirrors the local-regex convention of
// apps/web/src/bouncer/deep-link.ts and the mobile link-id generator (apps/mobile/src/lib/link-id.ts).
//
// Resolution order (D1):
//   1. `pathname` matches `^/l/<16-char id>/?$` — PRODUCTION. The static host rewrites `/l/<id>` to
//      serve the same `l.html` WITHOUT changing the browser URL, so `location.pathname` is still
//      `/l/<id>` when the client reads it.
//   2. else the `?id=` search param — DEV/local. `next dev` has no `[id]` route, so `/l/<id>` 404s;
//      developers load `/l?id=<id>` and `useSearchParams` supplies the id.
//   3. neither (or a malformed id) → `{ ok: false }` → the Invalid terminal, with ZERO network.

// 16-char url-safe id. Identical to the server's LINK_ID_REGEX and src/lib/link-id.ts, so a link
// minted anywhere in the product parses here byte-for-byte.
export const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;

// Path form: `/l/<16-char id>` with an optional trailing slash. The path segment must ALSO satisfy
// LINK_ID_REGEX (defense in depth — the edge rewrite already rejects junk paths).
const LINK_PATH_REGEX = /^\/l\/([A-Za-z0-9_-]{16})\/?$/;

export type ReadLinkIdResult = { ok: true; id: string } | { ok: false };

/**
 * Resolve the link id from the reader's `pathname` + `search`. The path takes precedence over a
 * conflicting `?id=` (a rewritten `/l/<id>` is the authoritative production shape).
 */
export function readLinkId(pathname: string, search: string): ReadLinkIdResult {
  const pathId = LINK_PATH_REGEX.exec(pathname)?.[1];
  if (pathId) return { ok: true, id: pathId };

  const queryId = new URLSearchParams(search).get("id");
  if (queryId !== null && LINK_ID_REGEX.test(queryId)) return { ok: true, id: queryId };

  return { ok: false };
}
