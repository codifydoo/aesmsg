# Sub-project 5 — Web client rotation, backup export/import, security settings, attachments (`apps/webapp`) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last parity gap between the web client (SP1–SP4) and the native app: real **key rotation** (retaining old keys so in-flight legacy links still open), **encrypted backup export/import** in the **byte-identical mobile format** (a mobile backup imports on web and vice-versa), a real **security-settings** screen (clipboard auto-clear, app-lock, wipe, storage-persistence, honest web-tier disclosure), and **attachments** (compose picker + reader download) replacing SP3's "not supported" notice. Every crypto call is the **exact `@aesmsg/crypto` call the mobile app makes**, so the wire format, backup file, and payload envelope are identical across surfaces.

Interop is non-negotiable in both directions: a backup exported on mobile restores on web and vice-versa; a message with an attachment sealed on either surface opens on the other; a link sealed to a web identity's **pre-rotation** key still opens after that identity rotates.

**Architecture:** Five concentric additions on top of SP1–SP4.
1. **Persistence:** an IndexedDB **v4** schema bump adding two additive, `contains`-guarded object stores — **`retired-keys`** (the multi-key-identity backing for rotation) and **`settings`** (the on-device prefs blob, no key material). Same additive-migration discipline as the SP2 v2 and SP4 v3 bumps.
2. **Multi-key identity + rotation:** port [`apps/mobile/src/identity/identity-bundle.ts`](../../../apps/mobile/src/identity/identity-bundle.ts) (retired-key data shape + list transforms) and [`apps/mobile/src/identity/decrypt-keys.ts`](../../../apps/mobile/src/identity/decrypt-keys.ts) (decrypt fallback), extend the identity context with `rotate(passphrase)` + retired-key retention + `getAllPrivateKeysForDecrypt()`, and wire the reader to fall back through retired keys.
3. **Backup export/import:** `keys/export-backup.ts` (`buildBackup` = the same `wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS)` mobile calls → a Blob download) and `onboarding/import-backup.ts` (`restoreIdentity` = the same `unwrapPrivateKey` mobile calls), mirroring [`apps/mobile/src/keys/export-backup.ts`](../../../apps/mobile/src/keys/export-backup.ts) + [`apps/mobile/src/onboarding/import-backup.ts`](../../../apps/mobile/src/onboarding/import-backup.ts).
4. **Security settings:** `settings-format.ts`/`settings-store.ts`/`settings-context.tsx` (a web subset of [`apps/mobile/src/settings/*`](../../../apps/mobile/src/settings)) + a real `/settings` screen wiring the clipboard-auto-clear duration into the existing reader hook, an app-lock timeout, storage-persistence status, the honest web-tier disclosure (§3), and wipe.
5. **Attachments:** `create/pick-attachment.ts` (port of [`apps/mobile/src/create/pick-attachment.ts`](../../../apps/mobile/src/create/pick-attachment.ts), FREE-tier cap) feeding `createAndSeal`, and a reader Blob-download replacing SP3's notice.

`@aesmsg/crypto`, `@aesmsg/ui`, `@aesmsg/design-tokens`, `@aesmsg/server-store`, and `apps/api` are **frozen** — consumed verbatim, never modified. **No mobile changes.**

**Tech Stack:** Next.js 16 static export (`output: 'export'`, unchanged); React 19; `@aesmsg/crypto` (workspace, unchanged); native IndexedDB; Blob / `URL.createObjectURL` + `<a download>` for the backup + attachment downloads (**no new npm dependency** — see D11); Vitest 3 **browser mode** (headless Chromium via Playwright); Biome 2 (repo-wide).

**Spec:** [`docs/superpowers/specs/2026-07-18-messaging-web-client-design.md`](../specs/2026-07-18-messaging-web-client-design.md) — this plan implements **item 5 of §9** ("Rotation, backup, security settings, attachments polish"), honoring §5 (identity & key handling: backup format parity, no recovery, storage-persistence), §3 (honest web-tier threat model: native offers stronger delivery guarantees + link; screenshot-blocking gap), §8 (attachments in scope), and §10 (testing). Builds on [`2026-07-18-webapp-foundation-identity.md`](./2026-07-18-webapp-foundation-identity.md) (SP1 — identity context, DB v1, Argon2id wrap), [`2026-07-18-webapp-sender-links.md`](./2026-07-18-webapp-sender-links.md) (SP2 — DB v2 store pattern, `create-and-seal`, sent-links, `RequireUnlocked`), [`2026-07-18-webapp-recipient-bouncer.md`](./2026-07-18-webapp-recipient-bouncer.md) (SP3 — reader, `open-and-decrypt`, the attachments notice this plan replaces), and [`2026-07-18-webapp-contacts-verification.md`](./2026-07-18-webapp-contacts-verification.md) (SP4 — DB v3, static-export `?id=` routing, the identity-screen QR).

**Backup format source of truth:** [`docs/superpowers/specs/2026-06-03-mobile-backup-export-import-design.md`](../specs/2026-06-03-mobile-backup-export-import-design.md). Mobile behavioral sources of truth (ported, not modified): [`export-backup.ts`](../../../apps/mobile/src/keys/export-backup.ts), [`import-backup.ts`](../../../apps/mobile/src/onboarding/import-backup.ts), [`identity-machine.ts`](../../../apps/mobile/src/identity/identity-machine.ts) (rotate/import/wipe), [`identity-bundle.ts`](../../../apps/mobile/src/identity/identity-bundle.ts), [`decrypt-keys.ts`](../../../apps/mobile/src/identity/decrypt-keys.ts), [`RotateKeyScreen.tsx`](../../../apps/mobile/src/keys/RotateKeyScreen.tsx) / [`RotateSuccessScreen.tsx`](../../../apps/mobile/src/keys/RotateSuccessScreen.tsx), [`ExportBackupScreen.tsx`](../../../apps/mobile/src/keys/ExportBackupScreen.tsx), [`ImportBackupScreen.tsx`](../../../apps/mobile/src/onboarding/ImportBackupScreen.tsx), [`settings-format.ts`](../../../apps/mobile/src/settings/settings-format.ts) / [`SecuritySettingsScreen.tsx`](../../../apps/mobile/src/settings/SecuritySettingsScreen.tsx), [`wipe-orchestration.ts`](../../../apps/mobile/src/settings/wipe-orchestration.ts), [`pick-attachment.ts`](../../../apps/mobile/src/create/pick-attachment.ts), [`entitlements.ts`](../../../apps/mobile/src/pro/entitlements.ts), [`attachment-cache.ts`](../../../apps/mobile/src/reader/attachment-cache.ts). Historical plans for context: `2026-05-11-security-settings.md`, `2026-05-09-key-store.md`, `2026-06-01-mobile-attachment-picker.md`.

---

## ⚠️ Pinned decisions — read before starting

### D1. Rotation RETAINS old keys — mobile semantics, pinned to real file refs

Mobile's identity is **not a single keypair**: it is an **ACTIVE keypair plus an ordered list of RETIRED keypairs**. `rotate()` generates a fresh active keypair, retires the old one, and **RETAINS the old private key** (still wrapped at rest) so in-flight "legacy" links sealed to a previous public key still open. New sends/receives use the active key; decryption **falls back** through the retired keys in order. Pinned to source:

- Model + invariants: [`identity-machine.ts:11-31`](../../../apps/mobile/src/identity/identity-machine.ts) ("Rotation generates a new active keypair and retires the old one — but RETAINS the old private key … so in-flight legacy links … still open").
- `rotate()` body — crash-safe write ordering (retired blob persisted **before** the active pointer flips): [`identity-machine.ts:259-302`](../../../apps/mobile/src/identity/identity-machine.ts).
- Retired-key data shape + list transforms (`RetiredKeyEntry`, `serializeRetiredKeys`/`parseRetiredKeys`, `dedupeRetired`, `prependRetired`, `retiredExcludingActive`, versioned blob `{ v:1, keys:[] }`, newest-first, KEEP-INDEFINITELY): [`identity-bundle.ts`](../../../apps/mobile/src/identity/identity-bundle.ts).
- Decrypt fallback (`allPrivateKeysForDecrypt` = `[active, ...retired]`; `decryptWithKeyFallback` tries each, advancing only on `DecryptionError`, rethrowing any other error immediately): [`decrypt-keys.ts`](../../../apps/mobile/src/identity/decrypt-keys.ts).
- On unlock, mobile unwraps the retained retired keys under the same secret, **best-effort per entry** (a corrupt entry is skipped, never fails the whole unlock): [`identity-machine.ts:181-197`](../../../apps/mobile/src/identity/identity-machine.ts).

**The web MUST retain too** — otherwise a web recipient who rotates permanently loses every in-flight link sealed to their old web key (no server-side copy; zero-knowledge backend). This forces the **IndexedDB v4 `retired-keys` store** (D3) and a reader key-fallback (Task 6). SP3's `open-and-decrypt.ts:26-27` note ("Key-rotation fallback … is OUT OF SCOPE — an SP1/SP2 web identity has exactly one active key") is **explicitly reversed** by this SP.

**What rotation does to the rest of the model (mobile parity, [`RotateKeyScreen.tsx`](../../../apps/mobile/src/keys/RotateKeyScreen.tsx) + [`RotateSuccessScreen.tsx`](../../../apps/mobile/src/keys/RotateSuccessScreen.tsx)):**
- **Fingerprint changes** — the new active key has a new `AM-` fingerprint. The success screen surfaces the new fingerprint + QR for re-sharing.
- **Your saved contacts are UNTOUCHED** — rotation does not modify the user's `contacts` store. Post-rotation copy states plainly that **your contacts must re-verify your new fingerprint** ("their app will show your key as changed until they do — that's the check working as intended," [`RotateSuccessScreen.tsx:73-79`](../../../apps/mobile/src/keys/RotateSuccessScreen.tsx)).
- **Sent links are UNTOUCHED** — the `sent-links` store is not modified; existing links keep opening via the retired key.
- **Tone is AMBER, not red** — rotation is not destructive and does not cost access to already-received messages. Red is reserved for wipe ([`RotateKeyScreen.tsx:6-15`](../../../apps/mobile/src/keys/RotateKeyScreen.tsx)).

### D2. Rotation on web re-prompts the login passphrase (spec §5) and re-uses the already-wrapped envelope as the retired entry

