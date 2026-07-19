"use client";

import { useEffect, useState } from "react";

// Blur-on-background shield for the secure reader (D6), mirroring mobile's `isObscured` cover. When
// the tab is hidden (or the window loses focus) the reader paints an opaque cover INSTEAD of the
// plaintext, so decrypted text is not left in a backgrounded/preview-captured frame. Best-effort —
// SSR-safe (guards `typeof document`) and, being web, strictly weaker than a native app: screenshot
// blocking is impossible on the web platform (documented gap — see AGENTS.md), so this only covers
// the background/blur case.

// Derive the cover state from the ACTUAL page state at this instant. SSR/static-export safe: at
// build-time prerender there is no `document` and nothing is painted, so it reports "not obscured".
// The reader keys its persisted cover state on visibility (the blur/focus handlers below are
// event-driven: a blur forces the cover, a focus re-derives from visibility), so the mount seed reads
// `visibilityState` — matching what the hook actually keys on.
function computeObscured(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

export function usePrivacyShield(): { isObscured: boolean } {
  // Seed from the real visibility at mount rather than a blind `false`, so a tab that is ALREADY
  // hidden when the decrypt resolves never paints the plaintext for a frame before the effect attaches.
  const [isObscured, setObscured] = useState(computeObscured);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncFromVisibility = () => setObscured(computeObscured());
    const onBlur = () => setObscured(true);

    document.addEventListener("visibilitychange", syncFromVisibility);
    window.addEventListener("blur", onBlur);
    // On focus, re-derive from visibility rather than force-clear (the tab could regain focus while
    // still transitioning) — keeps the cover honest.
    window.addEventListener("focus", syncFromVisibility);

    // Re-derive once on mount in case visibility changed between the initial render and this effect.
    syncFromVisibility();

    return () => {
      document.removeEventListener("visibilitychange", syncFromVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", syncFromVisibility);
    };
  }, []);

  return { isObscured };
}
