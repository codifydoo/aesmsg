"use client";

import type { ReactNode } from "react";
import { Icon } from "@/src/components/Icon";

/** Single source of truth for the dates shown near the title. */
export const LAST_UPDATED = "June 1, 2026";
export const EFFECTIVE_DATE = "June 1, 2026";

const h2Class = "font-display text-2xl font-semibold tracking-tight mt-12 mb-4 scroll-mt-24";
const pClass = "text-[15px] text-on-surface-variant leading-relaxed mb-4";
const listClass =
  "list-disc pl-5 space-y-1 mb-4 text-[15px] text-on-surface-variant leading-relaxed";
const calloutClass =
  "flex gap-3 p-4 rounded-2xl bg-surface-container border border-outline-variant my-6";
const calloutBody = "text-[14px] text-on-surface-variant leading-relaxed";
const strong = "text-on-surface font-medium";

type Section = {
  id: string;
  heading: string;
  body: ReactNode;
};

const SECTIONS: readonly Section[] = [
  {
    id: "overview",
    heading: "Overview",
    body: (
      <>
        <p className={pClass}>
          aesmsg is a privacy-first encryption layer over the messaging channels you already use.
          You encrypt content locally on your device, then share an opaque link to the resulting
          ciphertext — and only the intended recipient can decrypt it. This policy explains what the
          aesmsg apps and backend do, and just as importantly do not do, with your data.
        </p>
        <p className={pClass}>
          Because aesmsg runs on a zero-knowledge backend, there is very little data for this policy
          to describe. The product is designed so the sensitive parts of your message never reach
          our servers in a form anyone could read.
        </p>
      </>
    ),
  },
  {
    id: "what-we-process",
    heading: "What we process",
    body: (
      <>
        <p className={pClass}>
          When you create a secure link, your message and any attachment are encrypted on your
          device first. Only the resulting ciphertext, together with a small amount of operational
          metadata, is uploaded to our backend. The backend stores only:
        </p>
        <ul className={listClass}>
          <li>A message identifier</li>
          <li>The encrypted ciphertext</li>
          <li>The creation time</li>
          <li>The expiry you chose</li>
          <li>The maximum number of opens you allowed</li>
          <li>The link status — for example active, expired, or revoked</li>
        </ul>
        <p className={pClass}>
          That is the complete list. This metadata is what lets a link expire, enforce its open
          limit, and be revoked. It is not the contents of your message.
        </p>
      </>
    ),
  },
  {
    id: "what-we-never-see",
    heading: "What we never have access to",
    body: (
      <>
        <p className={pClass}>
          Your private content never reaches us in a readable form. We do not have access to, and
          the backend never stores:
        </p>
        <ul className={listClass}>
          <li>Plaintext messages</li>
          <li>Private keys</li>
          <li>Message previews</li>
          <li>Unencrypted attachments</li>
        </ul>
        <p className={pClass}>
          Encryption keys are generated on your device. Your private key stays on your device and
          never leaves it unless you explicitly export an encrypted backup. Decryption happens
          locally on the recipient&apos;s device after a biometric unlock, so only the intended
          recipient can decrypt a message — never us, and never the channel you sent the link
          through.
        </p>
        <div className={calloutClass}>
          <Icon name="verified_user" className="text-success shrink-0 text-[20px]" />
          <div className={calloutBody}>
            <span className={strong}>Zero-knowledge backend.</span> Our servers only ever hold
            opaque ciphertext and the minimal metadata above. This is the core guarantee —
            everything else in this policy follows from it.
          </div>
        </div>
      </>
    ),
  },
  {
    id: "connection-data",
    heading: "Connection and abuse-prevention data",
    body: (
      <>
        <p className={pClass}>
          To keep aesmsg available and to prevent abuse, our backend briefly processes limited
          technical data about each request — including a salted, non-reversible hash of your IP
          address — purely to enforce rate limits. We do not store raw IP addresses, and we do not
          use this data to identify you or build a profile of you. Our hosting provider may also
          keep standard server logs that include IP addresses for a limited period for security and
          reliability.
        </p>
        <div className={calloutClass}>
          <Icon name="info" className="text-primary shrink-0 text-[20px]" />
          <div className={calloutBody}>
            <span className={strong}>Legal basis.</span> Where EU data protection law applies, we
            process this connection data on the basis of our legitimate interest in keeping the
            service secure and available (GDPR Article 6(1)(f)).
          </div>
        </div>
      </>
    ),
  },
  {
    id: "legal-bases",
    heading: "Legal bases for processing",
    body: (
      <>
        <p className={pClass}>
          Where the EU General Data Protection Regulation (GDPR) applies, we rely on the following
          legal bases for the limited processing described in this policy:
        </p>
        <ul className={listClass}>
          <li>
            To transmit a secure link you create and enforce its expiry and open limit — performing
            the service you request (Article 6(1)(b)).
          </li>
          <li>
            To keep the service secure, enforce rate limits, and prevent abuse — our legitimate
            interests (Article 6(1)(f)).
          </li>
          <li>
            To meet legal obligations that may apply to us — compliance with a legal obligation
            (Article 6(1)(c)).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-retention",
    heading: "Data retention and deletion",
    body: (
      <>
        <p className={pClass}>
          You control how long a secure link lives and how many times it can be opened. When you
          create a link you can set it to self-destruct after 10 minutes, 1 hour, 24 hours, 7 days,
          or a custom duration, and you can cap the number of times it may be opened.
        </p>
        <p className={pClass}>
          You can also revoke a link manually at any time. Revoking a link purges its ciphertext
          from our servers immediately. When a link reaches its expiry or its open limit, it stops
          working at once — it can no longer be opened or decrypted by anyone through the service —
          and its ciphertext is then purged automatically by a routine cleanup process shortly
          afterwards. Anything we hold in the meantime is only ever opaque ciphertext sealed to the
          recipient — useless without the recipient&apos;s private key, which never reaches us.
        </p>
        <p className={pClass}>
          A minimal metadata record — the message identifier, timestamps, open count, and final
          status such as expired or revoked — may be retained so the link reliably stays closed. It
          never contains your message.
        </p>
      </>
    ),
  },
  {
    id: "on-device-data",
    heading: "Data that stays on your device",
    body: (
      <p className={pClass}>
        Some information never leaves your device at all. Your private keys, your saved contacts,
        your list of links, and your app settings are stored locally on your device and, where
        supported, encrypted at rest. We do not receive, store, or have access to this on-device
        data. If you uninstall the app or wipe your identity, this data is removed from the device.
      </p>
    ),
  },
  {
    id: "no-tracking",
    heading: "No tracking, analytics, or accounts",
    body: (
      <>
        <p className={pClass}>
          aesmsg has no user accounts, no analytics or tracking SDKs, no advertising, and no
          third-party data brokers. We do not build profiles of you, and we do not sell or share
          your data. The aesmsg website (aesmsg.com) sets no cookies and runs no analytics or
          tracking scripts.
        </p>
        <p className={pClass}>
          Consistent with this, the App Store privacy label for the aesmsg iOS app is declared{" "}
          <span className={strong}>&quot;Data Not Collected&quot;</span>. The only technical data we
          process is the transient, security-only connection data described above, which is never
          used to identify you, track you, or build a profile.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    heading: "Service providers and international transfers",
    body: (
      <>
        <p className={pClass}>
          Running aesmsg relies on a small number of infrastructure providers. None of them ever
          receive your plaintext, your private keys, or anything that would let them read your
          messages:
        </p>
        <ul className={listClass}>
          <li>
            A cloud hosting and database provider stores the encrypted ciphertext and minimal
            metadata, and keeps standard server logs.
          </li>
          <li>
            If you choose to enable notifications, Apple Push Notification service and Google
            Firebase Cloud Messaging may deliver content-free alerts that contain no message
            content.
          </li>
          <li>
            The Apple App Store and Google Play distribute the app and may collect download and
            diagnostic data under their own privacy policies.
          </li>
        </ul>
        <p className={pClass}>
          Our infrastructure — including the servers that store ciphertext and metadata — is located
          in the <span className={strong}>European Union (Germany)</span>. Any data the third-party
          providers above process on their own systems is handled under their respective privacy
          policies and safeguards.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    heading: "International users and your rights",
    body: (
      <>
        <p className={pClass}>
          aesmsg is operated by CODIFY d.o.o. and is available internationally. We aim to comply
          with applicable privacy laws, including the GDPR, wherever you use the app.
        </p>
        <p className={pClass}>
          Where the GDPR applies, you have the right to access, correct, erase, restrict, or object
          to the processing of your personal data, the right to data portability, and the right to
          lodge a complaint with your local data protection authority. In Croatia, that authority is
          the Personal Data Protection Agency (AZOP, azop.hr).
        </p>
        <p className={pClass}>
          Because our backend is zero-knowledge and we operate without accounts, we hold essentially
          no personal data tied to your identity — only opaque ciphertext and the minimal metadata
          described above. As permitted under Article 11 of the GDPR, we are not required to collect
          additional information solely to identify you, and we may be unable to link a request to
          specific data without more detail from you. In practice you exercise control directly:
          choose a short expiry, cap the number of opens, or revoke a link to purge its ciphertext
          immediately.
        </p>
        <p className={pClass}>
          To make a request or ask a question about your data, contact us using the details below
          and we will respond.
        </p>
      </>
    ),
  },
  {
    id: "security",
    heading: "How we protect your data",
    body: (
      <p className={pClass}>
        Security is the core of how aesmsg is built. Content is encrypted on your device with
        strong, modern encryption before it is ever uploaded; data is encrypted in transit; our
        servers hold only opaque ciphertext and minimal metadata; and we keep that ciphertext only
        for as long as your link lives. Because we never hold plaintext or private keys, even a full
        compromise of our servers would not expose your messages.
      </p>
    ),
  },
  {
    id: "children",
    heading: "Children",
    body: (
      <p className={pClass}>
        aesmsg is intended for adults and is not directed to children. We do not knowingly collect
        personal data from children, and the service is not offered to anyone under the minimum age
        required in their country — 16 in much of the European Union, and 13 in the United States.
        If you believe a child has provided us with personal data, contact us and we will address
        it.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p className={pClass}>
        We may update this policy from time to time. When we make a material change, we will revise
        the &quot;last updated&quot; date at the top of this page and highlight the change here, and
        where appropriate we will notify users in the app before it takes effect.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: (
      <>
        <p className={pClass}>
          aesmsg is provided by <span className={strong}>CODIFY d.o.o.</span>,{" "}
          <span className={strong}>Nova Cesta 138/1, 10110 Zagreb, Croatia</span> (
          <span className={strong}>OIB 59253184772</span>). For any question or request about this
          policy or your personal data, reach our privacy contact:
        </p>
        <div className={calloutClass}>
          <Icon name="mail" className="text-primary shrink-0 text-[20px]" />
          <div className={calloutBody}>
            <a href="mailto:info@codify.hr" className="font-mono text-primary hover:underline">
              info@codify.hr
            </a>
          </div>
        </div>
      </>
    ),
  },
] as const;

export function PrivacyContent() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 sm:px-8 py-12 sm:py-16">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-on-surface-variant mb-4">
        <span className="px-2 py-1 rounded-md bg-primary-container/40 text-on-primary-container font-medium">
          Legal
        </span>
        <span>Last updated: {LAST_UPDATED}</span>
        <span aria-hidden>·</span>
        <span>Effective: {EFFECTIVE_DATE}</span>
      </div>

      <h1 className="font-display text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
      <p className="text-lg text-on-surface-variant leading-relaxed mb-8">
        aesmsg is built so your private content stays private — encrypted on your device, opaque to
        our servers, and readable only by the recipient you choose.
      </p>

      {SECTIONS.map((section) => (
        <section key={section.id}>
          <h2 id={section.id} className={h2Class}>
            {section.heading}
          </h2>
          {section.body}
        </section>
      ))}
    </main>
  );
}
