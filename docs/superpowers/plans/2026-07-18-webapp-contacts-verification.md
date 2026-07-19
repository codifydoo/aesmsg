# Sub-project 4 — Web client contacts + verification (`apps/webapp`) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the standalone web identity (SP1) and its sender flow (SP2) a real **contact directory + trust layer**, at full parity with the mobile app. Save a peer's public key (pasted or **camera-QR-scanned**), see it as a **verified (green) / unverified (amber) / key-changed (amber)** contact, **display your own key as a QR** so a mobile user can scan you, perform **manual fingerprint verification** ("compare it out-of-band"), and — the product's headline MitM defense — detect when a saved contact's key **changed** and **gate compose** so a changed-key contact can never be silently sealed to. This fills the saved-contact-picker **seam** SP2 deliberately left in `ComposeScreen`/`recipient.ts`.

Interop with mobile is non-negotiable in both directions: the QR the web **displays** must scan on a mobile device, and a QR a mobile device displays must scan on the web. The contact record shape, the key-change classification, and the verify/reset semantics are **byte-for-byte mirrors** of `apps/mobile/src/contacts/*` so a contact behaves identically across surfaces.

**Architecture:** Four concentric layers on top of SP1–SP3.
1. **Persistence:** an IndexedDB **v3** schema bump adding a `contacts` object store (additive, `contains`-guarded, like the SP2 v2 bump), plus a `contacts-store.ts` that mirrors [`apps/mobile/src/contacts/contacts-store.ts`](../../../apps/mobile/src/contacts/contacts-store.ts) API + typed errors **verbatim** (swapping the mobile EncryptedStore for `withStore(CONTACTS_STORE, …)`).
2. **Pure trust logic (no React, no storage):** `contacts-display.ts` (`deriveTrustStatus`), `trust-status.ts` (color semantics), `key-change.ts` (`classifyKeyChange`/`detectKeyChange`) — direct ports of the mobile modules, node-testable in isolation.
3. **QR primitives:** `qr-encode.ts` (bundled `qrcode`, error-correction "M", → module matrix → inline SVG), `qr-decode.ts` + `use-camera-scanner.ts` (bundled `jsQR` over a `getUserMedia` `MediaStream` sampled through a `<canvas>`), `scanned-key.ts` (the `amk1:` scan gate).
4. **Screens + compose integration:** contacts list (`/contacts`), add-contact (`/contacts/new`), contact detail (`/contacts/detail?id=`), verify-fingerprint + key-changed alert, own-key QR on the existing `/identity` screen, and the `ComposeScreen` saved-contact picker + key-changed gate.

`@aesmsg/crypto`, `@aesmsg/ui`, `@aesmsg/design-tokens`, `@aesmsg/server-store`, and `apps/api` are **frozen** — consumed verbatim, never modified. **No mobile changes.**

**Tech Stack:** Next.js 16 static export (`output: 'export'`, unchanged); React 19; `@aesmsg/crypto` (workspace, unchanged); native IndexedDB; **`qrcode@^1.5.4`** + **`jsqr@^1.4.0`** (new — see D2); `getUserMedia`/canvas (no dep); Vitest 3 **browser mode** (headless Chromium via Playwright); Biome 2 (repo-wide).

**Spec:** [`docs/superpowers/specs/2026-07-18-messaging-web-client-design.md`](../specs/2026-07-18-messaging-web-client-design.md) — this plan implements **item 4 of §9** ("Contacts + verification"), honoring §6.3 (contacts & verification), §3 (honest web-tier threat model), and §10 (testing). Builds on [`2026-07-18-webapp-foundation-identity.md`](./2026-07-18-webapp-foundation-identity.md) (SP1), [`2026-07-18-webapp-sender-links.md`](./2026-07-18-webapp-sender-links.md) (SP2 — the DB v2 store pattern, `recipient.ts` seam, `RequireUnlocked`), and [`2026-07-18-webapp-recipient-bouncer.md`](./2026-07-18-webapp-recipient-bouncer.md) (SP3 — the static-export `?id=` detail-route precedent).

Mobile behavioral sources of truth (ported, not modified): [`contacts-store.ts`](../../../apps/mobile/src/contacts/contacts-store.ts), [`contacts-display.ts`](../../../apps/mobile/src/contacts/contacts-display.ts), [`trust-status.ts`](../../../apps/mobile/src/contacts/trust-status.ts), [`key-change.ts`](../../../apps/mobile/src/contacts/key-change.ts), [`scanned-key.ts`](../../../apps/mobile/src/contacts/scanned-key.ts), [`QRScanScreen.tsx`](../../../apps/mobile/src/contacts/QRScanScreen.tsx), [`qr-matrix.ts`](../../../apps/mobile/src/keys/qr-matrix.ts) / [`KeyQrCode.tsx`](../../../apps/mobile/src/keys/KeyQrCode.tsx), [`MyPublicKeyScreen.tsx`](../../../apps/mobile/src/keys/MyPublicKeyScreen.tsx), [`ContactsFlow.tsx`](../../../apps/mobile/src/contacts/ContactsFlow.tsx), [`KeyChangedWarningScreen.tsx`](../../../apps/mobile/src/create/KeyChangedWarningScreen.tsx) (compose gate) and [`KeyChangedAlertScreen.tsx`](../../../apps/mobile/src/keys/KeyChangedAlertScreen.tsx) (contact-side alert). Historical plans for context: `2026-05-10-contacts-directory.md`, `2026-05-10-security-alert.md`, `2026-06-01-mobile-paste-public-key-contact.md`, `2026-06-01-mobile-qr-scan-camera.md`.

---

## ⚠️ Pinned decisions — read before starting

### D1. QR payload = the RAW `amk1:` public-key string (mobile-compatible, both directions)

The QR carries the recipient's/own **`PublicKeyString`** verbatim — the same `amk1:…` string a user would paste. **No URI scheme, no `aesmsg://`, no JSON wrapper.** This is exactly what mobile displays (`KeyQrCode value={publicKeyString}`, [`MyPublicKeyScreen.tsx:66`](../../../apps/mobile/src/keys/MyPublicKeyScreen.tsx)) and exactly what mobile's scan gate accepts (`isAcceptableScan` requires a leading `amk1:`, [`scanned-key.ts:25-28`](../../../apps/mobile/src/contacts/scanned-key.ts)).

- **Web display** encodes the raw string with **error-correction level `"M"`** — matching [`qr-matrix.ts:12`](../../../apps/mobile/src/keys/qr-matrix.ts) so the two produce visually equivalent codes.
- **Web scan** decodes → `normalizeScannedPayload` (trim) → require the `amk1:` prefix → hand the raw string to the SAME `importPublicKey`-based validation the paste path uses. A scanned code that is not an `amk1:` key degrades to a calm "That's not an aesmsg public key" and keeps scanning (mirrors [`QRScanScreen.tsx:145-159`](../../../apps/mobile/src/contacts/QRScanScreen.tsx)).
- **Round-trip is tested both ways** (Task 7 + Task 13): a web-encoded QR decodes back to the original `amk1:` string, and a fixed mobile-shaped `amk1:` fixture encodes then decodes to itself. The authoritative parse is always `importPublicKey`, identical to a paste.

### D2. New dependencies — justified (this is the one sub-project where new deps are warranted)

The umbrella spec's "no third-party scripts" / strict-CSP rule (§3) is about **runtime script origins** — remote `<script>` tags and remote fonts/analytics. It is **not** a ban on bundled npm libraries: `qrcode` and `jsQR` are compiled by Next into hash-named, self-hosted, immutable `/_next/**` assets served from `'self'`, exactly like `@aesmsg/crypto`. Nothing is fetched from a third-party origin at runtime. Both are pure JS (no eval, no remote wasm) so they run under the SP1 `script-src 'self' 'wasm-unsafe-eval'` unchanged.

