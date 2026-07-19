# Mobile contact-card: Export & Import — Design

**Date:** 2026-07-19
**Scope:** `apps/mobile` only. Web is presentational / no-keys by architecture — nothing to do there.
**Status:** Approved for implementation.

## Problem

"Add contact → **Import contact file**" is a `ComingSoonScreen` stub
([`ContactsFlow.tsx`](../../../apps/mobile/src/contacts/ContactsFlow.tsx) route `import-soon`):
_"Importing a .aesmsg contact file is coming soon."_ The matching **export** does not exist at
all — there is no way to produce a shareable contact file. The two remaining "Add contact"
methods (scan QR, paste key) are live; file import is the last gap.

Today the only ways to hand someone your key are the raw `amk1:` string (share/copy on the My
Public Key screen) or a QR code. There is no self-describing **file** a user can send through any
channel and have the recipient one-tap into their contacts.

## Goal

Ship a symmetric pair, `apps/mobile` only:

- **Export** — from the **My Public Key** screen, bundle *my own* public key + a chosen display
  name into a `.aesmsg` **contact card** file and hand it to the system share sheet.
- **Import** — from "Add contact → Import contact file", pick a received card, validate it, and
  add the sender as a contact (**unverified**).

No new crypto primitives. Public-key validation already exists (`importPublicKey`), and the
file-lifecycle pattern already exists (`keys/export-backup.ts` + `onboarding/import-backup.ts`).

## What a contact card is (and is NOT)

A contact card carries a **public key**, which the product explicitly treats as non-secret — the
entire model is "others encrypt *to* your public key." So, unlike the identity **backup** file
(an encrypted `WrappedKey` envelope that protects a *private* key), the contact card is
**plaintext JSON, not encrypted**.

```json
{ "type": "aesmsg.contact-card", "version": 1, "label": "Alice", "publicKey": "amk1:…" }
```

| Field | Meaning |
|---|---|
| `type` | Fixed `"aesmsg.contact-card"`. Discriminates the card from the encrypted identity backup, which shares the `.aesmsg` extension. The importer checks this and rejects a backup picked by mistake. |
| `version` | `1`. Room to evolve the format. |
| `label` | The exporter's suggested display name (1–80 chars, matching `contacts-store` label rules). A **suggestion** only — the importer can edit it before saving. |
| `publicKey` | The exporter's `amk1:` public key string. |

### Security invariants (non-negotiable)

- **No fingerprint is stored in the file.** The importer **always re-computes** the fingerprint
  from `publicKey` via `@aesmsg/crypto` (`fingerprint()`), and never trusts a value carried in
  the file. Storing one would invite trusting it; omitting it removes the trap.
- **Imported contacts are always `verified: false`.** No file can mark a contact verified. The
  "verify this fingerprint out-of-band before sending sensitive information" note carries through
  the import confirmation, unchanged.
- **The card is not a secret, but it is also not proof of identity.** Import establishes only
  "here is a key claiming to be Alice" — trust still comes from the existing manual
  fingerprint-verification / QR flow. Import changes nothing about the trust model; it is a
  faster on-ramp to the same unverified state that paste/scan produce.
- Fixed filename `aesmsg-contact-card.aesmsg` — no user text in the filename, so no
  sanitization/encoding edge cases and nothing leaked via the filename itself.

## Components

Each is a small, independently testable unit: pure logic + dependency-injected native modules,
tested node-env per the mobile convention (no React renderer). This mirrors
`keys/export-backup.ts` and `onboarding/import-backup.ts` verbatim in shape.

### 1. `apps/mobile/src/contacts/contact-card.ts` — new pure module

**Build (export side):**

- `CONTACT_CARD_FILENAME = "aesmsg-contact-card.aesmsg"`.
- `buildContactCard(label: string, publicKey: PublicKeyString): ContactCardFile`
  - Validate/trim `label` with the same rule as `contacts-store`. **Single source of truth:**
    export `MAX_LABEL_LEN` and `validateLabel` from `contacts-store.ts` and call `validateLabel`
    here (it throws `InvalidLabelError` on empty/too-long). Do not duplicate the constant.
  - Return `{ filename: CONTACT_CARD_FILENAME, contents: JSON.stringify({ type, version: 1, label, publicKey }) }`.
  - Never logs key material (the public key is non-secret, but keep logging discipline uniform).

