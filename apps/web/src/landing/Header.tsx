"use client";

import { useEffect, useState } from "react";
import { Btn, SHELL, Wordmark } from "./primitives";
import { useStoreUrl } from "./use-store-url";

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Security", href: "#security" },
  { label: "Docs", href: "/docs" },
  { label: "GitHub", href: "https://github.com/codifydoo/aesmsg" },
] as const;

const linkBase = {
  color: "var(--on-var)",
  textDecoration: "none",
  fontWeight: 500,
  transition: "color .2s",
} as const;

/** Inline hamburger / close glyph. The vendored Material Symbols subset ships no
 *  `menu`/`close` icon, so the toggle is drawn as a small SVG instead. Decorative
 *  (the button carries the accessible name), hence aria-hidden. */
function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {open ? (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="7" x2="21" y2="7" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="17" x2="21" y2="17" />
        </>
      )}
    </svg>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const storeUrl = useStoreUrl();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50 }}>
      <div
        className="glass"
        style={{
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
          borderBottom:
            scrolled || menuOpen ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
          background: scrolled || menuOpen ? "rgba(20,18,24,0.72)" : "rgba(20,18,24,0.36)",
          transition: "background .3s ease, border-color .3s ease",
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
            href="#top"
            aria-label="aesmsg home"
            style={{ textDecoration: "none", color: "var(--on)" }}
          >
            <Wordmark markSize={24} text={20} />
          </a>
          <nav
            aria-label="Primary"
            style={{ alignItems: "center", gap: 4 }}
            className="hidden md:flex"
          >
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                {...(n.href.startsWith("http") ? { rel: "noreferrer" } : {})}
                style={{ ...linkBase, fontSize: 14.5, padding: "8px 14px", borderRadius: 8 }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--on)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--on-var)";
                }}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Btn kind="primary" icon="ios_share" href={storeUrl}>
              Get the app
            </Btn>
            <button
              type="button"
              className="md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 42,
                height: 42,
                borderRadius: 10,
                background: "rgba(20,18,24,0.5)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "var(--on)",
                cursor: "pointer",
              }}
            >
              <MenuGlyph open={menuOpen} />
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="glass md:hidden"
          style={{
            borderLeft: "none",
            borderRight: "none",
            borderTop: "none",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(20,18,24,0.94)",
          }}
        >
          <div
            className={SHELL}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingTop: 8,
              paddingBottom: 16,
            }}
          >
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                {...(n.href.startsWith("http") ? { rel: "noreferrer" } : {})}
                onClick={() => setMenuOpen(false)}
                style={{ ...linkBase, fontSize: 16, padding: "12px 8px", borderRadius: 8 }}
              >
                {n.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
