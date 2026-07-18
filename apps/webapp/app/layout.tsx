import type { Metadata } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import { IdentityProvider } from "@/src/identity/identity-context";
import "./globals.css";

// Fonts are self-hosted by next/font at build time (emitted under /_next/static/media),
// so the app makes no runtime request to Google — keeping the CSP closed (font-src 'self').
const geist = Geist({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

// The Content-Security-Policy is NOT set here. This app is a fully static export, so the
// per-page policy (which pins each page's inline hydration/flight scripts by sha256 hash)
// is injected into every exported out/**/*.html by scripts/inject-csp.mjs after `next build`.
// See next.config.ts and docs/deploy.md.
export const metadata: Metadata = {
  title: "aesmsg",
  description:
    "End-to-end encrypted messaging in your browser. Your private keys stay on your device; the backend is zero-knowledge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <IdentityProvider>{children}</IdentityProvider>
      </body>
    </html>
  );
}