**Parse (import side):**

- `type ParsedContactCard = { readonly label: string; readonly publicKey: PublicKeyString }`
- `type ParseCardResult =`
  `{ ok: true; card: ParsedContactCard } | { ok: false; reason: "invalid-file" | "wrong-file-type" }`
- `parseContactCard(text: string): Promise<ParseCardResult>`
  - `JSON.parse` → on throw, `invalid-file`.
  - If `type !== "aesmsg.contact-card"` → `wrong-file-type` (this is where a mistakenly-picked
    identity backup or unrelated JSON lands).
  - `await importPublicKey(publicKey)` as the **authoritative** key check → on throw,
    `invalid-file`.
  - Validate/trim `label`; if invalid, fall back to empty string (importer must supply one) —
    a card with a good key but a bad label should still be importable, just unnamed.
  - Result union mirrors `onboarding/import-backup.ts` `RestoreResult` so the screen maps
    branches to copy without try/catch.

**Native surfaces (DI, minimal — tests inject spies), same interfaces as backup export/import:**

- `writeCardToCache({ FileSystem }, card): Promise<{ uri; cleanup() }>` — write to
  `${cacheDirectory}${CACHE_FILE_PREFIX}${Date.now()}-${filename}`; return `cleanup` captured
  before any handoff (track-before-share). Reuses `CACHE_FILE_PREFIX` so the Settings
  "Clear local history" sweep reclaims an orphan.
- `shareCard({ Sharing }, uri): Promise<void>` — gated on `isAvailableAsync`; MIME
  `application/octet-stream`; dialog title "Share contact card"; swallow a share rejection
  (non-fatal, file already written + caller holds `cleanup`).
- `pickCardFile({ DocumentPicker }): Promise<{ uri; name; size } | null>` — `getDocumentAsync({ copyToCacheDirectory: true })`; first asset or `null` on cancel.
- `readCardFile({ FileSystem }, uri): Promise<string>` — UTF-8 read.

### 2. `apps/mobile/src/contacts/PasteKeyScreen.tsx` — add `initialName`

Add an optional `initialName?: string` prop that seeds the `name` state (`useState(initialName ?? "")`),
exactly parallel to the existing `initialKey`. No other change: validation, `addContact`
(duplicate detection via `DuplicateFingerprintError`), `verified:false`, and the
`pasteContactError` inline mapping all already do the right thing. This is what makes import a
thin orchestration instead of a new screen.

### 3. `apps/mobile/src/contacts/ContactsFlow.tsx` — replace the `import-soon` route

The `import-soon` route currently renders `ComingSoonScreen`. Replace with real orchestration:

- On entering import (from `AddContactScreen` "import"): call `pickCardFile`.
  - **Cancel** (`null`) → back to `list`/`add`, no-op.
  - Read the file (`readCardFile`) → `parseContactCard`.
    - **`ok`** → route to `paste` with `prefillKey = card.publicKey` and a new
      `prefillName = card.label`. PasteKeyScreen (ADD mode) shows both, editable; "Add contact"
      persists (unverified, dup-checked); success routes to the new contact's detail.
    - **`wrong-file-type` / `invalid-file`** → show an inline error state:
      "This isn't a valid aesmsg contact file." with a Back action. Implemented either as a small
      dedicated message screen (matching the app's first-class error-state convention, e.g.
      `link_expired`/`decryption_failed`) or an error slot on `AddContactScreen`. Prefer a tiny
      dedicated `ImportContactErrorScreen` for clarity and testability. Not a crash, not a toast.
- The `paste` route gains an optional `prefillName` carried into `PasteKeyScreen initialName`.
  Re-key mode is unaffected (it hides the name field).

Duplicate contacts need no special handling here — routing through PasteKeyScreen means
`addContact`'s `DuplicateFingerprintError` is mapped to existing inline copy downstream.

### 4. Export UI — My Public Key screen (Keys tab)

Exporting *my* card is an identity action, so it lives on
[`MyPublicKeyScreen`](../../../apps/mobile/src/keys/MyPublicKeyScreen.tsx) (design screen 40),
next to "Share public key" / "Copy public key" / "Export encrypted backup".

