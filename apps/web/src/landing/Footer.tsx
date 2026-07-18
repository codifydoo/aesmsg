"use client";

import { SHELL, Wordmark } from "./primitives";

// The footer is shared by the landing page AND the /privacy and /terms pages, so the
// "How it works" / "Security" section links are root-relative (`/#how`, not `#how`) —
// a bare hash would dangle on /privacy and /terms, which have no such sections. On the
// landing page `/#how` resolves to an in-page scroll (same pathname, hash only).
const COLS = [
  {
    head: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Security", href: "/#security" },
      { label: "Docs", href: "/docs" },
    ],
  },
  {
    head: "Company",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Open source", href: "https://github.com/codifydoo/aesmsg" },
      { label: "Contact", href: "mailto:info@codify.hr" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--outline-v)", background: "var(--sc-lowest)" }}>
      <div
        className={`${SHELL} footer-grid`}
        style={{
          paddingTop: 56,
          paddingBottom: 40,
          display: "grid",
          gap: 40,
          gridTemplateColumns: "minmax(0,1.4fr) repeat(2, minmax(0,1fr))",
        }}
      >
        <div style={{ minWidth: 220, color: "var(--on)" }}>
          <Wordmark markSize={26} text={21} />
          <p
            style={{
              margin: "16px 0 0",
              fontSize: 14.5,
              color: "var(--on-var)",
              maxWidth: 260,
              lineHeight: 1.6,
            }}
          >
            Institutional trust. Precision privacy.
          </p>
        </div>
        {COLS.map((col) => (
          <nav key={col.head} aria-label={col.head}>
            <div
              className="t-label"
              style={{ color: "var(--outline)", fontSize: 12, marginBottom: 16 }}
            >
              {col.head}
            </div>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {col.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    {...(link.href.startsWith("http") ? { rel: "noreferrer" } : {})}
                    style={{
                      color: "var(--on-var)",
                      textDecoration: "none",
                      fontSize: 14.5,
                      transition: "color .2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--on-var)";
                    }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className={SHELL} style={{ paddingBottom: 40 }}>
        <div
          style={{
            borderTop: "1px solid var(--outline-v)",
            paddingTop: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--outline)" }}>
            © 2026 aesmsg. All rights reserved.
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 12, color: "var(--outline-v)", letterSpacing: ".04em" }}
          >
            end-to-end encrypted · zero-knowledge
          </span>
        </div>
      </div>
    </footer>
  );
}
