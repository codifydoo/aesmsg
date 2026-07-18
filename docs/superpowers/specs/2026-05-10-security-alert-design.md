# Slice 10 — Security alert when sending to a key-changed contact

**Date:** 2026-05-10
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** Slices 1–8

## 1. Context

Slice 8 added the contacts directory and the inline `<KeyChangedBanner>` that warns the sender — at pick-time and on the contact-detail page — when a contact's public key has rotated. The banner is informational; it does not block anything. The mockup at `all_design_screens/security_alert_key_changed_aesmsg/` shows a heavier intervention: a full-page warning that interrupts the send when the user is about to encrypt to a key-changed-but-unverified contact.

Slice 10 adds that intervention. It surfaces at submit time, presents the previous and current fingerprints side-by-side, and forces an explicit choice: re-verify the contact (reuses Slice 8's `<VerifyConfirmModal>`) or proceed once with full acknowledgement that the key change is unaccounted-for. The alert closes the key-rotation safety story end-to-end. The data foundation already exists — `previousFingerprints[]` and `verified` are written by Slice 8's `updateContactKey`. No server changes.

This slice is **client-side and UI-only**. The contacts directory, the picker, the encrypt-and-post pipeline, and the result screen are all unchanged in their existing behavior.

## 2. Goals

- Add a `verifyKeyChange` state to `<CreateScreen>`'s state machine, transitioned to from `compose` when the form submit's contact has a non-empty `previousFingerprints[]` AND `verified === false`.
- Render a full-screen `<VerifyKeyChangeAlert>` component for that state, driven by the existing mockup. Two action buttons: `Verify Fingerprint` (primary) and `Proceed Anyway (Unsafe)` (destructive secondary).
- Wire `Verify Fingerprint` to Slice 8's `<VerifyConfirmModal>`. On confirm: flip `contact.verified` to true, dismiss the alert, resume the encrypt-and-post pipeline with the original form input.
- Wire `Proceed Anyway` to a one-time submit override: dismiss the alert, resume encrypt-and-post, **no contact mutation**. The next send to the same key-changed-unverified contact triggers the alert again.
- Wire the alert's back/cancel affordance to return to `compose` with the form draft rehydrated (message, expiry, max-opens preserved).
- Extend `ComposeFormSubmit` with `contactId: string | null` so `<CreateScreen>` can look up the contact at submit time.

## 3. Non-goals

- **No persistent "I acknowledged this rotation" flag** on the contact record. Each send through Proceed Anyway requires conscious acknowledgement. The remediation for repeated friction is to actually re-verify the contact via the Verify path (or via the contact-detail `Mark as Verified` toggle).
- **No session-storage acknowledgement.** Closing and reopening the tab does not change behavior; the alert always fires for unverified-key-changed contacts on submit.
- **No paste-tab submit interception.** A pasted key that happens to match a saved contact's current fingerprint goes through `source: "paste"` and does NOT trigger the alert. Phase 1 simplification: the picker's inline "saved contact ✓" note is the only awareness signal for the paste path. If the user wants the alert UX, they pick the contact from the saved-contacts tab.
- **No per-key verification timestamps.** The mockup shows "VERIFIED 2023-11-12" on the previous key card; we don't track that. The previous-key card shows the fingerprint only.
- **No multi-rotation history visualization.** If `previousFingerprints[]` has more than one entry, the alert shows only the most recent (last in the array). The inline banner's disclosure on contact-detail still shows the full history.
- **No alert for verified contacts.** A contact with `verified === true` and non-empty `previousFingerprints[]` does NOT trigger the alert — the user has explicitly re-trusted this key.
- **No keyboard-shortcut / focus-trap polish.** Standard tab order; the back button, Verify, and Proceed Anyway are all reachable. Modal-grade focus trapping is a Slice 8.5 / accessibility-pass concern.
- **No telemetry of any kind.** Zero-knowledge invariant: the server never learns the user clicked Proceed Anyway.

## 4. UX

### 4.1 Trigger

The alert fires when ALL of the following are true at form submit time:

1. `values.source === "contact"` (the recipient came from the saved-contacts tab; paste flow is exempt).
2. `values.contactId` resolves to a contact via `getContact(values.contactId)`.
3. `contact.previousFingerprints.length > 0`.
4. `contact.verified === false`.

If any condition fails, the form transitions directly to `encrypting` per the existing flow. No alert.

### 4.2 The alert screen

Based on `all_design_screens/security_alert_key_changed_aesmsg/code.html`. Top-down:

- **Top app bar.** Back button (24px arrow_back icon, `aria-label="Back"`) → contact avatar (initials via `deriveInitials`, primary-tinted) → contact label (`<span>` with `font-h2 text-h2 font-semibold text-primary`). On the right: a filled `security` icon and an outlined `notifications` icon (decorative, no actions in Phase 1).
- **Amber warning strip** spanning full-width below the header: `<div role="alert" className="bg-tertiary/10 border-b border-tertiary/20">` with `<MaterialIcon name="warning"/>` + the heading "Security Alert: Public Key Changed" (uppercase, `tracking-wider`).
- **Glass-panel description.** Body copy: `"{Label}'s public key fingerprint has changed since your last interaction. This could mean they have a new device or their identity was compromised. Verify the fingerprint before sending."` (Verbatim from the mockup with `{Label}` substituted.)
- **"Verification Required" amber chip.** Inline, immediately below the description.
- **Key Comparison block.** Section heading: `Key Comparison` (uppercase label-sm).
  Two stacked cards:
  - **Previous Known Fingerprint.** `<div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-md">`. Eyebrow: `Previous Known Fingerprint` (uppercase). Body: a `<code>` block in JetBrains Mono showing `formatFingerprint(contact.previousFingerprints[contact.previousFingerprints.length - 1])` (last entry → most recent prior key), in `text-on-surface/60` (faded).
  - **New Detected Fingerprint.** `<div className="bg-surface-container border-2 border-tertiary/20 rounded-xl p-md relative overflow-hidden">`. Top-right corner badge: `CURRENT` (`bg-tertiary text-on-tertiary`, ribbon-style). Eyebrow: `New Detected Fingerprint` (`text-tertiary`). Body: a `<code>` block in JetBrains Mono showing `formatFingerprint(contact.fingerprint)`, prominent `text-on-surface font-medium`. Below the code: a `Copy Fingerprint` button (`<MaterialIcon name="content_copy"/>` + label, `text-primary`) that writes the new fingerprint to the clipboard with a 30s clipboard auto-clear (the same pattern Slice 6's reader uses).
- **Action area** (fixed bottom of the alert, `pb-safe`):
  - Primary button (full-width): `Verify Fingerprint`, `<MaterialIcon name="verified_user"/>` + label. `bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container` per the mockup. `onClick={onVerify}`.
  - Destructive secondary button (full-width): `Proceed Anyway (Unsafe)`, `<MaterialIcon name="gpp_maybe"/>` + label. `bg-transparent border border-outline-variant/20 text-error/80 uppercase tracking-widest`. `onClick={onProceedAnyway}`.

### 4.3 Action handlers in `<CreateScreen>`

```tsx
function transitionToEncrypt(input: ComposeFormSubmit) {
  setState({ kind: "encrypting", input });
}

async function handleFormSubmit(values: ComposeFormSubmit) {
  if (values.source === "contact" && values.contactId) {
    const contact = await getContact(values.contactId);
    if (contact && contact.previousFingerprints.length > 0 && !contact.verified) {
      setState({ kind: "verifyKeyChange", input: values, contact });
      return;
    }
  }
  transitionToEncrypt(values);
}

function handleAlertVerify() {
  // Opens <VerifyConfirmModal>; the modal's onConfirm fires handleVerifyConfirmed
  setVerifyModalOpen(true);
}

async function handleVerifyConfirmed() {
  if (state.kind !== "verifyKeyChange") return;
  try {
    await setContactVerified(state.contact.id, true);
    setVerifyModalOpen(false);
    transitionToEncrypt(state.input);
  } catch (err) {
    // Contact was deleted between alert mounting and Verify click — surface inline error
    setVerifyModalOpen(false);
    setState({ kind: "error", message: (err as Error).message });
  }
}

function handleAlertProceedAnyway() {
  if (state.kind !== "verifyKeyChange") return;
  transitionToEncrypt(state.input);
}

function handleAlertCancel() {
  if (state.kind !== "verifyKeyChange") return;
  // Stash the input so ComposeForm rehydrates with it on re-mount.
  setState({ kind: "compose", rehydrate: state.input });
}
```

The `compose` state carries an optional `rehydrate?: ComposeFormSubmit` payload; on initial mount it's `undefined`, after a verifyKeyChange→compose cancel it carries the previous submission. `<ComposeForm>` reads it via the new `initial*` props (Section 4.4).

### 4.4 `<ComposeForm>` rehydration on cancel

`<ComposeForm>` already accepts `initialContactId?: string | null` (Slice 8 Task 7). Three new optional props:

- `initialMessage?: string` — initial value for the message textarea.
- `initialExpiry?: ExpiryChoice` — initial value for the expiry select.
- `initialMaxOpens?: MaxOpensChoice` — initial value for the max-opens select.

Each maps directly to the corresponding `useState` initializer. `initialContactId` continues to drive both `selectedContactId` state and the existing deep-link `useEffect` that fetches the contact and sets `recipientPublicKey`.

`<CreateScreen>` passes these from `state.rehydrate` when transitioning to `compose` with a non-null rehydrate payload:

```tsx
<ComposeForm
  onSubmit={handleFormSubmit}
  initialContactId={state.rehydrate?.contactId ?? null}
  initialMessage={state.rehydrate?.message}
  initialExpiry={/* derive from state.rehydrate?.expiresAt — see below */}
  initialMaxOpens={state.rehydrate?.maxOpens}
/>
```

**Expiry derivation.** `ComposeFormSubmit` carries `expiresAt: Date`, but `<ComposeForm>` tracks `expiry: ExpiryChoice` (a string enum like `"24h"`). The mapping is the inverse of `expiryToDate(choice, now)`. Two choices:

- (a) Add `expiryChoice: ExpiryChoice` to `ComposeFormSubmit` so we don't need to invert. Cleaner — preserves the user's choice instead of guessing.
- (b) Reverse-derive from the absolute Date, which is fragile (a 24h diff could be drifted, "never" is `9999-12-31`, etc.).

**We pick (a).** `ComposeFormSubmit` gains both `expiresAt: Date` (existing, used by encrypt-and-post) and `expiryChoice: ExpiryChoice` (new, used only for rehydration). `<ComposeForm>` records both at submit time. Tests that assert on submit shape need updating.

### 4.5 `ComposeFormSubmit` extension

```ts
export interface ComposeFormSubmit {
  recipientPublicKeyString: PublicKeyString;
  message: string;
  expiresAt: Date;
  maxOpens: MaxOpensChoice;
  source: "paste" | "contact";
  contactId: string | null;        // NEW: contact id when source is "contact", null when "paste"
  expiryChoice: ExpiryChoice;      // NEW: the ExpiryChoice the user picked, for rehydration
}
```

`<ComposeForm>` already tracks `selectedContactId` and `expiry` in local state; the submit handler just adds them to the payload.

`<CreateScreen>`'s state machine variants update:

```ts
type State =
  | { kind: "compose"; rehydrate?: ComposeFormSubmit }
  | { kind: "verifyKeyChange"; input: ComposeFormSubmit; contact: ContactRecord }
  | { kind: "encrypting"; input: ComposeFormSubmit }
  | { kind: "error"; message: string }
  | { kind: "result"; input: ComposeFormSubmit; output: { url: string; recipientFingerprint: Fingerprint } };
```

(The `compose` state now optionally carries a rehydrate payload; the `verifyKeyChange` state is new.)

### 4.6 Mockup deviations summary

For the spec record:

| Mockup feature | Slice 10 decision |
|---|---|
| "VERIFIED 2023-11-12" date on previous key card | Dropped — no per-key verification timestamps in the data model |
| Multiple previous fingerprints visible | Most recent only — the inline banner on contact-detail shows the full disclosure |
| Bottom navigation visible | Hidden — task-focused screen, suppress shell per the mockup's own comment |
| Sidebar visible on desktop | Hidden — full-bleed alert |
| Notification + security top-right icons | Decorative; no actions wired in Phase 1 |

### 4.7 Edge cases

- **Contact deleted between alert mounting and Verify click.** `setContactVerified` throws `NotFoundError`. Caught in `handleVerifyConfirmed`; transition to `error` state with the message. The existing error UI on `<CreateScreen>` handles display.
- **Contact's `verified` was flipped to true in another tab between alert mounting and Verify click.** The Verify path still works (idempotent setContactVerified). Proceed Anyway path also works (ignores contact state).
- **User refreshes the page while the alert is showing.** State is lost; they're back on `compose` with an empty form. Acceptable — `<CreateScreen>` is single-page and we don't persist the alert state.
- **`previousFingerprints[]` was somehow empty when the trigger gate evaluated true.** Cannot happen — the trigger explicitly checks `length > 0`. The alert can safely index `[length - 1]` without bounds checks.

## 5. Component layout

New file:

```
apps/web/src/create/VerifyKeyChangeAlert.tsx
```

Modifications:

```
apps/web/src/create/CreateScreen.tsx               — add verifyKeyChange state + handlers, mount alert + verify modal
apps/web/src/create/ComposeForm.tsx                — accept initialMessage/initialExpiry/initialMaxOpens; emit contactId + expiryChoice in submit payload
```

Reuse from Slice 8:

- `<VerifyConfirmModal>` (modal that gates `unverified → verified` transitions) — mounted in `<CreateScreen>`, opened by Verify, fires `handleVerifyConfirmed` on confirm.
- `setContactVerified`, `getContact` from `@/src/lib/contacts-store.js`.
- `deriveInitials` from `@/src/contacts/derive-initials.js`.

No new server work, no new IndexedDB work, no new packages.

## 6. Testing strategy

**Unit/component (Vitest browser, Chromium).**

`apps/web/tests/create/VerifyKeyChangeAlert.test.tsx` — new file:

- Renders contact label in the header.
- Renders the formatted current fingerprint and the most recent previous fingerprint.
- "Copy Fingerprint" writes the current fingerprint to the clipboard.
- Click `Verify Fingerprint` → calls `onVerify` once.
- Click `Proceed Anyway (Unsafe)` → calls `onProceedAnyway` once.
- Click back button → calls `onCancel` once.

Extend `apps/web/tests/create/CreateScreen.test.tsx`:

- Submit through a key-changed-unverified contact transitions to `verifyKeyChange`. Alert visible. Encrypt-and-post NOT yet called (assert via fetch mock or similar).
- Verify path: click Verify → `<VerifyConfirmModal>` opens → click Confirm → `setContactVerified` called with the contact id and `true` → encrypt path resumes (assertion on the network mock).
- Proceed Anyway path: click Proceed Anyway → `setContactVerified` NOT called → encrypt path resumes.
- Cancel path: click back button → state returns to `compose` → message textarea still contains the typed text (rehydration).
- Verified-contact-with-previous-fingerprints does NOT trigger the alert (transitions directly to `encrypting`).
- Source=paste does NOT trigger the alert, even when paste fingerprint matches a key-changed-unverified contact.
- Edge case: contact deleted before Verify click → caught error → state transitions to `error`.

Extend `apps/web/tests/create/ComposeForm.test.tsx`:

- `initialMessage` populates the textarea on mount.
- `initialExpiry` populates the expiry select.
- `initialMaxOpens` populates the max-opens select.
- Submit payload includes `contactId` and `expiryChoice` fields with correct values for both paste and contact paths.

Extend `apps/web/tests/contacts-flow.e2e.test.tsx` with one new end-to-end:

- Seed Alice with pkA. Rotate her key to pkB (`updateContactKey`); Alice is now key-changed-unverified.
- Mount `<CreateScreen initialContactId={aliceId} />`. Type a message. Click Encrypt.
- Assert the alert renders (look for the "Security Alert: Public Key Changed" copy).
- Click Verify → modal opens → click Confirm → result screen renders with the link.

## 7. File / commit shape

Single logical slice, multiple TDD commits in execution order:

1. `feat(web): ComposeFormSubmit gains contactId + expiryChoice; submit payload extended`
2. `feat(web): ComposeForm accepts initialMessage/initialExpiry/initialMaxOpens; rehydration props`
3. `feat(web): VerifyKeyChangeAlert component`
4. `feat(web): CreateScreen verifyKeyChange state + alert mount + cancel rehydration`
5. `feat(web): CreateScreen verify-path wires VerifyConfirmModal → setContactVerified → resume encrypt`
6. `feat(web): CreateScreen proceed-anyway-path resumes encrypt without mutating contact`
7. `test(web): contacts-flow e2e — key-changed contact + verify modal + send`
8. `docs(web): document Slice 10 security alert flow in apps/web/AGENTS.md`

Each commit: typecheck + lint + test green. No commit lands a half-wired feature.

## 8. Acceptance

After Slice 10 ships:

- A user picks a key-changed-unverified contact in the saved-contacts tab, types a message, clicks Encrypt → the full-page alert intercepts. Encrypt-and-post does not fire.
- The alert shows the contact's label, current fingerprint, and most recent previous fingerprint side-by-side.
- Clicking `Verify Fingerprint` opens `<VerifyConfirmModal>` ("I confirmed the fingerprint with [name] over a separate channel"). Confirming flips the contact's `verified` flag, dismisses the alert + modal, and the encrypt-and-post pipeline runs with the original message.
- Clicking `Proceed Anyway (Unsafe)` runs encrypt-and-post once; the contact's `verified` flag is unchanged. The next send to the same contact triggers the alert again.
- Clicking the back button returns to compose with the message, expiry, max-opens, and contact selection all rehydrated.
- A verified contact with `previousFingerprints[]` does NOT trigger the alert (no friction once re-verified).
- A pasted-key send does NOT trigger the alert, even when the pasted key matches a key-changed-unverified saved contact's current fingerprint.
- All existing Slice 1–8 tests still pass; new tests cover the surface above.