- **QR DISPLAY → `qrcode@^1.5.4`** (+ dev `@types/qrcode@^1.5.6`). **Pinned to the exact version mobile already uses** ([`apps/mobile/package.json:41,53`](../../../apps/mobile/package.json)). Rationale: identical library + identical input + identical error-correction level ⇒ format parity with the mobile QR by construction. Used as `QRCode.create(text, { errorCorrectionLevel: "M" })` → the module matrix → rendered as an inline SVG `<rect>` grid (mirrors mobile's `toQrMatrix`, [`qr-matrix.ts`](../../../apps/mobile/src/keys/qr-matrix.ts)) — **not** `toCanvas`/`toDataURL`, so there is no canvas dependency for display and the SVG is inert DOM (no CSP surface). MIT-licensed, mature, negligible bundle, no runtime deps of concern.
- **QR SCAN → `jsqr@^1.4.0`** (ships its own TypeScript types; no `@types` needed). Rationale for choosing a pure-JS decoder over the native `BarcodeDetector`:
  - **`BarcodeDetector` is Chromium-only AND platform-dependent** — it is absent on Firefox/Safari and frequently unavailable in headless Chromium / Playwright and on many Linux/macOS builds (it delegates to an OS Shape-Detection backend). Depending on it would create an **untestable, non-deterministic** code path in our Vitest browser-mode CI and a silent no-scan on common browsers.
  - **`jsQR` is deterministic, fully offline, framework-free, and works in every browser** including the headless Chromium the tests run in. It decodes an `ImageData` sampled from the `<video>` frame through a `<canvas>` — no network, no eval.
  - Decision: **`jsQR` is the single, always-on decode path.** `BarcodeDetector` is noted as a *possible future fast-path* (feature-detected, decode-only), explicitly **not** built or depended on here, to keep one tested path.
- **`getUserMedia` / `<canvas>` need no dependency.**

### D3. No CSP change — camera + canvas + QR need none

Confirmed against the SP1 policy ([`apps/webapp/scripts/inject-csp.mjs:58-69`](../../../apps/webapp/scripts/inject-csp.mjs): `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' …; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' <api>; base-uri 'none'; form-action 'none'`):

- **Camera preview** binds the stream via `video.srcObject = stream` — a live `MediaStream` **object**, not a URL fetch — so it is **not governed by `media-src`** (which the policy omits) and needs no directive. (Never assign a blob/object URL to `video.src`; that WOULD hit `default-src 'none'`.)
- **QR display** is inline SVG (`<rect>` grid) — inert DOM, no `img-src`/`connect-src` involvement. (Even a data-URL `<img>` fallback is already covered by the existing `img-src 'self' data:`.)
- **Scanning** (`getUserMedia`, canvas `getImageData`, `jsQR`) is entirely local computation — no new `connect-src` origin. `connect-src` stays `'self' <api.aesmsg.com>`.

Task 16 re-runs `pnpm --filter @aesmsg/webapp check:csp` after `build` to prove **zero** `securitypolicyviolation` on the new screens.

### D4. The camera stream never leaves the device; tracks stop on unmount

`use-camera-scanner.ts` calls `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })` client-side only. Frames are read into an in-memory canvas and decoded locally; **nothing is uploaded** and no frame is persisted. On unmount, on tab hidden (`visibilitychange`), and immediately after a successful decode, it calls `stream.getTracks().forEach((t) => t.stop())` and clears `video.srcObject`. **Graceful degradation** (mirrors [`QRScanScreen.tsx:161-197`](../../../apps/mobile/src/contacts/QRScanScreen.tsx)): no `mediaDevices`/`getUserMedia`, `NotAllowedError`/`SecurityError` (denied), `NotFoundError` (no camera), or `onMountError` → a calm "Camera access needed / paste the key instead" state that **falls back to the paste-key tab**. Camera unavailability must never crash the add-contact screen.

### D5. Contact record shape = byte-for-byte mirror of mobile `ContactRecord`

Pinned exact key set (source: [`contacts-store.ts:20-30`](../../../apps/mobile/src/contacts/contacts-store.ts)):

```ts
export interface ContactRecord {
  id: string;                       // crypto.randomUUID(); stable, survives key rotation
  label: string;                    // 1–80 chars, trimmed (validateLabel)
  publicKey: PublicKeyString;       // the amk1: key — PUBLIC material
  fingerprint: Fingerprint;         // computed via @aesmsg/crypto fingerprint()
  verified: boolean;                // manual; RESET to false on key rotation
  previousFingerprints: Fingerprint[]; // oldest-first rotation history
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601
  schemaVersion: 1;
}
```

The store API + typed errors are ported verbatim: `addContact`, `listContacts` (collator-sorted by label), `getContact`, `updateContactKey`, `setContactVerified`, `renameContact`, `deleteContact` (idempotent), `__resetContactsForTests`, and the errors `ContactsStoreError`/`InvalidLabelError`/`NotFoundError`/`SameKeyError`/`RotatedAwayError`/`DuplicateFingerprintError` (with `existingId`/`existingLabel`/`reason`). `MAX_LABEL_LEN = 80`.

**Honest web-tier caveat (spec §3):** the webapp's IndexedDB is **not encrypted at rest** (mobile seals this under a device DEK). But a `ContactRecord` is entirely **public material** — a public key, its fingerprint, and a user-chosen label. There is **no secret** here to leak: someone with local browser-profile access learns your *contact labels + social graph* (metadata), never any key that could decrypt a message. This is documented in `AGENTS.md` and does not touch the zero-knowledge backend invariant (nothing new reaches the server; contacts are local-only).

### D6. Key-changed detection mechanism — pinned to the mobile mechanism (real file refs)

Two parts, ported exactly:

- **The "changed" state is DERIVED, not stored.** `deriveTrustStatus(record)` returns `"changed"` iff `!record.verified && record.previousFingerprints.length > 0` ([`contacts-display.ts:16-20`](../../../apps/mobile/src/contacts/contacts-display.ts)). Ordering: `verified` always wins; else a non-empty rotation history ⇒ `changed`; else `unverified`.
- **The TRIGGER is re-keying an existing contact.** Key-changed is raised when a user **pastes or scans a DIFFERENT key for an already-saved contact** (matched by contact `id`), via the contact-detail re-key entry point. The pure classifier `classifyKeyChange(existing, candidateFp)` / `detectKeyChange(existing, candidateKey)` ([`key-change.ts:35-61`](../../../apps/mobile/src/contacts/key-change.ts)) decides **before** committing:
  - `candidateFp === existing.fingerprint` → `"same"` (a reassuring re-scan; no change),
  - `existing.previousFingerprints.includes(candidateFp)` → `"rotated-back"` (store refuses; `RotatedAwayError`),
  - otherwise → `"changed"` carrying the **REAL** `previousFingerprint` (current-on-file) + `newFingerprint`.
  On a `"changed"` outcome the UI raises the amber security alert; **confirming** calls `updateContactKey(id, newKey)` ([`contacts-store.ts:134-161`](../../../apps/mobile/src/contacts/contacts-store.ts)), which re-derives the fingerprint, **sets `verified: false`**, and **pushes the old fingerprint onto `previousFingerprints`**. That reset is the security-critical bit: a changed key is unverified until re-compared out-of-band. Flow wiring reference: [`ContactsFlow.tsx:113-131` (submitRekey)](../../../apps/mobile/src/contacts/ContactsFlow.tsx) and `:275-305` (the alert → `updateContactKey`).

Adding a brand-new distinct contact never triggers key-changed; `addContact` instead guards against re-adding an already-known key (`DuplicateFingerprintError`, current or previous, [`contacts-store.ts:91-106`](../../../apps/mobile/src/contacts/contacts-store.ts)).

### D7. Two distinct key-changed surfaces — both AMBER as ambient state (design rule)

There are two screens; do not conflate them, and honor the color rule (green = verified/safe, **amber = unverified / key-changed / verify-required**, **red = destructive/risky ACTION only** — never an ambient state):

1. **Contact-side security alert** — mockup [`security_alert_key_changed_aesmsg/code.html`](../../../all_design_screens/security_alert_key_changed_aesmsg/code.html) + mobile [`KeyChangedAlertScreen.tsx`](../../../apps/mobile/src/keys/KeyChangedAlertScreen.tsx). Raised in the **contact re-key** flow when a scanned/pasted key differs from the one on file. **Amber throughout**: an amber warning banner ("Security Alert: Public Key Changed"), a "Verification Required" amber chip, and a side-by-side **Previous (neutral/grey) vs New/Current (amber)** fingerprint comparison in `font-mono`. Actions: **"Verify Fingerprint"** (primary, safe) and **"Update to new key"** (adopt → resets unverified) / **"Keep current key"**. The mockup's secondary "Proceed Anyway (Unsafe)" is a **muted outline using `text-error/80`** (NOT a red *fill*, NOT an ambient red). Copy is honest about the meaning: "This could mean they have a new device or their identity was compromised. Verify the fingerprint before sending."
2. **Compose-side key-changed gate** — mobile [`KeyChangedWarningScreen.tsx`](../../../apps/mobile/src/create/KeyChangedWarningScreen.tsx). Raised when a **`"changed"`-status saved contact is picked as the compose recipient**. Amber "Key changed" chip + amber caution card contrasting **Previously vs Now** fingerprints (`font-mono`). It **blocks the silent seal** (see D8). Primary safe action **"Verify fingerprint"**; an explicit, clearly-labeled **"Send anyway (unsafe)"** is the risky *action* — that button MAY be red because red is reserved for exactly this kind of explicit destructive/risky choice (mobile styles it `kind="danger"`). Cancel leaves the draft untouched. This screen **never seals on its own**.

### D8. Compose blocking — a key-changed contact cannot be silently sealed to (fills SP2's seam)

SP2 left `ComposeScreen`/`recipient.ts` with a clean seam ([`recipient.ts:8-11`](../../../apps/webapp/src/create/recipient.ts), the `// SP4 seam` comment in [`ComposeScreen.tsx:221`](../../../apps/webapp/src/screens/ComposeScreen.tsx)). This SP fills it with a saved-contact picker whose selected contact feeds the **same** `{ publicKey, fingerprint }` the pasted path produces — so the seal call (`createAndSeal`) is unchanged. **Gate:** when the picked contact's derived status is `"changed"`, it does **not** become the active recipient directly — it routes through the D7-(2) compose gate. Sealing to a changed contact is only reachable by either (a) completing verification (safe path → status returns to `verified`), or (b) the explicit "Send anyway (unsafe)" acknowledgment. There is **no code path where a `"changed"` contact reaches `createAndSeal` without an explicit user action** — this is asserted by the Task 14 compose-blocking test. Mirrors mobile's `seedComposeRecipient`/`handlePicked` gate ([`ComposeScreen.tsx (mobile):119-126`](../../../apps/mobile/src/create/ComposeScreen.tsx), [`recipient.ts (mobile):42-62`](../../../apps/mobile/src/create/recipient.ts)). The **pasted-key path stays fully functional and unchanged** (a pasted key has no on-file history, so it is never gated).

> **Note on the task wording vs. mobile truth.** The task says "BLOCK sending until re-verified." Mobile does not hard-block; it gates behind an explicit-choice warning (verify / send-anyway / cancel), and both the mockup and mobile expose an explicit "Proceed Anyway (Unsafe)". We adopt the mobile/mockup model — the block is against *silent/accidental* sends: a changed contact **cannot be selected/sealed-to without an explicit action** (verify OR an acknowledged unsafe override). This is the faithful reading of "cannot be selected/sealed-to without explicit re-verification" and preserves cross-surface parity. The "Send anyway" action is explicit and destructively styled; the *primary* path is verification.

### D9. Routing — static-export `?id=` precedent (SP3), not dynamic `[id]`

Follow the SP3 detail-route precedent ([`app/links/details/page.tsx`](../../../apps/webapp/app/links/details/page.tsx): a static route reading `?id=` via `useSearchParams` under `<Suspense>`, because Next 16 `output: 'export'` rejects a dynamic `[id]` with an empty `generateStaticParams`):

- **List:** `app/contacts/page.tsx` — replace the SP1 placeholder.
- **Add:** `app/contacts/new/page.tsx` — a static route (no id, no query needed).
- **Detail:** `app/contacts/detail/page.tsx` — static route reading `?id=<contactId>` via `useSearchParams` under `<Suspense>`. The `contactId` is a **local UUID** that **never reaches the server** (contacts are local-only; there are no contact API calls at all).
- **Own-key QR:** added to the **existing `/identity` screen** ([`IdentityScreen.tsx`](../../../apps/webapp/src/screens/IdentityScreen.tsx)) — mobile parity with `MyPublicKeyScreen` which shows the QR on the identity card. **No dedicated route/screen** is added; the QR sits beside the existing fingerprint/public-key blocks.

### D10. Identity gating — `/contacts*` are `RequireUnlocked`, like `/new` + `/links`

Wrap `app/contacts/page.tsx`, `app/contacts/new/page.tsx`, `app/contacts/detail/page.tsx` in `<RequireUnlocked><AppShell>…</AppShell></RequireUnlocked>` ([`RequireUnlocked.tsx`](../../../apps/webapp/src/components/RequireUnlocked.tsx)). Contacts hold no secrets, but the directory lives behind the unlocked app for three reasons: (a) consistency with every other authenticated `AppShell` surface (`/new`, `/links`, `/identity`), (b) the picker that consumes contacts (compose) already requires unlock, and (c) mobile keeps the directory behind the unlocked app. The own-key QR change lives inside the already-mounted `/identity` page and inherits its gate.

### D11. Design-token + copy conventions (unchanged from SP1/SP2 — [`apps/webapp/AGENTS.md`](../../../apps/webapp/AGENTS.md))

No `.js` import extensions. Never hardcode colors/spacing — use token utilities (`bg-surface-container`, `text-on-surface`, `text-on-surface-variant`, `text-primary`, `border-outline-variant`, `text-error`, `text-success`, `text-warning`/`text-tertiary` for amber). `font-mono` **ONLY** for fingerprints / public keys / secure links — never contact names, labels, or body copy. Color semantics: **green** = verified/safe, **amber** = unverified / key-changed / verify-required, **red** = destructive action only (delete contact, "send anyway (unsafe)"). Verify copy is calm and concrete ("Compare this fingerprint with your contact over a channel you trust — read it aloud on a call, or check it in person."). Never write "unbreakable", "military-grade", or "impossible to hack"; never imply the server is trusted. Reuse existing components where possible: `FingerprintBlock`, `StatusChip`, `PrimaryButton`, `PasswordField` patterns, `MaterialIcon` from `@aesmsg/ui`.

---

## File-structure target

After this plan completes (⊕ = modified from a prior SP):

```
apps/webapp/
├─ package.json                              ⊕ Task 1  (+ qrcode, @types/qrcode, jsqr)
├─ src/
│  ├─ identity/db.ts                         ⊕ Task 2  (DB v3: + CONTACTS_STORE, contains-guarded)
│  ├─ contacts/
│  │  ├─ contacts-store.ts                      Task 3  (ContactRecord + CRUD + typed errors)
│  │  ├─ contacts-display.ts                    Task 4  (deriveTrustStatus, view-model, shortFingerprint)
│  │  ├─ trust-status.ts                        Task 4  (trustIndicator color semantics)
│  │  ├─ key-change.ts                          Task 5  (classify/detect/alertView — pure)
│  │  ├─ scanned-key.ts                         Task 7  (normalizeScannedPayload, isAcceptableScan)
│  │  └─ use-camera-scanner.ts                  Task 8  (getUserMedia + jsQR loop + teardown)
│  ├─ lib/
│  │  ├─ validate-public-key.ts                 Task 3  (shared paste/scan validation, extracted)
│  │  ├─ qr-encode.ts                           Task 6  (toQrMatrix via qrcode, ecl "M")
│  │  └─ qr-decode.ts                           Task 7  (decodeImageData via jsQR)
│  ├─ components/
│  │  ├─ QrCode.tsx                             Task 6  (inline-SVG QR from the matrix)
│  │  ├─ TrustChip.tsx                          Task 4  (green verified / amber unverified|changed)
│  │  ├─ ConfirmDeleteContactDialog.tsx         Task 11 (red/destructive confirm)
│  │  └─ KeyChangedAlert.tsx                    Task 12 (contact-side amber security alert)
│  ├─ create/
│  │  ├─ recipient.ts                        ⊕ Task 3  (delegate to validate-public-key.ts; API kept)
│  │  └─ compose-contact.ts                     Task 14 (seedComposeRecipient/isChangedContactRecipient)
│  └─ screens/
│     ├─ ContactsListScreen.tsx                Task 9
│     ├─ AddContactScreen.tsx                  Task 10
│     ├─ ContactDetailScreen.tsx              Task 11
│     ├─ VerifyFingerprintScreen.tsx          Task 12
│     ├─ RecipientPicker.tsx                   Task 14
│     ├─ IdentityScreen.tsx                 ⊕ Task 13 (own-key QR)
│     └─ ComposeScreen.tsx                  ⊕ Task 14 (contact picker + key-changed gate)
├─ app/
│  ├─ contacts/page.tsx                     ⊕ Task 9  (replace placeholder; gated)
│  ├─ contacts/new/page.tsx                    Task 10 (gated static route)
│  └─ contacts/detail/page.tsx                 Task 11 (gated static route, ?id=, Suspense)
├─ AGENTS.md                                ⊕ Task 15
└─ tests/
   ├─ identity/db.test.ts                   ⊕ Task 2  (v2→v3 migration preserves identity+sent-links)
   ├─ contacts/contacts-store.test.ts          Task 3
   ├─ contacts/contacts-display.test.ts        Task 4
   ├─ contacts/trust-status.test.ts            Task 4
   ├─ contacts/key-change.test.ts              Task 5
   ├─ lib/qr-encode.test.ts                     Task 6
   ├─ lib/qr-roundtrip.test.ts                  Task 7  (encode→decode + mobile fixture; zero-network)
   ├─ contacts/scanned-key.test.ts             Task 7
   ├─ contacts/use-camera-scanner.test.ts      Task 8  (camera-unavailable graceful; stop-tracks)
   ├─ screens/ContactsListScreen.test.tsx      Task 9
   ├─ screens/AddContactScreen.test.tsx        Task 10
   ├─ screens/ContactDetailScreen.test.tsx     Task 11
   ├─ screens/VerifyFingerprintScreen.test.tsx Task 12
   ├─ screens/IdentityScreen.test.tsx       ⊕ Task 13 (own-key QR round-trip)
   └─ screens/ComposeScreen.test.tsx        ⊕ Task 14 (contact-picker seal + key-changed blocking)
```

Visual sources of truth (do not author new mockups): [`contacts_aesmsg`](../../../all_design_screens/contacts_aesmsg/code.html) (list — verified/unverified cards + mono fingerprint), [`contact_detail_elena_rodriguez`](../../../all_design_screens/contact_detail_elena_rodriguez/code.html) (detail — fingerprint, verify, rename, remove), [`add_new_contact_aesmsg`](../../../all_design_screens/add_new_contact_aesmsg/code.html) (QR-scan-prominent + manual paste + Verify & Add), [`security_alert_key_changed_aesmsg`](../../../all_design_screens/security_alert_key_changed_aesmsg/code.html) (amber key-changed alert). The mockups say "RSA-4096 / SHA-256 / OpenPGP / .asc" — **ignore that legacy crypto copy**; aesmsg is HPKE(X25519)+AES-256-GCM with `AM-` fingerprints and `amk1:` keys. Omit the `.asc`/`.key` file-import affordance (mobile shows a ComingSoon placeholder; the web omits it, not a dead stub).

---

# PHASE 1 — Dependencies, persistence, pure trust logic

## Task 1: Add `qrcode` + `jsqr` (D2)

**Files:** Modify `apps/webapp/package.json`; modify `pnpm-lock.yaml`.

- [ ] **Step 1** — add to `apps/webapp/package.json` `dependencies`: `"qrcode": "^1.5.4"`, `"jsqr": "^1.4.0"`; and to `devDependencies`: `"@types/qrcode": "^1.5.6"`. Match mobile's `qrcode`/`@types/qrcode` versions exactly (D2). Run `pnpm install` from the repo root.
- [ ] **Step 2** — confirm resolution: `pnpm --filter @aesmsg/webapp exec node -e "require('qrcode'); require('jsqr'); console.log('ok')"` prints `ok`. Confirm `jsqr` ships its own `.d.ts` (no separate `@types/jsqr` needed).
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp typecheck` (no new type errors from the added packages).
- [ ] **Step 4: Commit** — `chore(webapp): add qrcode + jsqr for contact QR display/scan`.

## Task 2: IndexedDB v3 — add the `contacts` object store (migration-safe)

[`src/identity/db.ts`](../../../apps/webapp/src/identity/db.ts) is at `DB_VERSION = 2` with `IDENTITY_STORE` + `SENT_LINKS_STORE`, both created idempotently under a `contains`-guard in `onupgradeneeded`, and a generalized `withStore(storeName, mode, fn)`. Add a third store the same additive way.

**Files:** Modify `apps/webapp/src/identity/db.ts`; modify `apps/webapp/tests/identity/db.test.ts`.

- [ ] **Step 1** — bump `DB_VERSION` to `3`; add `export const CONTACTS_STORE = "contacts";`. In `onupgradeneeded`, add a third `contains`-guarded creation `db.createObjectStore(CONTACTS_STORE, { keyPath: "id" })` alongside the existing two. Because every creation is `contains`-guarded and additive, a v2→v3 upgrade **preserves** the identity row **and** all sent-links rows and only creates the new store. Update the top-of-file comment (currently "v2 adds the sent-links store") to note v3 adds contacts.
- [ ] **Step 2: Migration test** — extend `tests/identity/db.test.ts`: open the DB at **v2** (via a raw `indexedDB.open(DB_NAME, 2)` helper), write an `identity` row and a `sent-links` row, close; then open through the app path (v3) and assert **both prior rows survive** AND `CONTACTS_STORE` now exists and round-trips a `{ id }`-keyed record. Reuse `__deleteDbForTests`/`__resetDbForTests` for isolation.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- identity/db`; `typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): IndexedDB v3 contacts store (additive, migration-safe)`.

## Task 3: `contacts-store.ts` — record + CRUD + typed errors (mirror mobile) & shared key validation

**Files:** Create `apps/webapp/src/contacts/contacts-store.ts`, `apps/webapp/src/lib/validate-public-key.ts`; modify `apps/webapp/src/create/recipient.ts`; create `apps/webapp/tests/contacts/contacts-store.test.ts`.

- [ ] **Step 1: `validate-public-key.ts`** — extract SP2's paste validation into a shared, source-agnostic helper so add-contact and compose reuse one implementation: `validatePublicKey(input: string): Promise<{ ok: true; publicKey: PublicKeyString; fingerprint: Fingerprint } | { ok: false; reason: "empty" | "invalid" }>` (the current body of [`recipient.ts:validateRecipientKey`](../../../apps/webapp/src/create/recipient.ts): trim → `importPublicKey` → `fingerprint`, never throwing to the UI). Also export a cheap synchronous `looksLikePublicKey(value)` (mirror mobile's shape gate, [`recipient.ts (mobile):91-97`](../../../apps/mobile/src/create/recipient.ts)) for the scan gate + disabling submit before the async parse.
- [ ] **Step 2: `recipient.ts`** — keep the public `validateRecipientKey`/`RecipientValidation` API (SP2 callers + tests unchanged) but delegate to `validatePublicKey`. No behavior change.
- [ ] **Step 3: `contacts-store.ts`** — the D5 `ContactRecord` + the verbatim mobile API over `withStore(CONTACTS_STORE, …)`: `addContact` (validate label, compute fingerprint, `DuplicateFingerprintError` on current/previous match, insert with `verified:false`, empty history, timestamps, `schemaVersion:1`), `listContacts` (Intl.Collator label sort), `getContact`, `updateContactKey` (re-derive fp, `SameKeyError`/`RotatedAwayError` guards, `verified:false`, push old fp), `setContactVerified`, `renameContact`, `deleteContact` (idempotent), `__resetContactsForTests`, and all six error classes. Copy semantics from [`contacts-store.ts (mobile)`](../../../apps/mobile/src/contacts/contacts-store.ts) exactly.
- [ ] **Step 4: Tests** — CRUD round-trip; label validation (empty/>80); `addContact` duplicate (current + previous → `DuplicateFingerprintError` with `reason`); `updateContactKey` sets `verified:false` + appends old fp + `SameKeyError`/`RotatedAwayError`; `setContactVerified`/`renameContact`/`deleteContact` (idempotent); `listContacts` sorted. **No-secret invariant:** `JSON.stringify(record)` contains only the D5 keys — never `"privateKey"`/`"text"`/`"ciphertext"`/`"revocationToken"`. Use real keys from `exportPublicKey(generateIdentity())`.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- contacts/contacts-store create/recipient`; `typecheck`.
- [ ] **Step 6: Commit** — `feat(webapp): encrypted-directory-parity contacts store (metadata-only, mobile API)`.

## Task 4: Trust view-model + color semantics (mirror mobile)

**Files:** Create `apps/webapp/src/contacts/contacts-display.ts`, `apps/webapp/src/contacts/trust-status.ts`, `apps/webapp/src/components/TrustChip.tsx`; create their tests.

- [ ] **Step 1: `contacts-display.ts`** — port [`contacts-display.ts (mobile)`](../../../apps/mobile/src/contacts/contacts-display.ts): `TrustStatus = "verified" | "unverified" | "changed"`; `deriveTrustStatus(record)` (D6 ordering); `shortFingerprint(fp) = truncateFingerprint(fp, 2)`; `deriveKeyCreatedLabel(iso)`; a `contactRecordToContact(record)` view-model exposing `id, name(label), fingerprint(short), fullFingerprint, previousFingerprint?(short, only when changed), status, keyCreated`. Use `@aesmsg/crypto`'s `truncateFingerprint`.
- [ ] **Step 2: `trust-status.ts`** — port [`trust-status.ts (mobile)`](../../../apps/mobile/src/contacts/trust-status.ts): `trustIndicator(status)` → `{ kind:"glyph"|"chip", tone:"green"|"amber", icon, label, a11yLabel }`. `verified` → green `verified` glyph; `unverified` → amber "Unverified" chip; `changed` → amber "Key changed" chip. `tone` is **only ever `green` or `amber`** — never error/red (asserted in the test).
- [ ] **Step 3: `TrustChip.tsx`** — a `"use client"` presentational chip mapping `trustIndicator` to token classes: green = `border-success/30 bg-success/10 text-success`, amber = `border-warning/30 bg-warning/10 text-warning` (or the tertiary/amber token the app uses for warning). Never `text-error`.
- [ ] **Step 4: Tests** — `deriveTrustStatus` truth table (`verified:true`→verified regardless of history; `!verified`+history→changed; `!verified`+no-history→unverified). `trustIndicator` semantics: assert `tone !== "error"`/red for every status; verified is a glyph, the two amber states are chips. `TrustChip` render: verified uses a success token, the amber states use a warning token, neither uses an error token.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- contacts/contacts-display contacts/trust-status`; `typecheck`.
- [ ] **Step 6: Commit** — `feat(webapp): contact trust view-model + green/amber trust semantics`.

