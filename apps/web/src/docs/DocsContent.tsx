"use client";

import { Icon } from "@/src/components/Icon";

const FEATURE_CARDS = [
  {
    icon: "lock",
    title: "Encrypt locally",
    body: "AES-256-GCM sealing on your device, before anything is uploaded.",
  },
  {
    icon: "share",
    title: "Share anywhere",
    body: "Paste the link into Slack, WhatsApp, email, SMS — any channel.",
  },
  {
    icon: "key",
    title: "Only they open it",
    body: "Decryption needs the recipient's private key, which never leaves their device.",
  },
] as const;

const STEPS = [
  {
    lead: "Compose & attach.",
    body: "Write your message or attach a file in the aesmsg client.",
  },
  {
    lead: "Encrypt locally.",
    body: "The client seals the payload to the recipient's public key with AES-256-GCM.",
  },
  {
    lead: "Upload ciphertext.",
    body: "Only the encrypted blob and minimal metadata are uploaded. Plaintext never leaves your device.",
  },
  {
    lead: "Get a secure link.",
    body: "The backend returns an opaque pointer to the ciphertext — not the secret itself.",
  },
  {
    lead: "Share the link.",
    body: "Paste it into whatever app you already use to reach your recipient.",
  },
  {
    lead: "Recipient decrypts.",
    body: "They open the link, download the ciphertext, and decrypt locally after biometric unlock.",
  },
] as const;

const QUICKSTART_STEPS = [
  {
    lead: "Download aesmsg.",
    body: "Install the app from the App Store (iOS) or Google Play (Android).",
  },
  {
    lead: "Set up your identity.",
    body: "On first launch the app generates your keypair on-device and locks your private key behind biometric unlock.",
  },
  {
    lead: "Add a recipient.",
    body: "Scan their QR code or paste their public key, then verify the fingerprint out-of-band.",
  },
  {
    lead: "Compose & encrypt.",
    body: "Write your message or attach a file, pick the recipient, set an expiry and max opens, and encrypt locally.",
  },
  {
    lead: "Share the link.",
    body: "Copy the secure link and paste it into any app you already use to reach them.",
  },
] as const;

const HPKE_ROWS = [
  { layer: "Key encapsulation", primitive: "DHKEM(X25519, HKDF-SHA256)" },
  { layer: "Payload encryption", primitive: "AES-256-GCM" },
  { layer: "Key derivation", primitive: "HKDF-SHA256" },
] as const;

const h2Class = "font-display text-2xl font-semibold tracking-tight mt-12 mb-4 scroll-mt-24";
const pClass = "text-[15px] text-on-surface-variant leading-relaxed mb-4";
const cardClass = "p-4 rounded-2xl bg-surface-container border border-outline-variant";

