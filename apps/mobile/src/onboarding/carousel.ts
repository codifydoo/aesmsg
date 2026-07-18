// Pure carousel logic for the Welcome carousel (onboarding screen 2). Kept out of the .tsx so it
// can be unit-tested under node-env Vitest (tests/**/*.test.ts) with no React renderer.
//
// The Welcome screen shows N intro slides with PageDots + a Next/Get-started CTA. Index movement is
// clamped to [0, count-1]; the final slide is where the primary CTA hands off to identity creation.

export interface WelcomeSlide {
  /** Material Symbols glyph for the illustration tile. */
  icon: string;
  /** Geist headline. */
  title: string;
  /** Supporting body copy. */
  body: string;
}

// The three intro slides. Slide 2 is the design's S_Welcome verbatim ("Share through any app" +
// the ciphertext-only body); slides 1 and 3 frame it (the encrypt-locally promise and the
// recipient-only-decrypt promise) so the single design slide becomes a 3-slide carousel without
// inventing new product claims.
export const WELCOME_SLIDES: readonly WelcomeSlide[] = [
  {
    icon: "lock",
    title: "Encrypt before you send",
    body: "Your message and files are sealed on this device. Plaintext never leaves your phone.",
  },
  {
    icon: "ios_share",
    title: "Share through any app",
    body: "Send the link via Slack, email, anywhere. The app only carries ciphertext.",
  },
  {
    icon: "key",
    title: "Only they can open it",
    body: "The recipient decrypts on their device. Private keys stay on your device — and theirs.",
  },
] as const;

// The channel chips shown on the carousel — verbatim from the design's S_Welcome.
export const WELCOME_CHANNELS: readonly string[] = [
  "Slack",
  "WhatsApp",
  "iMessage",
  "Email",
  "SMS",
] as const;

/** Clamp an arbitrary index into the valid slide range [0, count-1]. count<=0 → 0. */
export function clampSlideIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index > count - 1) return count - 1;
  // Defend against fractional input from animated scroll offsets.
  return Math.round(index);
}

/** Advance one slide, clamped. Stops at the last slide (the CTA handles hand-off, not wrap-around). */
export function nextSlide(index: number, count: number): number {
  return clampSlideIndex(index + 1, count);
}

/** Go back one slide, clamped at the first. */
export function prevSlide(index: number, count: number): number {
  return clampSlideIndex(index - 1, count);
}

/** True when the given index is the final slide — i.e. the primary CTA should hand off, not advance. */
export function isLastSlide(index: number, count: number): boolean {
  return count > 0 && clampSlideIndex(index, count) === count - 1;
}
