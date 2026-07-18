// About / Legal content — app metadata + the legal/info links shown on the About screen. Kept as a
// tiny typed module so the screen stays thin & presentational and the strings live in one place.
//
// Version note: the design mockup shows "Version 1.4.0 (build 482)", but the canonical product
// version used elsewhere in this app (Settings root footer) is aesmsg 1.0.0, so we use 1.0.0
// here for consistency across the app. The one-line security model + "private keys stay on this
// device" reassurance are required copy.
//
// The link rows are wired in `SettingsFlow` via `resolveAboutLinkUrl` in `@/src/system/legal-links`,
// which maps each id below to its live web destination (or the public repo for "Acknowledgements").

export const APP_NAME = "aesmsg";
export const APP_VERSION = "1.0.0";
export const APP_BUILD = "482";

/** Marketing-free, one-line statement of the security model. Required About copy. */
export const SECURITY_MODEL_LINE =
  "End-to-end encrypted on your device. The zero-knowledge backend only ever holds ciphertext.";

/** The reassurance line under the legal links. */
export const KEYS_ON_DEVICE_LINE = "Encrypt before you send. Private keys stay on your device.";

/** A tappable legal / info link on the About screen. */
export interface AboutLink {
  id: string;
  icon: string;
  title: string;
}

// Mirrors the design's S_About LRows verbatim (icon + sentence-case title), in order.
export const ABOUT_LINKS: AboutLink[] = [
  { id: "privacy", icon: "shield", title: "Privacy policy" },
  { id: "security", icon: "security", title: "Security overview" },
  { id: "terms", icon: "gavel", title: "Terms of service" },
  { id: "acknowledgements", icon: "favorite", title: "Acknowledgements" },
];

/** Open-source license line — the app is Apache 2.0 (per the design + repo license). */
export const OPEN_SOURCE_LINE = "Open source under Apache 2.0";
