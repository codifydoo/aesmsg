import type { NextConfig } from "next";

// Content-Security-Policy for a static, presentational site.
// - No third-party origins: all scripts, styles, fonts, and connections are same-origin.
//   (next/font self-hosts Geist/Inter/JetBrains under /_next; Material Symbols is
//   vendored under /public/fonts — nothing is fetched from Google at runtime.)
// - 'unsafe-inline' is required for Next.js' inline hydration/RSC bootstrap scripts and
//   for Tailwind/inline style attributes; no nonce pipeline exists on this static site.
// - frame-ancestors 'none' mirrors X-Frame-Options: DENY (clickjacking / iframe embedding).
//
// Dev-only relaxation: Turbopack + React Refresh (HMR) evaluate generated modules via eval /
// new Function, which a strict CSP blocks. We add 'unsafe-eval' to script-src ONLY when
// NODE_ENV === "development" (set by `next dev`). `next build` / `next start` run with
// NODE_ENV === "production", so the shipped policy below stays byte-identical and never carries
// 'unsafe-eval'.
const scriptSrc =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  scriptSrc,
  "connect-src 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

// Security headers applied to every response. This site is served by `next start`
// (no `output: 'export'`), so `headers()` is honored at runtime and passes through
// the fronting nginx proxy. The `/l/[id]` link id is a capability pointer, so
// Referrer-Policy: no-referrer prevents it leaking via the Referer header when a
// visitor follows an outbound link (e.g. an app-store button).
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@aesmsg/ui"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Apple requires the Universal Links association file to be served as application/json.
      // It has NO file extension, so Next's static handler types it application/octet-stream —
      // and `X-Content-Type-Options: nosniff` above forbids sniffing past that. assetlinks.json
      // needs no such rule: its .json extension is typed correctly already.
      //
      // The file must also be reachable WITHOUT a redirect (Apple and Google both refuse to
      // follow one) on every host the app claims in associatedDomains / intentFilters.
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
