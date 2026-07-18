# Slice 8 — Contacts directory (`/contacts` + `/create` picker)

**Date:** 2026-05-10
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** Slices 1–7

## 1. Context

Slices 1–7 closed the seal → open loop and gave the sender an outbox. The remaining headline UX wart is on `/create`: the recipient field is a single textarea labelled "Paste recipient's public key…". A 44-character Base64 SPKI key is hostile copy, easy to truncate or corrupt, and the user has no record that they ever sent to this person. Worse, there is no way to express "this is the same Alice with a new key" — which is the prerequisite for the existing `security_alert_key_changed_aesmsg` mockup that the product brief calls out as a first-class flow.

Slice 8 adds a **client-side contacts directory**, integrates it into `/create` as the primary recipient picker, and lays the data foundation for key-change detection (`previousFingerprints[]`). It does not ship the full security-alert page — that becomes Slice 9 once we have field reports of what the warning needs to say. Slice 8 ships only the inline amber banner that the alert page will replace.

Like Slice 7, this slice is **single-device**: the local browser is the source of truth for the directory. Cross-device sync needs either an account or device-pairing, both Phase 3 concerns.

## 2. Goals

- Add three new routes to `apps/web`: `/contacts` (list), `/contacts/new` (add), `/contacts/[id]` (detail), all driven by mockups in `all_design_screens/contacts_aesmsg/`, `add_new_contact_aesmsg/`, and `contact_detail_elena_rodriguez/`.
- Add a local IndexedDB store at `apps/web/src/lib/contacts-store.ts` (DB `aesmsg-contacts`), sibling to `sent-links-store.ts`. One object store, keyed by stable contact `id`.
- Replace the `<ComposeForm>` recipient input with a tabbed picker: `Saved Contacts` (default when any exist) / `Paste Public Key` (fallback). Selected contact pinning, search, and an inline "save as contact" prompt on the Result screen.
- Implement an explicit **Update Public Key** flow on contact detail. Pushes the existing fingerprint into `previousFingerprints[]`, sets the new key as current, flips `verified: false`. Inline amber banner appears on every surface that renders the contact.
- Implement manual **Mark as Verified** / **Mark as Unverified** toggle. Default state for any new contact is unverified.
- Reject duplicate contacts at write time: `addContact` rejects if the new fingerprint matches *any* contact's current fingerprint *or* any entry in any contact's `previousFingerprints`. Surfaces silent re-adds of rotated-away keys.

## 3. Non-goals

- **No QR-scan verification.** Camera permissions, library pick (`jsQR` vs. `@yudiel/react-qr-scanner` vs. native `BarcodeDetector`), and the dual-side scan UX (sender-shows-QR + recipient-scans-QR + symmetric verification) are a deferred slice. The mockups' QR scanner is not implemented.
- **No OpenPGP file import.** The `add_new_contact_aesmsg` mockup mentions `.asc` / `.key` files. We use HPKE/X25519, not OpenPGP — those formats are aspirational and out of scope.
- **No full-page security alert.** The `security_alert_key_changed_aesmsg` mockup is its own slice. Slice 8 ships only the inline amber banner used on contact detail and in the `/create` selected-state.
- **No avatar uploads.** Initials only. Mockup avatars are external CDN URLs we won't host.
- **No presence / activity / "Active 2m ago".** We have no presence system. Drop entirely.
- **No connection logs section** on contact detail. We don't track session events client-side.
- **No notes, tags, email, or organisation grouping.** Label-only minimum data model.
- **No contacts export, import, sync, or device pairing.** Phase 3.
- **No editing a contact's `id` or its `createdAt`.** Internal fields only.
- **No "block" affordance.** Mockup's "Block & Wipe History" becomes plain "Delete Contact" — there's no message history to wipe and no block-list semantics in our model.
- **No revocation of in-flight links sealed to a rotated-away key.** A key change in contacts updates client state only. Existing sealed links remain openable by anyone holding the recipient's old private key. Recipient-side identity rotation is its own deferred slice.

## 4. UX

### 4.1 Mockup deviations

For the record, since multiple mockup elements don't fit:

| Mockup feature | Slice 8 decision |
|---|---|
| QR scan (in `add_new_contact`) | Dropped (deferred) |
| `.asc` / `.key` file import | Dropped (wrong crypto family) |
| "RSA-4096 / SHA-256" footer copy | Dropped (we use HPKE/X25519) |
| Avatar photos / external URLs | Initials-only avatars |
| "Active 2m ago" / "Last message 2d ago" | Dropped (no presence) |
| Connection logs section | Dropped (no session tracking) |
| "Block & Wipe History" | Renamed to "Delete Contact" |
| "Re-verify" QR button | Replaced with manual "Mark as Verified" toggle |
| Add-contact form has no name field | Required `Label` input added |

### 4.2 `/contacts` (list)

- Top app bar: title "Contacts", total count chip on the right.
- Search input under the header — substring match on `label`, client-side, case-insensitive, no debounce needed (lists are small in Phase 1).
- Card list. Each card: initials avatar (in `surface-container-high`), label, verified/unverified chip, fingerprint (truncated to 8 hex pairs via `truncateFingerprint`, JetBrains Mono).
- Click a card → `/contacts/[id]`.
- FAB bottom-right (`person_add` icon, primary gradient) → `/contacts/new`.
- Empty state: explanatory paragraph + CTA button → `/contacts/new`.

The contacts pages (`/contacts`, `/contacts/new`, `/contacts/[id]`) are **not** gated on identity state. The directory is purely local metadata — no private key is required to read, add, edit, or delete entries. A user in `no_identity` or `locked` state can still browse and curate their address book; they just can't *use* contacts to encrypt until they unlock, and `/create`'s existing identity gating handles that cleanly.

### 4.3 `/contacts/new` (add)

A single short form, top-down:

1. **Label** — required text input. Trimmed, length ≥ 1, ≤ 80 chars. No uniqueness check (real-world Alices collide; users should be able to disambiguate via the fingerprint or a suffix).
2. **Public Key** — Base64 SPKI textarea. Live fingerprint preview block under the textarea once the input parses (reuse the existing `importPublicKey` + `fingerprint` flow from `<ComposeForm>`). Invalid keys show "That doesn't look like a valid public key." inline.
3. **Add Contact** primary button — disabled until both fields are valid.

On submit:

- Calls `addContact({ label, publicKey })`.
- On success: redirects to `/contacts/[id]`.
- On duplicate-fingerprint rejection: shows an inline error pointing to the existing contact ("You already saved this key as [existing-label]." with a link to that contact). On rotated-away-fingerprint rejection: "This public key was previously used by [existing-label] and rotated away. If they rotated back, update their key from their contact page." with a link.
- New contacts are saved with `verified: false`. The detail page shows a one-line nudge under the verify chip: "Mark as verified after confirming the fingerprint with [label] over a separate channel."

### 4.4 `/contacts/[id]` (detail)

Top to bottom:

- Header: back button, "Contact Details" title, kebab menu (Rename, Delete).
- Hero: large initials avatar, label (h1), verified/unverified chip, "Mark as Verified" / "Mark as Unverified" toggle button.
- Fingerprint panel: full fingerprint (un-truncated, formatted in 4-char groups), copy-to-clipboard button.
- **Amber "Key Changed" banner**, rendered iff `previousFingerprints.length > 0`. Copy: "[Label]'s public key was updated on [updatedAt date]. Re-verify the new fingerprint with them before sending." Below the copy, a collapsible "Previous fingerprints (N)" disclosure listing the prior fingerprints. The banner uses the same `<KeyChangedBanner>` component used in the `/create` selected-state.
- Action row: "Send Secure Message" primary button (deep-links to `/create?contact=<id>`), "Update Public Key" secondary button.
- **Update Public Key disclosure** — collapsed by default. Opens to a textarea + "Confirm Key Change" button. On confirm, calls `updateContactKey(id, newPublicKey)`. Optimistic UI: banner appears, verified chip flips, previous fingerprint slides into the disclosure list. No navigation, no toast.
- "Delete Contact" destructive button at the bottom (`text-error`). Opens a type-to-confirm modal mirroring `<WipeConfirmModal>`'s shape: user must type the contact's label exactly to enable the delete button. On confirm, calls `deleteContact(id)` and navigates to `/contacts`.

**Mark as Verified confirm modal.** Tapping the toggle when going `unverified → verified` opens a single-confirm modal: "I confirmed the fingerprint `XXXX XXXX XXXX XXXX` with [label] over a separate channel — in person, by phone, or through an already-trusted secure channel." Single confirm button, no type-to-confirm. Tapping the toggle to go `verified → unverified` is instant — no modal (downgrades are always safe).

