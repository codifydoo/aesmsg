"use client";

import { useEffect, useState } from "react";
import { APP_STORE_URL, PLAY_STORE_URL } from "./app-store-links";

// Picks the right native-app store for a visitor's user agent. Android devices go to the Play
// Store; everything else (iPhone, iPad, and any desktop where there is no single right answer)
// falls back to the App Store — the historical default for the "Get the app" CTA. Kept as a pure
// function so it is trivially testable without a DOM.
export function storeUrlForUserAgent(userAgent: string): string {
  return /android/i.test(userAgent) ? PLAY_STORE_URL : APP_STORE_URL;
}

/**
 * Returns the best store URL for the visitor's device, for the "Get the app" CTAs.
 *
 * Detection runs after mount (client only): the first render always yields APP_STORE_URL so the
 * statically-rendered HTML and the first client render agree (no hydration mismatch), then Android
 * visitors are switched to the Play Store once `navigator.userAgent` is readable. This is a static
 * site, so there is no server-side User-Agent to branch on — the brief pre-hydration window where an
 * Android tap would hit the App Store is acceptable.
 */
export function useStoreUrl(): string {
  const [url, setUrl] = useState(APP_STORE_URL);

  useEffect(() => {
    setUrl(storeUrlForUserAgent(navigator.userAgent));
  }, []);

  return url;
}
