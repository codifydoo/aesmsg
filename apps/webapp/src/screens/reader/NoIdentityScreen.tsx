"use client";

import { MaterialIcon } from "@aesmsg/ui";
import Link from "next/link";

// Shown when the recipient taps Open but THIS browser holds no identity (D5). A message is sealed to
// a specific public key; without the matching private key on this device it cannot be opened — so we
// explain that calmly and offer the honest next steps. Reached only on an explicit tap, and it
// consumes NO open (no POST is issued). NO network.

// The product/app origin advertised for "open in the app". Build-time overridable; defaults to the
// marketing/app site (never Vercel).
const APP_SITE_ORIGIN = process.env.NEXT_PUBLIC_AESMSG_SITE_ORIGIN ?? "https://aesmsg.com";

export function NoIdentityScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <MaterialIcon name="key" size={38} />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-h1 text-on-surface">No identity on this browser</h1>
          <p className="text-body-md text-on-surface-variant">
            This message is sealed to a private key. This browser doesn't hold one yet, so it can't
            decrypt the message. Your keys only ever live on the device that created them.
          </p>
        </div>

        <div className="w-full space-y-3">
          <Link
            href="/onboarding"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-container font-display font-semibold text-on-primary-container transition-all active:scale-[0.98]"
          >
            <MaterialIcon name="key" size={20} />
            Create an identity
          </Link>
          <a
            href={APP_SITE_ORIGIN}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-outline-variant px-6 font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            Open in the aesmsg app
          </a>
        </div>

        <p className="text-label-sm text-on-surface-variant">
          Already have a key backup? Importing an encrypted backup is coming soon — for now, open
          this link on the device that holds your key.
        </p>
      </div>
    </div>
  );
}