**Rename** (kebab menu). Opens a small inline modal with a single text field pre-filled with the current label. Save calls `renameContact(id, label)`.

### 4.5 `/create` picker

`<ComposeForm>`'s recipient input becomes a tabbed component.

**Tab selection.** On mount, calls `listContacts()`. The active tab defaults to `Saved Contacts` if the directory is non-empty, otherwise `Paste Public Key`. The active tab is local React state in `<RecipientPicker>` — once set, it stays put for the lifetime of the `<ComposeForm>` instance, but is not persisted across page loads.

**Saved Contacts tab.**

- Search input (label substring, client-side).
- Scrollable card list — same `<ContactRow>` component used on `/contacts`, in a more compact density.
- Empty state ("no contacts yet"): direct link to `/contacts/new`.
- Picking a card → enters **selected state**:
  - The picker collapses to a single pinned card showing avatar + label + verified chip + truncated fingerprint, with a "Change" link to return to picker mode.
  - If the contact has `previousFingerprints.length > 0`, `<KeyChangedBanner>` renders below the pinned card. Clicking the banner navigates to `/contacts/[id]` for re-verification.
  - If `verified: false`, a muted "Unverified" notice renders inline. **Does not block submit.** The zero-knowledge guarantee is independent of trust state — sending to an unverified key is the user's call.
- Form `recipientPublicKeyString` is set to the selected contact's `publicKey`. Submit path is unchanged.

**Paste Public Key tab.**

- Identical to today's textarea + live fingerprint preview.
- Two new client-side checks once the key parses:
  - If the fingerprint matches an existing contact's `currentFingerprint`, show a small note: "This is [label] — saved contact ✓" with a link to that contact's detail page.
  - If the fingerprint matches an entry in any contact's `previousFingerprints`, render a `<KeyChangedBanner>` with copy: "This public key was rotated away by [label]. Send to their current key instead?" — and **disable Submit** until the user clicks an explicit "Use this old key anyway" link. Surfaces a real security signal: someone is trying to use a known-stale key.
- Submit path unchanged.

**Deep-link from contact detail.** `/create?contact=<id>` — `<CreateScreen>` reads `useSearchParams()`, fetches the contact via `getContact(id)`. If found, the picker pre-renders in `Saved Contacts` tab with that contact in selected state. If the id doesn't resolve (deleted, malformed) silently fall through to default behavior (no selection, default tab logic).

### 4.6 Save-as-contact prompt on Result screen

After a successful POST via the **Paste Public Key** path *and* the recipient fingerprint did not match any saved contact, the Result screen renders a one-line CTA below the link card:

> "Save this recipient for next time?" — [Save as contact] button.

Clicking the button opens a small inline modal containing a single label `<input>` and Save / Cancel. Save calls `addContact({ label, publicKey })` with the publicKey already known to `<ResultScreen>`, replaces the CTA with "Saved as [label]" once done. No page navigation. No prompt rendered after a Saved-Contacts-tab submission (the contact is already saved).

## 5. Data model

```ts
// apps/web/src/lib/contacts-store.ts
import type { Fingerprint, PublicKeyString } from "@aesmsg/crypto";

export interface ContactRecord {
  id: string;                          // uuid v4 — stable across key rotations
  label: string;                       // user-supplied display name; trimmed, ≥1, ≤80 chars
  publicKey: PublicKeyString;          // current Base64 SPKI key
  fingerprint: Fingerprint;            // derived from publicKey, denormalized for fast list rendering
  verified: boolean;                   // manual flag; flips to false on every key update
  previousFingerprints: Fingerprint[]; // chronological, oldest-first; non-empty => key-changed banner
  createdAt: string;                   // ISO-8601; set at write time
  updatedAt: string;                   // ISO-8601; bumps on label/key/verified change
  schemaVersion: 1;
}
```

