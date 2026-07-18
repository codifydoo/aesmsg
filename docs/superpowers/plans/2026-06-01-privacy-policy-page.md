# Privacy Policy page (`/privacy`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed, static, presentational `/privacy` Privacy Policy route to `apps/web`, accurate to aesmsg's zero-knowledge invariants, matching the existing design system.

**Architecture:** A server screen (`PrivacyPolicyScreen`) composes three client leaves — a slim `PrivacyHeader`, the long-form `PrivacyContent`, and the reused landing `Footer` — wrapped in `.landing-root` so the footer's short token aliases resolve. The route file `app/privacy/page.tsx` exports static `metadata` and renders the screen, mirroring `app/docs/page.tsx`. The screen never imports the `@aesmsg/ui` barrel (that breaks the RSC build); only the client leaves do.

**Tech Stack:** Next.js 16 (app router, RSC, Turbopack), TypeScript strict, Tailwind 4 + `@aesmsg/design-tokens`, `@aesmsg/ui`, Vitest browser mode (Playwright/Chromium) + Testing Library, Biome.

Spec: [`docs/superpowers/specs/2026-06-01-privacy-policy-page-design.md`](../specs/2026-06-01-privacy-policy-page-design.md)

---

## File structure

- Create `apps/web/src/privacy/PrivacyContent.tsx` — client; typed `SECTIONS` + `LAST_UPDATED`, renders the single-column anchored policy body.
- Create `apps/web/src/privacy/PrivacyHeader.tsx` — client; slim sticky header (brand → `/`, "Get the app" → `APP_STORE_URL`).
- Create `apps/web/src/privacy/PrivacyPolicyScreen.tsx` — server; composes header + content + landing `Footer` inside `.landing-root`.
- Create `apps/web/app/privacy/page.tsx` — server; `metadata` + renders the screen.
- Create `apps/web/tests/privacy/PrivacyPolicyScreen.test.tsx` — browser-mode render tests.

---

### Task 1: Write the failing test

**Files:**
- Test: `apps/web/tests/privacy/PrivacyPolicyScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPolicyScreen } from "@/src/privacy/PrivacyPolicyScreen";

describe("PrivacyPolicyScreen (presentational privacy policy)", () => {
  it("renders the page title and last-updated date", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    expect(
      screen.getByRole("heading", { level: 1, name: /privacy policy/i }),
    ).toBeInTheDocument();
    expect(container.textContent).toMatch(/last updated: june 1, 2026/i);
  });

  it("renders every policy section heading", () => {
    render(<PrivacyPolicyScreen />);
    for (const name of [
      /^overview$/i,
      /what we process/i,
      /what we never have access to/i,
      /data retention and deletion/i,
      /no tracking, analytics, or accounts/i,
      /international users and your rights/i,
      /^children$/i,
      /changes to this policy/i,
      /^contact$/i,
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("states the zero-knowledge data facts", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/only the resulting ciphertext/i);
    expect(text).toMatch(/maximum number of opens/i);
    expect(text).toMatch(/plaintext messages/i);
    expect(text).toMatch(/private keys/i);
    expect(text).toMatch(/message previews/i);
    expect(text).toMatch(/unencrypted attachments/i);
    expect(text).toMatch(/revoking a link purges its ciphertext/i);
  });

  it('notes the "Data Not Collected" label and the not-legal-advice disclaimer', () => {
    const { container } = render(<PrivacyPolicyScreen />);
    expect(container.textContent).toMatch(/data not collected/i);
    expect(container.textContent).toMatch(/not legal advice/i);
  });

  it("names the operator and a privacy-contact mailto", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    expect(container.textContent).toMatch(/CODIFY d\.o\.o\./);
    const mail = screen.getByRole("link", { name: /info@codify\.hr/i });
    expect(mail).toHaveAttribute("href", "mailto:info@codify.hr");
  });

  it("avoids the banned marketing copy", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/military-grade/i);
    expect(text).not.toMatch(/unbreakable/i);
    expect(text).not.toMatch(/impossible to hack/i);
    expect(text).not.toMatch(/quantum/i);
  });

  it("renders a footer with the aesmsg brand", () => {
    render(<PrivacyPolicyScreen />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("aesmsg")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — cannot resolve `@/src/privacy/PrivacyPolicyScreen` (module does not exist yet).

---

### Task 2: Create the policy content (`PrivacyContent`)

**Files:**
- Create: `apps/web/src/privacy/PrivacyContent.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { MaterialIcon } from "@aesmsg/ui";
import type { ReactNode } from "react";

/** Single source of truth for the "last updated" date shown near the title. */
export const LAST_UPDATED = "June 1, 2026";

