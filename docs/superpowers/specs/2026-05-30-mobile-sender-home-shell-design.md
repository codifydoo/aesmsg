---
title: Slice 13 — Mobile sender + home shell
date: 2026-05-30
status: draft
supersedes: none
builds-on: docs/superpowers/specs/2026-05-29-mobile-app-foundation-design.md
---

# Slice 13 — Mobile sender + home shell

## Goal

Turn `apps/mobile` from a recipient-only foundation into a navigable app you can **send** from. Add the app shell (bottom-tab navigation + Home overview + Settings) and the **sender / Encrypt** flow — compose a message, encrypt it locally to a pasted recipient public key, upload only the ciphertext, and share the resulting `/l/:id` link through the OS share sheet. The recipient/reader vertical, identity, and crypto already exist and are reused unchanged.

This is the first of several slices that complete the mobile app (see [Roadmap](#roadmap)). It is deliberately scoped to add **no new native dependencies**, so it runs on the current native build with no rebuild.

## Scope

**In scope**
- Lightweight, state-driven **bottom-tab shell** (Home · Encrypt · Keys · Settings) + the deep-link Reader as an overlay (unchanged).
- **Home** overview: security-status card + quick actions (New secure message, Copy public key).
- **Keys** tab hosting the existing `MyPublicKeyScreen`.
- **Settings** tab: Lock + Wipe identity (type-to-confirm).
- **Encrypt / Sender** flow: compose **text** → paste recipient **public key** → expiry + max-opens → encrypt locally → upload ciphertext → **Result** screen with the link + Share + Copy.
- Node pure-logic unit tests for all new non-UI logic.

**Out of scope (deferred, each noted with its cost)**
- **Attachment send** — needs `expo-document-picker` (native dep → rebuild). The *reader* already handles received attachments; sender-side attach is the very next slice.
- **Contacts** + recipient-by-contact — no mobile mockup exists; needs a design decision. Recipient selection here is **paste-public-key only**.
- **Scan QR** to add/select a recipient — needs `expo-camera` (native dep → rebuild).
- **Links** (sent-link tracking/list/revoke) — its own slice (needs a local sent-link store).
- Key rotation / security-alert (key-changed) flows.

## Decisions

1. **Navigation: lightweight custom tabs, no nav library.** The foundation already selects screens from state in `App.tsx` (identity status, deep-link id). We extend that with an `activeTab` state + a `TabBar` component. Rejected `react-navigation`/`expo-router`: they pull in `react-native-screens` + `react-native-safe-area-context` (native → rebuild) and are overkill for a 4-tab app with no nested stacks. If a later slice needs nested stacks (e.g. Contacts → Contact detail), revisit then.
2. **Text-only send this slice.** Avoids `expo-document-picker`; keeps the slice rebuild-free. Attachment send is the next slice.
3. **Recipient by pasted public key only.** Reuses `importPublicKey` + `fingerprint`; no Contacts/Scan native surface.
4. **Reuse the web sender's pure logic verbatim.** Mobile `create-and-seal.ts` mirrors `apps/web/src/create/encrypt-and-post.ts` line-for-line on the load-bearing path (binding context, seal, POST shape) so a mobile-sent link is byte-compatible with the web reader and vice-versa.

## Architecture

### App shell + navigation

`App.tsx`'s `Root` gains a `useState<Tab>` (`"home" | "encrypt" | "keys" | "settings"`), shown only when `identity.status === "unlocked"` and there is no active deep-link. Layout: the active tab's screen fills the safe area; a `TabBar` (new `src/navigation/TabBar.tsx`) renders the four destinations as label + a simple glyph, calling `setTab`. Icons use text/emoji glyphs (or `@expo/vector-icons`, which is JS + Metro-bundled font assets loaded via the already-present `expo-font` — **no native rebuild**); we do **not** add a native icon dependency. The deep-link Reader and the identity gate (loading/no_identity/locked) continue to short-circuit *above* the tab shell, exactly as today — a received `/l/:id` still takes over the screen regardless of the active tab.

- Pure tab model extracted to `src/navigation/tabs.ts` (the `Tab` union + an ordered `TABS` descriptor list: key, label, icon) so it is unit-testable and the `TabBar` stays declarative.

### Home (`src/home/HomeScreen.tsx`)

Per `all_design_screens/mobile_home_aesmsg`: a **security-status** card ("Private key secured on this device", green/safe accent) and **quick actions**: *New secure message* (`setTab("encrypt")`) and *Copy public key* (`Clipboard.setStringAsync(publicKeyString)`). Scan QR / Add Contact tiles from the mockup are **deferred** (Contacts slice) and omitted rather than shown disabled.

### Keys

The Keys tab renders the existing `src/keys/MyPublicKeyScreen.tsx` unchanged (already inset by the app-root `SafeAreaView`).

### Settings (`src/settings/SettingsScreen.tsx`)

Two actions, reusing the identity state machine that already exposes them:
- **Lock** → `actions.lock()` → returns to the Unlock gate.
- **Wipe identity** → a type-to-confirm modal (`src/settings/WipeConfirmModal.tsx`, mirroring the web `WipeConfirmModal` — type a fixed word to enable the destructive button) → `actions.wipe()`. Irreversible by design (no backup, no recovery), consistent with the foundation invariants.

### Sender / Encrypt

The flow is a small local state machine inside `src/create/CreateFlow.tsx`: `compose → encrypting → result | error`.

- **`src/create/ComposeScreen.tsx`** (form, mirrors web `ComposeForm`): a multiline **message** field; a **recipient public key** paste field that, on a valid key, shows the derived **fingerprint** (so the sender can verify out-of-band) and on an invalid key shows an inline error; an **expiry** picker (`ExpiryChoice = "10m" | "1h" | "24h" | "7d" | "never"`, mapped to a `Date` by an `expiryToDate` helper ported from web); a **max-opens** picker (1 / 3 / unlimited). Submit is disabled until the message is non-empty and the recipient key parses.
- **`src/create/create-and-seal.ts`** (pure logic, mirrors `apps/web/src/create/encrypt-and-post.ts`): `importPublicKey` → `fingerprint` → `generateLinkId()` → build `MessageBindingContext { linkId, recipientPublicKey, createdAtMs: Date.now(), expiresAtMs, maxOpens }` → `encodePayload({ text, attachments: [] })` → `seal(...)` → `postMessage({ id, recipientFingerprint, ciphertext: bytesToBase64(...), createdAtMs, expiresAt: ISO, maxOpens })` → return `{ id, url, recipientFingerprint }`. **The shareable `url` is `${webBaseUrl}/l/${id}`**, where `webBaseUrl` is derived from the configured API base (`Constants.expoConfig.extra.aesmsgApiBaseUrl`) — the link must point at the **web** host so a recipient without the app falls back to the web reader, and a recipient with the app deep-links in.
- **`src/lib/link-id.ts`** (mirrors web): `generateLinkId()` = 12 random bytes (`crypto.getRandomValues`, available via the Hermes polyfill) → base64url (16 chars matching `LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/`). Add `bytesToBase64Url` to `src/lib/base64.ts` if not already present.
- **`src/api/client.ts`** gains `postMessage(req)` → `POST {base}/api/messages` with the exact body the web `postMessage` sends; non-ok → `ApiError(status)` (same class already used by `getMessage`/`openMessage`).
- **`src/create/ResultScreen.tsx`** (mirrors web `ResultScreen`): shows the `/l/:id` link (JetBrains Mono), an expiry + max-opens recap, **Share** (`expo-sharing` `shareAsync` with the URL — falls back to `Clipboard` if `isAvailableAsync()` is false), **Copy link**, and *New message* to reset the flow.

## Data flow (send)

```
ComposeScreen submit
  → create-and-seal.ts
      importPublicKey(recipientKey) ──▶ recipient + fingerprint   (invalid key → inline error, no network)
      generateLinkId() ──▶ id
      MessageBindingContext{ id, recipientPubKey, createdAtMs, expiresAtMs, maxOpens }
      encodePayload({text}) ──▶ plaintext
      seal(plaintext, recipient, ctx) ──▶ ciphertext             (local; plaintext never leaves the device)
      postMessage({ id, recipientFingerprint, ciphertext(base64), createdAtMs, expiresAt, maxOpens })
                                          └─▶ server stores ciphertext + metadata only
  → ResultScreen{ url = `${webBaseUrl}/l/${id}` }  → Share/Copy → user pastes into any channel
```

## Error handling

- **Invalid recipient key** → inline form error from `importPublicKey` throwing; submit stays disabled; no network call.
- **Network / non-ok POST** → `ApiError` surfaced on an error state in `CreateFlow` with a Retry that returns to compose with the draft intact (mirrors web's "preserve draft on POST failure").
- **Empty message** → submit disabled.
- **Share unavailable** → fall back to copying the link to the clipboard with a toast/inline note.

## Security invariants (must hold)

- Plaintext (and any future attachment bytes) are encoded + sealed **on device**; only the AEAD ciphertext + minimal metadata are uploaded. Zero-knowledge backend preserved.
- The recipient public key is validated locally; the derived **fingerprint is shown** so the sender can verify out-of-band before sending (defeats MitM on the pasted key).
- The shared artifact is the **opaque link** (a pointer), never the key or plaintext.
- The binding context (linkId / recipient / expiry / max-opens) is byte-identical to the web sender, so the AAD frame matches and the reader (web or mobile) can open it; a tampered link/metadata fails to decrypt with no fallback.
- `@aesmsg/crypto` is reused unchanged (off-limits); no new wire format.

## Testing

Node-env Vitest, no React renderer (per the established mobile test convention — pure logic extracted, native modules `vi.mock`'d):
- `create-and-seal.test.ts` — mirrors `apps/web/tests/.../encrypt-and-post` style: a real `@aesmsg/crypto` round-trip where the sealed output is then opened with the recipient identity via the existing `fetch-and-open` path (proves send↔receive parity in-process); `postMessage` (fetch) mocked; invalid recipient key rejects before any fetch; URL is `${webBaseUrl}/l/${id}`.
- `link-id.test.ts` — generated ids match `LINK_ID_REGEX`; two calls differ.
- `api-client.test.ts` (extend) — `postMessage` issues `POST /api/messages` with the correct body; non-ok → `ApiError`.
- `tabs.test.ts` — the tab descriptor list + any selection helper.
- `expiry.test.ts` — `expiryToDate` mapping for each `ExpiryChoice` (and `never` → far-future).
- UI (ComposeScreen, ResultScreen, HomeScreen, SettingsScreen, TabBar, WipeConfirmModal): verified manually on the simulator; no renderer added.

## Native dependencies

**None new.** Custom tabs (JS), paste-only recipient (`importPublicKey`), text-only send, `expo-sharing` (already installed). The slice runs on the current native build with only a Metro reload. Each deferred feature names the native dep it will add (document-picker, camera) when its slice lands.

## File map

```
apps/mobile/
├─ App.tsx                              (add activeTab state + TabBar when unlocked)
└─ src/
   ├─ navigation/
   │  ├─ tabs.ts                        (Tab union + TABS descriptors — pure)
   │  └─ TabBar.tsx                     (bottom tab bar)
   ├─ home/HomeScreen.tsx               (status card + quick actions)
   ├─ settings/
   │  ├─ SettingsScreen.tsx             (Lock + Wipe)
   │  └─ WipeConfirmModal.tsx           (type-to-confirm)
   ├─ create/
   │  ├─ CreateFlow.tsx                 (compose→encrypting→result|error)
   │  ├─ ComposeScreen.tsx              (form: text, recipient key, expiry, max-opens)
   │  ├─ ResultScreen.tsx               (link + Share + Copy)
   │  ├─ create-and-seal.ts             (pure; mirrors web encrypt-and-post.ts)
   │  └─ expiry.ts                      (ExpiryChoice + expiryToDate; mirrors web)
   ├─ lib/link-id.ts                    (generateLinkId; mirrors web)
   ├─ lib/base64.ts                     (add bytesToBase64Url if absent)
   └─ api/client.ts                     (add postMessage)
```

## Roadmap (subsequent slices)

- **S14** — sender **attachments** (`expo-document-picker`) + **Links** sent-tracking (local store + list + status + revoke).
- **S15** — **Contacts** (needs a mobile mockup decision) + **Scan QR** (`expo-camera`); wire recipient-by-contact into the sender.
- **S16** — Settings depth, key rotation, security-alert (key-changed) flow.

## Open items / flags

- **No `mobile_secure_reader` mockup** existed; the reader was built from the web mockup (foundation slice) — unchanged here.
- **No Contacts mobile mockup** exists; flagged for S15 (design one or adapt the web layout — per the project's "don't invent screens" rule, this is a conscious decision to make then, not now).
- The Home mockup's Scan QR / Add Contact quick-action tiles are intentionally omitted until Contacts/Scan ship.
