import * as Linking from "expo-linking";
import { LINK_ID_REGEX } from "@/src/lib/link-id";

// Extract the link id from a /l/:id deep link, or null for a normal launch (or any URL that is
// not a well-formed single-segment /l/:id). Pulled out of App.tsx so the regex routing semantics
// can be unit-tested in Node with expo-linking mocked. Behavior is unchanged: the path component
// (scheme + host stripped, no leading slash) must match exactly `l/<id>` with no further slashes,
// so a malformed nested link (e.g. `l/a/b`) does NOT misroute.
export function parseLinkId(url: string | null): string | null {
  if (!url) return null;
  const { scheme, hostname, path } = Linking.parse(url);
  // Custom app-scheme deep links (aesmsg://l/<id>) put the marker segment "l" in the URL authority,
  // so expo-linking's `new URL()` parse yields hostname="l", path="<id>". Web/universal links
  // (https://aesmsg.com/l/<id>) instead carry the marker in the path with the real domain as host.
  // Fold the authority back into the path for non-web schemes so one anchor matches both forms —
  // and a real web host (aesmsg.com) is never mistaken for the "l" path segment. Without this, the
  // in-app-browser fallback (window.location = aesmsg://l/<id>) opens the app to Home, not the reader.
  const isWeb = scheme === "http" || scheme === "https";
  const fullPath = !isWeb && hostname ? [hostname, path].filter(Boolean).join("/") : path;
  const match = fullPath?.match(/^l\/([^/]+)$/);
  return match ? (match[1] ?? null) : null;
}

// Resolve a user-pasted value to a canonical link id, or null. Accepts a bare id, a full
// https://<host>/l/:id universal link, or a aesmsg://l/:id app-scheme link (and the bare
// `l/:id` path form). Anything else — free text, wrong-length id, nested path — returns null.
export function parsePastedLink(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // A bare canonical id pasted on its own (no scheme/path for parseLinkId to match).
  if (LINK_ID_REGEX.test(trimmed)) return trimmed;
  // Otherwise treat it as a link and reuse the deep-link extraction, then tighten to the
  // canonical id shape so a short/typo'd id is refused.
  const id = parseLinkId(trimmed);
  return id && LINK_ID_REGEX.test(id) ? id : null;
}
