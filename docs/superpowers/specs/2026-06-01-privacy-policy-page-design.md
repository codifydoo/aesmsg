# Web: Privacy Policy page at `/privacy`

**Date:** 2026-06-01
**Status:** Approved (design)
**Area:** `apps/web`

## Problem

The aesmsg iOS app's App Store listing needs a **Privacy Policy URL**, and
`https://aesmsg.com/privacy` will be used. That URL must be live and accurate before App
Store review. The web app (`apps/web`) currently serves only the marketing landing (`/`),
the docs page (`/docs`), and the `/l/[id]` deep-link bouncer — there is no `/privacy` route.

The marketing `Footer` already links to `/privacy` ([`Footer.tsx:17`](../../../apps/web/src/landing/Footer.tsx)),
so today that link 404s. This task adds the page behind it.

Wiring the URL into App Store Connect is a separate manual step and is **not** part of this task.

## Goals

- A typed, **static, presentational** `/privacy` route in `apps/web`, prerendered at build
  (shows as `○` in the Next build output), matching the existing design system.
- Content that is **accurate to aesmsg's zero-knowledge product invariants** — it must not
  invent data collection, and must stay consistent with the iOS App Store privacy label
  declared "Data Not Collected".
- Reuses `@aesmsg/ui` / `@aesmsg/design-tokens` and the landing `Footer`; no hardcoded
  colors or spacing.
- Complies with the CLAUDE.md copy rules (calm SaaS tone, no banned phrasing).

## Non-goals (explicitly out of scope)

- Wiring the URL into App Store Connect (manual, separate).
- A Terms of Service page, cookie banner, or consent management — none apply (no tracking,
  no accounts, no cookies set by this static site).
- A `/contact` page (the `Footer` also links `/contact`; out of scope here — the policy's
  contact section uses a `mailto:` to `info@codify.hr`).
- Any change to the marketing `Header` nav or the landing/docs pages.
- Adding a privacy mockup to `all_design_screens/` (see "Design source note" below).

## Design source note