## Task 5: `key-change.ts` — pure key-change classification (mirror mobile)

**Files:** Create `apps/webapp/src/contacts/key-change.ts`, `apps/webapp/tests/contacts/key-change.test.ts`.

- [ ] **Step 1** — port [`key-change.ts (mobile)`](../../../apps/mobile/src/contacts/key-change.ts) verbatim: `KeyChangeDetection = {kind:"same"} | {kind:"rotated-back"} | {kind:"changed"; previousFingerprint; newFingerprint}`; `classifyKeyChange(existing, candidateFp)` (D6 rules); `detectKeyChange(existing, candidatePublicKey)` (fingerprint then classify); `keyChangeAlertView(name, prev, next)` → `{ contactName, previousFingerprint(short), newFingerprint(short) }` using `shortFingerprint`.
- [ ] **Step 2: Tests** — `classifyKeyChange`: candidate === current → `same`; candidate ∈ history → `rotated-back`; genuinely new → `changed` carrying the **real** current fp as `previousFingerprint` and the candidate as `newFingerprint`. `detectKeyChange` with real keys → correct classification. `keyChangeAlertView` truncates both fingerprints (short form).
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- contacts/key-change`; `typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): pure key-change detection (MitM signal, mobile parity)`.

---

# PHASE 2 — QR primitives (display + scan)

## Task 6: QR encode → inline-SVG display (`qrcode`, D1/D2)

**Files:** Create `apps/webapp/src/lib/qr-encode.ts`, `apps/webapp/src/components/QrCode.tsx`, `apps/webapp/tests/lib/qr-encode.test.ts`.

- [ ] **Step 1: `qr-encode.ts`** — `toQrMatrix(text: string): boolean[][]` using `QRCode.create(text, { errorCorrectionLevel: "M" })` → `qr.modules` grid (row-major, `true` = dark). Direct port of [`qr-matrix.ts (mobile)`](../../../apps/mobile/src/keys/qr-matrix.ts). A bad/oversized input throws (caller catches).
- [ ] **Step 2: `QrCode.tsx`** — a `"use client"` component `<QrCode value size? />` computing the matrix in `useMemo` (try/catch → `null` renders nothing, never throws) and drawing it as a single inline `<svg>` with a white quiet-zone frame and one `<rect>` per dark module (mirrors [`KeyQrCode.tsx (mobile)`](../../../apps/mobile/src/keys/KeyQrCode.tsx)). Inline SVG only — no `<canvas>`, no data-URL, no `<img>` (D3). `aria-label="Public-key QR code"`.
- [ ] **Step 3: Tests** — `toQrMatrix("amk1:AAAA…")` (a real key from `exportPublicKey`) is a non-empty square grid with ≥1 dark module; `QrCode` renders an `<svg>` for a valid value and renders nothing (no throw) for `""`.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- lib/qr-encode`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): offline QR display via inline-SVG matrix (mobile-format parity)`.

## Task 7: QR decode + scan gate + round-trip (`jsQR`, D1/D2)

**Files:** Create `apps/webapp/src/lib/qr-decode.ts`, `apps/webapp/src/contacts/scanned-key.ts`, `apps/webapp/tests/lib/qr-roundtrip.test.ts`, `apps/webapp/tests/contacts/scanned-key.test.ts`.

- [ ] **Step 1: `qr-decode.ts`** — `decodeImageData(data: Uint8ClampedArray, width, height): string | null` = `jsQR(data, width, height)?.data ?? null`. Pure, offline, no network.
- [ ] **Step 2: `scanned-key.ts`** — port [`scanned-key.ts (mobile)`](../../../apps/mobile/src/contacts/scanned-key.ts): `AMK_PREFIX = "amk1:"`; `normalizeScannedPayload(raw)` (trim); `isAcceptableScan(raw)` = `startsWith(AMK_PREFIX) && looksLikePublicKey(raw)` (from `validate-public-key.ts`). This is the quick scan-time gate; the authoritative parse remains `importPublicKey`.
- [ ] **Step 3: Round-trip test (`qr-roundtrip.test.ts`)** — take a real `amk1:` key; `toQrMatrix` it; rasterize the matrix into an `ImageData` (scale each module to an N×N block on a white quiet zone, black modules → `[0,0,0,255]`); `decodeImageData` → assert the decoded string **equals** the original key. Add a **mobile-format fixture** case: a hardcoded representative `amk1:` string → encode → rasterize → decode → equals the fixture, and `isAcceptableScan(fixture)` is `true`. **Zero-network assertion:** stub/guard `globalThis.fetch` and assert it is never called during encode/decode.
- [ ] **Step 4: `scanned-key.test.ts`** — `isAcceptableScan`: a real `amk1:` key → `true`; a URL / vCard / plain text / a non-`amk1:` base64 blob → `false` (mirrors the mobile rationale that a permissive shape check alone would forward URLs). `normalizeScannedPayload` trims surrounding whitespace/newlines.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- lib/qr-roundtrip contacts/scanned-key`; `typecheck`.
- [ ] **Step 6: Commit** — `feat(webapp): jsQR decode + amk1 scan gate + encode/decode round-trip`.

