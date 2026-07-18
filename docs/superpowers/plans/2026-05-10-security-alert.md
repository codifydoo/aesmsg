# Slice 10 — Security alert when sending to a key-changed contact (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intercept `<CreateScreen>` submit when the recipient is a key-changed-unverified saved contact and present a full-page security alert with old/new fingerprint comparison; user must Verify (reuses Slice 8 modal) or Proceed Anyway (one-time, no state change) before encrypt-and-post fires.

**Architecture:** New state machine variant `verifyKeyChange` in `<CreateScreen>` carrying the form input and the contact record. New `<VerifyKeyChangeAlert>` component renders the full-screen alert UI based on `all_design_screens/security_alert_key_changed_aesmsg/code.html`. Verify path opens Slice 8's `<VerifyConfirmModal>`, on confirm flips `contact.verified` and resumes encrypt. Proceed Anyway resumes encrypt with no state change. Cancel returns to `compose` with form draft rehydrated via new `initialMessage` / `initialExpiry` / `initialMaxOpens` props on `<ComposeForm>`.

**Tech Stack:** Next.js 16 (Client Component), React 19, TypeScript strict, Vitest 3 browser mode (Chromium), `@testing-library/react`, `@aesmsg/crypto` (`generateIdentity` + `exportPublicKey` for real-key fixtures), `@aesmsg/ui` (`Button`, `Modal`, `MaterialIcon`, `Surface`).

**Spec:** [`docs/superpowers/specs/2026-05-10-security-alert-design.md`](../specs/2026-05-10-security-alert-design.md)

---

## File map

```
apps/web/src/create/
├─ VerifyKeyChangeAlert.tsx                          (Task 3 — new)
├─ ComposeForm.tsx                                   (Tasks 1, 2 — modify)
├─ CreateScreen.tsx                                  (Tasks 4, 5, 6 — modify)
└─ RecipientPicker.tsx                               (unchanged)

apps/web/tests/create/
├─ VerifyKeyChangeAlert.test.tsx                     (Task 3 — new)
├─ ComposeForm.test.tsx                              (Tasks 1, 2 — extend)
├─ CreateScreen.test.tsx                             (Tasks 4, 5, 6 — extend)
└─ RecipientPicker.test.tsx                          (unchanged)

apps/web/tests/contacts-flow.e2e.test.tsx            (Task 7 — extend)
apps/web/AGENTS.md                                   (Task 8 — append)
```

---

## Task 1: Extend `ComposeFormSubmit` with `contactId` + `expiryChoice`

**Files:**
- Modify: `apps/web/src/create/ComposeForm.tsx`
- Modify: `apps/web/tests/create/ComposeForm.test.tsx`

The current submit shape is `{ recipientPublicKeyString, message, expiresAt, maxOpens, source }`. Add two fields so `<CreateScreen>` can look up the contact at submit time and `<ComposeForm>` can be rehydrated with the user's original expiry choice:

- `contactId: string | null` — present (the contact's id) when `source === "contact"`, null when `"paste"`. Sourced from `selectedContactId` at submit time.
- `expiryChoice: ExpiryChoice` — the dropdown enum the user picked, before it's converted to an absolute Date. Needed for round-tripping rehydration.

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/create/ComposeForm.test.tsx`. Add to the existing `describe("ComposeForm", ...)` block:

```tsx
import { addContact } from "@/src/lib/contacts-store.js";

it("submits with contactId=null and expiryChoice='24h' for a paste-flow recipient", async () => {
  const onSubmit = vi.fn();
  render(<ComposeForm onSubmit={onSubmit} />);

  const recipient = await generateIdentity();
  const pk = exportPublicKey(recipient);

  const recipientInput = await screen.findByPlaceholderText(
    /Paste recipient's public key/i,
    undefined,
    { timeout: 5000 },
  );
  await act(async () => {
    await userEvent.type(recipientInput, pk);
    await userEvent.type(screen.getByLabelText(/Message/i), "hi");
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  const value = onSubmit.mock.calls[0]?.[0];
  expect(value).toMatchObject({
    source: "paste",
    contactId: null,
    expiryChoice: "24h",
  });
});

it("submits with contactId=<id> and source='contact' when a saved contact is picked", async () => {
  const onSubmit = vi.fn();
  const recipient = await generateIdentity();
  const pk = exportPublicKey(recipient);
  const saved = await addContact({ label: "Alice", publicKey: pk });

  render(<ComposeForm onSubmit={onSubmit} />);

  const aliceCard = await screen.findByRole(
    "button",
    { name: /Alice/i },
    { timeout: 5000 },
  );
  await act(async () => {
    await userEvent.click(aliceCard);
    await userEvent.type(screen.getByLabelText(/Message/i), "hi");
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  const value = onSubmit.mock.calls[0]?.[0];
  expect(value).toMatchObject({
    source: "contact",
    contactId: saved.id,
    expiryChoice: "24h",
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/create/ComposeForm.test.tsx`
Expected: FAIL on the new cases — `value.contactId` and `value.expiryChoice` are undefined because the form doesn't emit them yet.

- [ ] **Step 3: Modify `apps/web/src/create/ComposeForm.tsx`**

Update the `ComposeFormSubmit` interface (lines 15-21):

```tsx
export interface ComposeFormSubmit {
  recipientPublicKeyString: PublicKeyString;
  message: string;
  expiresAt: Date;
  maxOpens: MaxOpensChoice;
  source: "paste" | "contact";
  contactId: string | null;
  expiryChoice: ExpiryChoice;
}
```

Update the `handleSubmit` function (around lines 97-107) to include the two new fields:

```tsx
const handleSubmit = (e: FormEvent) => {
  e.preventDefault();
  if (!canSubmit || !recipientPublicKey) return;
  onSubmit({
    recipientPublicKeyString: recipientPublicKey,
    message,
    expiresAt: expiryToDate(expiry, new Date()),
    maxOpens,
    source: selectedContactId ? "contact" : "paste",
    contactId: selectedContactId,
    expiryChoice: expiry,
  });
};
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/create/ComposeForm.test.tsx`
Expected: PASS — the 2 new cases green plus all existing cases still green.

- [ ] **Step 5: Run full gates**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASS. (Note: `<CreateScreen>` consumes `ComposeFormSubmit` via `state.input` which is then read by `<ResultScreen>` — adding fields is backward-compatible; no consumer assertions break.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/create/ComposeForm.tsx apps/web/tests/create/ComposeForm.test.tsx
git commit -m "feat(web): ComposeFormSubmit gains contactId + expiryChoice for rehydration + lookup"
```

---

## Task 2: `<ComposeForm>` accepts `initialMessage` / `initialExpiry` / `initialMaxOpens`

**Files:**
- Modify: `apps/web/src/create/ComposeForm.tsx`
- Modify: `apps/web/tests/create/ComposeForm.test.tsx`

`<ComposeForm>` already accepts `initialContactId` (Slice 8 Task 7). Add three more optional initial-value props for full draft rehydration when canceling out of the alert.

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/create/ComposeForm.test.tsx`:

```tsx
it("renders with initialMessage populated in the textarea", async () => {
  render(<ComposeForm onSubmit={vi.fn()} initialMessage="draft text" />);
  const textarea = await screen.findByLabelText(/Message/i, undefined, { timeout: 5000 });
  expect((textarea as HTMLTextAreaElement).value).toBe("draft text");
});

it("renders with initialExpiry selected in the expiry dropdown", async () => {
  render(<ComposeForm onSubmit={vi.fn()} initialExpiry="7d" />);
  const expirySelect = await screen.findByLabelText(/Link Expiry/i, undefined, { timeout: 5000 });
  expect((expirySelect as HTMLSelectElement).value).toBe("7d");
});

it("renders with initialMaxOpens selected in the max-opens dropdown", async () => {
  render(<ComposeForm onSubmit={vi.fn()} initialMaxOpens={5} />);
  const maxOpensSelect = await screen.findByLabelText(/Max Views/i, undefined, { timeout: 5000 });
  expect((maxOpensSelect as HTMLSelectElement).value).toBe("5");
});

it("submits the rehydrated values when none have been edited", async () => {
  const onSubmit = vi.fn();
  const recipient = await generateIdentity();
  const pk = exportPublicKey(recipient);

  render(
    <ComposeForm
      onSubmit={onSubmit}
      initialMessage="draft"
      initialExpiry="1h"
      initialMaxOpens={5}
    />,
  );

  const recipientInput = await screen.findByPlaceholderText(
    /Paste recipient's public key/i,
    undefined,
    { timeout: 5000 },
  );
  await act(async () => {
    await userEvent.type(recipientInput, pk);
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  const value = onSubmit.mock.calls[0]?.[0];
  expect(value).toMatchObject({
    message: "draft",
    expiryChoice: "1h",
    maxOpens: 5,
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/create/ComposeForm.test.tsx`
Expected: FAIL — initial props ignored (state always inits to defaults).

- [ ] **Step 3: Modify `apps/web/src/create/ComposeForm.tsx`**

Update the `ComposeFormProps` interface (around lines 23-26):

```tsx
export interface ComposeFormProps {
  onSubmit: (values: ComposeFormSubmit) => void;
  initialContactId?: string | null;
  initialMessage?: string;
  initialExpiry?: ExpiryChoice;
  initialMaxOpens?: MaxOpensChoice;
}
```

Update the function signature and state initializers (around line 45):

```tsx
export function ComposeForm({
  onSubmit,
  initialContactId = null,
  initialMessage = "",
  initialExpiry = "24h",
  initialMaxOpens = 1,
}: ComposeFormProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(initialContactId);
  const [recipientPublicKey, setRecipientPublicKey] = useState<PublicKeyString | null>(null);
  const [_recipientFp, setRecipientFp] = useState<Fingerprint | null>(null);
  const [message, setMessage] = useState(initialMessage);
  const [expiry, setExpiry] = useState<ExpiryChoice>(initialExpiry);
  const [maxOpens, setMaxOpens] = useState<MaxOpensChoice>(initialMaxOpens);
  // ... rest unchanged
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/create/ComposeForm.test.tsx`
Expected: PASS — 4 new cases + all existing cases.

- [ ] **Step 5: Run full gates**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/create/ComposeForm.tsx apps/web/tests/create/ComposeForm.test.tsx
git commit -m "feat(web): ComposeForm accepts initialMessage/initialExpiry/initialMaxOpens for rehydration"
```

---

## Task 3: `<VerifyKeyChangeAlert>` component

**Files:**
- Create: `apps/web/src/create/VerifyKeyChangeAlert.tsx`
- Create: `apps/web/tests/create/VerifyKeyChangeAlert.test.tsx`

Standalone presentational component for the full-screen alert. Driven entirely by props; the parent (`<CreateScreen>`) decides when to mount it.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/create/VerifyKeyChangeAlert.test.tsx`:

```tsx
import type { Fingerprint, PublicKeyString } from "@aesmsg/crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VerifyKeyChangeAlert } from "@/src/create/VerifyKeyChangeAlert.js";
import type { ContactRecord } from "@/src/lib/contacts-store.js";

const oldFp = "0011223344556677889900112233445566778899001122334455667788990011" as Fingerprint;
const newFp = "ffeeeddccbbaa9988776655443322110011223344556677889900112233445566" as Fingerprint;

function makeContact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    label: "Alice Schmidt",
    publicKey: "SOMEPK" as PublicKeyString,
    fingerprint: newFp,
    verified: false,
    previousFingerprints: [oldFp],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

describe("VerifyKeyChangeAlert", () => {
  it("renders the contact label in the header", () => {
    render(
      <VerifyKeyChangeAlert
        contact={makeContact()}
        onVerify={vi.fn()}
        onProceedAnyway={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Alice Schmidt")).toBeInTheDocument();
  });

  it("renders the security alert heading", () => {
    render(
      <VerifyKeyChangeAlert
        contact={makeContact()}
        onVerify={vi.fn()}
        onProceedAnyway={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Security Alert: Public Key Changed/i)).toBeInTheDocument();
  });

  it("renders both fingerprints in 4-char groups, with the new one prominent", () => {
    render(
      <VerifyKeyChangeAlert
        contact={makeContact()}
        onVerify={vi.fn()}
        onProceedAnyway={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // Old fingerprint formatted in 4-char groups (uppercase)
    expect(screen.getByText(/0011 2233 4455 6677/)).toBeInTheDocument();
    // New fingerprint formatted similarly (note: hex from fixture lowercase, formatter uppercases)
    expect(screen.getByText(/FFEE EDDC CBBA A998/)).toBeInTheDocument();
    // CURRENT badge marks the new card
    expect(screen.getByText(/CURRENT/i)).toBeInTheDocument();
  });

  it("renders only the most recent previous fingerprint when there are multiple", () => {
    const olderFp =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Fingerprint;
    render(
      <VerifyKeyChangeAlert
        contact={makeContact({ previousFingerprints: [olderFp, oldFp] })}
        onVerify={vi.fn()}
        onProceedAnyway={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/0011 2233 4455 6677/)).toBeInTheDocument();
    expect(screen.queryByText(/AAAA AAAA AAAA AAAA/)).not.toBeInTheDocument();
  });

  it("calls onVerify when 'Verify Fingerprint' is clicked", async () => {
    const onVerify = vi.fn();
    render(
      <VerifyKeyChangeAlert
        contact={makeContact()}
        onVerify={onVerify}
        onProceedAnyway={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Verify Fingerprint/i }));
    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it("calls onProceedAnyway when 'Proceed Anyway (Unsafe)' is clicked", async () => {
    const onProceedAnyway = vi.fn();
    render(
      <VerifyKeyChangeAlert
        contact={makeContact()}
        onVerify={vi.fn()}
        onProceedAnyway={onProceedAnyway}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Proceed Anyway/i }));
    expect(onProceedAnyway).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the back button is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <VerifyKeyChangeAlert
        contact={makeContact()}
        onVerify={vi.fn()}
        onProceedAnyway={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("'Copy Fingerprint' writes the new fingerprint to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <VerifyKeyChangeAlert
        contact={makeContact()}
        onVerify={vi.fn()}
        onProceedAnyway={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Copy Fingerprint/i }));
    expect(writeText).toHaveBeenCalledWith(newFp);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/create/VerifyKeyChangeAlert.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/web/src/create/VerifyKeyChangeAlert.tsx`**

```tsx
"use client";

import type { Fingerprint } from "@aesmsg/crypto";
import { MaterialIcon, Surface } from "@aesmsg/ui";
import { deriveInitials } from "@/src/contacts/derive-initials.js";
import type { ContactRecord } from "@/src/lib/contacts-store.js";

export interface VerifyKeyChangeAlertProps {
  contact: ContactRecord;
  onVerify: () => void;
  onProceedAnyway: () => void;
  onCancel: () => void;
}

function formatFingerprint(fp: Fingerprint): string {
  return (fp.match(/.{1,4}/g) ?? []).join(" ").toUpperCase();
}

export function VerifyKeyChangeAlert({
  contact,
  onVerify,
  onProceedAnyway,
  onCancel,
}: VerifyKeyChangeAlertProps) {
  const previousFp = contact.previousFingerprints[contact.previousFingerprints.length - 1];
  const initials = deriveInitials(contact.label);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(contact.fingerprint);
    } catch {
      // Clipboard API not available — silent no-op
    }
  }

  return (
    <Surface className="min-h-screen flex flex-col">
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 sticky top-0 z-50">
        <div className="flex justify-between items-center w-full px-lg py-md max-w-7xl mx-auto">
          <div className="flex items-center gap-md">
            <button
              type="button"
              onClick={onCancel}
              aria-label="Back"
              className="text-on-surface-variant active:scale-95 transition-transform"
            >
              <MaterialIcon name="arrow_back" />
            </button>
            <div className="flex items-center gap-sm">
              <div className="w-8 h-8 rounded-full bg-secondary-container/30 flex items-center justify-center">
                <span className="font-h2 text-[14px] font-bold text-on-surface">{initials}</span>
              </div>
              <span className="font-h2 text-h2 font-semibold text-primary">{contact.label}</span>
            </div>
          </div>
          <div className="flex gap-md">
            <MaterialIcon name="security" className="text-primary" />
            <MaterialIcon name="notifications" className="text-on-surface-variant" />
          </div>
        </div>
      </header>

      <div
        role="alert"
        className="bg-tertiary/10 border-b border-tertiary/20 px-lg py-md flex items-start gap-md"
      >
        <MaterialIcon name="warning" className="text-tertiary mt-0.5" />
        <div className="flex-1">
          <h3 className="font-label-sm text-label-sm font-bold text-tertiary uppercase tracking-wider">
            Security Alert: Public Key Changed
          </h3>
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center px-lg py-xl max-w-md mx-auto w-full">
        <section className="w-full mb-xl">
          <div className="bg-surface-container/60 border border-outline-variant/10 rounded-xl p-lg space-y-md">
            <p className="text-on-surface-variant text-body-md leading-relaxed">
              {contact.label}'s public key fingerprint has changed since your last interaction. This
              could mean they have a new device or their identity was compromised. Verify the
              fingerprint before sending.
            </p>
            <div className="inline-flex items-center px-sm py-xs rounded border border-tertiary/30 bg-tertiary/5">
              <span className="text-[10px] font-bold text-tertiary tracking-widest uppercase">
                Verification Required
              </span>
            </div>
          </div>
        </section>

        <section className="w-full space-y-md mb-xxl">
          <h4 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest px-xs">
            Key Comparison
          </h4>
          <div className="grid grid-cols-1 gap-md">
            {previousFp && (
              <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-md">
                <div className="mb-sm">
                  <span className="text-on-surface-variant font-label-sm text-[11px] uppercase tracking-tighter">
                    Previous Known Fingerprint
                  </span>
                </div>
                <div className="bg-background/80 rounded-lg p-md border border-outline-variant/5">
                  <code className="font-mono-code text-on-surface/60 break-all text-sm tracking-widest">
                    {formatFingerprint(previousFp)}
                  </code>
                </div>
              </div>
            )}

            <div className="bg-surface-container border-2 border-tertiary/20 rounded-xl p-md relative overflow-hidden">
              <div className="absolute top-0 right-0 px-md py-1 bg-tertiary text-on-tertiary font-label-sm text-[10px] rounded-bl-lg font-bold">
                CURRENT
              </div>
              <div className="mb-sm">
                <span className="text-tertiary font-label-sm text-[11px] uppercase tracking-tighter">
                  New Detected Fingerprint
                </span>
              </div>
              <div className="bg-background rounded-lg p-md border border-tertiary/10">
                <code className="font-mono-code text-on-surface break-all text-sm tracking-widest font-medium">
                  {formatFingerprint(contact.fingerprint)}
                </code>
              </div>
              <div className="mt-md flex justify-end">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-xs text-primary font-label-sm hover:opacity-80 transition-opacity"
                >
                  <MaterialIcon name="content_copy" className="text-[18px]" />
                  <span>Copy Fingerprint</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="w-full space-y-md mt-auto pb-safe">
          <button
            type="button"
            onClick={onVerify}
            className="w-full py-md px-lg rounded-xl bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-h2 text-[16px] font-bold shadow-lg shadow-primary/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-md"
          >
            <MaterialIcon name="verified_user" />
            Verify Fingerprint
          </button>
          <button
            type="button"
            onClick={onProceedAnyway}
            className="w-full py-md px-lg rounded-xl bg-transparent border border-outline-variant/20 text-error/80 font-label-sm uppercase tracking-widest hover:bg-error/5 active:scale-[0.98] transition-all flex items-center justify-center gap-md"
          >
            <MaterialIcon name="gpp_maybe" />
            Proceed Anyway (Unsafe)
          </button>
        </div>
      </main>
    </Surface>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/create/VerifyKeyChangeAlert.test.tsx`
Expected: PASS — 8 cases green.

- [ ] **Step 5: Run full gates**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/create/VerifyKeyChangeAlert.tsx apps/web/tests/create/VerifyKeyChangeAlert.test.tsx
git commit -m "feat(web): VerifyKeyChangeAlert full-screen security alert component"
```

---

## Task 4: `<CreateScreen>` `verifyKeyChange` state + alert mount + cancel rehydration

**Files:**
- Modify: `apps/web/src/create/CreateScreen.tsx`
- Modify: `apps/web/tests/create/CreateScreen.test.tsx`

Add a new state variant. Trigger logic in `handleSubmit`: if the contact has rotated keys and isn't verified, transition to `verifyKeyChange` instead of `encrypting`. Mount the alert when in that state. Wire only the back button (Cancel) for now — Verify and Proceed Anyway land in Tasks 5 and 6.

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/create/CreateScreen.test.tsx`:

```tsx
import type { ContactRecord } from "@/src/lib/contacts-store.js";

describe("CreateScreen verifyKeyChange flow", () => {
  it("submitting through a key-changed-unverified contact opens the alert and skips encrypt-and-post", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "x", url: "https://x/l/x" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    const { addContact, updateContactKey } = await import("@/src/lib/contacts-store.js");
    const aliceRecipient = await generateIdentity();
    const otherRecipient = await generateIdentity();
    const pkA = exportPublicKey(aliceRecipient);
    const pkB = exportPublicKey(otherRecipient);
    const alice = await addContact({ label: "Alice", publicKey: pkA });
    await updateContactKey(alice.id, pkB);

    render(<CreateScreen initialContactId={alice.id} />);

    const messageInput = await screen.findByLabelText(/Message/i, undefined, { timeout: 5000 });
    await act(async () => {
      await userEvent.type(messageInput, "hi");
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/Security Alert: Public Key Changed/i)).toBeInTheDocument(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clicking back on the alert returns to compose with message rehydrated", async () => {
    const { addContact, updateContactKey } = await import("@/src/lib/contacts-store.js");
    const aliceRecipient = await generateIdentity();
    const otherRecipient = await generateIdentity();
    const pkA = exportPublicKey(aliceRecipient);
    const pkB = exportPublicKey(otherRecipient);
    const alice = await addContact({ label: "Alice", publicKey: pkA });
    await updateContactKey(alice.id, pkB);

    render(<CreateScreen initialContactId={alice.id} />);

    const messageInput = await screen.findByLabelText(/Message/i, undefined, { timeout: 5000 });
    await act(async () => {
      await userEvent.type(messageInput, "draft message");
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/Security Alert: Public Key Changed/i)).toBeInTheDocument(),
    );

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^Back$/i }));
    });

    const rehydratedMessage = await screen.findByLabelText(
      /Message/i,
      undefined,
      { timeout: 5000 },
    );
    expect((rehydratedMessage as HTMLTextAreaElement).value).toBe("draft message");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/create/CreateScreen.test.tsx`
Expected: FAIL — alert never renders (no state for it), encrypt-and-post fires immediately, etc.

- [ ] **Step 3: Modify `apps/web/src/create/CreateScreen.tsx`**

Replace the entire file content:

```tsx
"use client";

import { Surface } from "@aesmsg/ui";
import { useState } from "react";
import type { ApiError } from "@/src/lib/api-client.js";
import { type ContactRecord, getContact } from "@/src/lib/contacts-store.js";
import { recordSentLink } from "@/src/lib/sent-links-store.js";
import { ComposeForm, type ComposeFormSubmit, type MaxOpensChoice } from "./ComposeForm.js";
import { type EncryptAndPostOutput, encryptAndPost } from "./encrypt-and-post.js";
import { ResultScreen } from "./ResultScreen.js";
import { VerifyKeyChangeAlert } from "./VerifyKeyChangeAlert.js";

type State =
  | { kind: "compose"; error: string | null; rehydrate?: ComposeFormSubmit }
  | { kind: "verifyKeyChange"; input: ComposeFormSubmit; contact: ContactRecord }
  | { kind: "encrypting" }
  | {
      kind: "result";
      output: EncryptAndPostOutput;
      input: ComposeFormSubmit;
      expiresAt: Date;
      maxOpens: MaxOpensChoice;
    };

function errorMessageFor(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const apiErr = err as ApiError;
    if (apiErr.status === 429) return "Too many requests. Try again in a minute.";
    if (apiErr.status === 400) return "Validation failed. Please check your inputs.";
    if (apiErr.status === 409) return "Please try again — the system regenerated the link id.";
  }
  return "Something went wrong. Try again.";
}

export interface CreateScreenProps {
  initialContactId?: string | null;
}

export function CreateScreen({ initialContactId = null }: CreateScreenProps = {}) {
  const [state, setState] = useState<State>({ kind: "compose", error: null });

  async function runEncryptAndPost(values: ComposeFormSubmit) {
    setState({ kind: "encrypting" });
    try {
      const output = await encryptAndPost({
        recipientPublicKeyString: values.recipientPublicKeyString,
        message: values.message,
        expiresAt: values.expiresAt,
        maxOpens: values.maxOpens,
      });
      await recordSentLink({
        id: output.id,
        recipientFingerprint: output.recipientFingerprint,
        createdAt: new Date().toISOString(),
        expiresAt: values.expiresAt.toISOString(),
        maxOpens: values.maxOpens,
        label: null,
      });
      setState({
        kind: "result",
        output,
        input: values,
        expiresAt: values.expiresAt,
        maxOpens: values.maxOpens,
      });
    } catch (err) {
      setState({ kind: "compose", error: errorMessageFor(err) });
    }
  }

  const handleSubmit = async (values: ComposeFormSubmit) => {
    if (values.source === "contact" && values.contactId) {
      const contact = await getContact(values.contactId);
      if (contact && contact.previousFingerprints.length > 0 && !contact.verified) {
        setState({ kind: "verifyKeyChange", input: values, contact });
        return;
      }
    }
    await runEncryptAndPost(values);
  };

  const handleAlertCancel = () => {
    if (state.kind !== "verifyKeyChange") return;
    setState({ kind: "compose", error: null, rehydrate: state.input });
  };

  if (state.kind === "verifyKeyChange") {
    return (
      <VerifyKeyChangeAlert
        contact={state.contact}
        onVerify={() => {
          // Wired in Task 5
        }}
        onProceedAnyway={() => {
          // Wired in Task 6
        }}
        onCancel={handleAlertCancel}
      />
    );
  }

  if (state.kind === "encrypting") {
    return (
      <Surface className="min-h-screen flex items-center justify-center">
        <p className="font-body-md text-on-surface-variant text-center max-w-sm">
          Encrypting locally — your message never leaves this device until it's sealed.
        </p>
      </Surface>
    );
  }

  if (state.kind === "result") {
    return (
      <ResultScreen
        url={state.output.url}
        recipientFingerprint={state.output.recipientFingerprint}
        recipientPublicKey={state.input.recipientPublicKeyString}
        recipientSource={state.input.source}
        expiresAt={state.expiresAt}
        maxOpens={state.maxOpens}
        onCreateAnother={() => setState({ kind: "compose", error: null })}
      />
    );
  }

  return (
    <>
      {state.error && (
        <div role="alert" className="px-md md:px-xl pt-lg">
          <div className="max-w-[640px] mx-auto bg-error-container border border-error/30 rounded-lg px-md py-md">
            <p className="text-on-error-container font-body-md">{state.error}</p>
          </div>
        </div>
      )}
      <ComposeForm
        onSubmit={handleSubmit}
        initialContactId={state.rehydrate?.contactId ?? initialContactId}
        initialMessage={state.rehydrate?.message}
        initialExpiry={state.rehydrate?.expiryChoice}
        initialMaxOpens={state.rehydrate?.maxOpens}
      />
    </>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/create/CreateScreen.test.tsx`
Expected: PASS — 2 new cases green plus all existing cases.

- [ ] **Step 5: Run full gates**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/create/CreateScreen.tsx apps/web/tests/create/CreateScreen.test.tsx
git commit -m "feat(web): CreateScreen verifyKeyChange state + alert mount + cancel rehydration"
```

---

## Task 5: Verify path — opens `<VerifyConfirmModal>` → on confirm, flips verified + resumes encrypt

**Files:**
- Modify: `apps/web/src/create/CreateScreen.tsx`
- Modify: `apps/web/tests/create/CreateScreen.test.tsx`

Wire the alert's `onVerify`. Mount the existing Slice 8 `<VerifyConfirmModal>` in `<CreateScreen>`. On modal confirm, call `setContactVerified(contact.id, true)` then transition to encrypting.

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/create/CreateScreen.test.tsx` (inside the existing `describe("CreateScreen verifyKeyChange flow", ...)` block):

```tsx
it("Verify path: opens confirm modal, on confirm flips verified=true and runs encrypt-and-post", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "x", url: "https://x/l/x" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );

  const { addContact, updateContactKey, getContact } = await import("@/src/lib/contacts-store.js");
  const aliceRecipient = await generateIdentity();
  const otherRecipient = await generateIdentity();
  const pkA = exportPublicKey(aliceRecipient);
  const pkB = exportPublicKey(otherRecipient);
  const alice = await addContact({ label: "Alice", publicKey: pkA });
  await updateContactKey(alice.id, pkB);

  render(<CreateScreen initialContactId={alice.id} />);

  const messageInput = await screen.findByLabelText(/Message/i, undefined, { timeout: 5000 });
  await act(async () => {
    await userEvent.type(messageInput, "hi");
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() =>
    expect(screen.getByText(/Security Alert: Public Key Changed/i)).toBeInTheDocument(),
  );

  // Click Verify on the alert — modal opens
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Verify Fingerprint/i }));
  });
  await waitFor(() =>
    expect(screen.getByText(/I confirmed the fingerprint/i)).toBeInTheDocument(),
  );

  // Confirm in the modal
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Confirm Verified/i }));
  });

  // Encrypt path resumed
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  // Contact's verified flag flipped
  const updated = await getContact(alice.id);
  expect(updated?.verified).toBe(true);
});

it("Verify path: contact deleted between alert mount and confirm surfaces an error", async () => {
  const { addContact, updateContactKey, deleteContact } = await import(
    "@/src/lib/contacts-store.js"
  );
  const aliceRecipient = await generateIdentity();
  const otherRecipient = await generateIdentity();
  const pkA = exportPublicKey(aliceRecipient);
  const pkB = exportPublicKey(otherRecipient);
  const alice = await addContact({ label: "Alice", publicKey: pkA });
  await updateContactKey(alice.id, pkB);

  render(<CreateScreen initialContactId={alice.id} />);

  const messageInput = await screen.findByLabelText(/Message/i, undefined, { timeout: 5000 });
  await act(async () => {
    await userEvent.type(messageInput, "hi");
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() =>
    expect(screen.getByText(/Security Alert: Public Key Changed/i)).toBeInTheDocument(),
  );

  // Simulate another tab deleting the contact while the alert is up
  await deleteContact(alice.id);

  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Verify Fingerprint/i }));
  });
  await waitFor(() =>
    expect(screen.getByText(/I confirmed the fingerprint/i)).toBeInTheDocument(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Confirm Verified/i }));
  });

  // Returns to compose with an error message
  await waitFor(() =>
    expect(
      screen.getByText(/not found|Something went wrong/i),
    ).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/create/CreateScreen.test.tsx`
Expected: FAIL — Verify button click does nothing yet (handler is empty), modal never opens.

- [ ] **Step 3: Modify `apps/web/src/create/CreateScreen.tsx`**

Add the imports at the top:

```tsx
import { setContactVerified } from "@/src/lib/contacts-store.js";
import { VerifyConfirmModal } from "@/src/contacts/VerifyConfirmModal.js";
```

Replace the `formatFingerprint` is in the alert; for the modal we need a formatted version of the contact's current fingerprint. Add a small helper at the top of the file (after the imports):

```tsx
function formatFingerprint(fp: string): string {
  return (fp.match(/.{1,4}/g) ?? []).join(" ").toUpperCase();
}
```

Inside the `CreateScreen` function, add modal-open state and the verify handlers:

```tsx
const [verifyModalOpen, setVerifyModalOpen] = useState(false);

const handleAlertVerify = () => {
  if (state.kind !== "verifyKeyChange") return;
  setVerifyModalOpen(true);
};

const handleVerifyConfirmed = async () => {
  if (state.kind !== "verifyKeyChange") return;
  try {
    await setContactVerified(state.contact.id, true);
    setVerifyModalOpen(false);
    await runEncryptAndPost(state.input);
  } catch (err) {
    setVerifyModalOpen(false);
    setState({ kind: "compose", error: errorMessageFor(err) });
  }
};
```

Wire the alert's `onVerify` to `handleAlertVerify` and mount the modal alongside the alert. Replace the `verifyKeyChange` branch:

```tsx
if (state.kind === "verifyKeyChange") {
  return (
    <>
      <VerifyKeyChangeAlert
        contact={state.contact}
        onVerify={handleAlertVerify}
        onProceedAnyway={() => {
          // Wired in Task 6
        }}
        onCancel={handleAlertCancel}
      />
      <VerifyConfirmModal
        open={verifyModalOpen}
        label={state.contact.label}
        fingerprint={formatFingerprint(state.contact.fingerprint)}
        onCancel={() => setVerifyModalOpen(false)}
        onConfirm={handleVerifyConfirmed}
      />
    </>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/create/CreateScreen.test.tsx`
Expected: PASS — both new cases green plus all existing.

- [ ] **Step 5: Run full gates**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/create/CreateScreen.tsx apps/web/tests/create/CreateScreen.test.tsx
git commit -m "feat(web): CreateScreen Verify path — mount VerifyConfirmModal + flip verified + resume encrypt"
```

---

## Task 6: Proceed-Anyway path + non-trigger guards

**Files:**
- Modify: `apps/web/src/create/CreateScreen.tsx`
- Modify: `apps/web/tests/create/CreateScreen.test.tsx`

Wire the remaining `onProceedAnyway` handler — it transitions straight to encrypting with the original input, no contact mutation. Add tests for the negative trigger paths: paste-tab and verified-with-previous-fingerprints both bypass the alert.

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/create/CreateScreen.test.tsx` (inside the existing `describe("CreateScreen verifyKeyChange flow", ...)` block):

```tsx
it("Proceed Anyway: runs encrypt-and-post without flipping verified", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "x", url: "https://x/l/x" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );

  const { addContact, updateContactKey, getContact } = await import("@/src/lib/contacts-store.js");
  const aliceRecipient = await generateIdentity();
  const otherRecipient = await generateIdentity();
  const pkA = exportPublicKey(aliceRecipient);
  const pkB = exportPublicKey(otherRecipient);
  const alice = await addContact({ label: "Alice", publicKey: pkA });
  await updateContactKey(alice.id, pkB);

  render(<CreateScreen initialContactId={alice.id} />);

  const messageInput = await screen.findByLabelText(/Message/i, undefined, { timeout: 5000 });
  await act(async () => {
    await userEvent.type(messageInput, "hi");
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() =>
    expect(screen.getByText(/Security Alert: Public Key Changed/i)).toBeInTheDocument(),
  );

  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Proceed Anyway/i }));
  });

  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  const updated = await getContact(alice.id);
  expect(updated?.verified).toBe(false); // unchanged
});

it("paste-tab submit does NOT trigger the alert even when paste matches a key-changed-unverified saved contact", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "x", url: "https://x/l/x" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );

  const { addContact, updateContactKey } = await import("@/src/lib/contacts-store.js");
  const aliceRecipient = await generateIdentity();
  const otherRecipient = await generateIdentity();
  const pkA = exportPublicKey(aliceRecipient);
  const pkB = exportPublicKey(otherRecipient);
  const alice = await addContact({ label: "Alice", publicKey: pkA });
  await updateContactKey(alice.id, pkB);
  // Alice's current key is pkB; her previousFingerprints contains the fp of pkA.
  // Paste pkB (her current key) — picker emits source:"paste", no alert.

  render(<CreateScreen />);

  const recipientInput = await screen.findByPlaceholderText(
    /Paste recipient's public key/i,
    undefined,
    { timeout: 5000 },
  );
  await act(async () => {
    await userEvent.type(recipientInput, pkB);
    await userEvent.type(screen.getByLabelText(/Message/i), "hi");
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  expect(screen.queryByText(/Security Alert: Public Key Changed/i)).not.toBeInTheDocument();
});

it("verified contact with non-empty previousFingerprints does NOT trigger the alert", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "x", url: "https://x/l/x" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );

  const { addContact, updateContactKey, setContactVerified } = await import(
    "@/src/lib/contacts-store.js"
  );
  const aliceRecipient = await generateIdentity();
  const otherRecipient = await generateIdentity();
  const pkA = exportPublicKey(aliceRecipient);
  const pkB = exportPublicKey(otherRecipient);
  const alice = await addContact({ label: "Alice", publicKey: pkA });
  await updateContactKey(alice.id, pkB);
  await setContactVerified(alice.id, true); // user re-verified after rotation

  render(<CreateScreen initialContactId={alice.id} />);

  const messageInput = await screen.findByLabelText(/Message/i, undefined, { timeout: 5000 });
  await act(async () => {
    await userEvent.type(messageInput, "hi");
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  expect(screen.queryByText(/Security Alert: Public Key Changed/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/create/CreateScreen.test.tsx`
Expected: FAIL — the Proceed Anyway click does nothing (handler empty).

- [ ] **Step 3: Modify `apps/web/src/create/CreateScreen.tsx`**

Inside the `CreateScreen` function, add the proceed-anyway handler:

```tsx
const handleAlertProceedAnyway = async () => {
  if (state.kind !== "verifyKeyChange") return;
  await runEncryptAndPost(state.input);
};
```

Update the `verifyKeyChange` branch JSX to wire `onProceedAnyway`:

```tsx
if (state.kind === "verifyKeyChange") {
  return (
    <>
      <VerifyKeyChangeAlert
        contact={state.contact}
        onVerify={handleAlertVerify}
        onProceedAnyway={handleAlertProceedAnyway}
        onCancel={handleAlertCancel}
      />
      <VerifyConfirmModal
        open={verifyModalOpen}
        label={state.contact.label}
        fingerprint={formatFingerprint(state.contact.fingerprint)}
        onCancel={() => setVerifyModalOpen(false)}
        onConfirm={handleVerifyConfirmed}
      />
    </>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/create/CreateScreen.test.tsx`
Expected: PASS — 3 new cases green plus all existing.

- [ ] **Step 5: Run full gates**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/create/CreateScreen.tsx apps/web/tests/create/CreateScreen.test.tsx
git commit -m "feat(web): CreateScreen Proceed-Anyway path + paste/verified non-trigger guards"
```

---

## Task 7: End-to-end contacts-flow extension

**Files:**
- Modify: `apps/web/tests/contacts-flow.e2e.test.tsx`

Add one full end-to-end exercising the whole alert flow against real IndexedDB and a mocked network.

- [ ] **Step 1: Append the failing test**

Append to `apps/web/tests/contacts-flow.e2e.test.tsx` (inside the existing top-level `describe(...)` block):

```tsx
it("key-changed contact: alert intercepts → Verify modal → confirm → result screen", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "abcdefghij012345", url: "https://x/l/abcdefghij012345" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );

  const { addContact, updateContactKey, getContact } = await import(
    "@/src/lib/contacts-store.js"
  );
  const recipient = await generateIdentity();
  const other = await generateIdentity();
  const pkA = exportPublicKey(recipient);
  const pkB = exportPublicKey(other);
  const alice = await addContact({ label: "Alice", publicKey: pkA });
  await updateContactKey(alice.id, pkB);

  render(<CreateScreen initialContactId={alice.id} />);

  const messageInput = await screen.findByLabelText(/Message/i, undefined, { timeout: 5000 });
  await act(async () => {
    await userEvent.type(messageInput, "hello key-changed Alice");
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
  });

  await waitFor(() =>
    expect(screen.getByText(/Security Alert: Public Key Changed/i)).toBeInTheDocument(),
  );
  expect(fetchSpy).not.toHaveBeenCalled();

  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Verify Fingerprint/i }));
  });
  await waitFor(() =>
    expect(screen.getByText(/I confirmed the fingerprint/i)).toBeInTheDocument(),
  );
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: /Confirm Verified/i }));
  });

  await waitFor(() =>
    expect(screen.getByText(/Secure Link Created|Share Link/i)).toBeInTheDocument(),
  );
  expect(fetchSpy).toHaveBeenCalled();
  const updated = await getContact(alice.id);
  expect(updated?.verified).toBe(true);
});
```

- [ ] **Step 2: Run the e2e — expect pass**

Run: `pnpm --filter web exec vitest run tests/contacts-flow.e2e.test.tsx`
Expected: PASS — 4 cases green (3 existing + 1 new).

- [ ] **Step 3: Run full gates**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASS — full web suite green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/contacts-flow.e2e.test.tsx
git commit -m "test(web): contacts e2e — key-changed alert + Verify modal + send"
```

---

## Task 8: Document Slice 10 in `apps/web/AGENTS.md`

**Files:**
- Modify: `apps/web/AGENTS.md`

- [ ] **Step 1: Append a "Security alert (Slice 10)" section**

Append to `apps/web/AGENTS.md` (after the existing "Contacts (Slice 8)" section):

```markdown
### Security alert (Slice 10)

When the sender submits the compose form with a saved contact whose key has rotated AND `verified === false`, `<CreateScreen>` does NOT go straight to encrypt. Instead it transitions to a `verifyKeyChange` state and renders `<VerifyKeyChangeAlert>` — a full-page, mockup-driven warning that shows the previous and current fingerprint side-by-side and forces an explicit choice.

Three exits from the alert:

1. **Verify Fingerprint.** Opens Slice 8's `<VerifyConfirmModal>` (the same single-confirm "I confirmed this OOB" modal used on contact-detail). On confirm, `setContactVerified(contactId, true)` runs, then the encrypt-and-post pipeline resumes with the original form input.
2. **Proceed Anyway (Unsafe).** One-time submit override. Encrypt-and-post runs with the original input. The contact's `verified` flag is **not** changed — the next send to the same contact will trigger the alert again. There is no per-session or persistent acknowledgement flag.
3. **Back.** Returns to compose with the form draft rehydrated via `<ComposeForm>`'s `initialMessage`/`initialExpiry`/`initialMaxOpens` props (which Slice 10 added alongside the existing `initialContactId`). The `compose` state carries an optional `rehydrate?: ComposeFormSubmit` payload for this round-trip.

The alert ONLY fires for `source === "contact"` submits. Paste-tab submits — even when the pasted key matches a saved contact's current fingerprint — bypass the alert. The picker's inline "saved contact ✓" note is the awareness signal for the paste path; users who want the alert UX should pick from the saved-contacts tab.

`ComposeFormSubmit` carries `contactId: string | null` (id when source is `"contact"`, null otherwise) and `expiryChoice: ExpiryChoice` (the user's dropdown pick before Date conversion) — both added in Slice 10 to support the lookup and rehydration flows.
```

- [ ] **Step 2: Run gates**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`
Expected: PASS — no code changes, just docs.

- [ ] **Step 3: Commit**

```bash
git add apps/web/AGENTS.md
git commit -m "docs(web): document Slice 10 security alert flow"
```

---

## Acceptance — final verification

After Task 8, run from repo root:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: ALL GREEN. The new web tests should add roughly 20+ cases (`VerifyKeyChangeAlert` 8, `ComposeForm` rehydration + submit-shape ~6, `CreateScreen` flow ~6, `contacts-flow.e2e` 1) on top of the existing 221.

Spot-check the live UX by running `pnpm dev` and walking through:

1. Visit `/contacts`. Add Alice with a public key. Land on `/contacts/[id]` (Unverified chip).
2. From `/contacts/[id]`, click `Update Public Key`, paste a new key, click `Confirm Key Change`. Banner appears, chip stays Unverified.
3. Click `Send Secure Message` — lands on `/create?contact=<id>` with Alice pre-selected.
4. Type a message. Click `Encrypt & Create Link`.
5. **Full-page security alert intercepts.** See "Security Alert: Public Key Changed", the previous and current fingerprints side-by-side, and the two action buttons.
6. Click `Verify Fingerprint`. Modal opens asking to confirm OOB verification.
7. Click `Confirm Verified`. Alert + modal dismiss; the encrypting state appears briefly; then the Result screen shows the share link.
8. Repeat steps 1–4 for Bob (rotate his key, leave unverified). On the alert, click `Proceed Anyway (Unsafe)` instead. Result screen renders. Visit `/contacts/[id]` for Bob — chip is still Unverified (no flip).
9. Repeat for Charlie. On the alert, click the back button. Returns to `/create` with Charlie still selected and the message field still populated.
