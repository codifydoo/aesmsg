"use client";

import type { ReactNode } from "react";
import { Icon } from "@/src/components/Icon";

/** Single source of truth for the dates shown near the title. */
export const LAST_UPDATED = "June 4, 2026";
export const EFFECTIVE_DATE = "June 4, 2026";

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
    id: "agreement",
    heading: "Agreement to these terms",
    body: (
      <>
        <p className={pClass}>
          These Terms of Use (&quot;Terms&quot;) are a legal agreement between you and CODIFY d.o.o.
          (&quot;aesmsg&quot;, &quot;we&quot;, &quot;us&quot;) governing your use of the aesmsg apps
          and the aesmsg website. By downloading, accessing, or using aesmsg, you agree to these
          Terms and to our Privacy Policy. If you do not agree, do not use aesmsg.
        </p>
        <div className={calloutClass}>
          <Icon name="description" className="text-primary shrink-0 text-[20px]" />
          <div className={calloutBody}>
            <span className={strong}>EULA.</span> These Terms are also the End User License
            Agreement (EULA) for the aesmsg apps.
          </div>
        </div>
      </>
    ),
  },
  {
    id: "what-aesmsg-is",
    heading: "What aesmsg is",
    body: (
      <p className={pClass}>
        aesmsg is a privacy-first encryption utility — not a chat app or messaging service. You
        encrypt content locally on your device and share an opaque link to the resulting ciphertext
        through whatever channel you already use. The aesmsg backend only ever stores ciphertext and
        minimal metadata and cannot read your content. aesmsg produces a link; you decide whether
        and where to share it.
      </p>
    ),
  },
  {
    id: "eligibility",
    heading: "Eligibility",
    body: (
      <p className={pClass}>
        You must be old enough to form a binding contract and at least the minimum age in your
        country (16 in much of the European Union, 13 in the United States) to use aesmsg. By using
        aesmsg you confirm you meet these requirements and can lawfully agree to these Terms.
      </p>
    ),
  },
  {
    id: "your-keys",
    heading: "Your identity, keys, and responsibility",
    body: (
      <>
        <p className={pClass}>
          aesmsg has no user accounts. Your identity is a cryptographic keypair generated on your
          device, and your private key stays on your device. You are responsible for keeping your
          device and your key secure.
        </p>
        <div className={calloutClass}>
          <Icon name="key" className="text-primary shrink-0 text-[20px]" />
          <div className={calloutBody}>
            <span className={strong}>No recovery.</span> Because the backend is zero-knowledge, if
            you lose your private key or your device, your encrypted content cannot be recovered —
            there is no password reset, recovery, or backdoor, and we cannot restore it for you. If
            you create an encrypted key backup, storing and protecting it is your responsibility.
          </div>
        </div>
      </>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <>
        <p className={pClass}>You agree not to use aesmsg to:</p>
        <ul className={listClass}>
          <li>break any applicable law or regulation;</li>
          <li>transmit content you have no right to share;</li>
          <li>infringe the intellectual-property, privacy, or other rights of others;</li>
          <li>distribute malware or harmful code;</li>
          <li>harass, defraud, or harm anyone; or</li>
          <li>
            interfere with, overload, or attempt to breach the security of the service or other
            users.
          </li>
        </ul>
        <p className={pClass}>
          You are solely responsible for the content you encrypt and for the people you share links
          with. aesmsg is a transmission utility — you control the plaintext and its distribution.
        </p>
      </>
    ),
  },
  {
    id: "subscriptions",
    heading: "aesmsg Pro subscriptions",
    body: (
      <>
        <p className={pClass}>
          aesmsg Pro is an optional auto-renewable subscription, offered on a monthly or annual
          basis. Pro unlocks larger attachments, custom expiry, and priority support; your
          encryption and privacy are identical on every plan, including the free plan.
        </p>
        <ul className={listClass}>
          <li>
            <span className={strong}>Price and billing.</span> The current price is shown in the app
            before you confirm a purchase, in your local currency. Payment is charged to your Apple
            ID (or Google Play account) when you confirm the purchase.
          </li>
          <li>
            <span className={strong}>Auto-renewal.</span> Your subscription automatically renews for
            the same period at the then-current price unless you turn off auto-renew at least 24
            hours before the end of the current period. Your account is charged for renewal within
            24 hours before the end of the current period.
          </li>
          <li>
            <span className={strong}>Managing and canceling.</span> You can manage your subscription
            and turn off auto-renewal at any time in your App Store account settings (or Google
            Play). Canceling stops future renewals; your current period continues until it ends.
          </li>
          <li>
            <span className={strong}>Refunds.</span> Except where required by law, payments are
            non-refundable and there is no refund for the unused portion of a period. Refund
            requests for App Store purchases are handled by Apple under its policies.
          </li>
          <li>
            <span className={strong}>Free trials.</span> aesmsg Pro currently has no free trial. If
            a free trial is ever offered, any unused portion is forfeited when you purchase the
            related subscription.
          </li>
          <li>
            <span className={strong}>Price changes.</span> We may change subscription prices.
            Changes apply to future renewals, and where the app store or applicable law requires, we
            will obtain your consent before a price increase takes effect.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "apple",
    heading: "App Store terms",
    body: (
      <>
        <p className={pClass}>
          The following terms apply when you obtain aesmsg through the Apple App Store, in addition
          to everything above.
        </p>
        <ul className={listClass}>
          <li>
            These Terms are between you and CODIFY d.o.o. only, not with Apple. Apple is not
            responsible for aesmsg or its content.
          </li>
          <li>Apple has no obligation to provide any maintenance or support for aesmsg.</li>
          <li>
            If aesmsg fails to conform to any applicable warranty, you may notify Apple, and Apple
            will refund the purchase price (if any) you paid for it; to the maximum extent permitted
            by law, Apple has no other warranty obligation, and any other claims, losses,
            liabilities, damages, costs, or expenses attributable to a failure to conform to any
            warranty are our responsibility.
          </li>
          <li>
            We, not Apple, are responsible for addressing any claims relating to aesmsg, including
            product-liability, regulatory-compliance, and consumer-protection claims.
          </li>
          <li>
            We, not Apple, are responsible for investigating and resolving any third-party claim
            that aesmsg or your use of it infringes that party&apos;s intellectual-property rights.
          </li>
          <li>
            You represent that you are not located in a country subject to a U.S. Government embargo
            or designated a &quot;terrorist supporting&quot; country, and that you are not on any
            U.S. Government list of prohibited or restricted parties.
          </li>
          <li>
            Apple and its subsidiaries are third-party beneficiaries of these Terms and, upon your
            acceptance, have the right to enforce these Terms against you.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "disclaimers",
    heading: "Disclaimers",
    body: (
      <p className={pClass}>
        aesmsg is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any
        kind to the maximum extent permitted by law. We do not warrant that the service will be
        uninterrupted, error-free, or that every link will always be deliverable or recoverable.
        Once content is decrypted on a device, you are responsible for it.
      </p>
    ),
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    body: (
      <p className={pClass}>
        To the maximum extent permitted by law, CODIFY d.o.o. will not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for any loss of data or content
        arising from your use of aesmsg — including any inability to recover encrypted content.
        Nothing in these Terms limits any liability that cannot be limited under applicable law,
        including the mandatory consumer-protection rights you may have where you live.
      </p>
    ),
  },
  {
    id: "changes-to-service",
    heading: "Changes to the service",
    body: (
      <p className={pClass}>
        We may add, change, suspend, or remove features at any time, and we may set technical limits
        such as maximum link size, available expiry options, and rate limits.
      </p>
    ),
  },
  {
    id: "termination",
    heading: "Termination",
    body: (
      <p className={pClass}>
        You may stop using aesmsg at any time and wipe your identity from your device. We may
        suspend or end your access if you violate these Terms or where necessary to protect the
        service or other users.
      </p>
    ),
  },
  {
    id: "governing-law",
    heading: "Governing law",
    body: (
      <p className={pClass}>
        These Terms are governed by the laws of the Republic of Croatia, without regard to its
        conflict-of-laws rules, and without prejudice to any mandatory consumer-protection rights
        available to you in your country of residence.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: (
      <p className={pClass}>
        We may update these Terms from time to time. When we make a material change, we will revise
        the &quot;last updated&quot; date at the top of this page and, where appropriate, notify
        users in the app before the change takes effect.
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
          <span className={strong}>OIB 59253184772</span>). For any question about these Terms,
          reach us at:
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

export function TermsContent() {
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

      <h1 className="font-display text-4xl font-bold tracking-tight mb-4">Terms of Use</h1>
      <p className="text-lg text-on-surface-variant leading-relaxed mb-8">
        These terms govern your use of aesmsg — the encryption utility, the apps, and the website.
        Please read them before you use the service.
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