## Task 8: `use-camera-scanner.ts` — getUserMedia + jsQR loop + teardown (D4)

**Files:** Create `apps/webapp/src/contacts/use-camera-scanner.ts`, `apps/webapp/tests/contacts/use-camera-scanner.test.ts`.

- [ ] **Step 1** — a `"use client"` hook `useCameraScanner({ onResult })` returning `{ status, videoRef }` where `status ∈ "idle" | "requesting" | "scanning" | "denied" | "unavailable"`. Behavior:
  - If `navigator.mediaDevices?.getUserMedia` is missing → `status:"unavailable"` (never throws).
  - Request `{ video: { facingMode: "environment" } }`; `NotAllowedError`/`SecurityError` → `"denied"`; `NotFoundError`/`OverconstrainedError`/any mount error → `"unavailable"`.
  - On success, bind `video.srcObject = stream` (**never** `video.src`, D3), `play()`, then run a `requestAnimationFrame` sample loop: draw the current frame into an offscreen `<canvas>`, `getImageData`, `decodeImageData`; on a decode that passes `isAcceptableScan`, call `onResult(normalizeScannedPayload(decoded))` **once** (a `handled` ref latch) and stop.
  - **Teardown:** on unmount, on `document.visibilitychange → hidden`, and immediately after a successful scan → `stream.getTracks().forEach(t => t.stop())`, cancel the RAF, clear `video.srcObject`.
