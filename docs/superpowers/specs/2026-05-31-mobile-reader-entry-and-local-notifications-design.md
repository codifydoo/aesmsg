# Mobile reader entry + local notifications — design

- **Date:** 2026-05-31
- **Status:** Draft for review
- **Scope:** `apps/mobile` only. No server changes this round.
- **Related:** `docs/superpowers/specs/2026-05-30-metadata-leakage-audit.md` (ZK invariants), `apps/mobile/AGENTS.md`, mobile test convention.

## 1. Context

The request was framed as "we are missing reader/read functionality in the mobile app as well as push
notifications." Investigation shows the **reader decrypt engine is already fully built and wired** on
`main`:

- Real safe-preview fetch + ciphertext open: `apps/mobile/src/api/client.ts`
  (`getMessage`, `openMessage`).
- Real HPKE decrypt with byte-identical v1/v2 AAD reconstruction to web:
  `apps/mobile/src/reader/fetch-and-open.ts` → `open()` from `@aesmsg/crypto`.
- Full state machine mirroring web (loading → landing → opening → decrypted | failed | gone |
  network | invalid): `apps/mobile/src/navigation/ReaderFlow.tsx`.
- Trust-critical reader behaviors present: `usePrivacyShield` blur-on-background, 60s clipboard
  auto-clear, decrypted-attachment cache wipe-on-unmount, opaque error collapsing.
- Biometric-gated identity (private key unwrapped only after Face ID).
- Reader screens already restyled to the design (screens 23–33).

What is genuinely missing:

1. **No in-app way to reach the reader.** The only trigger is an OS deep link
   (`Linking.useURL()` in `App.tsx`). The Home screen already shows an **"Open secure link"**
   outline button (`apps/mobile/src/home/HomeScreen.tsx`, designed in `mobile_home_aesmsg`
   / `ai_design_prompts_mobile.md` screen 9), but its `onOpenLink` is a placeholder `noop` — there
   is no destination surface.
2. **No notifications.** `apps/mobile/src/system/PushPermissionScreen.tsx` and
   `apps/mobile/src/settings/NotificationsScreen.tsx` exist as presentational components matching the
   documented specs (`ai_design_prompts_mobile.md` screens 55 + 49), but nothing requests OS
   permission, schedules anything, or persists preferences. `expo-notifications` is not installed.

## 2. Decisions already made (with the user)

- **Reader gap to close:** in-app "Open a link" entry only. (Not: wiring a real backend host, not
  per-open biometric — both explicitly deferred.)
- **Notification model:** **local notifications only this round.** No remote APNs/FCM push, no server
  endpoint, no EAS `projectId`, no APNs/FCM credentials. Remote "link opened" push is a documented
  follow-up.
- **Open-link UI (no mockup exists):** build the destination as a **paste bottom-sheet composed only
  from existing kit components** (the compose recipient-picker sheet pattern + a paste field). No new
  visual invention. Approved by the user.

## 3. Scope

### In scope

- **Feature A — In-app "Open a link" entry.** Wire the existing Home button to a paste sheet that
  parses a aesmsg link/ID and routes into the existing `ReaderFlow`. **No crypto changes.**
- **Feature B — Local notifications.**
  - Add `expo-notifications` (+ plugin). This is a native module → **clean rebuild required**.
  - Wire `PushPermissionScreen` priming → real OS permission request.
  - On link creation, schedule a **local "expiring soon" notification** at `expiresAt − 1h`.
  - Wire `NotificationsScreen`: persist preferences, gate scheduling on the "Expiring soon" toggle.
  - Tapping a local notification opens the app to the **Links** tab.

### Out of scope (deferred — see §9)

- Remote "link opened" push (server subscription store, subscribe endpoint, open-handler trigger,
  Expo/APNs/FCM send, EAS `projectId`, credentials, metadata-leakage audit addendum).
- "Contact key changed" notification behavior (separate contact-verification feature).
- Quiet-hours **enforcement** (the UI + persisted preference are kept; enforcement deferred).
- Socket/realtime dashboard.
- A real persistent sent-links store / live Links tab (stays mock `SEED_LINKS`).
- Wiring a real backend host; per-open biometric.

## 4. Feature A — In-app "Open a link" entry

### Behavior

1. User taps **"Open secure link"** on Home.
2. A bottom sheet opens. On open it reads the clipboard once; if the clipboard contains a parseable
   aesmsg link, the input is **pre-filled** and a "Detected a secure link" hint shows. Otherwise
   the field is empty with a paste affordance.
3. User confirms/edits and taps **Open**.
4. The input is parsed (see rules). On success the sheet closes and the app mounts
   `ReaderFlow id=<id>` — the **same** state used by the deep-link path. On failure, an inline error
   ("That doesn't look like a aesmsg link") is shown; nothing navigates.