There is **no privacy-policy mockup** in `all_design_screens/` — this screen is not in the
design source of truth. Per the project's design rules we do not invent a novel visual;
instead this page is **derived from the established landing + docs design language**
(same tokens, same `Footer`, the docs page's long-form Tailwind-token prose treatment). It is
a derived layout, not a new invented aesthetic.

## Privacy facts the copy must reflect (product invariants — do not embellish)

- The server stores **only**: message ID, ciphertext, creation time, expiry, max opens, status.
- The server **never** stores: plaintext, private keys, message previews, unencrypted attachments.
- Private keys are generated **on-device** and never leave the device unless the user
  explicitly exports an encrypted backup.
- **No user accounts, no analytics/tracking SDKs, no advertising.** Consistent with the iOS
  "Data Not Collected" label.
- Links self-destruct (10 min / 1 hour / 24 hours / 7 days / custom), can cap max opens, and
  can be **manually revoked** — revocation purges the ciphertext from the server.
- Decryption happens **locally** on the recipient's device after biometric unlock; only the
  intended recipient can decrypt.
- Controller/operator: **CODIFY d.o.o.** Privacy contact: **info@codify.hr**.

## Component architecture

Mirrors the `/docs` pattern: a **server** screen composes **client** leaf components, and the
screen never imports the `@aesmsg/ui` barrel directly (importing the barrel into a server
component pulls client hooks into the RSC graph and breaks the build).

| File | Type | Role |
|---|---|---|
| `apps/web/app/privacy/page.tsx` | server | Exports `metadata` (title/description), renders `<PrivacyPolicyScreen/>`. Mirrors [`app/docs/page.tsx`](../../../apps/web/app/docs/page.tsx) — the in-repo, verified Next 16 static-route pattern. |
| `apps/web/src/privacy/PrivacyPolicyScreen.tsx` | server | Composes `<PrivacyHeader/>`, `<PrivacyContent/>`, landing `<Footer/>`. Imports leaf children **directly** (never the `@aesmsg/ui` barrel). Wraps everything in a `.landing-root` so the reused `Footer` resolves its short token aliases (`var(--on-var)` etc.). |
| `apps/web/src/privacy/PrivacyHeader.tsx` | client (`"use client"`) | Slim sticky header: `Wordmark` (links to `/`) + a "Get the app" CTA → `APP_STORE_URL`. Reuses landing `primitives` (`Wordmark`, `Btn`, `SHELL`) and `app-store-links`. **No** landing in-page anchors (`#how`/`#security`) — none would resolve on `/privacy`. |
| `apps/web/src/privacy/PrivacyContent.tsx` | client (`"use client"`) | The policy body. `"use client"` so it can use `MaterialIcon` callouts, exactly as [`DocsContent`](../../../apps/web/src/docs/DocsContent.tsx) does. Content is defined as a typed section array (id + heading + paragraph nodes) and rendered as a single readable column with anchored `<h2 id>` headings. |

### Styling

- Wrapper: `.landing-root` (required for the landing `Footer`'s short tokens).
- Body prose: the **docs-style Tailwind token utilities** — `text-on-surface`,
  `text-on-surface-variant`, `bg-surface-container`, `border-outline-variant`,
  `text-primary`, `font-display`, `font-mono`. These resolve globally (independent of
  `.landing-root`), so they compose cleanly inside the wrapper.
- Reuse the docs heading/paragraph class idioms (e.g. `h2Class` with `scroll-mt-24` for
  deep-link offset, `pClass` for body paragraphs). The page sits in a centered single
  column (`max-w-3xl`, comfortable reading measure), offset for the sticky header.
- No raw hex, no arbitrary color values, no drop shadows (depth via luminance + 1px borders),
  consistent with the rest of `apps/web`.

## Content: sections (anchored `<h2 id>`, single column, in order)

A typed `Section[]` drives rendering. Each section has a stable `id` (deep-linkable, e.g.
`/privacy#data-retention`), a heading, and prose. Copy is calm and plain; deep crypto jargon
stays out of the primary flow.

1. **Intro** (`#overview`) — what aesmsg is in one breath (a zero-knowledge encryption layer
   over channels you already use); the policy covers what the aesmsg apps and backend do with
   data. Includes an up-front **callout**: *this policy is provided for transparency and is
   not legal advice; have it reviewed by counsel before relying on it.*
2. **What we process** (`#what-we-process`) — only ciphertext + minimal metadata: message ID,
   ciphertext, creation time, expiry, max opens, status. Plaintext is encrypted on your device
   before anything is uploaded.
3. **What we never have access to** (`#what-we-never-see`) — plaintext, private keys, message
   previews, unencrypted attachments. Private keys are generated on-device and stay there
   unless you export an encrypted backup. Decryption is local, after biometric unlock; only
   the intended recipient can decrypt. (Reinforce the zero-knowledge backend here.)
4. **Data retention & deletion** (`#data-retention`) — links self-destruct (10 min / 1 hour /
   24 hours / 7 days / custom), can cap max opens, and can be manually revoked; revocation
   purges the ciphertext from the server. Expired/exhausted/revoked links leave no readable
   content behind.
5. **No tracking, analytics, or accounts** (`#no-tracking`) — no accounts, no analytics or
   tracking SDKs, no advertising, no third-party data brokers. States explicitly that this is
   consistent with the iOS App Store **"Data Not Collected"** label.
6. **International users & your rights** (`#your-rights`) — because the backend is
   zero-knowledge there is little to no personal data to access, correct, or erase; you
   control deletion directly through expiry / max-opens / revocation. GDPR-style rights are
   acknowledged honestly; CODIFY d.o.o. is the operator. Email for any request.
7. **Children** (`#children`) — the service is not directed to children under 16 (and not to
   children under 13); we do not knowingly collect their data.
8. **Changes to this policy** (`#changes`) — we may update this policy and will revise the
   "last updated" date; material changes will be reflected here.
9. **Contact** (`#contact`) — **CODIFY d.o.o.**, privacy contact **info@codify.hr**
   (rendered as a `mailto:` link).

A **"Last updated: June 1, 2026"** line appears near the title, driven by a typed
`LAST_UPDATED` constant.

## Copy compliance

- **Use:** "end-to-end encrypted", "zero-knowledge backend", "private keys stay on your
  device", "only the intended recipient can decrypt".
- **Never:** "unbreakable", "impossible to hack", "military-grade" (also avoid "quantum",
  consistent with the landing-page guard test).
- Green = safe/verified, amber = caution, red = destructive — used only if semantic, not
  ambient. This page is mostly neutral prose with at most subtle violet/info accents.

## Footer link

Already present — `Footer.tsx` "Company" column links `/privacy`. No change needed; this task
simply makes that link resolve. (Verified during design.)

## Testing

`apps/web/tests/privacy/PrivacyPolicyScreen.test.tsx` — Vitest **browser mode**
(Chromium/Playwright), `@testing-library/react`, mirroring the landing/bouncer test setup:

- Renders the page `h1` ("Privacy Policy").
- Renders the "Last updated" date line.
- Renders each section heading (overview, what-we-process, what-we-never-see, data-retention,
  no-tracking, your-rights, children, changes, contact) — assert by accessible heading name.
- Asserts the **zero-knowledge facts**: text mentioning that the server stores only
  ciphertext + minimal metadata, and never plaintext / private keys / previews / attachments.
- Asserts **"Data Not Collected"** appears and the **"not legal advice"** disclaimer appears.
- Asserts **`CODIFY d.o.o.`** appears and a `mailto:info@codify.hr` link is present.
- **Banned-copy guard:** asserts "military-grade", "unbreakable", "impossible to hack",
  "quantum" are absent (same shape as `LandingPage.test.tsx`).
- Renders a footer (`contentinfo`) with the aesmsg brand.

## Verification (run from repo root)

- `pnpm typecheck` — green across the workspace.
- `pnpm lint` — Biome clean (lint + format).
- `pnpm test` — Vitest green, including the new privacy test.
- `pnpm --filter web build` — production build succeeds and `/privacy` is listed as a
  **static** (`○` prerendered) route.

## Delivery

- Work on a feature branch (not `main`); open a PR.
- This is a `pnpm` monorepo — never `npm`/`yarn`.
- Implementation runs as a lean multi-agent **Workflow** (build → adversarial review against
  the privacy invariants + copy rules → fix), per the user's request to use workflows.
