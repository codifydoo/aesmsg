import { bytesToBase64Url } from "@/src/lib/base64";

// 16-char url-safe id. Matches the web generator + the server's LINK_ID_REGEX, so a
// mobile-minted link opens with the same AAD frame as a web-minted one.
export const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;

export function generateLinkId(): string {
  // crypto.getRandomValues is installed on Hermes by the Web Crypto polyfill at app entry,
  // and is native in Node (tests). 12 bytes → 16 base64url chars.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return bytesToBase64Url(bytes);
}
