"use client";

import { useCallback, useEffect, useRef } from "react";

// Clipboard copy + VERIFIED auto-clear for the secure reader (D6). Mirrors the mobile
// ReaderScreen.onCopy semantics (getStringAsync → compare → set "") on the web platform, with the
// platform's honest limits stated plainly:
//   • navigator.clipboard.readText() needs clipboard-READ permission AND a focused document;
//     Firefox/Safari may deny it, and a timer firing while the tab is unfocused will reject.
//   • When read-back is unavailable we DO NOT blind-clear — clobbering the clipboard could wipe
//     content the user copied later. Instead the copy resolves as "copied-no-autoclear" so the UI
//     can honestly say auto-clear couldn't be confirmed. This is strictly WEAKER than mobile's
//     native clipboard control — surfaced, not papered over.

export type CopyResult = "copied" | "copied-no-autoclear" | "failed";

export function useClipboardAutoClear(delayMs = 45_000): {
  copy: (text: string) => Promise<CopyResult>;
} {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drop any pending clear on unmount so a timer never fires against a torn-down reader.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string): Promise<CopyResult> => {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (!clipboard || typeof clipboard.writeText !== "function") return "failed";

      try {
        await clipboard.writeText(text);
      } catch {
        return "failed";
      }

      // Without readText we cannot VERIFY the clipboard still holds our text at clear-time, and a
      // blind clear could wipe unrelated content — so we skip the schedule and say so honestly.
      if (typeof clipboard.readText !== "function") return "copied-no-autoclear";

      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const current = await clipboard.readText();
            // Only clear when the clipboard STILL holds exactly our text — never clobber later copies.
            if (current === text) await clipboard.writeText("");
          } catch {
            // read denied / document unfocused — do NOT blind-clear.
          }
        })();
      }, delayMs);

      return "copied";
    },
    [delayMs],
  );

  return { copy };
}