- [ ] **Step 2: Tests** — (a) **camera-unavailable graceful:** stub `navigator.mediaDevices` absent → `status:"unavailable"`, no throw; stub `getUserMedia` rejecting `NotAllowedError` → `status:"denied"`. (b) **stop-tracks-on-unmount:** stub `getUserMedia` resolving a fake `MediaStream` whose `getTracks()[i].stop` is a spy; unmount the hook → assert every `stop` spy was called and `srcObject` cleared. (c) **onResult-once:** feed a fake stream + a canvas whose `getImageData` yields a rasterized `amk1:` QR → assert `onResult` fires exactly once with the trimmed key. Keep the DOM/stream fakes minimal; the decode path itself is already covered by Task 7.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- contacts/use-camera-scanner`; `typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): camera QR scanner hook — local-only, graceful degradation, tracks stopped`.

---

# PHASE 3 — Contacts screens

## Task 9: Contacts list at `/contacts` (per `contacts_aesmsg` mockup)

**Files:** Create `apps/webapp/src/screens/ContactsListScreen.tsx`; replace `apps/webapp/app/contacts/page.tsx`; create `apps/webapp/tests/screens/ContactsListScreen.test.tsx`.

- [ ] **Step 1: `ContactsListScreen.tsx`** (`"use client"`) — load `listContacts()` on mount (a read failure → empty list, never a crash), adapt each via `contactRecordToContact`. Header "Contacts" + a total count; a **"Add contact"** action → `router.push("/contacts/new")`. Each row: avatar/initials, name (`font-sans`), a `<TrustChip>` (green verified / amber unverified / amber "Key changed"), and the short fingerprint in **`font-mono`**; row click → `/contacts/detail?id=<id>`. First-class **empty state** ("No contacts yet — add one to start sending securely.") and **loading** state.
- [ ] **Step 2: `app/contacts/page.tsx`** — replace the SP1 `Placeholder` with `<RequireUnlocked><AppShell><ContactsListScreen/></AppShell></RequireUnlocked>` (D10).
- [ ] **Step 3: Tests** — seed the store with a verified, an unverified, and a changed contact (the last via `addContact` then `updateContactKey`); assert each renders the right chip **token** (success vs warning, never error) and its mono short fingerprint; empty store → empty state; row click routes to `/contacts/detail?id=`.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/ContactsListScreen`; `typecheck`; `pnpm --filter @aesmsg/webapp build`.
- [ ] **Step 5: Commit** — `feat(webapp): contacts list with verified/unverified/key-changed states`.