### Parse rules (`apps/mobile/src/navigation/parse-link-id.ts`, extended)

Add a pure `parsePastedLink(input: string): string | null` alongside the existing `parseLinkId`:

- Trim whitespace.
- If it looks like a URL (`https://…/l/<id>` or `aesmsg://l/<id>`), reuse the existing
  `Linking.parse`-based extraction (same `^l\/([^/]+)$` path match).
- Else if it is a bare link ID, validate against `LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/` (matches the
  web/server link-id format).
- Else return `null`.

Pure module, unit-tested in Node (no `Linking` native dependency beyond what `parse-link-id` already
mocks).

### Wiring

- New component `apps/mobile/src/reader/OpenLinkSheet.tsx` — presentational sheet built from existing
  kit (`Button`, input/field components, `Chip`, `Icon`), mirroring the compose recipient-picker
  sheet. Props: `visible`, `onSubmit(id)`, `onClose`, and an injected `readClipboard` (DI for tests).
- `apps/mobile/src/home/HomeFlow.tsx` owns the sheet's `visible` state and clipboard read; the Home
  button's `onOpenLink` toggles it; on a valid parse it calls an `onOpenLink(id)` callback threaded
  from `App.tsx`.
- `App.tsx` passes `onOpenLink={(id) => setLinkId(id)}` down through the tab shell to `HomeFlow`.
  Setting `linkId` mounts `ReaderFlow` exactly as the deep-link path does — single routing path,
  no duplication.

### Security note

No plaintext, key, or ciphertext is handled here — only a link **pointer**. A pasted link without
this device's private key is useless (existing invariant). The clipboard is read, never written.

## 5. Feature B — Local notifications

### 5.1 Dependency + config

- Add `expo-notifications` (`~56.x`) to `apps/mobile/package.json`. (`expo-device` is **not** needed
  for local-only scheduling and is omitted to minimize native surface.)
- Add `"expo-notifications"` to the `plugins` array in `apps/mobile/app.config.ts` (icon/color/sound
  defaults). **No `projectId`** — local notifications do not require a push token.
- Native module ⇒ **clean rebuild** per the iOS build recipe. OTA stays disabled.

### 5.2 DI wrapper — `apps/mobile/src/notifications/notifications.ts`

Thin wrapper over `expo-notifications` so all callers depend on an interface, not the native module
(per the mobile test convention — node-env Vitest, `vi.mock` the native):

- `getPermissionStatus()`, `requestPermission()`
- `scheduleLocal({ id, title, body, fireAt, data })` → returns the OS notification id
- `cancel(notificationId)`
- `setForegroundHandler()` (show alerts while foregrounded)
- `addResponseListener(handler)` (tap handling)

### 5.3 Preferences — `apps/mobile/src/notifications/prefs.ts`

- Shape: `{ linkOpened: boolean; expiringSoon: boolean; keyChanged: boolean; quietHours: { enabled,
  from, to } }`. Defaults match the design (alerts on).
- Persisted as a JSON blob via the already-installed `expo-secure-store` (no new native dep). Pure
  load/save/merge logic behind a DI store for Node tests.

### 5.4 Permission priming

