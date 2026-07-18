import type { Metadata } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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

const SITE_URL = "https://aesmsg.com";
const OG_DESCRIPTION =
  "Zero-knowledge encryption layer for the channels you already use. Encrypt before you send; only the intended recipient can open it.";

// Site-wide metadata. The Open Graph / Twitter card is STATIC and id-free: a single
// branded /og.png and an og:url pinned to the homepage. Because these fields live on the
// root layout and `og:url` is explicit, every route — including the `/l/[id]` bouncer,
// whose own metadata sets only `robots` and therefore inherits this openGraph block —
// previews as the same generic card. No per-link id or per-link data is ever embedded in
// a preview, so pasting a secure link never leaks or consumes it.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "aesmsg",
  description:
    "Zero-knowledge encryption layer for the channels you already use. Encrypt before you send.",
  openGraph: {
    type: "website",
    siteName: "aesmsg",
    url: SITE_URL,
    title: "aesmsg — Encrypt before you send",
    description: OG_DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "aesmsg — end-to-end encrypted, zero-knowledge backend",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "aesmsg — Encrypt before you send",
    description: OG_DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