const h2Class = "font-display text-2xl font-semibold tracking-tight mt-12 mb-4 scroll-mt-24";
const pClass = "text-[15px] text-on-surface-variant leading-relaxed mb-4";
const listClass = "list-disc pl-5 space-y-1 mb-4 text-[15px] text-on-surface-variant leading-relaxed";
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
          aesmsg is a privacy-first encryption layer over the messaging channels you already
          use. You encrypt content locally on your device, then share an opaque link to the
          resulting ciphertext — and only the intended recipient can decrypt it. This policy
          explains what the aesmsg apps and backend do, and just as importantly do not do, with
          your data.
        </p>
        <p className={pClass}>
          Because aesmsg runs on a zero-knowledge backend, there is very little data for this
          policy to describe. The product is designed so the sensitive parts of your message
          never reach our servers in a form anyone could read.
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
          device first. Only the resulting ciphertext, together with a small amount of
          operational metadata, is uploaded to our backend. The backend stores only:
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
          Your private content never reaches us in a readable form. We do not have access to,
          and the backend never stores:
        </p>
        <ul className={listClass}>
          <li>Plaintext messages</li>
          <li>Private keys</li>
          <li>Message previews</li>
          <li>Unencrypted attachments</li>
        </ul>
        <p className={pClass}>
          Encryption keys are generated on your device. Your private key stays on your device
          and never leaves it unless you explicitly export an encrypted backup. Decryption
          happens locally on the recipient&apos;s device after a biometric unlock, so only the
          intended recipient can decrypt a message — never us, and never the channel you sent
          the link through.
        </p>
        <div className={calloutClass}>
          <MaterialIcon name="verified_user" className="text-success shrink-0 text-[20px]" />
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
    id: "data-retention",
    heading: "Data retention and deletion",
    body: (
      <>
        <p className={pClass}>
          You control how long a secure link lives and how many times it can be opened. When you
          create a link you can set it to self-destruct after 10 minutes, 1 hour, 24 hours, 7
          days, or a custom duration, and you can cap the number of times it may be opened.
        </p>
        <p className={pClass}>
          You can also revoke a link manually at any time. Revoking a link purges its ciphertext
          from the server. Once a link expires, reaches its open limit, or is revoked, there is
          no readable content left on our servers to recover.
        </p>
      </>
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
          your data — because we do not collect it in the first place.
        </p>
        <p className={pClass}>
          This is consistent with the App Store privacy label for the aesmsg iOS app, which is
          declared <span className={strong}>&quot;Data Not Collected&quot;</span>.
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
          aesmsg is operated by CODIFY d.o.o. and is available internationally. We aim to honor
          applicable privacy laws, including the EU General Data Protection Regulation (GDPR),
          wherever you use the app.
        </p>
        <p className={pClass}>
          Rights such as access, correction, and erasure normally apply to personal data a
          service holds about you. Because our backend is zero-knowledge, we hold essentially no
          personal data tied to your identity — only opaque ciphertext and the minimal metadata
          described above. In practice you exercise control directly: choose a short expiry, cap
          the number of opens, or revoke a link to purge its ciphertext immediately.
        </p>
        <p className={pClass}>
          If you have a question or request regarding your data, contact us using the details
          below and we will respond.
        </p>
      </>
    ),
  },
  {
    id: "children",
    heading: "Children",
    body: (
      <p className={pClass}>
        aesmsg is not directed to children. The service is intended for adults and is not offered
        to children under 16, or under 13 where that is the applicable minimum age. We do not
        knowingly collect personal data from children. If you believe a child has provided us
        data, contact us and we will address it.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p className={pClass}>
        We may update this policy from time to time. When we do, we will revise the
        &quot;last updated&quot; date at the top of this page and reflect any material changes
        here. Continued use of aesmsg after an update means you accept the revised policy.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: (
      <>
        <p className={pClass}>
          aesmsg is provided by <span className={strong}>CODIFY d.o.o.</span> For any question or
          request about this policy or your data, reach our privacy contact:
        </p>
        <div className={calloutClass}>
          <MaterialIcon name="mail" className="text-primary shrink-0 text-[20px]" />
          <div className={calloutBody}>
            <a
              href="mailto:info@codify.hr"
              className="font-mono text-primary hover:underline"
            >
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
      <div className="flex items-center gap-2 text-[12px] text-on-surface-variant mb-4">
        <span className="px-2 py-1 rounded-md bg-primary-container/40 text-on-primary-container font-medium">
          Legal
        </span>
        <span>Last updated: {LAST_UPDATED}</span>
      </div>

      <h1 className="font-display text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
      <p className="text-lg text-on-surface-variant leading-relaxed mb-8">
        aesmsg is built so your private content stays private — encrypted on your device, opaque
        to our servers, and readable only by the recipient you choose.
      </p>

      <div className={calloutClass}>
        <MaterialIcon name="info" className="text-primary shrink-0 text-[20px]" />
        <div className={calloutBody}>
          <span className={strong}>This is not legal advice.</span> We provide this policy for
          transparency. Please have it reviewed by qualified legal counsel before relying on it
          for compliance.
        </div>
      </div>

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
```

---

### Task 3: Create the slim header (`PrivacyHeader`)

**Files:**
- Create: `apps/web/src/privacy/PrivacyHeader.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { APP_STORE_URL } from "@/src/landing/app-store-links";
import { Btn, SHELL, Wordmark } from "@/src/landing/primitives";

// Slim, sticky privacy-page header. Reuses the landing brand lockup + primary CTA but carries
// NONE of the landing nav's in-page anchors (#how / #security) — those would dangle on
// /privacy. The wordmark links home; the CTA drives to the App Store. The `glass` / `btn-*`
// helper classes resolve because the whole screen is wrapped in `.landing-root`.
export function PrivacyHeader() {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50 }}>
      <div
        className="glass"
        style={{
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(20,18,24,0.72)",
        }}
      >
        <div
          className={SHELL}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 68,
          }}
        >
          <a
            href="/"
            aria-label="aesmsg home"
            style={{ textDecoration: "none", color: "var(--on)" }}
          >
            <Wordmark markSize={24} text={20} />
          </a>
          <Btn kind="primary" icon="ios_share" href={APP_STORE_URL}>
            Get the app
          </Btn>
        </div>
      </div>
    </header>
  );
}
```

---

### Task 4: Create the screen composition (`PrivacyPolicyScreen`)

**Files:**
- Create: `apps/web/src/privacy/PrivacyPolicyScreen.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Footer } from "@/src/landing/Footer";
import { PrivacyContent } from "@/src/privacy/PrivacyContent";
import { PrivacyHeader } from "@/src/privacy/PrivacyHeader";