Constants: `DB_NAME = "aesmsg-contacts"`, `DB_VERSION = 1`, `STORE_NAME = "contacts"`. The object store is keyed by `id`. No secondary indexes in v1; lookups by fingerprint go through `getAll()` and a linear scan (Phase 1 directory sizes don't need an index).

## 6. Module API

```ts
// apps/web/src/lib/contacts-store.ts

export interface AddContactInput {
  label: string;
  publicKey: PublicKeyString;
}

export async function addContact(input: AddContactInput): Promise<ContactRecord>;
//   - Trims label; throws InvalidLabelError if the trimmed result is empty or > 80 chars.
//   - Computes fingerprint.
//   - Reads all contacts; throws DuplicateFingerprintError({ existingId, existingLabel })
//     if fingerprint matches any current OR previous fingerprint.
//   - Generates id (crypto.randomUUID()), createdAt = updatedAt = now ISO,
//     verified = false, previousFingerprints = [], schemaVersion = 1.
//   - Writes; returns the persisted record.

export async function listContacts(): Promise<ContactRecord[]>;
//   - Returns all, sorted by label asc (locale-aware compare).

export async function getContact(id: string): Promise<ContactRecord | null>;

export async function updateContactKey(
  id: string,
  newPublicKey: PublicKeyString,
): Promise<ContactRecord>;
//   - Throws NotFoundError if id doesn't exist.
//   - Computes new fingerprint.
//   - Throws SameKeyError if new fingerprint == current fingerprint (no-op).
//   - Throws RotatedAwayError if new fingerprint matches any of THIS contact's
//     own previous fingerprints (downgrade attempt). Other contacts' previous
//     fingerprints are NOT checked here — addContact already rejects cross-contact
//     dupes; updateContactKey is operating within one contact's identity.
//   - Pushes current fingerprint onto previousFingerprints, sets new publicKey
//     and fingerprint, flips verified = false, bumps updatedAt.

export async function setContactVerified(id: string, verified: boolean): Promise<ContactRecord>;
//   - Throws NotFoundError if id doesn't exist.
//   - Updates verified, bumps updatedAt.

export async function renameContact(id: string, label: string): Promise<ContactRecord>;
//   - Trims; throws InvalidLabelError if the trimmed result is empty or > 80 chars.
//   - Throws NotFoundError if id doesn't exist.
//   - Updates label, bumps updatedAt.

export async function deleteContact(id: string): Promise<void>;
//   - No-op if id doesn't exist (idempotent).

export async function __deleteContactsDbForTests(): Promise<void>;
//   - Test-only escape hatch, mirrors sent-links-store's pattern.
```

Errors are typed exceptions with stable `name` properties so call sites can branch on them without instanceof gymnastics:

```ts
export class ContactsStoreError extends Error { name = "ContactsStoreError"; }
export class InvalidLabelError extends ContactsStoreError { name = "InvalidLabelError"; }
export class DuplicateFingerprintError extends ContactsStoreError {
  name = "DuplicateFingerprintError";
  existingId: string;
  existingLabel: string;
  reason: "current" | "previous"; // distinguishes "same key" from "rotated-away key"
}
export class NotFoundError extends ContactsStoreError { name = "NotFoundError"; }
export class SameKeyError extends ContactsStoreError { name = "SameKeyError"; }
export class RotatedAwayError extends ContactsStoreError { name = "RotatedAwayError"; }
```

## 7. Component layout

New components in `apps/web/src/contacts/`:

```
ContactsScreen.tsx           — list page; reads listContacts, owns search state
ContactRow.tsx               — list-row card (used in /contacts and the picker)
AddContactScreen.tsx         — /contacts/new form
ContactScreen.tsx            — /contacts/[id] detail page
KeyChangedBanner.tsx         — amber banner; reused on detail + /create selected-state
VerifyConfirmModal.tsx       — single-confirm modal for verified → unverified transition
DeleteContactConfirmModal.tsx — type-to-confirm modal
RenameContactModal.tsx       — small inline modal
useContacts.ts               — hook wrapping listContacts + a refresh trigger
```

Modifications in `apps/web/src/create/`:

```
ComposeForm.tsx              — replace recipient input with <RecipientPicker />
RecipientPicker.tsx          — NEW; tabbed picker, owns tab state and selection
ResultScreen.tsx             — add save-as-contact CTA + <SaveAsContactModal />
SaveAsContactModal.tsx       — NEW; label input + Save/Cancel
```

New routes in `apps/web/app/`:

```
contacts/page.tsx                       — renders <ContactsScreen />
contacts/new/page.tsx                   — renders <AddContactScreen />
contacts/[id]/page.tsx                  — renders <ContactScreen id={params.id} />
                                          (await params per Next.js 16 convention)
```

The header / shell on `apps/web/app/layout.tsx` doesn't change — there's no global navigation in Phase 1, screens link to each other directly.

## 8. Testing strategy

**Storage layer (Node, fake-indexeddb).** New `apps/web/src/lib/contacts-store.test.ts`. Covers:

- `addContact` happy path, label trimming, length bounds (empty rejects, 80-char ok, 81-char rejects).
- Duplicate fingerprint via current → `DuplicateFingerprintError` with `reason: "current"`.
- Duplicate fingerprint via a previous fingerprint of another contact → `DuplicateFingerprintError` with `reason: "previous"`.
- `listContacts` sort order (locale-aware).
- `updateContactKey` happy path: previous fingerprint pushed, verified flips to false, updatedAt bumps.
- `updateContactKey` `SameKeyError` when the key is unchanged.
- `updateContactKey` `RotatedAwayError` when re-rotating to a key this contact already had.
- `setContactVerified` round-trips both directions.
- `renameContact` trims, validates length.
- `deleteContact` is idempotent.
- Schema version is written and round-trips.

**Component (Vitest browser, Chromium).** New tests under `apps/web/src/contacts/`:

- `ContactsScreen` renders list, empty state, search filter, navigates to add.
- `AddContactScreen` parses and saves; surfaces fingerprint and rejects malformed keys; surfaces duplicate errors with link to existing contact.
- `ContactScreen` renders the verified toggle, opens and confirms the verify modal, opens update-key disclosure, walks through the update flow, observes the banner appearing without navigation, opens delete modal, type-confirms delete and verifies redirect.
- `RecipientPicker` (new tests under `apps/web/src/create/`): renders Saved Contacts when contacts exist, switches to Paste tab, paste detects existing contact, paste detects rotated-away key and disables submit, picker selection feeds the form, deep-link via `?contact=<id>` pre-selects.
- `ResultScreen` save-as-contact CTA: renders only after paste flow, opens modal, saves, replaces with "Saved as".

**Setup.** `apps/web/tests/setup.ts` extended to clear `aesmsg-contacts` IndexedDB alongside the identity DB and `aesmsg-sent-links` DB. No new server-side tests — Slice 8 is client-only.

## 9. File / commit shape

Single logical slice, multiple commits in execution order (TDD per Slice 5/6/7 pattern):

1. `feat(web): add contacts-store with schema v1 and tests`
2. `feat(web): ContactRow + ContactsScreen + /contacts page`
3. `feat(web): AddContactScreen + /contacts/new page`
4. `feat(web): ContactScreen detail + verify/update-key/rename/delete + /contacts/[id] page`
5. `feat(web): KeyChangedBanner shared component`
6. `feat(web): RecipientPicker tabbed input + Saved Contacts tab + paste-detects-existing-contact`
7. `feat(web): RecipientPicker rotated-away key warning + submit gate`
8. `feat(web): /create?contact deep-link pre-selection`
9. `feat(web): ResultScreen save-as-contact CTA + SaveAsContactModal`
10. `chore(web): clear contacts DB in tests/setup.ts`
11. `docs(web): document contacts directory in apps/web/AGENTS.md`

Each commit: typecheck + lint + test green. No commit lands a half-wired feature.

## 10. Acceptance

After Slice 8 ships:

- A user with zero contacts can open `/contacts`, see an empty state, click through to `/contacts/new`, paste a public key with a label, and land on the new contact's detail page.
- The user can mark a contact verified through the confirm modal, see the chip flip, then unmark instantly without a modal.
- The user can update a contact's public key from their detail page, see an amber "Key changed" banner appear immediately, and find the previous fingerprint in the disclosure.
- On `/create`, a user with at least one saved contact sees the Saved Contacts tab as default; picking a contact populates the recipient and the existing encrypt/post path runs unchanged.
- Pasting a public key in `/create` that matches an existing contact shows a small inline confirmation; pasting one that matches a rotated-away fingerprint disables submit until the user explicitly opts in.
- After a successful send via paste, the Result screen offers to save the recipient as a new contact in one click.
- Deleting a contact via the type-to-confirm modal redirects back to `/contacts` and removes the row from list and picker.
- All existing tests still pass; new tests cover the surface above.
