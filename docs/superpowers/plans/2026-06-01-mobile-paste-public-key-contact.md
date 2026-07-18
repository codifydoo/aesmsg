# Paste public key → add contact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the Contacts "Paste public key → Coming soon" dead-end with a working screen that validates a pasted `amk1:` key, names it, saves it to the encrypted contacts store, and lands on the new contact's detail.

**Architecture:** A new presentational `PasteKeyScreen` collects the key + name; a new pure `paste-contact-error` module holds the submit gate + error→copy mapping (node-tested). Validation reuses the compose precedent (`importPublicKey` throws `InvalidFormatError`; brand `as PublicKeyString`); persistence reuses `contacts-store.addContact`. `ContactsFlow` gains a real `paste` route (plus an `import-soon` coming-soon for the file-import method) and points all paste entry points at it.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), React Native/Expo, Vitest (node env, no React renderer — pure logic tested, screens/wiring verified by typecheck/lint), `@aesmsg/crypto`, `expo-clipboard`.

**Conventions:** gates from repo root — `pnpm --filter @aesmsg/mobile <typecheck|test>`, `pnpm lint` (Biome; run `pnpm lint:fix` for formatting). Ignore the 2 pre-existing `!important` warnings in `apps/web/app/globals.css`. Conventional commits scoped `mobile`.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `apps/mobile/src/contacts/paste-contact-error.ts` (new) | pure `canAddContact` gate + `pasteContactError` mapper | A |
| `apps/mobile/tests/paste-contact-error.test.ts` (new) | unit tests for the above | A |
| `apps/mobile/src/components/Field.tsx` | add optional `multiline` prop | B |
| `apps/mobile/src/contacts/PasteKeyScreen.tsx` (new) | the paste/validate/save screen | C |
| `apps/mobile/src/contacts/ContactsFlow.tsx` | `paste` + `import-soon` routes; repoint entry points | D |

---

## Task A: `paste-contact-error.ts` pure module (TDD)

**Files:**
- Create: `apps/mobile/src/contacts/paste-contact-error.ts`
- Test: `apps/mobile/tests/paste-contact-error.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/paste-contact-error.test.ts`:

```ts
import { InvalidFormatError } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { DuplicateFingerprintError, InvalidLabelError } from "@/src/contacts/contacts-store";
import { canAddContact, pasteContactError } from "@/src/contacts/paste-contact-error";

// Pure gate + error→copy mapping for the Paste-public-key screen (node-tested, no renderer).
const VALID_LOOKING_KEY = "amk1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("canAddContact", () => {
  it("requires a non-empty (trimmed) name", () => {
    expect(canAddContact(VALID_LOOKING_KEY, "")).toBe(false);
    expect(canAddContact(VALID_LOOKING_KEY, "   ")).toBe(false);
  });

  it("requires a key that at least looks like a public key", () => {
    expect(canAddContact("nope", "Alice")).toBe(false);
    expect(canAddContact(VALID_LOOKING_KEY, "Alice")).toBe(true);
  });
});

describe("pasteContactError", () => {
  it("maps InvalidFormatError to the malformed-key copy", () => {
    expect(pasteContactError(new InvalidFormatError("bad"))).toMatch(/valid aesmsg public key/i);
  });

  it("names the existing contact for a current duplicate", () => {
    const e = new DuplicateFingerprintError("dup", {
      existingId: "1",
      existingLabel: "Elena",
      reason: "current",
    });
    expect(pasteContactError(e)).toBe('This key is already saved as "Elena".');
  });

  it("frames a rotated-away (previous) duplicate as a rotation", () => {
    const e = new DuplicateFingerprintError("dup", {
      existingId: "1",
      existingLabel: "Marcus",
      reason: "previous",
    });
    expect(pasteContactError(e)).toBe('This key was rotated away by "Marcus".');
  });

  it("maps InvalidLabelError to the name prompt", () => {
    expect(pasteContactError(new InvalidLabelError("x"))).toMatch(/enter a name/i);
  });

  it("falls back for unknown errors", () => {
    expect(pasteContactError(new Error("boom"))).toMatch(/couldn't add this contact/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @aesmsg/mobile test -- paste-contact-error`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `apps/mobile/src/contacts/paste-contact-error.ts`:

```ts
import { InvalidFormatError } from "@aesmsg/crypto";
import { DuplicateFingerprintError, InvalidLabelError } from "@/src/contacts/contacts-store";
import { looksLikePublicKey } from "@/src/create/recipient";

// Pure helpers for the Paste-public-key contact screen. Extracted (node-tested, no React) per the
// apps/mobile convention; mirrors keys/gate-error.ts so the screen stays thin & presentational.

/** Enable "Add contact" only with a name and something that at least looks like a public key. */
export function canAddContact(key: string, name: string): boolean {
  return name.trim().length > 0 && looksLikePublicKey(key);
}

/** Map a thrown validation/store error to user-facing copy for the paste screen. */
export function pasteContactError(e: unknown): string {
  if (e instanceof InvalidFormatError) {
    return "That doesn't look like a valid aesmsg public key. Check that you copied the whole key.";
  }
  if (e instanceof DuplicateFingerprintError) {
    return e.reason === "previous"
      ? `This key was rotated away by "${e.existingLabel}".`
      : `This key is already saved as "${e.existingLabel}".`;
  }
  if (e instanceof InvalidLabelError) {
    return "Enter a name for this contact.";
  }
  return "Couldn't add this contact. Please try again.";
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @aesmsg/mobile test -- paste-contact-error`
Expected: PASS (both suites).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @aesmsg/mobile typecheck` (PASS) and `pnpm lint` (no new findings).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/contacts/paste-contact-error.ts apps/mobile/tests/paste-contact-error.test.ts
git commit -m "feat(mobile): add paste-contact error mapper + submit gate"
```

---

## Task B: add `multiline` to the `Field` component

**Files:** Modify `apps/mobile/src/components/Field.tsx`

- [ ] **Step 1: Add the prop + style (additive; default false = unchanged behavior)**

In `FieldProps`, add:
```tsx
  /** Multi-line input (e.g. a pasted public key). */
  multiline?: boolean;
```

In the destructure, add `multiline = false,` (alongside the other props).

On the `<TextInput>`, add `multiline={multiline}` and append `multiline && styles.multiline` to the `style` array, so it reads:
```tsx
        style={[styles.input, mono && styles.mono, eye && styles.inputWithEye, multiline && styles.multiline]}
```

Add to the StyleSheet:
```tsx
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
```

(Do not combine `multiline` with `eye`/`secureTextEntry` — the key field uses neither.)

- [ ] **Step 2: Verify**

Run: `pnpm --filter @aesmsg/mobile typecheck` (PASS) and `pnpm lint` (clean). No renderer test — `Field` is presentational and the change is additive.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/Field.tsx
git commit -m "feat(mobile): add multiline variant to Field"
```

---

## Task C: `PasteKeyScreen.tsx`

**Files:** Create `apps/mobile/src/contacts/PasteKeyScreen.tsx`

- [ ] **Step 1: Create the screen**

```tsx
import { importPublicKey, type PublicKeyString } from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Field, Icon, Screen } from "@/src/components";
import { addContact } from "@/src/contacts/contacts-store";
import { canAddContact, pasteContactError } from "@/src/contacts/paste-contact-error";
import { colors } from "@/src/theme";

// 36b · Paste public key → add contact. Paste/enter an amk1: key + a name, validate via
// importPublicKey (authoritative — throws InvalidFormatError on a bad key, exactly like the compose
// flow), brand it `as PublicKeyString` (the create-and-seal precedent), then persist via the
// encrypted contacts store. Thin: the submit gate + error→copy mapping live in the pure
// paste-contact-error module. On success the flow routes to the new contact's (unverified) detail.

