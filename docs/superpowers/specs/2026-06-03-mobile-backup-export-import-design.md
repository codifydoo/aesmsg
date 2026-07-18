# Mobile encrypted-backup: Export & Import (wiring) — Design

**Date:** 2026-06-03
**Scope:** `apps/mobile` only. Web is presentational / no-keys by architecture — nothing to do there.
**Status:** Approved for implementation.

## Problem

The "Export encrypted backup" screen (design screen 41) and the "Restore identity / Import
backup" screen (design screen 8) are both fully built but **presentational only**. Their
callbacks are stubs:

- `ExportBackupScreen.onExport(passphrase)` just navigates back — it never produces a file.
- `ImportBackupScreen.onPickFile` / `onRestore(passphrase)` are stubs with a hard-coded sample
  file — they never pick or decrypt anything.

This makes the single sanctioned escape hatch from "private keys never leave the device"
non-functional: a user who loses or replaces their device permanently loses every message ever
sent to them, because there is no server-side copy (zero-knowledge backend).

## Goal

Wire both screens to real behavior using the **already-implemented** crypto in
`@aesmsg/crypto`. No new crypto primitives — `wrapPrivateKey` / `unwrapPrivateKey` already
round-trip and are tested (`packages/crypto/tests/wrap.test.ts`).

- **Export:** take the in-memory unlocked identity, re-seal it under a **user passphrase** with
  the heavy KDF, write a `.aesmsg` file, hand it to the system share sheet.
- **Import:** pick that file (fresh-install / `no_identity` onboarding only), decrypt it locally
  with the passphrase, and persist it as this device's active identity.

## The one detail that must be correct: two independent wraps

| Wrap | Protected by | KDF params | Where |
|---|---|---|---|
| **At-rest device wrap** | 256-bit device secret (Keychain, biometric-gated) | `MOBILE_KDF_PARAMS` (2 MiB, t=1) — light, because 2^256 entropy needs no brute-force cost | `secure-store.ts` |
| **Export file wrap** | human passphrase (low entropy) | `DEFAULT_WRAP_KDF_PARAMS` (65 MiB, t=3) — heavy, brute-force resistant | the new backup file |

The export file wrap **must** use `DEFAULT_WRAP_KDF_PARAMS` (not the mobile light params). On
import, `unwrapPrivateKey` reads the KDF params back out of the envelope, so no params argument is
needed to restore. After unwrapping, the imported identity is re-wrapped under the device secret
with `MOBILE_KDF_PARAMS` for at-rest storage — a clean separation between "file the user keeps"
and "envelope on this device".

## Components

Each is a small, independently testable unit. Pure logic + dependency-injected native modules,
tested node-env with `vi.mock` per the mobile convention (no React renderer).

### 1. `apps/mobile/src/identity/identity-machine.ts` — new `importIdentity` action (trust-critical)

Add `importIdentity(identity: IdentityKeypair): Promise<void>`:

- Guard: only valid from `status === "no_identity"` (same guard discipline as `setupNew`; throws
  otherwise — no silent overwrite of an existing identity).
- Reuse the persist-and-unlock tail of `setupNew`: extract a private helper
  `persistAndUnlock(identity)` that does `createDeviceSecret` →
  `wrapPrivateKey(identity, secret, MOBILE_KDF_PARAMS)` → `saveWrappedIdentity` →
  `exportPublicKey` → `setState({ status: "unlocked", ... })`. `setupNew` becomes
  `generateIdentity()` + `persistAndUnlock(id)`; `importIdentity` is `persistAndUnlock(provided)`.
- Wire it through `IdentityMachine` actions and the production machine in `identity-context.tsx`.

This is the only state-machine change. The existing fake-store / fake-secret / `realCrypto`
harness in `tests/identity-state-machine.test.ts` covers it.

### 2. `apps/mobile/src/onboarding/import-backup.ts` — new pure + DI module

- `restoreIdentity(wrapped: string, passphrase: string): Promise<RestoreResult>` wrapping
  `unwrapPrivateKey`, mapping crypto errors to a result union:
  `{ ok: true; identity } | { ok: false; reason: "bad-passphrase" | "invalid-file" }`.
  `BadPassphraseError` → `"bad-passphrase"`; `InvalidFormatError` (and any other) → `"invalid-file"`.
  This keeps the screen free of try/catch and lets it pick the right inline copy.
- `readBackupFile(deps, uri): Promise<string>` over an injected `FileSystemLike`
  (`readAsStringAsync`, UTF-8).
- `pickBackupFile(deps): Promise<{ uri; name; size } | null>` over injected `DocumentPickerLike`
  (`getDocumentAsync({ copyToCacheDirectory: true })`), mirroring `create/pick-attachment.ts`.
- `formatBackupSize(bytes): string` for the selected-file chip ("4.2 KB").

### 3. `apps/mobile/src/keys/export-backup.ts` — new pure + DI module

- `buildBackup(identity, passphrase): Promise<BackupFile>` →
  `{ filename: "aesmsg-identity-backup.aesmsg"; contents: <WrappedKey JSON string> }` via
  `wrapPrivateKey(identity, passphrase, DEFAULT_WRAP_KDF_PARAMS)`.