## Task 10: Add contact at `/contacts/new` (per `add_new_contact` mockup)

**Files:** Create `apps/webapp/src/screens/AddContactScreen.tsx`, `apps/webapp/app/contacts/new/page.tsx`; create `apps/webapp/tests/screens/AddContactScreen.test.tsx`.

- [ ] **Step 1: `AddContactScreen.tsx`** (`"use client"`) — a name field + a **Paste key / Scan QR** tab pair (the mockup foregrounds QR scan; keep paste as the always-available default and the scan-fallback target):
  - **Paste tab:** a `font-mono` textarea for the `amk1:` key; on change run `validatePublicKey` (Task 3) and show the derived **`AM-` fingerprint** (mono) with a green "Valid key" affordance (means *valid*, not *verified*) or an inline invalid error — reuse the SP2 compose recipient pattern.
  - **Scan tab:** mount `useCameraScanner`; render the `<video>` under a viewfinder; on a successful scan, prefill the paste field with the key and switch to the paste tab for naming + confirm (mirrors mobile: scan → prefilled paste; the authoritative validation runs on submit). `denied`/`unavailable` → a calm "Camera access needed — paste the key instead" panel with a "Paste instead" action (D4).
  - **Add contact** (disabled until a valid-looking key + non-empty name): `addContact({ label, publicKey })`; on `DuplicateFingerprintError`/`InvalidFormatError`/`InvalidLabelError` show inline copy (port [`paste-contact-error.ts (mobile)`](../../../apps/mobile/src/contacts/paste-contact-error.ts) messages); on success → `/contacts/detail?id=<newId>`.
  - Ignore the mockup's "RSA-4096 / OpenPGP / .asc" legacy copy; **no file-import affordance** (D-note in file-structure).