export interface PasteKeyScreenProps {
  onBack: () => void;
  /** Called with the new contact's id after a successful add. */
  onAdded: (contactId: string) => void;
}

export function PasteKeyScreen({ onBack, onAdded }: PasteKeyScreenProps) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pasteFromClipboard() {
    const text = await Clipboard.getStringAsync().catch(() => "");
    if (text) {
      setKey(text.trim());
      setError(null);
    }
  }

  async function submit() {
    if (busy || !canAddContact(key, name)) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = key.trim();
      await importPublicKey(trimmed); // authoritative validation; throws InvalidFormatError
      const record = await addContact({ label: name, publicKey: trimmed as PublicKeyString });
      onAdded(record.id);
    } catch (e) {
      setError(pasteContactError(e));
      setBusy(false);
    }
  }

  const canSubmit = !busy && canAddContact(key, name);

  return (
    <View style={styles.root}>
      <AppBar title="Paste public key" onLeading={onBack} />
      <Screen topInset={false} contentStyle={styles.content}>
        <Text style={styles.lead}>
          Paste your contact's aesmsg public key, then give them a name.
        </Text>

        <View style={styles.group}>
          <Text style={styles.label}>Public key</Text>
          <Field
            placeholder="amk1:…"
            value={key}
            onChangeText={(t) => {
              setKey(t);
              setError(null);
            }}
            mono
            multiline
          />
          <Pressable
            onPress={() => void pasteFromClipboard()}
            accessibilityRole="button"
            accessibilityLabel="Paste from clipboard"
            hitSlop={8}
            style={styles.pasteBtn}
          >
            <Icon name="content_paste" size={16} color={colors.primary} />
            <Text style={styles.pasteText}>Paste from clipboard</Text>
          </Pressable>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Name</Text>
          <Field
            placeholder="e.g. Elena Rodriguez"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.note}>
          <Icon name="info" size={18} color={colors.onSurfaceVariant} />
          <Text style={styles.noteText}>
            Verify this fingerprint with your contact before sending sensitive information.
          </Text>
        </View>

        <Button
          icon="person_add"
          onPress={() => void submit()}
          disabled={!canSubmit}
          style={styles.cta}
        >
          {busy ? "Adding…" : "Add contact"}
        </Button>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { gap: 16, paddingTop: 4 },
  lead: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 23 },
  group: { gap: 8 },
  label: { fontSize: 13, fontWeight: "500", color: colors.onSurfaceVariant },
  pasteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  pasteText: { color: colors.primary, fontSize: 13, fontWeight: "500" },
  error: { color: colors.error, fontSize: 13, lineHeight: 19 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  noteText: { flex: 1, fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 20 },
  cta: { marginTop: 4 },
});
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @aesmsg/mobile typecheck` (PASS) and `pnpm lint` (run `pnpm lint:fix` if Biome flags import order/formatting on the new file, then re-run). No renderer test (convention).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/contacts/PasteKeyScreen.tsx
git commit -m "feat(mobile): add PasteKeyScreen (paste public key to add a contact)"
```

---

## Task D: wire `PasteKeyScreen` into `ContactsFlow`

**Files:** Modify `apps/mobile/src/contacts/ContactsFlow.tsx`

- [ ] **Step 1: Import the new screen**

Add near the other contact-screen imports:
```tsx
import { PasteKeyScreen } from "@/src/contacts/PasteKeyScreen";
```

- [ ] **Step 2: Update the `Route` union**

Replace the `{ name: "paste-soon" }` member with two routes:
```tsx
  | { name: "scan" }
  | { name: "paste" }
  | { name: "import-soon" };
```
(Keep the `list`/`detail`/`add`/`verify`/`scan` members as they are.)

- [ ] **Step 3: Exempt `paste`/`import-soon` from the empty-store guard**