export function DocsContent() {
  return (
    <main className="min-w-0 flex-1 py-8 lg:px-4 max-w-3xl">
      {/*
        `prose-doc` is a structural marker only. In the mockup it carried
        `.prose-doc h2 { scroll-margin-top: 96px }`; here that scroll offset is
        instead baked into each heading via `scroll-mt-24` in `h2Class`, so this
        wrapper has no styling of its own.
      */}
      <div className="prose-doc">
        {/* Category label. (No fabricated "last updated" / "read time" meta — this
            static page has no edit-tracking to substantiate one.) */}
        <div className="flex items-center gap-2 text-[12px] text-on-surface-variant mb-4">
          <span className="px-2 py-1 rounded-md bg-primary-container/40 text-on-primary-container font-medium">
            Guides
          </span>
        </div>

        <h1 className="font-display text-4xl font-bold tracking-tight mb-4">
          Introduction to aesmsg
        </h1>
        <p className="text-lg text-on-surface-variant leading-relaxed mb-8">
          aesmsg is a privacy-first encryption layer over the communication channels you already
          use. Encrypt sensitive content locally, share an opaque link through any app, and only the
          intended recipient can ever open it.
        </p>

        {/* Callout */}
        <div className="flex gap-3 p-4 rounded-2xl bg-surface-container border border-outline-variant mb-8">
          <Icon name="info" className="text-primary shrink-0 text-[20px]" />
          <div className="text-[14px] text-on-surface-variant leading-relaxed">
            <span className="text-on-surface font-medium">aesmsg is not a messenger.</span>{" "}
            It&apos;s a zero-knowledge transmission utility. We never see your plaintext, your keys,
            or your attachments — only opaque ciphertext lives on our servers.
          </div>
        </div>

        <h2 id="introduction" className={h2Class}>
          What is aesmsg?
        </h2>
        <p className={pClass}>
          The channels people use to send credentials, files, and confidential notes — Slack,
          WhatsApp, email — were never designed to keep that content private from the channel
          itself. aesmsg sits one layer above: it encrypts before you send, so the channel only ever
          transports an opaque link to ciphertext.
        </p>

        <div className="grid sm:grid-cols-3 gap-3 my-8">
          {FEATURE_CARDS.map((card) => (
            <div key={card.title} className={cardClass}>
              <Icon name={card.icon} className="text-primary mb-2 text-[24px]" />
              <div className="font-display font-semibold text-[14px] mb-1">{card.title}</div>
              <div className="text-[12px] text-on-surface-variant leading-relaxed">{card.body}</div>
            </div>
          ))}
        </div>

        <h2 id="how-it-works" className={h2Class}>
          How it Works
        </h2>
        <p className={pClass}>
          Every message follows the same six-step path from your device to your recipient&apos;s —
          and at no point does plaintext touch our servers.
        </p>

        <div className="space-y-3 my-6">
          {STEPS.map((step, idx) => (
            <div
              key={step.lead}
              className="flex gap-4 p-4 rounded-2xl bg-surface-container border border-outline-variant"
            >
              <div className="grid place-items-center size-7 rounded-full bg-primary-container text-on-primary-container font-semibold text-[13px] shrink-0">
                {idx + 1}
              </div>
              <div className="text-[14px] text-on-surface-variant leading-relaxed">
                <span className="text-on-surface font-medium">{step.lead}</span> {step.body}
              </div>
            </div>
          ))}
        </div>

        <h2 id="quickstart" className={h2Class}>
          Quickstart
        </h2>
        <p className={pClass}>
          Send your first encrypted message from the aesmsg app in under a minute. aesmsg ships on
          iOS and Android — there is nothing to run on the web.
        </p>

        <div className="space-y-3 my-6">
          {QUICKSTART_STEPS.map((step, idx) => (
            <div
              key={step.lead}
              className="flex gap-4 p-4 rounded-2xl bg-surface-container border border-outline-variant"
            >
              <div className="grid place-items-center size-7 rounded-full bg-primary-container text-on-primary-container font-semibold text-[13px] shrink-0">
                {idx + 1}
              </div>
              <div className="text-[14px] text-on-surface-variant leading-relaxed">
                <span className="text-on-surface font-medium">{step.lead}</span> {step.body}
              </div>
            </div>
          ))}
        </div>

        <p className={pClass}>
          Every message becomes an opaque link like the one below — a pointer to ciphertext that is
          useless without the recipient&apos;s private key. Paste it into any app to deliver it.
        </p>

        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant p-4 my-6">
          <div className="text-[12px] text-on-surface-variant mb-2">Secure link format</div>
          <div className="font-mono text-[13px] text-primary break-all">
            https://aesmsg.com/l/x7Kp9wQ2mB4nR8tv
          </div>
        </div>

        <h2 id="encryption" className={h2Class}>
          Encryption Model
        </h2>
        <p className={pClass}>
          aesmsg uses HPKE (RFC 9180) — DHKEM(X25519, HKDF-SHA256) for key encapsulation,
          AES-256-GCM for the payload, and HKDF-SHA256 as the KDF. Every message gets a fresh
          symmetric key.
        </p>

        <div className="overflow-hidden rounded-2xl border border-outline-variant my-6">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface-container border-b border-outline-variant text-left">
                <th className="px-4 py-3 font-display font-semibold">Layer</th>
                <th className="px-4 py-3 font-display font-semibold">Primitive</th>
              </tr>
            </thead>
            <tbody className="text-on-surface-variant">
              {HPKE_ROWS.map((row, idx) => (
                <tr
                  key={row.layer}
                  className={idx < HPKE_ROWS.length - 1 ? "border-b border-outline-variant" : ""}
                >
                  <td className="px-4 py-3">{row.layer}</td>
                  <td className="px-4 py-3 font-mono text-primary">{row.primitive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="keys" className={h2Class}>
          Keys &amp; Identity
        </h2>
        <p className={pClass}>
          Every user has a PKI keypair generated on-device. Your private key never leaves your
          device unless you explicitly export an encrypted backup. Trust between users is
          established by manual fingerprint verification or QR scan.
        </p>

        <div className="flex gap-3 p-4 rounded-2xl bg-surface-container border border-outline-variant my-6">
          <Icon name="verified_user" className="text-success shrink-0 text-[20px]" />
          <div className="text-[14px] text-on-surface-variant leading-relaxed">
            <span className="text-on-surface font-medium">Fingerprint example.</span> Compare this
            out-of-band with your contact:
            <div className="font-mono text-primary mt-2 text-[13px]">AM-7f3a 9c2e 4b8d 1a6f</div>
          </div>
        </div>

        <h2 id="links" className={h2Class}>
          Secure Links
        </h2>
        <p className={pClass}>
          A secure link is a pointer, not a secret. Without the recipient&apos;s private key it is
          useless. Public link previews are safe — messaging apps that auto-fetch the URL never
          consume an open or expose ciphertext.
        </p>

        <h2 id="expiry" className={h2Class}>
          Expiry &amp; Revocation
        </h2>
        <p className={pClass}>
          Links can self-destruct after a set time (10m, 1h, 24h, 7d, or custom), cap the number of
          opens (1, 3, or unlimited until expiry), and be manually revoked at any time. Revocation
          purges the ciphertext from the server immediately.
        </p>

        <h2 id="threat-model" className={h2Class}>
          Threat Model
        </h2>
        <p className={pClass}>
          aesmsg protects the confidentiality and integrity of your message contents against the
          server, the transport channel, and anyone with later access to the conversation. It does
          not hide that communication occurred, nor protect a device already compromised at the OS
          level.
        </p>

        <h2 id="zero-knowledge" className={h2Class}>
          Zero-Knowledge
        </h2>
        <p className={pClass}>
          The server stores only: message ID, ciphertext, creation time, expiry, max opens, and
          status. It never stores plaintext, private keys, message previews, or unencrypted
          attachments. This is the core guarantee — everything else follows from it.
        </p>
      </div>
    </main>
  );
}
