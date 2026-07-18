# Mobile: add a contact by pasting a public key

**Date:** 2026-06-01
**Status:** Approved (design)
**Area:** `apps/mobile` (Contacts tab)

## Problem

On the Contacts tab, "Add contact → Paste public key" (and the empty-state "Paste public key"
button, and the QR screen's "paste instead") all dead-end at the `ComingSoonScreen`. The
encrypted contacts store already has a complete `addContact({ label, publicKey })`, and the
compose flow already validates pasted keys — so the only missing piece is the paste UI + wiring.

## Goals

- A working "Paste public key" screen: paste/enter an `amk1:` public key + a contact name,
  validate it, save it to the encrypted contacts store, and land on the new contact's detail.
- Route the three "paste" entry points to it instead of the coming-soon screen.

## Non-goals (unchanged / still coming-soon)

- **Camera QR scan** (needs `expo-camera` + permissions) — `QRScanScreen` stays as-is.
- **Import contact file** (the chooser's third method, `.aesmsg` file) — keeps a coming-soon
  screen; file picking + parsing is a separate capability.
- Editing/rotating an existing contact's key (already handled elsewhere).

## Design

### New screen — `PasteKeyScreen` (`apps/mobile/src/contacts/PasteKeyScreen.tsx`)

Presentational, built from the existing kit (`AppBar`, `Screen`, `Field`, `Button`, `Icon`),
matching the `all_design_screens/add_new_contact_aesmsg` elements within the app's established
chooser→method navigation:

- AppBar "Paste public key" + back.
- A **multi-line key field** (mono) with a **"Paste from clipboard"** affordance that reads
  `Clipboard.getStringAsync()` into the field (errors swallowed → `""`, matching `OpenLinkSheet`).
- A **name field** (the contact label).
- A primary **"Add contact"** button, disabled until `canAddContact(key, name)` is true.
- An inline **error** line (from the pure error-mapper) and the "verify before you trust" note
  (same copy/treatment as `AddContactScreen`'s footer).
- A `busy` state disables the button while validating/saving.

Props:
```ts
interface PasteKeyScreenProps {
  onBack: () => void;
  /** Called with the new contact's id after a successful add. */
  onAdded: (contactId: string) => void;
}
```

The async submit lives in the screen (it touches crypto + the store, so it is not pure):
1. `if (!canAddContact(key, name)) return;`
2. `await importPublicKey(key.trim())` — authoritative validation (throws `InvalidFormatError`).
3. `const publicKey = key.trim() as PublicKeyString;` — the established precedent
   (`create-and-seal.ts:33`, `CreateFlow.tsx:67`).
4. `const record = await addContact({ label: name, publicKey });` — the store validates the
   label, rejects duplicates, computes the fingerprint.
5. `onAdded(record.id)`.
6. On any throw → `setError(pasteContactError(e))`, clear `busy`.

### Pure logic (node-tested, per repo convention)

New module `apps/mobile/src/contacts/paste-contact-error.ts`:

- `canAddContact(key: string, name: string): boolean` — `name.trim().length > 0 &&
  looksLikePublicKey(key)` (reuses `create/recipient.ts`'s `looksLikePublicKey`). Gates the button.
- `pasteContactError(e: unknown): string` — maps:
  - `InvalidFormatError` → "That doesn't look like a valid aesmsg public key. Check that you
    copied the whole key."
  - `DuplicateFingerprintError` with `reason: "current"` → `This key is already saved as
    "${e.existingLabel}".`
  - `DuplicateFingerprintError` with `reason: "previous"` → `This key was rotated away by
    "${e.existingLabel}".`
  - `InvalidLabelError` → "Enter a name for this contact."
  - else → "Couldn't add this contact. Please try again."
  (Error classes are `instanceof`-checked; imported from `@aesmsg/crypto` (`InvalidFormatError`)
  and `@/src/contacts/contacts-store` (`DuplicateFingerprintError`, `InvalidLabelError`).)

### ContactsFlow wiring (`apps/mobile/src/contacts/ContactsFlow.tsx`)

- Replace the `paste-soon` route with two routes: `paste` (the real screen) and `import-soon`
  (the coming-soon for file import).
- `paste` renders `<PasteKeyScreen onBack={goList} onAdded={async (id) => { await reload();
  setRoute({ name: "detail", contactId: id }); }} />`.
- `import-soon` renders the existing `ComingSoonScreen` with an import-specific message.
- Repoint paste entry points to `{ name: "paste" }`:
  - `AddContactScreen` `onPick`: `scan → scan`, `paste → paste`, `import → import-soon`.
  - `ContactsEmptyScreen` `onPaste → paste`.
  - `QRScanScreen` `onPaste → paste`.
- The empty-store guard must exempt `paste` (as it already does `add`/`scan`) so a contactless
  user pasting their first key isn't bounced to the empty screen.

### Post-add navigation

On success the flow reloads the encrypted store and routes to `{ name: "detail", contactId }`.
The detail screen already shows the contact as **unverified** with a **Verify** affordance.

## Components / boundaries touched

| Unit | Change | Tested by |
|---|---|---|
| `contacts/paste-contact-error.ts` (new) | pure `canAddContact` + `pasteContactError` | new unit test |
| `contacts/PasteKeyScreen.tsx` (new) | presentational paste/validate/save screen | typecheck/lint + on-device |
| `contacts/ContactsFlow.tsx` | `paste` + `import-soon` routes; repoint entry points; exempt `paste` from empty guard | typecheck/lint |
| `contacts/AddContactScreen.tsx` | `onPick("import")` → import-soon (no API change; ContactsFlow maps it) | — |

(`ComingSoonScreen`, `contacts-store.addContact`, `looksLikePublicKey`, `importPublicKey`,
`ContactDetailScreen` are reused unchanged.)

## Testing

- **Unit (node-env):** `paste-contact-error.test.ts` — `canAddContact` (empty name, junk key,
  valid pair) and `pasteContactError` (each error class → message, incl. the two duplicate
  reasons and the generic fallback).
- **Gates:** `pnpm --filter @aesmsg/mobile typecheck|test`, root `pnpm lint`.
- **On-device (manual):** valid key + name → contact saved, lands on its (unverified) detail;
  malformed key → inline error, nothing saved; duplicate key → "already saved as …"; the
  empty-state "Paste" and the chooser "Paste" both reach the new screen; "Import contact file"
  still shows coming-soon.

## Risks

- **Branding via `as PublicKeyString`** mirrors the existing compose precedent — acceptable
  because `importPublicKey` has already validated the same string in the line above.
- **Field multiline support:** the plan confirms the kit `Field` supports a multi-line variant;
  if not, the screen uses a kit-styled `TextInput` for the key. (Resolved at plan time.)
- **Duplicate "previous fingerprint" case** is a security signal, not just a convenience block —
  the copy names the existing contact and frames it as a rotation, never silently merges.
