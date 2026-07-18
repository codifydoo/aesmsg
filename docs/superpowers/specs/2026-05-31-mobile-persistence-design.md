# Mobile on-device persistence — design

- **Date:** 2026-05-31
- **App:** `apps/mobile` (Expo SDK 56 / RN 0.85, React 19)
- **Phase:** 2 (native mobile)
- **Status:** design — pending implementation plan

## Goal

Replace the in-memory mocks in `apps/mobile` (contacts, sent-links/history, settings)
with **real, encrypted, on-device persistence**, and make those features
**genuinely functional** — not merely "remember the screen's state". Also wire the
currently-redundant biometric onboarding screen as a one-time, post-setup
education + confirmation step with a persisted preference.

### Decisions locked in during brainstorming

1. **Depth: functional + persisted.** Contacts store real public keys and feed the
   compose recipient picker; sent links are recorded locally and reconciled with
   the server's live status; settings toggles are persisted **and** wired to the
   behaviors they name.
2. **Encrypt at rest.** Privacy-sensitive blobs (contacts, link history, settings)
   are AES-256-GCM encrypted under a device-only symmetric key held in the hardware
   keychain. Consistent with the shipped metadata-leakage mitigations and the
   zero-knowledge posture.
3. **Biometric scope = education + persisted preference.** No rework of the
   trust-critical secret-wrapping crypto. The full optional-biometric + passphrase
   fallback is a **separate deferred slice**.

## Non-goals (explicit out of scope)

- Activity / inbox feed persistence (`system/activity-data.ts`) — separate
  notifications concern; stays mocked.
- Full optional-biometric + passphrase/PIN fallback. This is the only honest fix
  for the **no-biometric-device setup dead-end** (see §6); it is **deferred** and
  owned by its own slice.
- Quiet-hours scheduler and real push notifications — toggles persist but are
  display-only this slice.
- Analytics SDK / telemetry transport — the `analytics` toggle persists but
  nothing is sent (no SDK exists).
- iCloud / cross-device backup or sync of the stores — intentionally excluded by
  the `WHEN_UNLOCKED_THIS_DEVICE_ONLY` keychain class (documented limitation).
- Contact `email` / notes metadata — mirror web's `label` + `publicKey` model only.

## New dependencies

**None native.** The store is backed by **`expo-file-system`** (already installed,
used by the reader for attachment caching) rather than
`@react-native-async-storage/async-storage` (which is **not** installed and would
require a new native module + dev-client rebuild — costly on this Xcode toolchain).
All other primitives are already present: `expo-secure-store`,
`expo-screen-capture`, `expo-clipboard`, `expo-local-authentication`, and
`crypto.subtle` via `react-native-quick-crypto` + `expo-standard-web-crypto`.
**No dev-client rebuild is required for this slice.** No `date-fns` (not installed);
reuse the existing pure relative-time helpers (e.g. `system/activity-data.ts`'s
`relativeTime`).

## Architecture

Three layers:

```
expo-file-system (encrypted blobs)   +   expo-secure-store (the DEK)
            │
            ▼
EncryptedStore  ── AES-256-GCM JSON blobs, namespaced keys, ONE shared DEK
            │
            ├── contacts-store      (src/contacts/contacts-store.ts)
            ├── sent-links-store    (src/links/sent-links-store.ts)
            └── settings-store      (src/settings/settings-store.ts)
            │
            ▼
React providers / hooks ── ContactsProvider, useSentLinks, SettingsProvider/useSettings
            │
            ▼
Thin screens + behavior controllers (auto-lock, privacy shield, clipboard auto-clear)
```

### Data-encryption key (DEK)

- **One shared, app-level DEK** (256-bit, generated once via `expo-crypto`
  random bytes). Domains are separated by **key namespace / file name**, not by
  separate keys ("generated once").
