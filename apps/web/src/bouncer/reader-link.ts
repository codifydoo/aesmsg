import { isValidLinkId } from "./deep-link";

// Origin of the browser reader (the `apps/webapp` surface), where a recipient can open a secure link
// without installing the native app. Build-time overridable so a preview/staging deploy can point at a
// different host; defaults to production. Mirrors the constant pattern in ../landing/app-store-links.ts.
export const WEBAPP_ORIGIN =
  process.env.NEXT_PUBLIC_AESMSG_WEBAPP_ORIGIN ?? "https://app.aesmsg.com";

// Builds the "Open in browser" URL for a secure link id. Returns null for a malformed id so the bouncer
// never renders a misleading cross-origin link — same stance as appDeepLink in ./deep-link. This is a
// plain string builder: no fetch, no state query, nothing that would break the bouncer's static invariant.
export function browserReaderUrl(id: string): string | null {
  if (!isValidLinkId(id)) return null;
  return `${WEBAPP_ORIGIN}/l/${id}`;
}