- [ ] **Step 2: `app/contacts/new/page.tsx`** — `<RequireUnlocked><AppShell><AddContactScreen/></AppShell></RequireUnlocked>` (D9/D10).
- [ ] **Step 3: Tests** — paste a real `amk1:` key → shows its `AM-` fingerprint; empty/garbage → invalid, submit disabled; adding a key already saved → the duplicate error copy (no crash); a successful add routes to detail. **Camera-unavailable graceful:** stub `getUserMedia` absent → the scan tab shows the fallback panel and the paste tab still adds a contact. **Zero-network:** guard `fetch` — adding a contact makes **no** network request (contacts are local-only).
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/AddContactScreen`; `typecheck`; `build`.
- [ ] **Step 5: Commit** — `feat(webapp): add-contact via paste key or camera QR scan`.

## Task 11: Contact detail at `/contacts/detail?id=` (per `contact_detail` mockup)

**Files:** Create `apps/webapp/src/screens/ContactDetailScreen.tsx`, `apps/webapp/src/components/ConfirmDeleteContactDialog.tsx`, `apps/webapp/app/contacts/detail/page.tsx`; create `apps/webapp/tests/screens/ContactDetailScreen.test.tsx`.

- [ ] **Step 1: `app/contacts/detail/page.tsx`** — static route reading `?id=` via `useSearchParams` under `<Suspense>`, wrapped `<RequireUnlocked><AppShell>…` (D9/D10). Mirror [`app/links/details/page.tsx`](../../../apps/webapp/app/links/details/page.tsx). No dynamic `[id]`.
- [ ] **Step 2: `ContactDetailScreen.tsx`** (`"use client"`) — `getContact(id)`; missing → calm "This contact isn't saved on this device." For a found record: name + a `<TrustChip>`; the **full fingerprint** via `<FingerprintBlock label="Public fingerprint" …>` (mono) + the full `amk1:` public key block; created date; a **key history** section listing `previousFingerprints` (mono, "Previously used keys") only when non-empty. Actions:
  - **Verify** → `/contacts` verify flow (Task 12) — primary when `unverified`/`changed`.
  - **Send secure message** → `router.push("/new")` seeding this contact as the compose recipient (via the in-memory hand-off store used for compose selection; the recipient still passes the D8 key-changed gate if `changed`).
  - **Rename** → inline edit → `renameContact`.
  - **Update key** (re-key) — paste or scan a new key → `detectKeyChange(record, candidate)`: `same`/`rotated-back` → inline error copy; `changed` → open the **contact-side `<KeyChangedAlert>`** (Task 12) with the real previous/new fingerprints; confirming calls `updateContactKey` (resets `verified:false`, D6).
  - **Delete contact** (`text-error`/`border-error`, red destructive) → `<ConfirmDeleteContactDialog>` → `deleteContact` → back to `/contacts`.
- [ ] **Step 3: `ConfirmDeleteContactDialog.tsx`** — a red/destructive confirm ("Delete this contact? This removes their saved key from this device. You can add it again later."), mirroring the `ConfirmRevokeDialog` pattern.
- [ ] **Step 4: Tests** — renders name/mono fingerprint/key/created; a `changed` contact shows the amber chip + a previous-keys section; rename persists; delete opens the confirm and removes on confirm (red tokens used); re-key with a **different** key opens the amber alert with the real prev/new fingerprints; re-key with the **current** key shows the "already this contact's current key" copy (no alert). Missing id → the calm empty copy.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/ContactDetailScreen`; `typecheck`; `build`.
- [ ] **Step 6: Commit** — `feat(webapp): contact detail — fingerprint, verify, rename, re-key, delete`.

## Task 12: Verify-fingerprint flow + contact-side key-changed alert (D7)

**Files:** Create `apps/webapp/src/screens/VerifyFingerprintScreen.tsx`, `apps/webapp/src/components/KeyChangedAlert.tsx`; create `apps/webapp/tests/screens/VerifyFingerprintScreen.test.tsx`.

- [ ] **Step 1: `VerifyFingerprintScreen.tsx`** — the **manual out-of-band comparison** UX (per `contact_detail`/`add_new_contact` verify sections and mobile `VerifyFingerprintScreen`): the contact's **full fingerprint in `font-mono`**, laid out in readable groups, with calm copy: "Compare this fingerprint with **{name}** over a channel you trust — read it aloud on a call, or check it in person. Mark verified only if every group matches." Primary **"Mark as verified"** (green) → `setContactVerified(id, true)` → return to detail (status flips to green `verified`). A secondary **"Not now"** leaves it unverified. Document the **unverify implication** in copy near a later "Mark unverified" affordance on detail if included: marking unverified (or a key change) means compose will re-gate — trust is not sticky across a key change.
- [ ] **Step 2: `KeyChangedAlert.tsx`** — the **contact-side amber security alert** per [`security_alert_key_changed_aesmsg`](../../../all_design_screens/security_alert_key_changed_aesmsg/code.html) + [`KeyChangedAlertScreen.tsx (mobile)`](../../../apps/mobile/src/keys/KeyChangedAlertScreen.tsx): an **amber** warning header ("Public key changed"), the honest explanation ("a new device, or their identity was compromised — verify before sending"), a **Previous (neutral) vs New/Current (amber)** side-by-side `font-mono` comparison, and actions **"Verify fingerprint"** (primary) + **"Update to new key"** (adopt → `updateContactKey`, resets unverified) + **"Keep current key"** (dismiss). **Amber throughout; the only red permitted is a muted `text-error/80` outline on an explicit "Proceed anyway (unsafe)"** if included — never an ambient red fill (D7).
- [ ] **Step 3: Tests** — "Mark as verified" calls `setContactVerified(id, true)` and the derived status becomes `verified` (green); `<KeyChangedAlert>` renders the **real** previous + new fingerprints (mono) and uses amber tokens (assert **no** `bg-error`/ambient red on the alert container); "Update to new key" invokes the `onUpdateKey` handler; the previous-fingerprint cell is neutral and the new cell amber.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/VerifyFingerprintScreen`; `typecheck`; `build`.
- [ ] **Step 5: Commit** — `feat(webapp): manual fingerprint verification + amber key-changed alert`.

---

# PHASE 4 — Own-key QR + compose integration

## Task 13: Own-key QR on the identity screen (D1/D9)

**Files:** Modify `apps/webapp/src/screens/IdentityScreen.tsx`; modify `apps/webapp/tests/screens/IdentityScreen.test.tsx`.

- [ ] **Step 1** — add a `<QrCode value={publicKeyString} />` to the identity card (mobile parity with [`MyPublicKeyScreen.tsx:66`](../../../apps/mobile/src/keys/MyPublicKeyScreen.tsx)), above the existing `FingerprintBlock`s, with calm copy: "Let a contact scan this to add your key." The QR payload is the **raw `amk1:` public-key string** (D1) — the exact value the existing "Copy public key" block already exposes. No new route; the change lives inside the already-gated `/identity` page.
- [ ] **Step 2: Test** — extend `IdentityScreen.test.tsx`: after unlocking a seeded identity, an `<svg>` QR renders; **round-trip** it (rasterize the rendered matrix → `decodeImageData`) and assert the decoded string **equals** `publicKeyString`, proving a mobile device could scan it. The existing `AM-` fingerprint/public-key assertions stay green.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/IdentityScreen`; `typecheck`; `build`.
- [ ] **Step 4: Commit** — `feat(webapp): display own public key as a scannable QR on the identity screen`.

## Task 14: Compose contact picker + key-changed gate (fills SP2's seam, D8)

**Files:** Create `apps/webapp/src/screens/RecipientPicker.tsx`, `apps/webapp/src/create/compose-contact.ts`; modify `apps/webapp/src/screens/ComposeScreen.tsx`; modify `apps/webapp/tests/screens/ComposeScreen.test.tsx`.

