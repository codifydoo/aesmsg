"use client";

import type { Fingerprint } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import Link from "next/link";
import { SecureLinkBlock } from "@/src/components/SecureLinkBlock";

export interface LinkCreatedScreenProps {
  /** The server-returned shareable link (aesmsg.com/l/<id>). */
  url: string;
  /** Recipient fingerprint derived locally at seal time (display only). */
  recipientFingerprint: Fingerprint;
  /** Human summary of the chosen expiry, e.g. "24 hours". */
  expiryLabel: string;
  /** Human summary of the chosen max-opens, e.g. "1 view (burn on read)". */
  maxOpensLabel: string;
  /** Reset the compose form to send another message. */
  onCreateAnother: () => void;
}

/**
 * The post-seal success screen (per secure_link_created_aesmsg). Its job is SHARING: show the full
 * mono link + copy, summarize the expiry/opens choices, reassure about the local-only encryption,
 * and nudge the sender to paste the link into whatever app they already use. Revoke lives on the
 * link details view, not here.
 */
export function LinkCreatedScreen({
  url,
  recipientFingerprint,
  expiryLabel,
  maxOpensLabel,
  onCreateAnother,
}: LinkCreatedScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary-container/30 text-primary">
          <MaterialIcon name="lock" size={32} filled />
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-success text-on-primary">
            <MaterialIcon name="check" size={14} />
          </span>
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-h1 text-on-surface">Link created</h1>
          <p className="text-body-md text-on-surface-variant">
            Your message has been sealed and is ready for delivery.
          </p>
        </div>
      </header>

      <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low p-6">
        <SecureLinkBlock url={url} />
        <p className="px-1 text-label-sm text-on-surface-variant">
          Sealed to <span className="font-mono text-on-surface">{recipientFingerprint}</span>
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container p-4">
          <MaterialIcon name="schedule" className="text-tertiary" />
          <div>
            <span className="block text-label-sm text-on-surface">{expiryLabel} expiry</span>
            <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
              Time bound
            </span>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container p-4">
          <MaterialIcon name="visibility_off" className="text-tertiary" />
          <div>
            <span className="block text-label-sm text-on-surface">{maxOpensLabel}</span>
            <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
              View limit
            </span>
          </div>
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-high text-primary">
          <MaterialIcon name="verified_user" size={20} />
        </span>
        <div className="space-y-1">
          <h2 className="text-label-sm font-semibold text-on-surface">
            Encrypted locally with AES-256-GCM
          </h2>
          <p className="text-label-sm text-on-surface-variant">
            Decryption happens only on the recipient's device — we never see your keys.
          </p>
        </div>
      </section>

      <section className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <MaterialIcon name="share" className="text-on-surface-variant" />
        <p className="text-body-md text-on-surface-variant">
          Paste this link into any app — Slack, WhatsApp, email — to share it securely.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onCreateAnother}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-container font-display font-semibold text-on-primary-container transition-all active:scale-[0.98]"
        >
          <MaterialIcon name="add_box" size={20} />
          Create another
        </button>
        <Link
          href="/links"
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high font-medium text-on-surface transition-colors hover:bg-surface-container-highest"
        >
          <MaterialIcon name="link" size={20} />
          View in Links
        </Link>
      </div>
    </div>
  );
}
