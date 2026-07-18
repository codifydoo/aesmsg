// Contact-support destination. The address is a placeholder until a real support inbox exists.
// supportMailtoUrl builds a mailto: the Help screen opens via Linking — kept pure (node-tested) so
// the URL encoding is verified without a renderer.

export const SUPPORT_EMAIL = "support@aesmsg.com";

/** Build a mailto: URL to the support address with a pre-filled subject. */
export function supportMailtoUrl(subject = "aesmsg support"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