// Top-level composition of the Privacy Policy page. SERVER component: it only composes children
// and imports no @aesmsg/ui barrel or client hooks (importing the barrel into a server component
// pulls client hooks into the RSC graph and breaks the build). The slim header, the long-form
// content, and the reused marketing footer are all client leaves. The whole page is wrapped in
// `.landing-root` so the landing Footer resolves its short token aliases (var(--on-var), etc.).
export function PrivacyPolicyScreen() {
  return (
    <div className="landing-root min-h-dvh">
      <PrivacyHeader />
      <PrivacyContent />
      <Footer />
    </div>
  );
}
```

---

### Task 5: Create the route (`app/privacy/page.tsx`)

**Files:**
- Create: `apps/web/app/privacy/page.tsx`

- [ ] **Step 1: Write the route**

```tsx
import type { Metadata } from "next";
import { PrivacyPolicyScreen } from "@/src/privacy/PrivacyPolicyScreen";

export const metadata: Metadata = {
  title: "Privacy Policy — aesmsg",
  description:
    "How aesmsg handles data: a zero-knowledge backend that stores only ciphertext and minimal metadata. Plaintext, private keys, and attachments never reach our servers.",
};

export default function PrivacyPage() {
  return <PrivacyPolicyScreen />;
}
```

---

### Task 6: Green the test + verify all gates

- [ ] **Step 1: Run the privacy test**

Run: `pnpm --filter web test`
Expected: PASS — all `PrivacyPolicyScreen` cases green, no regressions in bouncer/landing.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS across the workspace.

- [ ] **Step 3: Lint / format**

Run: `pnpm lint`
Expected: Biome clean. If only-formatting issues appear, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: PASS across every workspace.

- [ ] **Step 5: Production build + static-route check**

Run: `pnpm --filter web build`
Expected: build succeeds and the route table lists `/privacy` as a **static** prerendered route (`○`). Confirm `.next` emitted prerendered HTML for `/privacy` (e.g. `apps/web/.next/server/app/privacy.html` exists).

---

### Task 7: Commit

- [ ] **Step 1: Commit**

```bash
git add apps/web/app/privacy apps/web/src/privacy apps/web/tests/privacy
git commit -m "feat(web): add /privacy Privacy Policy page"
```

---

## Self-review

**Spec coverage:** intro + not-legal-advice callout (Task 2 header + overview) ✓; what we process (ciphertext + 6 metadata fields) ✓; what we never have access to (4 items + keys-on-device + local decrypt) ✓; retention/expiry/max-opens/revocation-purges ✓; no tracking/analytics/accounts + "Data Not Collected" ✓; international/rights/CODIFY operator ✓; children ✓; changes + last-updated date ✓; contact CODIFY d.o.o. + mailto info@codify.hr ✓; footer link already present (no change) ✓; static route + design-system reuse + `.landing-root` ✓; copy compliance (banned-word guard test) ✓.

**Placeholder scan:** none — every step has full code or an exact command.

**Type consistency:** `PrivacyPolicyScreen` (default-less named export) imported identically in the test and the route; `LAST_UPDATED` value (`"June 1, 2026"`) matches the test regex; `APP_STORE_URL` import path matches the existing landing `Header`; `Btn`/`Wordmark`/`SHELL` come from `@/src/landing/primitives`; heading texts match the test's section-name regexes exactly.
