import type { NextConfig } from "next";

// Fully static export: no server runtime, no API routes, no SSR touching key material.
//
// CSP is delivered two ways, both first-party and server-free:
//   1. A per-page `<meta http-equiv="Content-Security-Policy">` injected into every
//      exported out/**/*.html by scripts/inject-csp.mjs after `next build`. That step
//      hashes each page's inline hydration/flight scripts (sha256) so script-src can stay
//      strict — `'self' 'wasm-unsafe-eval'` + per-page hashes, with NO 'unsafe-inline'.
//   2. The authoritative nginx/Sproobo response header documented in docs/deploy.md
//      (adds `frame-ancestors 'none'`, which <meta> cannot express, + the classic
//      hardening headers).
//
// next.config `headers()` is NOT honored for output: 'export' (there is no server
// runtime to apply it), so it is intentionally omitted here.
const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@aesmsg/ui"],
  images: { unoptimized: true },
};

export default nextConfig;