- `PushPermissionScreen.onEnable` → `notifications.requestPermission()`.
- Show priming once (persist an "asked" flag in prefs/secure-store). If already granted/denied, skip.
- Entry point: shown after the first link is created (matches the design's "after first link
  created" trigger) when permission is `undetermined` and the user hasn't dismissed it.

### 5.5 Schedule "expiring soon" on create

- Pure function `apps/mobile/src/notifications/schedule-expiry.ts`:
  `planExpiryReminder({ id, expiresAtMs, nowMs }): { fireAtMs } | null`.
  - Fire at `expiresAtMs − 3_600_000`.
  - Returns `null` (skip) if `fireAtMs <= nowMs` (link expires in <1h or already past) — no immediate
    or past-dated reminders.
- Integration in the create flow (`apps/mobile/src/create/CreateFlow.tsx`, after `createAndSeal`
  returns `{ id, url }` and the flow already holds the chosen `expiresAt`): if permission granted and
  `prefs.expiringSoon`, compute the plan and `notifications.scheduleLocal(...)` with body
  *"A secure link is expiring soon."* and `data: { linkId: id }`.
  - **Crypto stays clean:** scheduling lives in the flow/integration layer, never in
    `create-and-seal.ts` or `@aesmsg/crypto` (no notification/network/DOM in crypto).

### 5.6 Settings screen wiring (`NotificationsScreen`)

- Load prefs on mount; persist each toggle change.
- **"Expiring soon"** — functional (gates §5.5).
- **"Link opened"** and **"Contact key changed"** — rendered **disabled with a muted "Available
  soon"** caption; the preference value is still persisted so it lights up when the feature lands.
  (Honesty call, confirmed: no toggle that silently does nothing.)
- **Quiet hours** — toggle + From/To **persisted, no enforcement this round**, with a small in-screen
  "applies to future alerts" note. (Confirmed: keep + persist, enforce when remote push lands.)

### 5.7 Tap handling

- In `App.tsx`, register `notifications.addResponseListener` → on tap, `setTab("links")`. Local-only;
  per-link deep-linking is deferred until the real links store exists (Links tab is mock).
- `setForegroundHandler` so a reminder that fires while the app is open is still presented.

## 6. Zero-knowledge / security guardrails

- **No server changes**, so the zero-knowledge backend is untouched this round.
- Local notification payloads are **event-only** (no ciphertext, no recipient, no plaintext); the
  link ID in `data` never leaves the device (local scheduling is on-device).
- Clipboard is **read** in the open-link sheet, never written.
- Crypto package remains free of DOM/network/notification/storage imports.
- The deferred remote-push phase (§9) **does** introduce a new sender-side metadata surface
  (`device token ↔ its own link IDs`) and **must** be covered by a metadata-leakage audit addendum
  before it ships. Recorded here so it is not forgotten.

## 7. Module boundaries (for testability)

Pure, DI-driven modules (Node-testable, `vi.mock` natives) vs. thin integration glue:

| Module | Pure? | Responsibility |
|---|---|---|
| `navigation/parse-link-id.ts` (+`parsePastedLink`) | yes | URL/ID → linkId |
| `notifications/prefs.ts` | yes (DI store) | load/save/merge preferences |
| `notifications/schedule-expiry.ts` | yes | compute fire time / skip rule |
| `notifications/notifications.ts` | thin | DI wrapper over `expo-notifications` |
| `reader/OpenLinkSheet.tsx` | presentational | paste UI, `onSubmit(id)` |
| `home/HomeFlow.tsx`, `App.tsx`, `create/CreateFlow.tsx` | glue | wire the above together |

## 8. Testing strategy

Per the mobile test convention (node-env Vitest, **no** React renderer; pure logic + `vi.mock`
natives):

- **Unit:** `parsePastedLink` (valid URLs in both schemes, bare IDs, garbage, whitespace);
  `planExpiryReminder` boundaries (<1h, past, normal, exactly 1h); `prefs` load/default/save/merge;
  permission-gated scheduling decision logic.
- **Gates:** `pnpm typecheck`, `pnpm lint`, `pnpm test` green across the workspace.
- **Manual verification (iOS sim, after clean rebuild):**
  1. Open secure link → paste sheet → clipboard pre-fill → `ReaderFlow` mounts (reaches landing
     against a reachable backend, or the network terminal against the placeholder host — either
     proves routing).
  2. Permission priming → grant.
  3. Create a link → an "expiring soon" local notification is scheduled (verify via a short test
     interval or `getAllScheduledNotificationsAsync`).
  4. Settings toggles persist across relaunch; disabled rows show "Available soon".
  5. Firing a local notification → tapping it opens the Links tab.
- Full end-to-end decrypt demo (optional): point `AESMSG_API_BASE_URL` at the local web dev
  server for a one-off run; not committed.

## 9. Deferred follow-up — remote "link opened" push

Documented so it can be picked up cleanly when the user provides EAS + credentials:

- Mobile: add `expo-device`, EAS `projectId`/`owner` in `app.config.ts`, `getExpoPushTokenAsync`,
  `subscribePush({ linkId, token })` after `postMessage` in `create-and-seal.ts`, light it up the
  "Link opened" toggle.
- Server (`apps/web` + `packages/server-store`): a `linkId → token` subscription store
  (Redis TTL = expiry, in-memory backend for tests, via the existing store DI), `POST
  /api/notifications/subscribe`, a **timing-neutral, fire-and-forget after-response** trigger in
  `createOpenMessageHandler` once `incrementOpens` succeeds, Expo Push send (`expo-server-sdk`),
  purge-on-revoke.
- Metadata-leakage audit addendum for the `token ↔ links` surface.

## 10. Risks / caveats

- Adding `expo-notifications` requires a **clean** native rebuild (incremental builds crash with
  stale codegen — see prior build notes).
- The iOS simulator cannot exercise remote push, but **local** notifications work in the sim, so this
  round is fully verifiable without a device.
- Reader end-to-end decrypt still needs a reachable backend; the placeholder host (`app.aesmsg.
  example`) yields the network terminal. This is expected and not in scope to fix here.

## 11. Resolved decisions

- **Quiet hours:** keep the rows, persist From/To, **no enforcement** this round, in-screen
  "applies to future alerts" note.
- **Inert toggles:** "Link opened" and "Contact key changed" rendered **disabled + "Available
  soon"** (preference persisted).
