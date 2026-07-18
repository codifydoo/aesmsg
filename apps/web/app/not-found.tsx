import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found — aesmsg",
  robots: { index: false, follow: false },
};

// Branded 404. Pure server component: it imports no @aesmsg/ui barrel and no client
// hooks (importing the barrel into a server component pulls client code into the RSC
// graph and breaks the build), so the brand mark is inlined as an SVG here. Rendered
// inside the root layout, which supplies the fonts and page background.
export default function NotFound() {
  return (
    <main className="min-h-dvh bg-surface text-on-surface flex flex-col items-center justify-center px-6 text-center">
      <svg
        viewBox="12 16 68 68"
        width={52}
        height={52}
        role="img"
        aria-label="aesmsg"
        className="mb-6"
      >
        <g fill="none" stroke="#cfbcff" strokeWidth={8} strokeLinecap="butt">
          <circle cx={46} cy={50} r={26} />
          <line x1={72} y1={24} x2={72} y2={76} />
        </g>
      </svg>

      <p className="font-mono text-primary text-xs tracking-[0.16em] uppercase mb-3">Error 404</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight mb-3">
        This page doesn&apos;t exist
      </h1>
      <p className="text-on-surface-variant max-w-md mb-8 leading-relaxed">
        The page you&apos;re looking for isn&apos;t here — it may have moved, or the address may be
        incomplete. Secure links always open in the aesmsg app, not here.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="bg-primary text-on-primary font-semibold px-6 py-3 rounded-xl no-underline transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          Back to home
        </Link>
        <Link
          href="/docs"
          className="border border-outline-variant px-6 py-3 rounded-xl no-underline text-on-surface transition-colors hover:border-outline focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          Read the docs
        </Link>
      </div>
    </main>
  );
}