- Stored in the keychain with accessibility `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and
  **NOT** `requireAuthentication` — routine metadata reads at app startup must not
  trigger a biometric prompt. The DEK is **separate** from the biometric-gated
  device secret used to wrap the private key.
- **Wiping the identity also wipes the DEK and all encrypted blobs**, so a wipe is
  complete (an attacker cannot decrypt leftover metadata).

### Corruption / failure policy

- Missing key → return `null` (never throws).
- Undecryptable blob (GCM auth failure / malformed framing) → typed
  `DecryptionError`, surfaced as a **non-fatal** "couldn't load" UI state. Never a
  silent wipe; never a startup crash.
- **Settings specifically:** on load failure fall back to `SETTINGS_DEFAULTS` and
  log — a single corrupt byte must not brick app startup.

## 1. Storage foundation — `src/storage/`

### New files
- `src/storage/encrypted-store.types.ts` — `IBlobStore` (get/set/remove string by
  key), `ISecureStore` (keychain), `EncryptedStoreOptions`, `DecryptionError`.
- `src/storage/encrypted-store.ts` — `EncryptedStore` with `getJson<T>`,
  `setJson<T>`, `remove`, `clear`. JSON (de)serialize → AES-256-GCM with a fresh
  random 12-byte nonce per write → frame as `base64(nonce ‖ ciphertext ‖ tag)`.
  GCM auth-tag rejects tampering. No React, no domain knowledge.
- `src/storage/data-key.ts` — `getOrCreateDEK()` (idempotent), `deleteDEK()`.
- `src/storage/file-blob-store.ts` — `IBlobStore` impl over `expo-file-system`
  (blobs under `${documentDirectory}aesmsg/<namespace>.enc`).
- `src/storage/secure-store-impl.ts` — `ISecureStore` impl over `expo-secure-store`.
- `src/storage/index.ts` — barrel export.

### Dependency injection / tests
The `EncryptedStore` and `data-key` modules take their blob store + keychain via
DI so node-env tests swap a `Map` and run **real** AES-GCM via `crypto.subtle`.
Tests: round-trip; nonce uniqueness across writes; tamper → `DecryptionError`;
missing key → `null`; namespace isolation; `clear`; DEK idempotency; DEK
accessibility flags (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, not `requireAuthentication`);
`deleteDEK` then regenerate.

## 2. Contacts — functional — `src/contacts/`

### Model (mirror `apps/web/src/lib/contacts-store.ts` verbatim)
```ts
interface ContactRecord {
  id: string;                       // stable uuid; survives key rotation
  label: string;                    // 1–80 chars, trimmed
  publicKey: PublicKeyString;
  fingerprint: Fingerprint;         // computed via @aesmsg/crypto
  verified: boolean;                // manual; reset to false on key rotation
  previousFingerprints: Fingerprint[];
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601
  schemaVersion: 1;
}
```
No `email` (web has none — do not diverge).

### API (mirror web exactly)
`addContact / listContacts / getContact / updateContactKey / setContactVerified /
renameContact / deleteContact`, with the same error types: `InvalidLabelError`,
`NotFoundError`, `SameKeyError`, `RotatedAwayError`, `DuplicateFingerprintError`
(carrying `existingId` / `existingLabel` / `reason`). `updateContactKey` pushes the
old fingerprint into `previousFingerprints`, resets `verified=false`, bumps
`updatedAt`. `listContacts` sorts by label via `Intl.Collator`.

### Derived display (never stored)
`src/contacts/contacts-display.ts` — pure: `deriveTrustStatus`
(`verified` | `unverified` | `changed`), `deriveLastUsedLabel` (relative, via the
existing relative-time helper), `deriveKeyCreatedLabel` (absolute date),
short/full fingerprint truncation.

### Wiring
- `RecipientPickerSheet.tsx` loads real contacts (`listContacts()` / optional
  `ContactsProvider`). Picking a contact now yields a **real `publicKey`**.
- `recipient.ts` / `ComposeScreen.tsx`: contact recipients now carry a real key —
  remove the "contact carries only a short fingerprint, no key material"
  limitation; the seal path becomes identical to the paste path.
- `create-and-seal.ts`: unchanged (already takes a public-key string).
- `ContactsFlow.tsx` / list / detail / verify screens: read/write through the
  store (`getContact`, `setContactVerified`, `deleteContact`, `addContact`); render
  the empty state when there are no contacts.
- `ResultScreen.tsx`: add a **"Save as contact"** CTA shown only after a paste-flow
  send whose fingerprint isn't already known (current or rotated-away). Inline
  name+confirm sheet with the public key pre-filled (no email — YAGNI).
- Key-rotation detection vs `previousFingerprints` continues to feed the existing
  key-changed alert.

### Tests
Mirror web's contacts-store cases: label validation, duplicate fingerprint
(current + rotated-away), rotation moves fingerprint + resets verified, verify
toggle, rename, delete, sort order. Display helpers unit-tested. Use real
`@aesmsg/crypto` for fingerprints; mock the keychain/blob store.

## 3. Sent links — functional + reconciliation — `src/links/`

### Model (mirror `apps/web/src/lib/sent-links-store.ts`)
```ts
interface SentLinkRecord {
  id: string;
  recipientFingerprint: Fingerprint;
  createdAt: string;     // ISO
  expiresAt: string;     // ISO
  maxOpens: number;
  label: string | null;
  schemaVersion: 1;
}
```

### Stores & helpers (new files)
- `src/links/sent-links-store.ts` — `recordSentLink / listSentLinks (newest-first) /
  getSentLink / deleteSentLink`.
- `src/links/link-reconciliation.ts` — **pure** `reconcileSentLinks(localRecords,
  serverResponse, now)` merges live status/opens/expiry from the server onto local
  records. Local records missing from the server response → `gone`.
- `src/links/link-display.ts` — pure: `deriveLinkStatus`, `formatExpiresLabel`,
  `formatCreatedAtLabel`, `formatTimeLabel`, `toDisplayLink` (reuses existing
  relative-time helpers, no `date-fns`).
- `src/links/use-sent-links.ts` — hook: load + reconcile on mount, `refresh()`,
  `recordNewLink()`, `revokeAndDelete()`, `deleteLocal()`.

### API client + wiring
- `src/api/client.ts`: add `listMessages(ids)` → `POST /api/messages/list` and
  `revokeLink(id)` → `POST /api/messages/[id]/revoke` (same endpoints web uses).
- `create-and-seal.ts`: after a successful POST, `recordSentLink({...})`.
- `LinksFlow.tsx`: replace `SEED_LINKS` with `useSentLinks()`; wire revoke/delete to
  hook actions; show loading + empty + error states.
- `links-data.ts`: drop `SEED_LINKS`; keep `Link` / `LinkRecipient` / `LinkStatus`
  type exports.
- Refresh strategy: on mount + manual pull-to-refresh (no background sync — YAGNI).

### Tests
`sent-links-store`: record/list (newest-first)/delete round-trip, no-op delete,
empty list. `link-reconciliation`: active / gone / revoked / expired / past-expiry /
empty merges. `link-display`: status enum derivation and label formatting.
`tests/setup.ts` clears the store between cases.

## 4. Settings — persist + behavior wiring — `src/settings/`

### Model
```ts
interface SettingsRecord {
  biometric: boolean;            // default true  (persisted; see §6 — not a true on/off this slice)
  requireUnlock: boolean;        // default true
  blurPreview: boolean;          // default true
  blockScreens: boolean;         // default true
  autoWipe: boolean;             // default true
  clipboardClearSeconds: number; // default 45  (clamp 10–90)
  appLockTimeout: "never" | "1m" | "5m" | "15m" | "1h"; // default "never"
  analytics: boolean;            // default false
  quietHoursEnabled: boolean;    // default false
  quietHoursFrom: string;        // "HH:MM", default "22:00"
  quietHoursTo: string;          // "HH:MM", default "07:00"
  schemaVersion: 1;
  createdAt: number;             // epoch ms
  updatedAt: number;             // epoch ms
}
```

### Files
- `src/settings/settings-store.ts` — `load / save / delete / hasSaved` over
  `EncryptedStore`. Validation + schemaVersion migration; load failure →
  `SETTINGS_DEFAULTS`.
- `src/settings/settings-format.ts` — pure: `validateSettings`, `migrateSettings`,
  `appLockTimeoutMs`, `isValidClipboardSeconds`.
- `src/settings/settings-context.tsx` — `SettingsProvider` at the app root +
  `useSettings()` (auto-persists changes).

### Behavior wiring (honest matrix)
| Setting | This slice |
|---|---|
| `appLockTimeout` | **Wired** → replaces hardcoded auto-lock timeout (`appLockTimeoutMs`, `null`=never) |
| `blurPreview` | **Wired** → privacy-shield blur-on-background flag |
| `blockScreens` | **Wired** → `expo-screen-capture` (`preventScreenCaptureAsync` / `allow…`) |
| `clipboardClearSeconds` | **Wired** → reader clipboard auto-clear duration (thread through `usePrivacyShield` → clipboard auto-clear) |
| `autoWipe` | **Wired** → auto-wipe decrypted content after reading |
| `requireUnlock` | **Wired if a real reader gate exists**; otherwise persisted + honestly marked |
| `biometric` | Persisted + reflected; **not a true on/off** (cannot disable the gate without the deferred passphrase work) |
| `analytics` | Persisted only — no analytics SDK; nothing sent |
| quiet hours / notification toggles | Persisted, **display-only** (no scheduler / no push) — labeled in-UI |

### Edits
`SecuritySettingsScreen`, `PrivacySettingsScreen`, `NotificationsScreen` →
`useSettings()` instead of local `useState`. `AdvancedScreen` stays read-only.
`usePrivacyShield` / `privacy-shield-controller` / `shield-logic` accept
`blurPreview` + `blockScreens` + `clipboardClearMs` from settings.
`identity-context` reads `appLockTimeout` from settings. `App.tsx` wraps the tree in
`SettingsProvider` **above** `IdentityProvider` (avoid a settings↔identity render
race).

### Tests
`settings-store`: defaults, save/load round-trip, schemaVersion/migration, corrupt
blob → defaults. `settings-format`: validation, `appLockTimeoutMs` mapping,
clipboard-seconds clamp. Behavior wiring covered via the DI seams.

## 5. Biometric onboarding — `src/onboarding/`

- Show `EnableBiometricsScreen` **once, post-setup**, gated by a persisted
  `biometricOnboardingSeen` flag (lives in `SettingsRecord`).
- `EnableBiometricsScreenIntegration.tsx` (new wrapper) holds the logic; the
  presentational `EnableBiometricsScreen.tsx` is untouched (unwired callbacks
  provided by the wrapper).
- `biometric-onboarding.ts` (new, pure/node-testable): `checkBiometricCapability()`
  (`hasHardwareAsync` + `isEnrolledAsync`), `performBiometricConfirmation(prompt)`
  (`authenticateAsync`; throws on rejection), `getBiometricOnboardingState(settings)`.
- **Enable** → live `authenticateAsync()` confirmation → persist
  `{ biometric: true, biometricOnboardingSeen: true }` → route on.
  **Not now** → persist `{ biometricOnboardingSeen: true }` → route on. Honest:
  "Not now" only dismisses the educational screen this slice; it does not disable
  the intrinsic biometric gate.
- `App.tsx`: after `status === "unlocked"`, conditionally render the wrapper, then
  fall through to the tab shell.

### Known limitation (must be called out in the PR)
`device-secret.ts`'s `createDeviceSecret()` (via `ensureBiometricCapable()`)
**throws `BiometricUnavailableError` on devices with no enrolled biometrics at
identity-setup time**, so such devices **dead-end before they ever reach
onboarding**. The only honest fix is the deferred optional-biometric +
passphrase/PIN fallback. This slice therefore:
- detects capability and shows honest messaging in the onboarding wrapper, and
- **documents the setup dead-end** as a known limitation owned by the deferred
  slice — **without** silently weakening the secret's protection class.

### Tests
Capability branches (hardware/enrolled combinations, no throw on missing),
confirmation success/rejection, `getBiometricOnboardingState` first-run vs seen,
enable persists `{ biometric, biometricOnboardingSeen }`, skip persists seen.

## Testing approach (all areas)

- Node-env Vitest, **no React renderer** (existing convention). `vi.hoisted` +
  `vi.mock` for `expo-file-system` / `expo-secure-store` / `expo-local-authentication`;
  **real** AES-GCM via `crypto.subtle`.
- All non-trivial logic (reconciliation, display formatting, trust status, settings
  validation/migration, onboarding state) lives in pure DI modules and is unit-tested.
- `tests/setup.ts` clears every store between cases.
- Screen + provider wiring verified manually on the iOS simulator (per convention).

## Risks

- **DEK loss = data loss.** Keychain unavailable / restored-from-backup device → a
  new DEK is generated and old blobs become unreadable. Acceptable for metadata;
  documented. (A real backup/restore flow is a future slice.)
- **No-biometric setup dead-end** (see §5) — pre-existing; explicitly deferred.
- **Behavior-wiring regressions** — moving auto-lock/clipboard/shield off hardcoded
  constants must thread the value end-to-end or the toggle silently no-ops. Covered
  by DI seams + tests; verify on-device.
- **Provider ordering** — `SettingsProvider` must sit above `IdentityProvider`.

## File-change summary

**New:** `src/storage/{encrypted-store.types,encrypted-store,data-key,file-blob-store,secure-store-impl,index}.ts`;
`src/contacts/{contacts-store,contacts-display}.ts` (+ optional `ContactsProvider.tsx`);
`src/links/{sent-links-store,link-reconciliation,link-display,use-sent-links}.ts`;
`src/settings/{settings-store,settings-format}.ts` + `src/settings/settings-context.tsx`;
`src/onboarding/{biometric-onboarding.ts,EnableBiometricsScreenIntegration.tsx}`;
plus matching `tests/*.test.ts`.

**Edited:** `src/create/{RecipientPickerSheet,recipient,ComposeScreen,ResultScreen}.tsx`,
`src/create/create-and-seal.ts`; `src/contacts/{ContactsFlow,ContactsListScreen,ContactDetailScreen}.tsx`,
`src/contacts/contacts-data.ts` (drop sample); `src/links/{LinksFlow}.tsx`,
`src/links/links-data.ts` (drop `SEED_LINKS`); `src/api/client.ts`;
`src/settings/{SecuritySettingsScreen,PrivacySettingsScreen,NotificationsScreen}.tsx`,
`src/settings/settings-mock.ts`; `src/shield/{usePrivacyShield,privacy-shield-controller,shield-logic}.ts`;
`src/identity/{identity-context.tsx,device-secret.ts}`; `App.tsx`; `tests/setup.ts`.