The empty-store guard currently reads:
```tsx
  if (
    loaded &&
    records.length === 0 &&
    route.name !== "add" &&
    route.name !== "scan" &&
    route.name !== "paste-soon"
  ) {
```
Change the last condition so paste/import sub-screens aren't bounced to the empty state:
```tsx
  if (
    loaded &&
    records.length === 0 &&
    route.name !== "add" &&
    route.name !== "scan" &&
    route.name !== "paste" &&
    route.name !== "import-soon"
  ) {
```
And in that `ContactsEmptyScreen`, repoint paste:
```tsx
        onPaste={() => setRoute({ name: "paste" })}
```

- [ ] **Step 4: Repoint the Add-contact chooser**

In the `case "add":` `AddContactScreen`, change `onPick` so paste → paste and import → import-soon:
```tsx
          onPick={(method) =>
            setRoute(
              method === "scan"
                ? { name: "scan" }
                : method === "paste"
                  ? { name: "paste" }
                  : { name: "import-soon" },
            )
          }
```

- [ ] **Step 5: Repoint the QR screen's "paste instead"**

In `case "scan":`:
```tsx
    case "scan":
      return <QRScanScreen onBack={goList} onPaste={() => setRoute({ name: "paste" })} />;
```

- [ ] **Step 6: Replace the `paste-soon` case with `paste` + `import-soon`**

Replace:
```tsx
    case "paste-soon":
      return (
        <ComingSoonScreen
          title="Paste public key"
          icon="content_paste"
          message="Pasting and importing a public key is coming soon."
          onBack={goList}
        />
      );
```
with:
```tsx
    case "paste":
      return (
        <PasteKeyScreen
          onBack={goList}
          onAdded={async (id) => {
            await reload();
            setRoute({ name: "detail", contactId: id });
          }}
        />
      );

    case "import-soon":
      return (
        <ComingSoonScreen
          title="Import contact file"
          icon="cloud_upload"
          message="Importing a .aesmsg contact file is coming soon."
          onBack={goList}
        />
      );
```

- [ ] **Step 7: Verify**

Run:
- `pnpm --filter @aesmsg/mobile typecheck` → PASS.
- `pnpm lint` → no new findings (run `pnpm lint:fix` if needed).
- `pnpm --filter @aesmsg/mobile test` → full suite passes.
- `grep -rn "paste-soon" apps/mobile/src` → no matches.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/contacts/ContactsFlow.tsx
git commit -m "feat(mobile): wire paste-public-key flow into Contacts (replaces coming-soon)"
```

---

## Task E: full verification

**Files:** none (gates only).

- [ ] **Step 1: Run the full mobile gate suite**

```bash
pnpm --filter @aesmsg/mobile typecheck
pnpm lint
pnpm --filter @aesmsg/mobile test
```
Expected: all PASS, including the new `paste-contact-error` suite.

- [ ] **Step 2: Confirm no leftover dead-end**

`grep -rn "paste-soon" apps/mobile/src` → no output.

- [ ] **Step 3: On-device sanity (manual, simulator)**

- Contacts → Add → "Paste public key" opens the new screen (not coming-soon); empty-state "Paste public key" also reaches it.
- Paste a valid `amk1:` key + a name → contact saved, lands on its detail (status **unverified**, with a Verify CTA).
- Malformed key → inline "doesn't look like a valid aesmsg public key", nothing saved.
- A key already saved → "This key is already saved as '<name>'".
- "Import contact file" still shows a coming-soon screen.

---

## Notes / acceptance

- **Branding:** `trimmed as PublicKeyString` is safe — `importPublicKey(trimmed)` validated the same string on the line above (throws otherwise). This mirrors `create-and-seal.ts:33` / `CreateFlow.tsx:67`.
- **Out of scope (unchanged):** camera QR scan, file import (now its own `import-soon` coming-soon), editing an existing contact's key.
