"use client";

import { Btn, SHELL, Wordmark } from "@/src/landing/primitives";
import { useStoreUrl } from "@/src/landing/use-store-url";

// Slim, sticky terms-page header. Reuses the landing brand lockup + primary CTA but carries
// NONE of the landing nav's in-page anchors (#how / #security) — those would dangle on
// /terms. The wordmark links home; the CTA drives to the visitor's app store (App Store on
// iOS/desktop, Play Store on Android). The `glass` / `btn-*` helper classes resolve because the
// whole screen is wrapped in `.landing-root`.
export function TermsHeader() {
  const storeUrl = useStoreUrl();
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50 }}>
      <div
        className="glass"
        style={{
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(20,18,24,0.72)",
        }}
      >
        <div
          className={SHELL}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 68,
          }}
        >
          <a
            href="/"
            aria-label="aesmsg home"
            style={{ textDecoration: "none", color: "var(--on)" }}
          >
            <Wordmark markSize={24} text={20} />
          </a>
          <Btn kind="primary" icon="ios_share" href={storeUrl}>
            Get the app
          </Btn>
        </div>
      </div>
    </header>
  );
}
