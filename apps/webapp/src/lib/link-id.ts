import { bytesToBase64Url } from "./base64";

// 16-char url-safe link id. Matches the server's LINK_ID_REGEX and the mobile generator
// (apps/mobile/src/lib/link-id.ts) exactly, so a web-minted link opens with the same AAD frame as a
// mobile-minted one — the linkId is bound into the message AAD, so its byte shape is interop-critical.
export const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;

export function generateLinkId(): string {
  // 12 random bytes → exactly 16 base64url chars. crypto.getRandomValues is native in the browser.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return bytesToBase64Url(bytes);
}
