import type { Metadata } from "next";
import { BouncerScreen } from "@/src/bouncer/BouncerScreen";

// A secure-link URL is a capability pointer — keep it out of search indexes and caches.
// This metadata deliberately sets ONLY `robots`: it must never derive any Open Graph /
// preview field from the link `id`. By omitting `openGraph`, the page inherits the root
// layout's static, id-free card (og:url pinned to the homepage), so a pasted secure link
// previews as the generic brand card and never leaks or consumes the link.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function LinkBouncerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BouncerScreen id={id} />;
}
