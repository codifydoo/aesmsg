// Legal / info link destinations + a pure resolver for the About screen's link rows.
//
// These are the live aesmsg web pages (Privacy Policy, Terms of Use / EULA, Security overview) plus
// the public source repo. They satisfy App Store Guideline 3.1.2 (functional Terms of Use + Privacy
// Policy links at the point of purchase) and make the About screen's legal rows tappable.
//
// Kept as a plain pure module (no React Native imports) so it loads in node-env Vitest and the
// mapping is verified without a renderer (see tests/legal-links.test.ts).

export const PRIVACY_URL = "https://aesmsg.com/privacy";
export const TERMS_URL = "https://aesmsg.com/terms";
export const SECURITY_URL = "https://aesmsg.com/docs";
export const SOURCE_URL = "https://github.com/codifydoo/aesmsg";

/**
 * Resolve an About-screen legal/info link id (the `ABOUT_LINKS` ids from `about-data.ts`) to its
 * destination URL. Returns `null` for an unknown id (so the caller can simply skip opening it).
 */
export function resolveAboutLinkUrl(id: string): string | null {
  switch (id) {
    case "privacy":
      return PRIVACY_URL;
    case "terms":
      return TERMS_URL;
    case "security":
      return SECURITY_URL;
    case "acknowledgements":
      return SOURCE_URL;
    default:
      return null;
  }
}