The web at-rest wrap is a **passphrase** wrap (`DEFAULT_WRAP_KDF_PARAMS`), not a device secret; the unlocked session holds only the **plaintext keypair**, never the passphrase ([`identity-context.tsx:70-74`](../../../apps/webapp/src/identity/identity-context.tsx)). Spec §5 mandates an **explicit re-prompt before rotation**, and a re-prompt is also required to wrap the new key. Pinned flow (mirrors mobile's fresh-gate-then-rotate, adapted to the passphrase model):

1. **Re-prompt the login passphrase** (an `InlineUnlock`-style field). **Verify** it by `unwrapPrivateKey(stored.wrapped, passphrase)`; `BadPassphraseError` → calm inline error, **abort — identity untouched** (mirrors mobile's biometric-cancel-leaves-identity-untouched, [`KeysFlow.tsx:88-103`](../../../apps/mobile/src/keys/KeysFlow.tsx)).
2. The **retired entry re-uses the EXISTING stored `wrapped` envelope verbatim** — it is already sealed under the current passphrase with `DEFAULT_WRAP_KDF_PARAMS`, i.e. the SAME at-rest protection (D1's "retired private keys keep the SAME at-rest protection" invariant, [`identity-machine.ts:19-21`](../../../apps/mobile/src/identity/identity-machine.ts)) — plus its `publicKeyString`, `fingerprint(publicKeyString)`, and `retiredAtMs: Date.now()`. **No re-wrap, no second Argon2id** for the retired key.
3. `generateIdentity()` → `wrapPrivateKey(newId, passphrase, DEFAULT_WRAP_KDF_PARAMS)` for the new active key.
4. **One atomic IndexedDB transaction** over `[IDENTITY_STORE, RETIRED_STORE]`: `put` the retired blob (`prependRetired(existing, oldEntry)`) **and** `put` the new `StoredIdentity` (`id:"primary"`). IndexedDB commits a multi-store transaction all-or-nothing, which **subsumes** mobile's two-phase retired-first ordering — "fully rotated OR unchanged, never bricked" ([`identity-machine.ts:250-258`](../../../apps/mobile/src/identity/identity-machine.ts)) holds by transaction atomicity; document this equivalence in a comment.
5. In-memory: new active keypair + `retiredKeypairs = [oldActiveKeypair, ...priorRetired]` (already held unwrapped — no re-unwrap). Re-derive + surface the new fingerprint.

> **Single-passphrase model (the one intentional divergence from mobile, justified):** on web the retired key stays under the **same** login passphrase as the active key (both `DEFAULT_WRAP_KDF_PARAMS`). Mobile can keep them under one device secret; the web keeps them under one passphrase. On the next unlock, that single passphrase unwraps the active **and** every retired entry (Task 5).

### D3. IndexedDB **v4** — add `retired-keys` + `settings` stores (additive, migration-safe)

[`src/identity/db.ts`](../../../apps/webapp/src/identity/db.ts) is at `DB_VERSION = 3` (`identity`, `sent-links`, `contacts`), each created idempotently under a `contains`-guard in `onupgradeneeded`. Add **two** stores the same additive way:

- `export const RETIRED_STORE = "retired-keys";` — a single blob record keyed `id:"primary"` holding `{ id:"primary"; entries: RetiredKeyEntry[]; schemaVersion: 1 }` (newest-first, deduped — D1's `identity-bundle` semantics). Keyed store (not per-key rows) so a rotation's retired-blob write is a single atomic `put` alongside the active-identity `put` (D2).
- `export const SETTINGS_STORE = "settings";` — a single blob record keyed `id:"primary"` holding the web `SettingsRecord` (D7). **No key material.**

Bump `DB_VERSION` to `4`; add both `contains`-guarded creations in the single `onupgradeneeded`. Because every creation is `contains`-guarded and additive, a v3→v4 upgrade **preserves** identity + sent-links + contacts and only creates the two new stores. Update the top-of-file comment. **Migration test (Task 1)** opens the DB at v3, writes an identity + a sent-link + a contact, closes, re-opens through the app path (v4), asserts all three prior rows survive AND both new stores exist + round-trip a `{ id }`-keyed record.

### D4. Backup FILE FORMAT — byte-identical to mobile (`2026-06-03-mobile-backup-export-import-design.md`)

The backup file is the **`WrappedKey` JSON envelope** produced by the **same crypto call mobile makes** — nothing more:

- **Export** = `wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS)` ([`export-backup.ts:35-42`](../../../apps/mobile/src/keys/export-backup.ts), spec "Export file wrap … MUST use `DEFAULT_WRAP_KDF_PARAMS`"). `DEFAULT_WRAP_KDF_PARAMS = { mKib: 65536, t: 3, p: 1 }` (64 MiB / t=3, [`packages/crypto/src/wrap.ts:38`](../../../packages/crypto/src/wrap.ts)). The returned branded string **is** the file body.
- **Envelope shape** ([`wrap.ts:93-104`](../../../packages/crypto/src/wrap.ts)): `{ v:1, kdf:"argon2id-aes256gcm", m_kib:65536, t:3, p:1, salt, iv, ct, pub }` — all base64url; `ct` is the AES-256-GCM-sealed 32-byte X25519 private key, `pub` the raw public key.
- **Import** = `unwrapPrivateKey(wrapped, passphrase)` ([`import-backup.ts:32-42`](../../../apps/mobile/src/onboarding/import-backup.ts)). It **reads the KDF params back out of the envelope** ([`wrap.ts:181-186`](../../../packages/crypto/src/wrap.ts)), so restore needs **no params argument** and a mobile backup (heavy params) opens on web unchanged.
- **Filename:** `aesmsg-identity-backup.aesmsg` — the exact mobile constant `BACKUP_FILENAME` ([`export-backup.ts:20`](../../../apps/mobile/src/keys/export-backup.ts)). **MIME `application/octet-stream`** (the body is ciphertext, [`export-backup.ts:112`](../../../apps/mobile/src/keys/export-backup.ts)).
- **CONTENTS — exactly what mobile includes, pinned:** the **single ACTIVE identity keypair only** (its private key, wrapped). **NOT** contacts, **NOT** sent-links, **NOT** retired keys, **NOT** settings, **NO** metadata/preview. `buildBackup(identity, passphrase)` wraps only the passed `IdentityKeypair` ([`export-backup.ts:35-42`](../../../apps/mobile/src/keys/export-backup.ts)); the spec explicitly excludes "backup-contents preview" and multi-identity backups. A backup exported **after** a rotation therefore holds only the **new active** key — retired keys are device-local and are lost on restore (mobile parity; note it, do not "fix" it).

Because both surfaces call the identical `@aesmsg/crypto` functions with `DEFAULT_WRAP_KDF_PARAMS`, format parity is **by construction**; Task 9 proves it with a fixture round-trip **both directions**.

### D5. Backup EXPORT on web — login-passphrase re-prompt, Blob download, zero network

Export lives on the **`/identity` (Keys) screen** — mobile parity: export + rotate live in the Keys tab ([`KeysFlow.tsx:27-49`](../../../apps/mobile/src/keys/KeysFlow.tsx)); the web `/identity` route is the "Keys" nav destination ([`nav-items.ts:18`](../../../apps/webapp/src/app-shell/nav-items.ts)). Flow:

1. **Explicit passphrase re-prompt** (spec §5). Verify by `unwrapPrivateKey(stored.wrapped, passphrase)`; `BadPassphraseError` → calm inline error, **no file produced**. (On web the login passphrase **is** the backup passphrase — the resulting FILE is byte-format-identical regardless, which is all interop requires; mobile's separately-chosen backup passphrase + strength meter exists only because its at-rest wrap is a device secret, not a passphrase — not applicable here.)
2. `buildBackup(identity, passphrase)` → `wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS)` (fresh random salt/iv, so the file differs byte-wise from the stored envelope but is the same format + opens with the same passphrase).
3. **Browser download, zero network:** `new Blob([contents], { type: "application/octet-stream" })` → `URL.createObjectURL` → a synthetic `<a download="aesmsg-identity-backup.aesmsg">` click → `URL.revokeObjectURL` in a `finally`/`setTimeout(0)`. **No `fetch`, no upload** — assert this in the test.
4. Success + reassurance copy (verbatim-adapted from [`ExportBackupScreen.tsx:91-104`](../../../apps/mobile/src/keys/ExportBackupScreen.tsx) + backup spec §Copy): "Your backup is encrypted with a passphrase only you know. Without it, the file is useless." / "This is the only way a key leaves your device — and only in encrypted form. Store the passphrase somewhere safe; we can't recover it." No "unbreakable"/"military-grade"/"forgot passphrase"/cloud-restore (backup-spec DO-NOT list).

### D6. Backup IMPORT on web — onboarding-only, no-recovery, wipe-first if an identity exists

Import mirrors mobile's guard exactly: **only valid from `no_identity`** — a restore can never silently overwrite an existing (otherwise-unrecoverable) identity ([`identity-machine.ts:161-166`](../../../apps/mobile/src/identity/identity-machine.ts): `importIdentity` throws unless `status === "no_identity"`). Pinned:

- **Entry points** (both reach `no_identity` state): the **onboarding** flow gains an "Import a backup instead" path, and the reader **`NoIdentityScreen`** note ("Already have a key backup? …", currently dead copy at [`src/screens/reader/NoIdentityScreen.tsx:46-49`](../../../apps/webapp/src/screens/reader/NoIdentityScreen.tsx)) links to it.
- **Flow:** `<input type="file" accept=".aesmsg,application/octet-stream">` → read text (`file.text()`) → passphrase prompt → `restoreIdentity(contents, passphrase)` (`unwrapPrivateKey`, [`import-backup.ts:32-42`](../../../apps/mobile/src/onboarding/import-backup.ts)) → on `ok`, adopt the imported envelope as this device's identity: `saveIdentity({ id:"primary", wrapped: importedEnvelope, publicKeyString: exportPublicKey(id), createdAt: now, schemaVersion:1 })` + hold the keypair in memory (`unlocked`) + `navigator.storage.persist()`. **Adopt the envelope verbatim** (it is already `DEFAULT_WRAP_KDF_PARAMS`, the web's at-rest params) — the import passphrase becomes the ongoing login passphrase; **no re-wrap**.
- **Errors (terminal, no recovery — spec §5 + backup-spec §Error handling):** `restoreIdentity` returns `{ ok:false, reason:"bad-passphrase" | "invalid-file" }` (`BadPassphraseError` → bad-passphrase; `InvalidFormatError`/anything else → invalid-file). `bad-passphrase` → calm inline "That passphrase didn't unlock this backup. No backup data is recoverable without it." — **no "forgot passphrase", no attempt counter, no fallback.** `invalid-file` → "This isn't a valid backup file." **Never crash.**
- **When an identity already exists** (`locked`/`unlocked`): import is **not offered**; the UI directs to **wipe-first** (mirrors mobile's Home note "restoring a backup replaces the current identity … points to Wipe," backup-spec §"Home Import backup tile"). No destructive auto-flow.

### D7. Security settings — web subset of the mobile `SettingsRecord`, persisted in IndexedDB (NO key material)

The mobile `SettingsRecord` ([`settings-format.ts:84-124`](../../../apps/mobile/src/settings/settings-format.ts)) carries device-only concerns; the web keeps the **actionable subset** and drops what is native-only or inherent:

| Mobile field | Web disposition |
|---|---|
| `clipboardClearSeconds` (10–90, default **45**) | **Kept** — wired into the reader hook (D8). |
| `appLockTimeout` (`never`/`1m`/`5m`/`15m`/`1h`, default `never`) | **Kept** — drives a web idle/visibility auto-lock calling the existing `lock()` (D8). |
| `biometric`, `requireUnlock` | **Dropped** — web has no biometrics; the passphrase re-prompt IS the gate. |
| `blurPreview` | **Inherent** — the reader already blurs on `visibilitychange` (`use-privacy-shield.ts`); no toggle, no key material. |
| `blockScreens` | **Impossible on web** — surfaced as the honest gap, not a toggle (D9). |
| `autoWipe` | **Inherent** — decrypted plaintext is memory-only + dropped on close ([`SecureReaderScreen.tsx:10-14`](../../../apps/webapp/src/screens/reader/SecureReaderScreen.tsx)); no toggle. |
| `analytics` | **Dropped** — `app.aesmsg.com` ships no analytics (§3). |

Pinned web `SettingsRecord` (`src/settings/settings-format.ts`, ported validators): `{ clipboardClearSeconds: number; appLockTimeout: AppLockTimeout; schemaVersion: 1; createdAt: number; updatedAt: number }`. Port `CLIPBOARD_CLEAR_MIN_SECONDS=10`/`MAX=90`/`clampClipboardSeconds`/`formatClipboardClear`, `AppLockTimeout`/`APP_LOCK_TIMEOUT_OPTIONS`/`appLockTimeoutMs`, and a **fail-soft** `validateSettings`/`migrateSettings` (a missing/corrupt blob → defaults, **never throws**, [`settings-store.ts:21-35`](../../../apps/mobile/src/settings/settings-store.ts)). Persist as a single `settings`-store blob (D3); `SettingsProvider` mirrors [`settings-context.tsx`](../../../apps/mobile/src/settings/settings-context.tsx) (load once, optimistic `update(patch)` + fire-and-forget persist). **The record holds no key material** — asserted in the test (`JSON.stringify` contains only the pinned keys).

### D8. Clipboard duration + app-lock are WIRED, not decorative

- **Clipboard auto-clear:** `SecureReaderScreen` currently hardcodes `CLIPBOARD_CLEAR_MS = 45_000` ([`SecureReaderScreen.tsx:19`](../../../apps/webapp/src/screens/reader/SecureReaderScreen.tsx)). Wire it to `settings.clipboardClearSeconds * 1000` via `useClipboardAutoClear(delayMs)` ([`use-clipboard-auto-clear.ts:17`](../../../apps/webapp/src/reader/use-clipboard-auto-clear.ts)) — mobile parity ([`ReaderScreen.tsx:41`](../../../apps/mobile/src/reader/ReaderScreen.tsx): `useClipboardAutoClear(settings.clipboardClearSeconds * 1000)`). The reader reads it from `SettingsProvider`. The web hook's **verified-clear** honesty (reads back before clearing; says "Copied" when `readText` is unavailable) is unchanged.
- **App-lock / lock-now:** mobile has an app-lock timeout ([`settings-format.ts:134-138`](../../../apps/mobile/src/settings/settings-format.ts) → identity auto-lock). Add a small `useAutoLock(timeoutMs)` hook that calls the existing identity `lock()` after `appLockTimeoutMs(setting)` of inactivity (reset on pointer/keydown/visibility), replacing the SP1 `// TODO(SP2+)` auto-lock stub ([`identity-context.tsx:102-104`](../../../apps/webapp/src/identity/identity-context.tsx)), plus a **"Lock now"** action on `/settings` (and the existing `/identity` "Lock identity" stays). `never` → no timer.

### D9. Honest web-tier disclosure on `/settings` (spec §3) — required copy + link

`/settings` carries a first-class, calm disclosure card (spec §3, §6.5): the **native app offers stronger delivery guarantees** — **signed builds** (code arrives as a signed binary, not a page load), a **biometric gate** on every open, and **screenshot blocking** — with a **link to it** (`process.env.NEXT_PUBLIC_AESMSG_SITE_ORIGIN ?? "https://aesmsg.com"`, the same origin the reader uses, [`NoIdentityScreen.tsx:13`](../../../apps/webapp/src/screens/reader/NoIdentityScreen.tsx)). State the **screenshot-blocking gap** plainly ("Screenshot blocking is not possible in a browser — the native app enforces it."). **Never** claim web ≡ native; **never** "unbreakable"/"military-grade". Tone: amber/neutral informational, **not** red (ambient state).

### D10. Wipe on web — revoke-before-wipe, then a full LOCAL purge (mobile parity)

Wiping destroys the private key **and** the per-link revocation tokens (stored cleartext in `sent-links`, [`sent-links-store.ts:13-18`](../../../apps/webapp/src/links/sent-links-store.ts)). Mobile guards this with **revoke-before-wipe** ([`wipe-orchestration.ts`](../../../apps/mobile/src/settings/wipe-orchestration.ts) + `identity-machine.wipe` purging keys + retired + all blobs, [`identity-machine.ts:229-245`](../../../apps/mobile/src/identity/identity-machine.ts)). Port a `src/settings/wipe-local.ts` orchestration:

1. **Best-effort revoke** every still-live tracked link first (`selectLiveTrackedLinks(records, now)` → `revokeLink(id, token)`; a 404/410 counts as success, [`wipe-orchestration.ts:83-100`](../../../apps/mobile/src/settings/wipe-orchestration.ts)); on genuine failures (offline/5xx) require an explicit "wipe anyway — these links stay live and unrevokable" acknowledgement (a simplified `confirmProceedDespiteFailures`).
2. Then **purge ALL local stores** (clean slate, mobile `wipeStorage` parity): delete the `identity` row, `clear()` the `retired-keys`, `settings`, `sent-links`, and `contacts` stores, and drop the in-memory keypair (identity → `no_identity`). Extend the identity context `wipe()` to also clear the `retired-keys` store (**required** — a surviving retired key would violate irreversibility).

Both the existing `/identity` Danger Zone ([`IdentityScreen.tsx:120-138`](../../../apps/webapp/src/screens/IdentityScreen.tsx)) and the new `/settings` Danger Zone (per [`security_settings_aesmsg_2`](../../../all_design_screens/security_settings_aesmsg_2/code.html)) call `wipe-local.ts` via the existing `WipeConfirmDialog`. Copy stays red/destructive and honest ("Permanently delete this identity from this device. All encrypted messages will be lost forever."). **No server-side account deletion** — the mockups' "Delete Account / terminate server-side identity" is native-account copy with **no web analogue** (there is no account; only per-link revocation) — omit it, do not stub.

### D11. Attachments — payload-format parity, FREE-tier cap, budget math, NO new dependency

- **Payload format:** `encodePayload({ text, attachments })` already encodes attachments (u16 name-len, u16 mime-len, u32 content-len, inside the AEAD-sealed v0x02 envelope, [`packages/crypto/src/payload.ts:14-30`](../../../packages/crypto/src/payload.ts)). `PayloadAttachment = { filename, mimetype, bytes }`. `create-and-seal.ts` already threads `attachments` into `encodePayload` — SP2 hardcodes `[]` ([`create-and-seal.ts:73`](../../../apps/webapp/src/create/create-and-seal.ts): "SP5 will feed a non-empty array"). This SP feeds the real array; **the seal sequence is otherwise byte-identical** (the empty-vs-nonempty array is the only change).
- **Cardinality:** **single attachment** (mobile compose is single: `attachment: ComposeAttachment | null`, [`ComposeScreen.tsx` (mobile):54,92](../../../apps/mobile/src/create/ComposeScreen.tsx)). A message with only an attachment and no text is valid (mobile submit gate `message.trim().length > 0 || attachment !== null`).
- **Client-side size cap = FREE tier, 10 MiB.** Port [`pick-attachment.ts`](../../../apps/mobile/src/create/pick-attachment.ts) (`validateAttachmentSize`, `formatSize`, `ComposeAttachment`); the cap is `FREE_ATTACHMENT_BYTES = 10 * 1024 * 1024` ([`entitlements.ts:10`](../../../apps/mobile/src/pro/entitlements.ts)). **aesmsg Pro is deferred on web (§8), so there is NO 25 MiB PRO path** — the web cap is the FREE cap, full stop.
- **Budget math (derived from the real `apps/api` caps — [`messages-handler.ts:46-48`](../../../apps/api/src/handlers/messages-handler.ts)):**
  - Caps: `MIN_CIPHERTEXT_BYTES = 32`, `MAX_CIPHERTEXT_BYTES = 26 MiB`, `MAX_BODY_BYTES = 37 MiB`.
  - Upload body = JSON `{ id, ciphertext: base64(ct), expiresAt, maxOpens }` ([`create-and-seal.ts:82-88`](../../../apps/webapp/src/create/create-and-seal.ts)). base64 expands N bytes → ~1.334·N; the JSON scaffold is <120 B. Body-limit ⇒ ct ≤ 37 MiB × ¾ ≈ **27.7 MiB**; the **ciphertext-limit (26 MiB) binds** (stricter).
  - Ciphertext (seal wire) = plaintext_padded + **50 B** (2 header + 32 encapsulated key + 16 GCM tag, [`pad.ts:3-6`](../../../packages/crypto/src/pad.ts)) ⇒ plaintext_padded ≤ 26 MiB − 50.
  - plaintext_padded = `targetPaddedLen(raw + 4)`; Padmé caps overhead ≤ ~12% above 4 KiB and at ~10 MiB pads to the next 256 KiB (`blockSize = 2^18`), i.e. **≤ ~0.25 MiB** ([`pad.ts:26-34`](../../../packages/crypto/src/pad.ts)).
  - Envelope framing per attachment ≈ 8 B + |name| + |mime| (tens of bytes) — negligible.
  - **A single 10 MiB attachment** ⇒ raw ≈ 10 MiB ⇒ plaintext_padded ≈ **10.25 MiB** ⇒ ct ≈ **10.25 MiB ≤ 26 MiB ✓** ⇒ body ≈ 10.25 × 1.334 ≈ **13.7 MiB ≤ 37 MiB ✓**. Comfortable headroom; the 10 MiB FREE cap is conservative and interop-safe. (The mobile cap comment still cites the historical 14 MiB ciphertext limit; the current 26 MiB API cap leaves even more room — no cap change needed, parity is the point.)
- **No new dependency:** the file picker is a native `<input type="file">`; the reader download is `Blob` + `URL.createObjectURL` + `<a download>`. No npm package (unlike SP4's QR libs).

### D12. Reader attachment download — Blob, memory-only, no network, replacing SP3's notice

The web has no filesystem cache, so mobile's `attachment-cache.ts` (write-to-cache → share → wipe-on-leave) becomes a **Blob object-URL download** — the pattern [`attachment-cache.ts:46`](../../../apps/mobile/src/reader/attachment-cache.ts) references as "the web DecryptedScreen, which pushes to objectUrls.current BEFORE the download handoff." Pinned:

- Replace SP3's amber "Saving attachments in the browser isn't supported yet" notice ([`SecureReaderScreen.tsx:78-91`](../../../apps/webapp/src/screens/reader/SecureReaderScreen.tsx)) with a real **download control per attachment**: `new Blob([att.bytes], { type: att.mimetype })` → `URL.createObjectURL` → **push the URL into an `objectUrls` ref BEFORE** the `<a download={att.filename}>` handoff (track-before-handoff, mirroring mobile's track-before-share) → **revoke every tracked URL on unmount/close** so no decrypted bytes linger.
- **Memory-only, zero network, dropped on close** — the decrypted bytes never touch storage/URL/history/cache; leaving the reader (`onDone` → `URL.revokeObjectURL` all) drops them (D6-parity of the reader).
- `SecureReaderScreen` already **receives** `attachments: PayloadAttachment[]` from `open-and-decrypt` — only the rendering changes (download instead of notice); no reader-flow change beyond the key-fallback of Task 6.

### D13. Routing, gating, CSP, design/copy conventions (unchanged from SP1–SP4)

- **Routing:** `/settings` and `/identity` are **existing static routes** — no new route, no dynamic `[id]`, no `next.config` rewrite; **no `docs/deploy.md` change** (D-note in Task 17). The onboarding import path is a state within the existing `/onboarding` route.
- **Gating:** `/identity` (rotate + export) and `/settings` are `RequireUnlocked` + `AppShell` ([`RequireUnlocked.tsx`](../../../apps/webapp/src/components/RequireUnlocked.tsx)) — a rotate/export/settings action requires the unlocked identity. The **import** path is reached from `no_identity` (onboarding / reader `NoIdentityScreen`), **outside** `RequireUnlocked` (a fresh browser has no identity), mirroring SP3's reader gating.
- **CSP:** the Blob-download (`URL.createObjectURL` + `a[download]`) and the file `<input>` are local; camera/QR in SP4 needed **no CSP change**, and a download is not a fetch/navigation governed by `default-src`/`connect-src`. **Expect no CSP change**; Task 17 re-runs `check:csp` to prove **zero** `securitypolicyviolation`, and if one appears the minimal documented fix is `blob:` on the offending directive — but it is not anticipated.
- **Design/copy** ([`apps/webapp/AGENTS.md`](../../../apps/webapp/AGENTS.md)): no `.js` import extensions; token utilities only (`bg-surface-container`, `text-on-surface`, `text-primary`, `border-outline-variant`, `text-error`, `text-success`, `text-warning`); **`font-mono` ONLY for fingerprints / public keys / secure links** — never filenames, passphrases, or body copy. Color semantics: **green** = verified/decrypted/safe, **amber** = rotation caution / verify-required / expiring, **red** = destructive only (wipe). Rotation is **amber**, wipe is **red** (D1). Reuse `PasswordField`, `PrimaryButton`, `FingerprintBlock`, `QrCode`, `WipeConfirmDialog`, `MaterialIcon`.

---

## File-structure target

After this plan completes (⊕ = modified from a prior SP):

```
apps/webapp/
├─ src/
│  ├─ identity/
│  │  ├─ db.ts                          ⊕ Task 1  (DB v4: + RETIRED_STORE + SETTINGS_STORE)
│  │  ├─ identity-bundle.ts                Task 2  (RetiredKeyEntry + list transforms — mobile port)
│  │  ├─ retired-keys-store.ts             Task 2  (load/save/clear over withStore(RETIRED_STORE))
│  │  ├─ decrypt-keys.ts                   Task 3  (allPrivateKeysForDecrypt + decryptWithKeyFallback)
│  │  └─ identity-context.tsx           ⊕ Task 4  (retired-key retention, rotate(passphrase), wipe clears retired)
│  ├─ reader/
│  │  └─ open-and-decrypt.ts            ⊕ Task 6  (key-set fallback; drop the "single key" note)
│  ├─ keys/
│  │  └─ export-backup.ts                  Task 7  (buildBackup + downloadBackup — mobile format)
│  ├─ onboarding/
│  │  └─ import-backup.ts                  Task 8  (restoreIdentity + readBackupFile — mobile port)
│  ├─ settings/
│  │  ├─ settings-format.ts                Task 10 (web SettingsRecord subset + validators)
│  │  ├─ settings-store.ts                 Task 10 (load/save over withStore(SETTINGS_STORE))
│  │  ├─ settings-context.tsx              Task 10 (SettingsProvider — load once + optimistic update)
│  │  ├─ use-auto-lock.ts                  Task 12 (idle/visibility → lock())
│  │  └─ wipe-local.ts                     Task 13 (revoke-before-wipe + full local purge)
│  ├─ create/
│  │  ├─ pick-attachment.ts                Task 14 (validateAttachmentSize FREE cap, ComposeAttachment)
│  │  └─ create-and-seal.ts             ⊕ Task 14 (accept + seal a single attachment)
│  └─ screens/
│     ├─ RotateKeyScreen.tsx               Task 5  (confirm + passphrase re-prompt; amber)
│     ├─ RotateSuccessScreen.tsx           Task 5  (new fingerprint + QR + re-verify copy)
│     ├─ ExportBackupScreen.tsx            Task 7
│     ├─ ImportBackupScreen.tsx            Task 8
│     ├─ SecuritySettingsScreen.tsx        Task 11
│     ├─ IdentityScreen.tsx             ⊕ Task 5/7 (rotate + export entry points; backup nudge)
│     ├─ SetPassphraseScreen.tsx        ⊕ Task 8/16 (import link; remove dead backup copy)
│     ├─ ComposeScreen.tsx             ⊕ Task 14 (attachment picker UI)
│     └─ reader/
│        ├─ SecureReaderScreen.tsx      ⊕ Task 15 (Blob download replaces the notice; wire clipboard duration D8)
│        ├─ ReaderFlowScreen.tsx        ⊕ Task 6  (pass the key set to openAndDecrypt)
│        └─ NoIdentityScreen.tsx        ⊕ Task 8  (real import link replaces "coming soon")
├─ app/
│  ├─ onboarding/page.tsx               ⊕ Task 8  (create | import chooser)
│  └─ settings/page.tsx                 ⊕ Task 11 (replace placeholder; RequireUnlocked + AppShell)
├─ AGENTS.md                            ⊕ Task 16
└─ tests/
   ├─ identity/db.test.ts              ⊕ Task 1  (v3→v4 preserves identity+sent-links+contacts; new stores)
   ├─ identity/identity-bundle.test.ts    Task 2
   ├─ identity/retired-keys-store.test.ts Task 2
   ├─ identity/decrypt-keys.test.ts       Task 3
   ├─ identity/rotation.test.tsx          Task 4  (rotate retains old key; wrong passphrase aborts; wipe clears retired)
   ├─ reader/open-and-decrypt.test.ts  ⊕ Task 6  (legacy link opens via retired key after rotation)
   ├─ keys/export-backup.test.ts          Task 7  (heavy params; Blob download; zero-network)
   ├─ onboarding/import-backup.test.ts    Task 8  (bad-passphrase/invalid-file; guard from no_identity)
   ├─ keys/backup-parity.test.ts          Task 9  (mobile↔web fixture round-trip, both directions)
   ├─ settings/settings-format.test.ts    Task 10
   ├─ settings/settings-store.test.ts     Task 10 (no key material)
   ├─ settings/wipe-local.test.ts         Task 13 (revoke-before-wipe; full purge)
   ├─ create/pick-attachment.test.ts      Task 14 (10 MiB cap; format)
   ├─ create/create-and-seal.test.ts   ⊕ Task 14 (attachment seal + mobile-encoded fixture round-trip)
   ├─ screens/RotateKeyScreen.test.tsx    Task 5
   ├─ screens/ExportBackupScreen.test.tsx Task 7
   ├─ screens/ImportBackupScreen.test.tsx Task 8
   ├─ screens/SecuritySettingsScreen.test.tsx Task 11
   ├─ screens/ComposeScreen.test.tsx   ⊕ Task 14 (attachment picked → sealed; over-cap rejected)
   └─ screens/reader/SecureReaderScreen.test.tsx ⊕ Task 15 (Blob download; object-URL revoked on close)
```

Visual sources of truth (do **not** author new mockups): [`security_settings_aesmsg_1`](../../../all_design_screens/security_settings_aesmsg_1/code.html) + [`security_settings_aesmsg_2`](../../../all_design_screens/security_settings_aesmsg_2/code.html) (settings: device security, clipboard, key management, rotate, export, danger zone) and [`my_security_keys_aesmsg`](../../../all_design_screens/my_security_keys_aesmsg/code.html) (identity/keys: fingerprint, export backup, danger zone). The mockups say "RSA-4096 / password-protected JSON / institutional-grade / server-side identity" — **ignore the legacy-crypto + server-account copy**; aesmsg is HPKE(X25519)+AES-256-GCM, the backup is a `.aesmsg` `WrappedKey` envelope, and there is **no server-side account** (only per-link revocation). Reader affordances follow [`secure_reader_aesmsg`](../../../all_design_screens/secure_reader_aesmsg/code.html) + [`create_secure_message`](../../../all_design_screens/create_secure_message_aesmsg/code.html) for the attachment control.

---

# PHASE 1 — Multi-key identity + rotation (retain old keys)

## Task 1: IndexedDB v4 — add `retired-keys` + `settings` stores (D3)

**Files:** Modify [`src/identity/db.ts`](../../../apps/webapp/src/identity/db.ts); modify `tests/identity/db.test.ts`.

- [ ] **Step 1** — bump `DB_VERSION` to `4`; add `export const RETIRED_STORE = "retired-keys";` and `export const SETTINGS_STORE = "settings";`. In `onupgradeneeded`, add two more `contains`-guarded `createObjectStore(…, { keyPath: "id" })` alongside the existing three. Update the top-of-file comment ("v2 adds sent-links; v3 adds contacts; v4 adds retired-keys + settings").
- [ ] **Step 2: Migration test** — extend `tests/identity/db.test.ts`: open at **v3** (raw `indexedDB.open(DB_NAME, 3)`), write an `identity` + a `sent-links` + a `contacts` row, close; re-open through the app path (v4); assert **all three prior rows survive** AND `RETIRED_STORE` + `SETTINGS_STORE` exist and each round-trips a `{ id:"primary" }`-keyed record. Reuse `__deleteDbForTests`/`__resetDbForTests`.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- identity/db`; `pnpm --filter @aesmsg/webapp typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): IndexedDB v4 retired-keys + settings stores (additive, migration-safe)`.

## Task 2: `identity-bundle.ts` + `retired-keys-store.ts` (mirror mobile)

**Files:** Create `src/identity/identity-bundle.ts`, `src/identity/retired-keys-store.ts`; create their tests.

- [ ] **Step 1: `identity-bundle.ts`** — port [`identity-bundle.ts` (mobile)](../../../apps/mobile/src/identity/identity-bundle.ts) verbatim: `RetiredKeyEntry = { wrapped: WrappedKey; publicKeyString: PublicKeyString; fingerprint: string; retiredAtMs: number }`; versioned blob `{ v:1, keys: RetiredKeyEntry[] }`; `serializeRetiredKeys`, tolerant `parseRetiredKeys` (null/malformed/unknown-version → `[]`, drop bad entries, dedupe), `dedupeRetired` (first/newest wins), `prependRetired` (KEEP-INDEFINITELY), `retiredExcludingActive`. Pure — no crypto, no storage.
- [ ] **Step 2: `retired-keys-store.ts`** — `loadRetiredEntries(): Promise<RetiredKeyEntry[]>` / `saveRetiredEntries(entries)` / `clearRetiredEntries()` over `withStore(RETIRED_STORE, …)` (one `id:"primary"` blob holding `{ entries }`), fail-soft on read (corrupt/missing → `[]`, mirroring `parseRetiredKeys`).
- [ ] **Step 3: Tests** — `parseRetiredKeys` tolerance table; `prependRetired`/`dedupeRetired`/`retiredExcludingActive` semantics; store round-trip + fail-soft on a corrupt blob. Use real keys from `exportPublicKey(await generateIdentity())`.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- identity/identity-bundle identity/retired-keys-store`; `typecheck`.
- [ ] **Step 5: Commit** — `feat(webapp): multi-key identity — retired-key model + store (mobile parity)`.

## Task 3: `decrypt-keys.ts` — decrypt fallback (mirror mobile)

**Files:** Create `src/identity/decrypt-keys.ts`, `tests/identity/decrypt-keys.test.ts`.

- [ ] **Step 1** — port [`decrypt-keys.ts` (mobile)](../../../apps/mobile/src/identity/decrypt-keys.ts): `allPrivateKeysForDecrypt(active, retired) → [active, ...retired]` and `decryptWithKeyFallback<T>(keys, attempt)` — try each key in order, advance only on `DecryptionError`, **rethrow any other error immediately** (a non-decryption error can only come from a key that already decrypted), and throw the final `DecryptionError` when all fail. (Adapt the input to the web identity-context shape — a plain ordered `IdentityKeypair[]` — rather than the mobile `IdentityState`.)
- [ ] **Step 2: Tests** — first key succeeds → its result; first fails `DecryptionError`, second succeeds → second's result; all fail → `DecryptionError`; a non-`DecryptionError` from a key is rethrown immediately (no further keys tried). Build real "wrong key" cases by sealing to key A and attempting `[B, A]`.
- [ ] **Step 3: Verify** — `pnpm --filter @aesmsg/webapp test -- identity/decrypt-keys`; `typecheck`.
- [ ] **Step 4: Commit** — `feat(webapp): decrypt key-fallback over active + retired keys (mobile parity)`.

## Task 4: identity-context — retired-key retention + `rotate(passphrase)` + wipe (D1/D2)

**Files:** Modify [`src/identity/identity-context.tsx`](../../../apps/webapp/src/identity/identity-context.tsx); create `tests/identity/rotation.test.tsx`.

- [ ] **Step 1: retained retired keypairs in memory** — hold a `retiredKeypairs: IdentityKeypair[]` ref/state alongside the active `identity`. Extend `unlock(passphrase)`: after unwrapping the active key, load `loadRetiredEntries()`, run `retiredExcludingActive(entries, activePublicKeyString)`, and `unwrapPrivateKey(entry.wrapped, passphrase)` each — **best-effort per entry** (a failed entry is skipped, never fails the unlock; the active key is the priority — [`identity-machine.ts:186-195`](../../../apps/mobile/src/identity/identity-machine.ts)). Expose `getAllPrivateKeysForDecrypt(): IdentityKeypair[]` (`allPrivateKeysForDecrypt`, empty unless unlocked). `lock()` drops the retired keypairs too.
- [ ] **Step 2: `rotate(passphrase): Promise<PublicKeyString>`** (D2) — verify `passphrase` via `unwrapPrivateKey(stored.wrapped, passphrase)` (`BadPassphraseError` → throw a typed `WrongPassphraseError`, identity untouched); build the retired entry from the **existing stored `wrapped`** + `publicKeyString` + `await fingerprint(publicKeyString)` + `retiredAtMs: Date.now()`; `generateIdentity()` + `wrapPrivateKey(new, passphrase, DEFAULT_WRAP_KDF_PARAMS)`; in **one `readwrite` transaction over `[IDENTITY_STORE, RETIRED_STORE]`** `put` the new `StoredIdentity` **and** the `prependRetired`-ed blob (atomic — comment the "fully rotated OR unchanged" equivalence to mobile's two-phase ordering, D2). Update in-memory state (new active + old prepended to retired). Guard the epoch race exactly like SP1's `unlock`/`wipe` ([`identity-context.tsx:76-79`](../../../apps/webapp/src/identity/identity-context.tsx)). Return the new `publicKeyString`.
- [ ] **Step 3: `wipe()`** — extend to `clearRetiredEntries()` (required — irreversibility). (The full multi-store purge lands in Task 13's `wipe-local.ts`; this step guarantees the identity context's own `wipe()` never leaves a retired key behind.)
- [ ] **Step 4: Tests** (`rotation.test.tsx`, browser-mode with a mounted provider) — (a) create identity, seal a message to the **old** public key, `rotate(correct-passphrase)` → the returned key differs, `publicKeyString` is the new one, and `getAllPrivateKeysForDecrypt()` still opens the old-key message; (b) `rotate(wrong-passphrase)` throws `WrongPassphraseError` and leaves the identity + stored envelope **unchanged**; (c) after `wipe()`, `loadRetiredEntries()` is empty and state is `no_identity`; (d) INVARIANT: storage only ever holds `WrappedKey` envelopes — never a raw keypair (re-use SP1's assertion).
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- identity/rotation identity/identity-context`; `typecheck`.
- [ ] **Step 6: Commit** — `feat(webapp): key rotation retaining old keys + retired-key unlock (mobile semantics)`.

## Task 5: Rotate UI on `/identity` (per `my_security_keys` / `security_settings`)

**Files:** Create `src/screens/RotateKeyScreen.tsx`, `src/screens/RotateSuccessScreen.tsx`; modify [`src/screens/IdentityScreen.tsx`](../../../apps/webapp/src/screens/IdentityScreen.tsx); create `tests/screens/RotateKeyScreen.test.tsx`.

- [ ] **Step 1: `RotateKeyScreen.tsx`** (`"use client"`) — an **amber** confirm (mirror [`RotateKeyScreen.tsx` (mobile)](../../../apps/mobile/src/keys/RotateKeyScreen.tsx)): current fingerprint (mono), the honest caution — "Your contacts will need to re-verify your new fingerprint … Your saved contacts stay as they are" — and the emerald reassurance "Messages already sent to your old key can still be opened." A `PasswordField` for the passphrase re-prompt (D2), a **"Rotate key"** amber primary (busy → "Rotating…"), and Cancel. On submit call `rotate(passphrase)`; `WrongPassphraseError` → inline "That passphrase didn't match." (identity untouched); success → the success screen.
- [ ] **Step 2: `RotateSuccessScreen.tsx`** — mirror [`RotateSuccessScreen.tsx` (mobile)](../../../apps/mobile/src/keys/RotateSuccessScreen.tsx): the **new** public key as a `<QrCode>` + the derived new `AM-` fingerprint (`FingerprintBlock`), an amber caution "Share this new fingerprint so your contacts can re-verify you — their app will show your key as changed until they do (the check working as intended)," and Copy/Share/Done.
- [ ] **Step 3: `IdentityScreen.tsx`** — add a **"Rotate key"** action (amber, `autorenew` icon) opening `RotateKeyScreen`; on success show `RotateSuccessScreen`. Keep the existing Lock/Wipe. Green ambient states stay green; rotation stays amber; wipe stays red.
- [ ] **Step 4: Tests** — wrong passphrase → inline error + `rotate` rejects + no state change; correct passphrase → success screen shows the **new** fingerprint (differs from the pre-rotation one) and a QR that round-trips to the new `publicKeyString`. Amber (not red) tokens on the confirm/success caution.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/RotateKeyScreen screens/IdentityScreen`; `typecheck`; `pnpm --filter @aesmsg/webapp build`.
- [ ] **Step 6: Commit** — `feat(webapp): rotate-key confirm + success screens on the identity screen`.

## Task 6: Reader key-fallback — open through active + retired keys (D1)

**Files:** Modify [`src/reader/open-and-decrypt.ts`](../../../apps/webapp/src/reader/open-and-decrypt.ts); modify [`src/screens/reader/ReaderFlowScreen.tsx`](../../../apps/webapp/src/screens/reader/ReaderFlowScreen.tsx); modify `tests/reader/open-and-decrypt.test.ts`.

- [ ] **Step 1: `open-and-decrypt.ts`** — change the signature to accept the **ordered key set** (`keys: IdentityKeypair[]`, active first) instead of a single `identity`. The single `openMessage(id)` POST stays exactly once (zero-network-before-action, single-open guarantee unchanged); after fetching the response, wrap the local `open()` + `decodePayload()` in `decryptWithKeyFallback(keys, (key) => …)` — each retried key re-derives its own AAD from **its own** public key (`exportPublicKey(key)`), rebuilding the exact legacy binding it was sealed under (the mobile note, [`decrypt-keys.ts:20-26`](../../../apps/mobile/src/identity/decrypt-keys.ts)). Derive `recipientFingerprint` from the **key that succeeded**. **Delete** the SP3 "Key-rotation fallback … OUT OF SCOPE / single active key" note ([`open-and-decrypt.ts:26-27`](../../../apps/webapp/src/reader/open-and-decrypt.ts)) and replace it with the fallback rationale. A total decryption failure stays terminal (`DecryptionFailed`, no retry).
- [ ] **Step 2: `ReaderFlowScreen.tsx`** — pass `getAllPrivateKeysForDecrypt()` (from the identity context) to `openAndDecrypt` in place of the single `identity` ([`ReaderFlowScreen.tsx:107`](../../../apps/webapp/src/screens/reader/ReaderFlowScreen.tsx)). The identity gate (`identity !== null` before the POST, D3-SP3) is unchanged — the active key must be unlocked first.
- [ ] **Step 3: Tests** — a message sealed to key A opens for a key set `[B(active), A(retired)]`; a message sealed to an unrelated key against `[active, ...retired]` → `DecryptionFailed`; the existing single-active-key path (no retired keys) still opens. Assert **exactly one** `openMessage` POST regardless of how many keys are tried (no extra opens burned by the fallback).
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- reader/open-and-decrypt screens/reader`; `typecheck`; `build`.
- [ ] **Step 5: Commit** — `feat(webapp): reader decrypts legacy links via retired keys after rotation`.

---

# PHASE 2 — Backup export / import

## Task 7: Backup export — `buildBackup` + Blob download on `/identity` (D4/D5)

**Files:** Create `src/keys/export-backup.ts`, `src/screens/ExportBackupScreen.tsx`; modify [`src/screens/IdentityScreen.tsx`](../../../apps/webapp/src/screens/IdentityScreen.tsx); create `tests/keys/export-backup.test.ts`, `tests/screens/ExportBackupScreen.test.tsx`.

- [ ] **Step 1: `export-backup.ts`** — `BACKUP_FILENAME = "aesmsg-identity-backup.aesmsg"` (the mobile constant, D4); `buildBackup(identity, passphrase): Promise<{ filename; contents }>` = `wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS)` as `contents` ([`export-backup.ts:35-42`](../../../apps/mobile/src/keys/export-backup.ts)); `downloadBackup({ filename, contents }): void` = `new Blob([contents], { type: "application/octet-stream" })` → `URL.createObjectURL` → synthetic `a[download]` click → `URL.revokeObjectURL` (deferred). Never logs the key; **zero network**.
- [ ] **Step 2: `ExportBackupScreen.tsx`** (`"use client"`) — a single `PasswordField` **passphrase re-prompt** (D5) + the reassurance/caution copy (D5). On submit: `unwrapPrivateKey(stored.wrapped, passphrase)` verify → `BadPassphraseError` → inline "That passphrase didn't match." (no file); success → `buildBackup(identity, passphrase)` → `downloadBackup(...)` → success sheet ("Encrypted backup ready — share or save this file. Keep the passphrase separate."). Busy state ("Encrypting backup…").
- [ ] **Step 3: `IdentityScreen.tsx`** — add an **"Export backup"** action (`cloud_download`/`ios_share` icon) opening `ExportBackupScreen`; place it near the public-key block (mobile parity: export lives on the Keys screen).
- [ ] **Step 4: Tests** — `buildBackup` produces a parseable `WrappedKey` whose `readWrapKdfParams` returns `DEFAULT_WRAP_KDF_PARAMS` (heavy), and a round-trip `unwrapPrivateKey(contents, passphrase)` recovers the **same** public key; `downloadBackup` creates + revokes an object URL and issues **no** `fetch` (guard `globalThis.fetch`); the screen blocks export on a wrong passphrase and only downloads after verification. Assert the filename is `aesmsg-identity-backup.aesmsg`.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- keys/export-backup screens/ExportBackupScreen`; `typecheck`; `build`.
- [ ] **Step 6: Commit** — `feat(webapp): encrypted backup export in the mobile .aesmsg format (Blob download, zero network)`.

## Task 8: Backup import — onboarding + reader entry, no-recovery (D4/D6)

**Files:** Create `src/onboarding/import-backup.ts`, `src/screens/ImportBackupScreen.tsx`; modify [`app/onboarding/page.tsx`](../../../apps/webapp/app/onboarding/page.tsx), [`src/screens/SetPassphraseScreen.tsx`](../../../apps/webapp/src/screens/SetPassphraseScreen.tsx), [`src/screens/reader/NoIdentityScreen.tsx`](../../../apps/webapp/src/screens/reader/NoIdentityScreen.tsx), [`src/identity/identity-context.tsx`](../../../apps/webapp/src/identity/identity-context.tsx); create `tests/onboarding/import-backup.test.ts`, `tests/screens/ImportBackupScreen.test.tsx`.

- [ ] **Step 1: `import-backup.ts`** — port [`import-backup.ts` (mobile)](../../../apps/mobile/src/onboarding/import-backup.ts): `restoreIdentity(wrapped, passphrase): Promise<{ ok:true; identity } | { ok:false; reason:"bad-passphrase"|"invalid-file" }>` (`unwrapPrivateKey`; `BadPassphraseError`→bad-passphrase; `InvalidFormatError`/other→invalid-file; **never throws**); `readBackupFile(file: File): Promise<string>` = `file.text()`; `formatBackupSize(bytes)` for the selected-file chip.
- [ ] **Step 2: identity-context `importIdentity(identity)`** — add an action guarded to `state === "no_identity"` (throws otherwise, mirroring [`identity-machine.ts:161-166`](../../../apps/mobile/src/identity/identity-machine.ts)). It adopts the imported envelope **verbatim** (D6): but since `restoreIdentity` returns the unwrapped keypair, the screen must also carry the raw envelope string to persist. Simplest: `importIdentity(envelope: WrappedKey, keypair: IdentityKeypair)` → `saveIdentity({ id:"primary", wrapped: envelope, publicKeyString: exportPublicKey(keypair), createdAt: now, schemaVersion:1 })` → `requestPersistentStorage()` → set in-memory keypair → `unlocked`. No re-wrap.
- [ ] **Step 3: `ImportBackupScreen.tsx`** (`"use client"`) — a `<input type="file" accept=".aesmsg,application/octet-stream">` + selected-file chip (`formatBackupSize`) + a `PasswordField` + intro/helper copy ("Restore your identity from an encrypted backup. Your backup is decrypted on this device — nothing is uploaded." / "This passphrase never leaves your device."). On restore: `readBackupFile` → `restoreIdentity` → `ok` → `importIdentity(envelope, identity)` (→ lands unlocked, route to `/identity`); `bad-passphrase` → inline "That passphrase didn't unlock this backup. No backup data is recoverable without it." (**no** forgot-passphrase/attempt-counter); `invalid-file` → "This isn't a valid backup file."
- [ ] **Step 4: Onboarding + reader wiring** — `app/onboarding/page.tsx` (or `SetPassphraseScreen`) gains a secondary **"Import a backup instead"** action → `ImportBackupScreen` (both under the `no_identity` flow). `NoIdentityScreen` — replace the dead "Importing an encrypted backup is coming soon" note ([`NoIdentityScreen.tsx:46-49`](../../../apps/webapp/src/screens/reader/NoIdentityScreen.tsx)) with a real `Link href="/onboarding?import=1"` (or equivalent) to the import path. If an identity already exists (`locked`/`unlocked`), import is **not** offered — direct to wipe-first (D6).
- [ ] **Step 5: Tests** — `restoreIdentity` returns `ok` on the correct passphrase, `bad-passphrase` on wrong, `invalid-file` on malformed JSON / truncated envelope; a web-built backup (Task 7) imports and yields the **same** public key; `importIdentity` from a non-`no_identity` state throws (guard); the screen shows the right inline copy per branch and **never** calls `fetch` (guard). A full round-trip: `buildBackup` → `restoreIdentity` → `importIdentity` → the imported identity opens a message sealed to it.
- [ ] **Step 6: Verify** — `pnpm --filter @aesmsg/webapp test -- onboarding/import-backup screens/ImportBackupScreen`; `typecheck`; `build`.
- [ ] **Step 7: Commit** — `feat(webapp): encrypted backup import on onboarding + reader (no recovery, wipe-first guard)`.

## Task 9: Backup format-parity tests — mobile ↔ web, both directions (D4)

**Files:** Create `tests/keys/backup-parity.test.ts`.

- [ ] **Step 1: web→(mobile-shape)** — build a backup with `buildBackup(identity, passphrase)`; assert the JSON envelope has exactly the mobile/crypto keys `{ v:1, kdf:"argon2id-aes256gcm", m_kib:65536, t:3, p:1, salt, iv, ct, pub }` ([`wrap.ts:93-104`](../../../packages/crypto/src/wrap.ts)); `readWrapKdfParams` === `DEFAULT_WRAP_KDF_PARAMS`; `unwrapPrivateKey` round-trips the same public key. This is the exact byte-shape a mobile `restoreIdentity` consumes.
- [ ] **Step 2: (mobile-produced)→web** — since mobile calls the **identical** `wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS)` ([`export-backup.ts:39`](../../../apps/mobile/src/keys/export-backup.ts)), generate the fixture the way mobile does (that same call), then `restoreIdentity(fixture, passphrase)` → `ok` and the recovered key seals/opens a message. Include a **hardcoded** representative envelope string (a real `wrapPrivateKey` output captured once) to lock the format against silent drift, and assert it imports.
- [ ] **Step 3: negative** — a fixture with a bumped/unknown `v` or a mangled `ct` → `restoreIdentity` returns `invalid-file`/`bad-passphrase` (never throws, never a partial recovery).
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- keys/backup-parity`; `typecheck`.
- [ ] **Step 5: Commit** — `test(webapp): backup format parity — mobile↔web round-trip both directions`.

---

# PHASE 3 — Security settings + wipe

## Task 10: Settings persistence — format + store + provider (D7)

**Files:** Create `src/settings/settings-format.ts`, `src/settings/settings-store.ts`, `src/settings/settings-context.tsx`; create `tests/settings/settings-format.test.ts`, `tests/settings/settings-store.test.ts`.

- [ ] **Step 1: `settings-format.ts`** — the D7 web `SettingsRecord` + ported validators from [`settings-format.ts` (mobile)](../../../apps/mobile/src/settings/settings-format.ts): `CLIPBOARD_CLEAR_MIN_SECONDS=10`/`MAX=90`, `clampClipboardSeconds`, `formatClipboardClear`, `AppLockTimeout`/`APP_LOCK_TIMEOUT_OPTIONS`/`appLockTimeoutLabel`/`appLockTimeoutMs`, `SETTINGS_DEFAULTS` (`clipboardClearSeconds:45`, `appLockTimeout:"never"`), and a **fail-soft** `validateSettings`/`migrateSettings` (per-field fallback, never throws).
- [ ] **Step 2: `settings-store.ts`** — `loadSettings()` (missing/corrupt → `SETTINGS_DEFAULTS`, never throws) / `saveSettings(record)` (stamp `updatedAt`, set `createdAt` on first write) / `clearSettings()` over `withStore(SETTINGS_STORE, …)` (single `id:"primary"` blob).
- [ ] **Step 3: `settings-context.tsx`** — `SettingsProvider` mirroring [`settings-context.tsx` (mobile)](../../../apps/mobile/src/settings/settings-context.tsx): load once on mount (defaults meanwhile), `update(patch)` optimistic + fire-and-forget persist. Mount it in the app layout (or the `AppShell` subtree) so `/settings` **and** the reader can read it. **NO key material.**
- [ ] **Step 4: Tests** — `clampClipboardSeconds`/`appLockTimeoutMs`/`validateSettings` fail-soft table (corrupt field → default, never throws); store round-trip; **no-key-material invariant**: `JSON.stringify(saved)` contains only `{ clipboardClearSeconds, appLockTimeout, schemaVersion, createdAt, updatedAt }` — never `"wrapped"`/`"privateKey"`/`"ct"`.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- settings/settings-format settings/settings-store`; `typecheck`.
- [ ] **Step 6: Commit** — `feat(webapp): on-device settings store (clipboard + app-lock prefs, no key material)`.

## Task 11: `/settings` screen — clipboard, app-lock, storage-persistence, honest web-tier, wipe (D7/D9/D10)

**Files:** Create `src/screens/SecuritySettingsScreen.tsx`; modify [`app/settings/page.tsx`](../../../apps/webapp/app/settings/page.tsx); create `tests/screens/SecuritySettingsScreen.test.tsx`.

- [ ] **Step 1: `SecuritySettingsScreen.tsx`** (`"use client"`, per [`security_settings_aesmsg_1/2`](../../../all_design_screens/security_settings_aesmsg_1/code.html)) — sections:
  - **Unlock / app-lock:** an app-lock-timeout selector (`APP_LOCK_TIMEOUT_OPTIONS`) wired to `update({ appLockTimeout })`; a **"Lock now"** action calling the identity `lock()`.
  - **Clipboard protection:** a clipboard-auto-clear duration control (10–90s, `formatClipboardClear`) wired to `update({ clipboardClearSeconds })`.
  - **Storage persistence:** show `navigator.storage.persisted()` status (green "Your keys are stored persistently on this device." vs a "Request persistent storage" action calling `navigator.storage.persist()`, [`identity-context.tsx:58-65`](../../../apps/webapp/src/identity/identity-context.tsx)). Best-effort; degrade calmly where unsupported.
  - **Key management:** the identity fingerprint (mono) + entry points to **Rotate key** and **Export backup** (link to `/identity`, mobile parity).
  - **Web-tier disclosure (D9):** the honest card — native offers stronger delivery guarantees (signed builds, biometric gate, screenshot blocking), a link to the app, and the screenshot-blocking gap. Amber/neutral, never red, never "≡ native".
  - **Danger zone (D10):** **Wipe private key** (red) → `WipeConfirmDialog` → `wipe-local.ts` (Task 13). Omit the mockups' "Delete Account / server-side" copy (no web analogue).
- [ ] **Step 2: `app/settings/page.tsx`** — replace the SP1 `Placeholder` ([`app/settings/page.tsx`](../../../apps/webapp/app/settings/page.tsx)) with `<RequireUnlocked><AppShell><SecuritySettingsScreen/></AppShell></RequireUnlocked>`.
- [ ] **Step 3: Tests** — changing the app-lock/clipboard controls persists via `saveSettings` (re-mount shows the saved value); the web-tier card renders the native-guarantees copy + a link to the site origin + the screenshot-blocking gap (assert the exact honest phrasing, **no** "≡ native", **no** forbidden claims); "Lock now" calls `lock()`; storage-persistence status renders both branches (stub `navigator.storage`); wipe opens the red confirm.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/SecuritySettingsScreen`; `typecheck`; `build`.
- [ ] **Step 5: Commit** — `feat(webapp): security settings — clipboard, app-lock, storage-persistence, honest web-tier, wipe`.

## Task 12: Wire clipboard duration into the reader + app-lock auto-lock (D8)

**Files:** Modify [`src/screens/reader/SecureReaderScreen.tsx`](../../../apps/webapp/src/screens/reader/SecureReaderScreen.tsx); create `src/settings/use-auto-lock.ts`; modify [`src/identity/identity-context.tsx`](../../../apps/webapp/src/identity/identity-context.tsx) (or `AppShell`); create `tests/settings/use-auto-lock.test.ts`.

- [ ] **Step 1: reader clipboard duration** — `SecureReaderScreen` reads `settings.clipboardClearSeconds` from `SettingsProvider` and passes `clipboardClearSeconds * 1000` to `useClipboardAutoClear` (replacing the hardcoded `CLIPBOARD_CLEAR_MS = 45_000`, [`SecureReaderScreen.tsx:19,43`](../../../apps/webapp/src/screens/reader/SecureReaderScreen.tsx)). The reader tree already renders inside the provider (Task 10 Step 3) — the recipient reader is outside `AppShell`, so ensure `SettingsProvider` sits high enough (app layout) that the reader reads it; a missing provider → `SETTINGS_DEFAULTS` (45s), never a crash. Copy stays honest ("Copied — clears in Ns" only when verified-clear is available).
- [ ] **Step 2: `use-auto-lock.ts`** — a `useAutoLock(timeoutMs | null)` hook: on activity (`pointerdown`/`keydown`/`visibilitychange→visible`) reset a timer; on expiry call the identity `lock()`. `null` (`never`) → no timer. Wire it where the unlocked app mounts (e.g. `AppShell`) reading `appLockTimeoutMs(settings.appLockTimeout)`. Replace the SP1 `// TODO(SP2+)` auto-lock stub ([`identity-context.tsx:102-104`](../../../apps/webapp/src/identity/identity-context.tsx)).
- [ ] **Step 3: Tests** — `use-auto-lock` calls `lock` after the timeout with no activity; activity resets it; `null` never locks (fake timers). Reader test: with `clipboardClearSeconds` set to a non-default value, the reader's copy label reflects it.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- settings/use-auto-lock screens/reader/SecureReaderScreen`; `typecheck`; `build`.
- [ ] **Step 5: Commit** — `feat(webapp): wire clipboard auto-clear duration + app-lock auto-lock`.

## Task 13: `wipe-local.ts` — revoke-before-wipe + full local purge (D10)

**Files:** Create `src/settings/wipe-local.ts`; modify [`src/screens/IdentityScreen.tsx`](../../../apps/webapp/src/screens/IdentityScreen.tsx) + `SecuritySettingsScreen.tsx`; create `tests/settings/wipe-local.test.ts`.

- [ ] **Step 1: `wipe-local.ts`** — port the shape of [`wipe-orchestration.ts` (mobile)](../../../apps/mobile/src/settings/wipe-orchestration.ts): `selectLiveTrackedLinks(records, now)` + `revokeAllThenWipe(deps)` — best-effort revoke each live tracked link (`revokeLink(id, token)`; 404/410 = success, [`isAlreadyGoneRevokeError`](../../../apps/mobile/src/settings/wipe-orchestration.ts)); on genuine failures ask `confirmProceedDespiteFailures(failures)` (a simplified acknowledgement) before proceeding; then the injected `wipe()` purges **all local stores** (identity + `clearRetiredEntries` + `clearSettings` + `clearSentLinks` + `__resetContactsForTests`/an equivalent `clearContacts`, and drops in-memory keys). Pure + DI, node/browser-testable.
- [ ] **Step 2: wire** — both the `/identity` and `/settings` Danger Zones drive `revokeAllThenWipe` through the existing `WipeConfirmDialog`; on `wiped`, route to `/onboarding`.
- [ ] **Step 3: Tests** — with seeded live links + a stubbed `revoke`: all succeed → wipe proceeds + every local store is cleared; a genuine failure → acknowledgement gate is asked and declining aborts (identity intact); a 404/410 counts as success. Assert the retired-keys + settings + sent-links + contacts stores are all empty after a completed wipe.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- settings/wipe-local`; `typecheck`; `build`.
- [ ] **Step 5: Commit** — `feat(webapp): revoke-before-wipe + full local purge (mobile parity)`.

---

# PHASE 4 — Attachments

## Task 14: Compose attachment picker + seal (D11)

**Files:** Create `src/create/pick-attachment.ts`; modify [`src/create/create-and-seal.ts`](../../../apps/webapp/src/create/create-and-seal.ts), [`src/screens/ComposeScreen.tsx`](../../../apps/webapp/src/screens/ComposeScreen.tsx); create `tests/create/pick-attachment.test.ts`; modify `tests/create/create-and-seal.test.ts`, `tests/screens/ComposeScreen.test.tsx`.

- [ ] **Step 1: `pick-attachment.ts`** — port [`pick-attachment.ts` (mobile)](../../../apps/mobile/src/create/pick-attachment.ts): `ComposeAttachment = { filename; mimetype; bytes; size }`, `MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024` (FREE cap, D11 — **no Pro path**), `validateAttachmentSize`, `formatSize`, and a browser `fileToAttachment(file: File)` (`file.name` basename, `file.type || "application/octet-stream"`, `new Uint8Array(await file.arrayBuffer())`, size-checked). A too-large file → a `too-large` result the UI surfaces (never seals it).
- [ ] **Step 2: `create-and-seal.ts`** — accept an optional single `attachment?: ComposeAttachment | null` and feed `encodePayload({ text, attachments: attachment ? [{ filename, mimetype, bytes }] : [] })` ([`create-and-seal.ts:73`](../../../apps/webapp/src/create/create-and-seal.ts)); the rest of the interop-critical sequence is **unchanged**. Update the SP2 comment ("SP5 will feed a non-empty array" → done).
- [ ] **Step 3: `ComposeScreen.tsx`** — add an **Add file / Change file** control (`<input type="file">`, single) + a selected-file chip (name in `font-sans`, size via `formatSize`, a remove button), per [`create_secure_message`](../../../all_design_screens/create_secure_message_aesmsg/code.html) + mobile [`ComposeScreen.tsx:243-270`](../../../apps/mobile/src/create/ComposeScreen.tsx). Over-cap → an inline "That file is over the 10 MB limit." (never sealed). `canSubmit` already allows attachment-only messages (no message-text requirement).
- [ ] **Step 4: Tests** — `validateAttachmentSize`/`formatSize` boundaries (exactly 10 MiB ok; +1 too-large); `fileToAttachment` maps name/mime/bytes; ComposeScreen picks a file → submit calls `createAndSeal` with the attachment and the request body carries **no plaintext** (reuse the SP2 no-plaintext mock — the attachment bytes are inside the sealed ciphertext, never in the JSON scaffold); an over-cap file disables/blocks the seal.
- [ ] **Step 5: Verify** — `pnpm --filter @aesmsg/webapp test -- create/pick-attachment create/create-and-seal screens/ComposeScreen`; `typecheck`; `build`.
- [ ] **Step 6: Commit** — `feat(webapp): compose attachment picker + seal (payload parity, FREE 10 MiB cap)`.

## Task 15: Reader attachment download — Blob, memory-only (D12) + attachment parity fixture

**Files:** Modify [`src/screens/reader/SecureReaderScreen.tsx`](../../../apps/webapp/src/screens/reader/SecureReaderScreen.tsx); modify `tests/screens/reader/SecureReaderScreen.test.tsx`, `tests/create/create-and-seal.test.ts`.

- [ ] **Step 1: `SecureReaderScreen.tsx`** — replace the SP3 "not supported" amber notice ([`SecureReaderScreen.tsx:78-91`](../../../apps/webapp/src/screens/reader/SecureReaderScreen.tsx)) with a per-attachment **download** control: for each `PayloadAttachment`, on click `new Blob([att.bytes], { type: att.mimetype })` → `URL.createObjectURL` → **push the URL into an `objectUrls` ref BEFORE** triggering the `a[download={att.filename}]` handoff (track-before-handoff, D12) → **revoke all tracked URLs on unmount and on `onDone`/close**. Show filename (`font-sans`) + size. Memory-only, zero network. Update the top-of-file comment (attachments now supported).
- [ ] **Step 2: attachment format-parity fixture** (`create-and-seal.test.ts`) — a round-trip: `createAndSeal({ …, attachment })` → capture the uploaded ciphertext → `open` + `decodePayload` recover the attachment's `filename`/`mimetype`/`bytes` **exactly**; plus a **hardcoded mobile-encoded fixture** (a v0x02 envelope carrying a known attachment, or the ciphertext of the identical `encodePayload`+`seal` call mobile makes) decodes to the expected attachment — proving cross-surface attachment interop.
- [ ] **Step 3: reader test** — a decrypted output with one attachment renders a download control (not the old notice); clicking it creates an object URL and `onDone` revokes every tracked URL (spy `URL.revokeObjectURL`); zero `fetch`.
- [ ] **Step 4: Verify** — `pnpm --filter @aesmsg/webapp test -- screens/reader/SecureReaderScreen create/create-and-seal`; `typecheck`; `build`.
- [ ] **Step 5: Commit** — `feat(webapp): reader downloads decrypted attachments (Blob, memory-only) + parity fixtures`.

---

# PHASE 5 — Wiring, docs, final gate

## Task 16: Final wiring — onboarding nudge, dead-copy removal, AGENTS.md

**Files:** Modify [`src/screens/SetPassphraseScreen.tsx`](../../../apps/webapp/src/screens/SetPassphraseScreen.tsx), [`src/app-shell/Placeholder.tsx`](../../../apps/webapp/src/app-shell/Placeholder.tsx) usages, [`src/screens/IdentityScreen.tsx`](../../../apps/webapp/src/screens/IdentityScreen.tsx); modify [`apps/webapp/AGENTS.md`](../../../apps/webapp/AGENTS.md).

- [ ] **Step 1: dead-copy sweep** — remove/replace every "coming soon / later release / not supported" string this SP makes real (`git grep -n` these in `apps/webapp/src apps/webapp/app`): SetPassphraseScreen "Encrypted backup export arrives in a later release." → a real **backup nudge** pointing to Export (post-onboarding, on `/identity`, mirroring mobile's `BackupNudgeSheet`); NoIdentityScreen "Importing an encrypted backup is coming soon" → the real import link (Task 8); SecureReaderScreen "Saving attachments in the browser isn't supported yet" → gone (Task 15). Confirm the `/settings` Placeholder is gone (Task 11).
- [ ] **Step 2: backup nudge** — on `/identity`, after identity creation, surface a calm "Export an encrypted backup" nudge (a card routing to Export) so a fresh user is prompted to back up (spec §11: onboarding pushes the backup export; mirrors mobile's nudge). Keep it dismissible; no key material in any persisted "nudge seen" flag (reuse the settings store if a flag is wanted, else keep it ephemeral).
- [ ] **Step 3: AGENTS.md** — add sections covering: **rotation retains old keys** (retired-keys store v4, reader fallback, amber tone, contacts re-verify); **backup** (byte-identical `.aesmsg` `WrappedKey` envelope under `DEFAULT_WRAP_KDF_PARAMS`, contents = active identity only, no recovery, import-from-`no_identity`-only); **settings** (web subset, no key material, IndexedDB v4 `settings` store, clipboard duration wired into the reader, app-lock); **wipe** (revoke-before-wipe + full local purge); **attachments** (payload parity, FREE 10 MiB cap, budget math, Blob download memory-only); **honest web-tier** disclosure (§3). Note **no deploy.md change** (no new routes/env/API).
- [ ] **Step 4: Verify** — `pnpm lint`; `git grep -nE "coming soon|later release|isn't supported yet" -- apps/webapp/src apps/webapp/app` → none of the ones this SP owns remain.
- [ ] **Step 5: Commit** — `docs: webapp rotation/backup/settings/attachments agent notes + remove dead copy`.

## Task 17: Final verification gate (repo-root green) + invariant sweep

- [ ] **Step 1: Typecheck** — `pnpm typecheck` (all workspaces).
- [ ] **Step 2: Lint** — `pnpm lint`; if Biome flags new files, `pnpm lint:fix`, re-run, amend.
- [ ] **Step 3: Tests** — `pnpm test` green across all workspaces (the new v3→v4 migration, rotation/retired-key, backup export/import + both-direction parity, settings, wipe-local, attachment picker + reader-download + fixture suites).
- [ ] **Step 4: Static build + CSP** — `pnpm --filter @aesmsg/webapp build`; then `pnpm --filter @aesmsg/webapp check:csp` → **zero** `securitypolicyviolation` (proves D13: Blob-download + file-input need no CSP change). `rm -rf apps/webapp/out` after.
- [ ] **Step 5: Invariant sweep** —
  ```
  git grep -nE "military-grade|unbreakable|impossible to hack" -- apps/webapp     # none
  git grep -nE "RSA|OpenPGP|\.asc|Delete Account|terminate" -- apps/webapp/src     # none (no legacy/server-account copy)
  ```
  Manually confirm: the backup file is the `.aesmsg` `WrappedKey` envelope (`DEFAULT_WRAP_KDF_PARAMS`); rotation retains the old key (a pre-rotation link still opens); export/import make **zero** network requests; the settings blob holds **no** key material; a wrong passphrase on import/export/rotate is terminal (no recovery).
- [ ] **Step 6: Final commit** — `git add -A && git commit -m "chore(webapp): SP5 rotation/backup/settings/attachments fixes" || echo "clean"`.

---

## Out of scope for SP5 (do NOT implement here)

Per spec §8/§9/§12:
- **Passkey/WebAuthn-PRF unlock** — deferred upgrade on top of the Argon2id wrap (§8).
- **aesmsg Pro / web billing** — deferred; **no 25 MiB PRO attachment cap** on web (§8). The web cap is the FREE 10 MiB cap only.
- **Push notifications** — architecturally impossible under zero-knowledge (§8).
- **Cross-surface identity / key sync advertising** — standalone identities only; the format-parity is a **migration path**, not an advertised sync (§5, §8). Do not add "sync your mobile identity" UX.
- **Any `apps/api` change** — no CORS/route/schema/rate-limit/body-cap change; the existing `/api/messages/*` caps are consumed as-is.
- **Any `packages/*` change** — `@aesmsg/crypto` (`wrapPrivateKey`/`unwrapPrivateKey`/`encodePayload`/`seal`/`open`), `@aesmsg/ui`, `@aesmsg/design-tokens`, `@aesmsg/server-store` are frozen, consumed verbatim.
- **Any `apps/mobile` change** — the native flows are the behavioral source of truth and are untouched.
- **Backup versioning / multi-identity backups / retired-key backup** — the backup holds the single active identity only (D4, mobile parity); do not extend the format.
- **`docs/deploy.md` change** — no new routes/env/API; the fourth-service section from SP1 is unchanged.

---

## Self-review — spec coverage

- **Backup EXPORT** — location `/identity` (mobile Keys-tab parity) — D5, Task 7; explicit passphrase re-prompt (§5) — D5; mobile-format envelope via `wrapPrivateKey(..., DEFAULT_WRAP_KDF_PARAMS)` — D4; browser Blob download, zero network — D5, Task 7; filename `aesmsg-identity-backup.aesmsg` + `application/octet-stream` — D4; contents = **active identity only** (no contacts/links/retired/settings) — D4.
- **Backup IMPORT** — onboarding + reader `NoIdentityScreen` entry — D6, Task 8; file picker → parse → passphrase → restore; `bad-passphrase`/`invalid-file` calm terminals, no recovery — D6; **`no_identity`-only** guard, wipe-first when an identity exists (mobile parity) — D6, Task 8.
- **Format-parity tests** — both directions + hardcoded fixture + negative — D4, Task 9.
- **ROTATION** — retains old keys, reader fallback (pinned to `identity-machine.ts`/`identity-bundle.ts`/`decrypt-keys.ts`) — D1, Tasks 2–6; re-prompt + amber tone + post-rotation "contacts must re-verify" copy — D1/D2, Task 5; contacts/sent-links untouched, fingerprint changes — D1; IndexedDB **v4** retired-keys store pinned — D3, Task 1; atomic-transaction "fully rotated OR unchanged" — D2.
- **SECURITY SETTINGS** at `/settings` — clipboard duration wired to the reader hook (§D8/Task 12), app-lock + lock-now (D8/D12), wipe (D10/Task 13), storage-persistence via `navigator.storage.persist()`/`persisted()` (Task 11), honest web-tier disclosure + link + screenshot gap (§3) — D9/Task 11; settings persisted in IndexedDB, **no key material** — D7/Task 10.
- **ATTACHMENTS** — compose picker (payload parity, FREE 10 MiB cap, budget math shown) — D11/Task 14; reader Blob download memory-only replacing SP3's notice — D12/Task 15; tests both directions incl. a mobile-encoded fixture — Tasks 14–15.
- **Final wiring** — onboarding backup nudge → real export; dead-copy grep-and-remove; AGENTS.md; deploy.md unchanged — Task 16.
- **Repo-root green gate** — Task 17: `pnpm typecheck && pnpm lint && pnpm test` + webapp `build` + `check:csp`.