- `writeAndShareBackup(deps, backup): Promise<void>` over injected `FileSystemLike` /
  `SharingLike`, following the exact **track-before-share** discipline of
  `reader/attachment-cache.ts`: write to a cache URI, then `Sharing.shareAsync(uri, { mimeType:
  "application/octet-stream", dialogTitle: "Save encrypted backup" })`, swallowing share-sheet
  rejection (file stays for cleanup). MIME is opaque octet-stream — the file is ciphertext.

### 4. Wiring

- **Export (`keys/KeysFlow.tsx` + `ExportBackupScreen.tsx`):** real `onExport(passphrase)`:
  1. biometric confirm via the existing `performBiometricConfirmation()` (design screen 40:
     "Unlock to export your encrypted backup"); on reject, abort silently.
  2. `buildBackup(identity, passphrase)` — identity comes from the unlocked identity context.
  3. `writeAndShareBackup(...)`.
  4. success sheet ("Encrypted backup ready" / "Share or save this file. Keep the passphrase
     separate."), then the system share sheet.
  The screen gains an exporting/done state (CTA → spinner "Encrypting backup…"). Identity is
  supplied to `KeysFlow` from the unlocked shell via the identity context.
- **Import (onboarding host in `App.tsx` + `ImportBackupScreen.tsx`):** real `onPickFile`
  (`pickBackupFile`) populating the real `SelectedBackup` chip; real `onRestore(passphrase)`:
  `readBackupFile` → `restoreIdentity` → on `ok` call `machine.importIdentity(identity)` (machine
  transitions to `unlocked`, app lands on Home naturally); on `bad-passphrase` show the design's
  inline red error + one field shake (no attempt counter); on `invalid-file` show a "not a valid
  backup file" inline error.
- **Home "Import backup" tile:** when an identity already exists, show a short note that restoring
  a backup replaces the current identity and points to Wipe — no destructive auto-flow this round.

## Error handling (matches product invariants)

- Wrong passphrase is **terminal**: inline error, field shake, no "forgot passphrase", no
  recovery, no attempt counter, no fallback. (`messanger.md` screen-8 copy, CLAUDE.md invariants.)
- Corrupt / wrong-type file → "This isn't a valid backup file." inline; never crash.
- Share-sheet dismissal is non-fatal; the written cache file is cleaned on unmount
  (track-before-share).
- Export is gated on a fresh biometric; reject aborts without producing a file.

## Copy (verbatim from design screens 41 and 8)

Export: intro "Your backup is encrypted with a passphrase only you know. Without it, the file is
useless."; amber "This is the only way a key leaves your device — and only in encrypted form.
Store the passphrase somewhere safe; we can't recover it."; CTA "Export backup"; success
"Encrypted backup ready" + "Share or save this file. Keep the passphrase separate." (Existing
screen already carries most of this — preserve it.)

Import: intro "Restore your identity from an encrypted backup. Your backup is decrypted on this
device — nothing is uploaded."; helper "This passphrase never leaves your device."; wrong-pass
"That passphrase didn't unlock this backup. No backup data is recoverable without it."; success
"Identity restored."

No "unbreakable" / "military-grade" / "forgot passphrase" / cloud-restore / strength meter on
import / backup-contents preview / attempt counter (design DO-NOT lists).

## Testing strategy

- `export-backup.test.ts`: `buildBackup` produces parseable WrappedKey JSON sealed under heavy
  params (assert `readWrapKdfParams` returns `DEFAULT_WRAP_KDF_PARAMS`); `writeAndShareBackup`
  writes then shares, swallows share rejection, and a round-trip `unwrapPrivateKey(contents,
  passphrase)` recovers the same public key. Native modules mocked.
- `import-backup.test.ts`: `restoreIdentity` returns `ok` on correct passphrase, `bad-passphrase`
  on wrong, `invalid-file` on malformed JSON / truncated envelope; `formatBackupSize` formatting;
  `readBackupFile` / `pickBackupFile` over mocked natives.
- `identity-state-machine.test.ts`: `importIdentity` from `no_identity` persists a wrapped
  envelope and transitions to `unlocked` with the imported public key; guard throws from
  `locked`/`unlocked`; an exported-then-imported identity decrypts a message sealed to it
  (full round-trip through `buildBackup` → `restoreIdentity` → `importIdentity`).
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test` all green across workspaces. Delete stale
  `apps/*/tsconfig.tsbuildinfo` before the gate if dep graph churned (known phantom-error trap).

## Verification boundary

Unit tests + typecheck + lint will be green and are the completion bar for this branch.
**On-device QA requires a cloud EAS build** — local iOS builds are impossible on this Mac (the
known Xcode 26.5 pod-install bug), so the device walkthrough (export → share file → reinstall →
restore) is flagged as a follow-up, not claimed as done.

## Out of scope (follow-ups)

- Full "replace existing identity from Home" (wipe-then-import) destructive flow.
- HTML design mockups for screens 8 / 41 (they are spec-only today; React components are the
  source of truth once built).
- Backup file versioning / multi-identity backups.

## File inventory

New: `keys/export-backup.ts` (+ test), `onboarding/import-backup.ts` (+ test).
Changed: `identity/identity-machine.ts`, `identity/identity-context.tsx`, `keys/KeysFlow.tsx`,
`keys/ExportBackupScreen.tsx`, `onboarding/ImportBackupScreen.tsx`, `App.tsx`, the Home screen
(import tile), `tests/identity-state-machine.test.ts`.