- [ ] **Step 1: `compose-contact.ts`** — the pure compose-side gate, ported from mobile [`recipient.ts:42-62`](../../../apps/mobile/src/create/recipient.ts): a `PickedRecipient` union (`{ kind:"contact"; contact; publicKey; fingerprint }` | `{ kind:"pasted"; publicKey; fingerprint }`), `isChangedContactRecipient(p)` (contact-kind whose status is `"changed"`), and `seedComposeRecipient(initial)` → `{ recipient, keyChanged }` (a changed contact is held back behind the gate, never adopted directly). Node-testable.
- [ ] **Step 2: `RecipientPicker.tsx`** — a `"use client"` picker offering **Paste key** (the SP2 path, unchanged) and **Saved contacts** (from `listContacts` → `contactRecordToContact`, each row showing name + short mono fingerprint + `<TrustChip>`). Selecting a contact yields a `PickedRecipient` carrying the contact's **real public key** so the seal path is identical to a paste.
- [ ] **Step 3: `ComposeScreen.tsx`** — fill the seam: replace the SP4-seam comment with the picker. When a picked contact has status `"changed"`, route it through the **compose key-changed gate** (D7-(2)) instead of adopting it: an amber warning contrasting Previously vs Now (mono), primary **"Verify fingerprint"** (→ `/contacts/detail?id=` verify), and an explicit **"Send anyway (unsafe)"** (red action, `kind="danger"`-equivalent) that adopts the recipient. A verified/unverified contact and the pasted-key path adopt directly and feed the SAME `createAndSeal` call. The recipient the screen ultimately seals to remains the existing `{ publicKey, fingerprint }` seam — `createAndSeal` is unchanged.
- [ ] **Step 4: Tests** — with a mounted+unlocked `IdentityProvider` and a seeded store:
  - **Verified/unverified contact** → picking it and submitting calls `createAndSeal` (spy) with **that contact's public key**; the pasted-key path (SP2) still works.
  - **Compose-blocking (the load-bearing test):** a `"changed"` contact **cannot reach `createAndSeal`** — picking it shows the amber gate and asserts `createAndSeal` is **not** called; only after the explicit "Send anyway (unsafe)" (or after verifying) does a subsequent submit reach the seal spy. Assert the gate uses amber (not ambient red) and the recipient's plaintext never appears in any captured request body (reuse the SP2 no-plaintext mock).
  - No forbidden copy; `font-mono` only on fingerprints.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/ComposeScreen`; `typecheck`; `build`.
- [ ] **Step 6: Commit** — `feat(webapp): compose contact picker + key-changed send gate (fills SP2 seam)`.

---

# PHASE 5 — Docs + final gate

## Task 15: `AGENTS.md` — contacts + verification section

**Files:** Modify `apps/webapp/AGENTS.md`.

- [ ] **Step 1** — add a "Contacts + verification" note covering: the `contacts` IndexedDB store (schema **v3**) holds the D5 `ContactRecord` — **public material only** (public key, fingerprint, label), **not encrypted at rest** on web, an availability/metadata exposure (local social graph), **never** a confidentiality break; the **key-changed mechanism** (derived `changed` state ⇔ `!verified && previousFingerprints.length>0`; trigger = re-keying an existing contact via `updateContactKey`, which resets `verified:false`); the **QR payload** is the raw `amk1:` public-key string (error-correction "M") — mobile-compatible both directions; the new bundled deps (`qrcode`, `jsQR`) are self-hosted `/_next` assets and **do not** violate the no-third-party-scripts rule; the camera stream is **local-only** (`srcObject`, tracks stopped on unmount) and needs **no CSP change**; and the compose **key-changed gate** blocks a silent seal to a changed contact.
- [ ] **Step 2: Verify** — `pnpm lint`; `git grep -nE "military-grade|unbreakable|impossible to hack" -- apps/webapp docs` → none.
- [ ] **Step 3: Commit** — `docs: webapp contacts + verification agent notes`.

## Task 16: Final verification gate (repo-root green) + invariant sweep

- [ ] **Step 1: Typecheck** — `pnpm typecheck` (all workspaces).
- [ ] **Step 2: Lint** — `pnpm lint`; if Biome flags new files, `pnpm lint:fix`, re-run, amend.
- [ ] **Step 3: Tests** — `pnpm test` green across all workspaces (the new contacts/QR/scan/screen suites incl. the **v2→v3 migration**, **QR round-trip + mobile fixture**, **camera-unavailable graceful**, and **compose-blocking** tests).
- [ ] **Step 4: Static build + CSP** — `pnpm --filter @aesmsg/webapp build` (must export `/contacts`, `/contacts/new`, `/contacts/detail`); then `pnpm --filter @aesmsg/webapp check:csp` → zero `securitypolicyviolation` on the new screens (proves D3: no CSP change needed). `rm -rf apps/webapp/out` after.
- [ ] **Step 5: Invariant sweep** —
  ```
  git grep -nE "military-grade|unbreakable|impossible to hack" -- apps/webapp   # none
  git grep -n "RSA|OpenPGP|\.asc" -- apps/webapp/src                            # none (no legacy crypto copy)
  ```
  Manually confirm: the QR payload is the raw `amk1:` string (no URI scheme); a `"changed"` contact cannot reach `createAndSeal` without an explicit action; contacts screens make **zero** network requests (contacts are local-only).
- [ ] **Step 6: Final commit** — `git add -A && git commit -m "chore(webapp): SP4 verification fixes" || echo "clean"`.

---

## Out of scope for SP4 (do NOT implement here)

Per spec §8/§9/§12:
- **Key rotation, encrypted backup export/import, security settings, attachments polish, clipboard/blur** — **SP5**. This SP does not add a rotate/backup UI; it only *reacts* to a contact's key changing (re-key detection), which is a contacts concern.
- **Any `apps/api` change** — no CORS, route, store, rate-limit, or body-cap change. Contacts are **entirely local** (IndexedDB); there are **no** contact endpoints.
- **Any `packages/*` change** — `@aesmsg/crypto`, `@aesmsg/ui`, `@aesmsg/design-tokens`, `@aesmsg/server-store` are frozen, consumed verbatim.
- **Any `apps/mobile` change** — the native flows are the behavioral source of truth and are untouched.
- **`.aesmsg`/`.asc`/`.key` file import** (mobile shows a ComingSoon placeholder) — omitted here, not stubbed as dead UI.
- **`BarcodeDetector` fast-path, contact search/filter beyond the mockup, contact groups/directory sync, aesmsg Pro** — deferred.

---

## Self-review — spec coverage

- **IndexedDB v3 contacts store, schema-versioned, migration-safe** — Task 2 (v2→v3 preserves identity + sent-links); record shape pinned to mobile, metadata/public-only — D5, Task 3.
- **Contacts list per `contacts_aesmsg`, verified-green / unverified-amber / key-changed-amber** — Tasks 4, 9 (color semantics asserted).
- **Add-contact (paste → derived `AM-` fingerprint, reusing/refactoring SP2's `recipient.ts` validation) + QR-scan tab** — Tasks 3, 7, 8, 10 (D1/D4).
- **Contact detail (fingerprint, verify, rename, delete=red, key history) + re-key** — Task 11.
- **QR DISPLAY of own key, payload pinned to mobile format** — Tasks 6, 13 (D1 raw `amk1:` string, ecl "M"); on the identity screen per mobile parity (D9).
- **Manual fingerprint verification (out-of-band compare) + mark-verified (green) + unverify implications** — Task 12.
- **Key-changed detection mechanism pinned to mobile (file refs)** — D6; the amber security-alert screen per mockup (**amber, not red**) — D7, Task 12; **compose blocked** so a changed contact can't be silently sealed to — D8, Task 14.
- **Compose integration filling SP2's seam, pasted-key path kept** — Task 14.
- **Identity gating for `/contacts*` (RequireUnlocked)** — D10, Tasks 9–11.
- **Dependency picks with versions + justification** — D2 (`qrcode@^1.5.4` + `@types/qrcode@^1.5.6`, `jsqr@^1.4.0`); **no CSP change** — D3.
- **Tests: store CRUD + migration, paste-add validation, QR round-trip + mobile fixture (zero-network), verification transitions, key-changed detection, compose-blocking, camera-unavailable graceful** — Tasks 2–14.
- **Design/copy + color semantics; no forbidden claims; no legacy crypto copy** — D11, swept in Task 16.
- **Repo-root green gate** — Task 16: `pnpm typecheck && pnpm lint && pnpm test` + build + `check:csp`.