- Add an **"Export contact card"** affordance (outline button or an entry beside the existing
  actions). Tapping opens a `BottomSheet` (the component already used on this screen) with:
  - A single **name `Field`** — "What name should they see?" (label validation: non-empty,
    ≤ 80 chars; the "Create" button is disabled until non-empty).
  - A **"Create contact card"** button → `buildContactCard(name, publicKeyString)` →
    `writeCardToCache` → `shareCard`. The system share sheet is the confirmation (no separate
    success sheet needed; simpler than the backup flow, which needs one only because of its
    passphrase step).
- Wiring lives in [`KeysFlow`](../../../apps/mobile/src/keys/KeysFlow.tsx), which already owns the
  identity's public key string and the export-backup route. Inject the production `FileSystem` /
  `Sharing` modules there, matching `export-backup` wiring.

## Error / edge states (first-class, per product convention)

| Situation | Behavior |
|---|---|
| Export: empty name | "Create contact card" disabled until a valid name is entered. |
| Export: share sheet unavailable / user dismisses | File already written; swallow — no error surfaced. Cache file reclaimed by Clear-local-history. |
| Import: user cancels the picker | No-op; stay on Add contact. |
| Import: file isn't JSON / not a contact-card `type` | Inline "This isn't a valid aesmsg contact file." + Back. |
| Import: `type` ok but `publicKey` invalid | Same "not a valid contact file" message. |
| Import: valid card, key already saved | PasteKeyScreen shows the existing `DuplicateFingerprintError` copy. |
| Import: valid card, key matches a contact's rotated-away key | Existing duplicate/rotated-away copy from `pasteContactError`. |

## Testing

Mirror the existing `export-backup` / `import-backup` suites (pure module, `vi.mock` native deps,
no renderer):

- `apps/mobile/tests/contact-card.test.ts`
  - `buildContactCard` → `parseContactCard` **round-trips** (label + key preserved).
  - `buildContactCard` rejects empty / > 80-char labels (`InvalidLabelError`).
  - `parseContactCard` rejects: non-JSON (`invalid-file`); JSON without / with wrong `type`
    (`wrong-file-type`); JSON of the right type but a **non-`amk1:` / malformed key**
    (`invalid-file`, proving `importPublicKey` is the authoritative gate).
  - **Fingerprint is recomputed, not trusted:** a card has no fingerprint field; assert the added
    contact's fingerprint equals `fingerprint(publicKey)` regardless of file contents.
  - `writeCardToCache` writes to a `CACHE_FILE_PREFIX` path and returns a working `cleanup`;
    `shareCard` swallows a rejected `shareAsync`; `pickCardFile` returns `null` on cancel.
- A light `ContactsFlow` import-route test if the existing flow tests provide a pattern:
  a parsed card lands on PasteKeyScreen with name+key prefilled; an invalid file lands on the
  error screen. Otherwise cover the orchestration logic via the pure module + manual QA note.

## Out of scope (YAGNI)

- **Bulk address-book export/import** (all contacts in one file, device migration) — explicitly
  declined. The `type` tag leaves room for a future `"aesmsg.contact-book"` format without
  breaking single-card files.
- **Exporting a *saved* contact** (introducing contact A to person B) — not this change.
- **Encrypting the card** — unnecessary; public keys are non-secret by design.
- **Persisting the export display name** — prompt each time; no stored identity display name.
- Any web (`apps/web`) work — no keys/crypto there by architecture.

## File-by-file summary

| File | Change |
|---|---|
| `apps/mobile/src/contacts/contact-card.ts` | **New.** Build/parse/write/share/pick/read pure module + DI surfaces. |
| `apps/mobile/src/contacts/PasteKeyScreen.tsx` | Add optional `initialName` prop (seeds name field). |
| `apps/mobile/src/contacts/ContactsFlow.tsx` | Replace `import-soon` ComingSoon route with real pick→parse→route/error orchestration; `paste` route carries `prefillName`. |
| `apps/mobile/src/contacts/ImportContactErrorScreen.tsx` | **New (small).** "Not a valid contact file" message + Back. |
| `apps/mobile/src/keys/MyPublicKeyScreen.tsx` | Add "Export contact card" affordance + name BottomSheet. |
| `apps/mobile/src/keys/KeysFlow.tsx` | Wire export: inject `FileSystem`/`Sharing`, build→write→share. |
| `apps/mobile/tests/contact-card.test.ts` | **New.** Round-trip, rejection, recomputed-fingerprint, native-surface tests. |
