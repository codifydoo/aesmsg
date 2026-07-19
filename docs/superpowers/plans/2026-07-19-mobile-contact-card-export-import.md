# Contact-card Export & Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user export their identity as a shareable `.aesmsg` contact card and import a received card to add the sender as an (unverified) contact.

**Architecture:** One new pure, dependency-injected module `contact-card.ts` (mirrors `keys/export-backup.ts` + `onboarding/import-backup.ts`) holds all build/parse/file logic and is node-tested with injected spies. Export is wired on the My Public Key screen (Keys tab); import replaces the ComingSoon stub in ContactsFlow (Contacts tab) by routing a parsed card into the existing `PasteKeyScreen`. Label validation is extracted to a tiny pure `label.ts` so `contact-card.ts` never imports `contacts-store` (which pulls native storage modules and would break node tests).

**Tech Stack:** React Native / Expo (SDK 56), TypeScript strict, Vitest (node env, `vi.mock`/DI — no renderer), `@aesmsg/crypto` (`importPublicKey`, `exportPublicKey`), `expo-file-system/legacy`, `expo-sharing`, `expo-document-picker`, Biome.

## Global Constraints

- **Scope: `apps/mobile` only.** No web, no server, no new crypto primitives.
- **Package manager: `pnpm`** (never npm/yarn). Run workspace scripts as `pnpm --filter @aesmsg/mobile <script>`.
- **Contact card file = plaintext JSON, NOT encrypted.** Public keys are non-secret by design.
- **Card JSON shape:** `{ "type": "aesmsg.contact-card", "version": 1, "label": <string>, "publicKey": "amk1:…" }`.
- **Fixed filename:** `aesmsg-contact-card.aesmsg`. Cache writes use `CACHE_FILE_PREFIX` (`"aesmsg-"`) so Clear-local-history reclaims orphans.
- **`contact-card.ts` must stay node-testable:** import only from `@aesmsg/crypto`, `@/src/contacts/label`, `@/src/reader/attachment-cache`, and its own DI interfaces. NEVER import `@/src/contacts/contacts-store` or `@/src/storage` (they load native modules at import time).
- **Imported contacts are always `verified: false`** — guaranteed by routing through `addContact` (via `PasteKeyScreen`). No file field may set verified.
- **The importer never trusts a fingerprint from the file.** The card carries no fingerprint; `addContact` recomputes it from the key. `parseContactCard` returns only `{ label, publicKey }`.
- **Label rule:** trimmed length 1–80 (`MAX_LABEL_LEN = 80`).
- **Copy rules (CLAUDE.md):** no "unbreakable"/"military-grade"; JetBrains Mono only for keys/fingerprints/links, never UI labels.
- **Commit style:** Conventional Commits, e.g. `feat(mobile): …`.

---

### Task 1: Pure `label.ts` + `contact-card.ts` build/parse

**Files:**
- Create: `apps/mobile/src/contacts/label.ts`
- Modify: `apps/mobile/src/contacts/contacts-store.ts:18` (replace local `MAX_LABEL_LEN` const with an import)
- Create: `apps/mobile/src/contacts/contact-card.ts`
- Test: `apps/mobile/tests/contact-card.test.ts`

**Interfaces:**
- Produces:
  - `label.ts`: `MAX_LABEL_LEN: number`, `isValidLabel(raw: string): boolean`, `normalizeLabel(raw: string): string`
  - `contact-card.ts`: `CONTACT_CARD_TYPE`, `CONTACT_CARD_VERSION`, `CONTACT_CARD_FILENAME`, `class InvalidContactCardError extends Error`, `interface ContactCardFile { filename; contents }`, `buildContactCard(label: string, publicKey: PublicKeyString): ContactCardFile`, `interface ParsedContactCard { label: string; publicKey: PublicKeyString }`, `type ParseCardResult`, `parseContactCard(text: string): Promise<ParseCardResult>`

- [ ] **Step 1: Create the pure label module**

Create `apps/mobile/src/contacts/label.ts`:

```ts
// Pure label rules for a contact's display name. Extracted so BOTH contacts-store.ts (which throws
// InvalidLabelError) and contact-card.ts can share the rule WITHOUT contact-card importing
// contacts-store — that module pulls @/src/storage (native expo-secure-store / file-system) at load
// time, which would break contact-card's node tests. No native imports here on purpose.

export const MAX_LABEL_LEN = 80;

/** True when the trimmed label is 1..MAX_LABEL_LEN characters. */
export function isValidLabel(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_LABEL_LEN;
}

/** Trim and clamp a label to MAX_LABEL_LEN. Advisory normalization — may return "". */
export function normalizeLabel(raw: string): string {
  return raw.trim().slice(0, MAX_LABEL_LEN);
}
```

- [ ] **Step 2: Point contacts-store at the shared constant**

In `apps/mobile/src/contacts/contacts-store.ts`, add the import near the other imports (top of file) and delete the local `const MAX_LABEL_LEN = 80;` at line 18. `validateLabel` keeps throwing `InvalidLabelError` and keeps using `MAX_LABEL_LEN` — now the imported one.

Add after the existing `import { getEncryptedStore } from "@/src/storage";` line:

```ts
import { MAX_LABEL_LEN } from "@/src/contacts/label";
```

Remove this line (currently line 18):

```ts
const MAX_LABEL_LEN = 80;
```

- [ ] **Step 3: Write the failing test for build + parse**

Create `apps/mobile/tests/contact-card.test.ts`:

```ts
import { exportPublicKey, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import {
  buildContactCard,
  CONTACT_CARD_FILENAME,
  InvalidContactCardError,
  parseContactCard,
} from "@/src/contacts/contact-card";

// Pure + DI module, tested node-env with no renderer and no native mocks — contact-card.ts imports
// only @aesmsg/crypto, the pure label module, and the CACHE_FILE_PREFIX const. The key round-trip
// uses the REAL @aesmsg/crypto, so a card built from a generated identity's public key parses back to
// the same key. The card carries NO fingerprint; parse returns only { label, publicKey }.

describe("buildContactCard", () => {
  it("produces a plaintext contact-card JSON with the fixed filename", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);

    const card = buildContactCard("Alice", pk);

    expect(card.filename).toBe(CONTACT_CARD_FILENAME);
    const parsed = JSON.parse(card.contents);
    expect(parsed).toEqual({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Alice",
      publicKey: pk,
    });
  });

  it("trims the label", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const card = buildContactCard("  Bob  ", pk);
    expect(JSON.parse(card.contents).label).toBe("Bob");
  });

  it("throws InvalidContactCardError on an empty label", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    expect(() => buildContactCard("   ", pk)).toThrow(InvalidContactCardError);
  });

  it("throws InvalidContactCardError on a label longer than 80 chars", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    expect(() => buildContactCard("x".repeat(81), pk)).toThrow(InvalidContactCardError);
  });
});

describe("parseContactCard", () => {
  it("round-trips a built card back to { label, publicKey }", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const card = buildContactCard("Alice", pk);

    const result = await parseContactCard(card.contents);

    expect(result).toEqual({ ok: true, card: { label: "Alice", publicKey: pk } });
  });

  it("ignores any fingerprint field carried in the file (never trusts it)", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    // A hand-crafted card with a bogus fingerprint field: parse must drop it entirely.
    const contents = JSON.stringify({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Mallory",
      publicKey: pk,
      fingerprint: "AM-DEAD-BEEF",
    });

    const result = await parseContactCard(contents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card).toEqual({ label: "Mallory", publicKey: pk });
      expect("fingerprint" in result.card).toBe(false);
    }
  });

  it("returns invalid-file on non-JSON input", async () => {
    expect(await parseContactCard("not json")).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("returns invalid-file on empty input", async () => {
    expect(await parseContactCard("")).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("returns wrong-file-type when the type tag is absent or different", async () => {
    // An identity-backup envelope (a WrappedKey) has no contact-card type tag.
    expect(await parseContactCard('{"v":1,"kdf":{}}')).toEqual({
      ok: false,
      reason: "wrong-file-type",
    });
    expect(await parseContactCard('{"type":"aesmsg.backup","publicKey":"amk1:x"}')).toEqual({
      ok: false,
      reason: "wrong-file-type",
    });
  });

  it("returns invalid-file when the type is right but the key is malformed", async () => {
    const contents = JSON.stringify({
      type: "aesmsg.contact-card",
      version: 1,
      label: "Nope",
      publicKey: "not-an-amk1-key",
    });
    expect(await parseContactCard(contents)).toEqual({ ok: false, reason: "invalid-file" });
  });

  it("recovers a real fingerprint from the parsed key (recomputed downstream, not from file)", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const result = await parseContactCard(buildContactCard("Alice", pk).contents);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The authoritative fingerprint comes from the key, computed here exactly as addContact does.
      expect(await fingerprint(result.card.publicKey)).toEqual(await fingerprint(pk));
    }
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test contact-card`
Expected: FAIL — `Cannot find module "@/src/contacts/contact-card"` (module not created yet).

- [ ] **Step 5: Implement `contact-card.ts` build + parse**

Create `apps/mobile/src/contacts/contact-card.ts`:

```ts
import { importPublicKey, type PublicKeyString } from "@aesmsg/crypto";
import { isValidLabel, normalizeLabel } from "@/src/contacts/label";

// Contact-card vertical: build a PLAINTEXT `.aesmsg` card (my public key + a chosen name) and parse a
// received one. A public key is non-secret, so — unlike the identity BACKUP file (an encrypted
// WrappedKey envelope that shares the .aesmsg extension) — the card is plaintext JSON with a `type`
// tag. The importer distinguishes the two by that tag, and NEVER trusts a fingerprint from the file:
// parse returns only { label, publicKey }; addContact recomputes the fingerprint from the key.
//
// Pure + node-testable: imports only @aesmsg/crypto and the pure label module (plus CACHE_FILE_PREFIX
// for the write helper in the native-surfaces section). Native modules are dependency-injected.

export const CONTACT_CARD_TYPE = "aesmsg.contact-card";
export const CONTACT_CARD_VERSION = 1;
/** Fixed share filename. No user text in the name → no sanitization edge cases, nothing leaked. */
export const CONTACT_CARD_FILENAME = "aesmsg-contact-card.aesmsg";

/** Thrown by buildContactCard for an empty / over-long name (a backstop; the UI gates the field). */
export class InvalidContactCardError extends Error {
  override name = "InvalidContactCardError";
}

/** A built card: the share filename + the plaintext JSON body. */
export interface ContactCardFile {
  readonly filename: typeof CONTACT_CARD_FILENAME;
  readonly contents: string;
}

/**
 * Bundle my public key + a display name into a plaintext contact-card JSON body. Trims the label and
 * rejects empty / >80-char names with InvalidContactCardError. Never encrypts — a public key is not a
 * secret.
 */
export function buildContactCard(label: string, publicKey: PublicKeyString): ContactCardFile {
  if (!isValidLabel(label)) {
    throw new InvalidContactCardError("Contact card name must be 1–80 characters");
  }
  const contents = JSON.stringify({
    type: CONTACT_CARD_TYPE,
    version: CONTACT_CARD_VERSION,
    label: label.trim(),
    publicKey,
  });
  return { filename: CONTACT_CARD_FILENAME, contents };
}

/** A parsed card, ready to hand to the add-contact flow. Carries no fingerprint by design. */
export interface ParsedContactCard {
  readonly label: string;
  readonly publicKey: PublicKeyString;
}

/**
 * Outcome of parsing a picked file. `wrong-file-type` is where a mistakenly-picked identity backup or
 * unrelated JSON lands (no / different `type` tag); `invalid-file` covers non-JSON and a malformed
 * key. Result union mirrors onboarding/import-backup.ts RestoreResult so the caller avoids try/catch.
 */
export type ParseCardResult =
  | { readonly ok: true; readonly card: ParsedContactCard }
  | { readonly ok: false; readonly reason: "invalid-file" | "wrong-file-type" };

export async function parseContactCard(text: string): Promise<ParseCardResult> {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-file" };
  }
  if (typeof obj !== "object" || obj === null) return { ok: false, reason: "invalid-file" };
  const record = obj as Record<string, unknown>;
  if (record.type !== CONTACT_CARD_TYPE) return { ok: false, reason: "wrong-file-type" };
  const rawKey = record.publicKey;
  if (typeof rawKey !== "string") return { ok: false, reason: "invalid-file" };
  try {
    await importPublicKey(rawKey); // authoritative validation; throws on a malformed / non-amk1 key
  } catch {
    return { ok: false, reason: "invalid-file" };
  }
  // Label is advisory: normalize (trim+clamp); the importer edits it before saving, so a missing /
  // odd label still yields an importable card (just unnamed).
  const label = typeof record.label === "string" ? normalizeLabel(record.label) : "";
  return { ok: true, card: { label, publicKey: rawKey as PublicKeyString } };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @aesmsg/mobile test contact-card`
Expected: PASS (all `buildContactCard` + `parseContactCard` cases green).

- [ ] **Step 7: Verify no regression in contacts-store + typecheck**

Run: `pnpm --filter @aesmsg/mobile test contacts-store && pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (contacts-store still validates labels via the shared constant; no type errors).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/contacts/label.ts apps/mobile/src/contacts/contact-card.ts apps/mobile/src/contacts/contacts-store.ts apps/mobile/tests/contact-card.test.ts
git commit -m "feat(mobile): contact-card build/parse + shared label rule"
```

---

### Task 2: `contact-card.ts` native surfaces + `importContactCard`

**Files:**
- Modify: `apps/mobile/src/contacts/contact-card.ts` (append native-surface section)
- Test: `apps/mobile/tests/contact-card.test.ts` (append describe blocks)

**Interfaces:**
- Consumes: `ContactCardFile`, `ParsedContactCard`, `parseContactCard` (Task 1); `CACHE_FILE_PREFIX` from `@/src/reader/attachment-cache`.
- Produces: `FileSystemLike`, `SharingLike`, `DocumentPickerLike`, `interface WrittenCard { uri; cleanup() }`, `writeCardToCache(deps, card): Promise<WrittenCard>`, `shareCard(deps, uri): Promise<void>`, `interface PickedCard { uri; name; size }`, `pickCardFile(deps): Promise<PickedCard | null>`, `readCardFile(deps, uri): Promise<string>`, `type ImportCardOutcome`, `importContactCard(deps): Promise<ImportCardOutcome>`

- [ ] **Step 1: Write the failing tests for the native surfaces**

Append to `apps/mobile/tests/contact-card.test.ts` (add `vi` to the existing vitest import: `import { describe, expect, it, vi } from "vitest";`, and extend the contact-card import list):

```ts
// --- add to the top-of-file import from "@/src/contacts/contact-card" ---
//   importContactCard,
//   pickCardFile,
//   readCardFile,
//   shareCard,
//   writeCardToCache,
//   type DocumentPickerLike,
//   type FileSystemLike,
//   type SharingLike,

const CARD = { filename: "aesmsg-contact-card.aesmsg", contents: '{"type":"aesmsg.contact-card"}' } as const;

describe("writeCardToCache", () => {
  it("writes to a CACHE_FILE_PREFIX cache URI and returns a working cleanup hook", async () => {
    const writeAsStringAsync = vi.fn(async () => {});
    const deleteAsync = vi.fn(async () => {});
    const FileSystem = { cacheDirectory: "file:///cache/", writeAsStringAsync, deleteAsync };

    const written = await writeCardToCache({ FileSystem }, CARD);

    expect(writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [uri, contents] = writeAsStringAsync.mock.calls[0];
    expect(uri).toContain("file:///cache/");
    expect(uri).toContain("aesmsg-"); // CACHE_FILE_PREFIX so Clear-local-history reclaims orphans
    expect(uri).toContain("aesmsg-contact-card.aesmsg");
    expect(contents).toBe(CARD.contents);
    expect(written.uri).toBe(uri);

    await written.cleanup();
    expect(deleteAsync).toHaveBeenCalledWith(written.uri, { idempotent: true });
  });
});

describe("shareCard", () => {
  const URI = "file:///cache/aesmsg-1-aesmsg-contact-card.aesmsg";

  it("shares as octet-stream with the contact-card dialog title", async () => {
    const shareAsync = vi.fn(async () => {});
    const Sharing = { isAvailableAsync: vi.fn(async () => true), shareAsync };

    await shareCard({ Sharing }, URI);

    expect(shareAsync).toHaveBeenCalledWith(URI, {
      mimeType: "application/octet-stream",
      dialogTitle: "Share contact card",
    });
  });

  it("swallows a thrown share rejection (non-fatal)", async () => {
    const Sharing = {
      isAvailableAsync: vi.fn(async () => true),
      shareAsync: vi.fn(async () => {
        throw new Error("share sheet already presented");
      }),
    };
    await expect(shareCard({ Sharing }, URI)).resolves.toBeUndefined();
  });

  it("does not share when the share sheet is unavailable", async () => {
    const shareAsync = vi.fn(async () => {});
    const Sharing = { isAvailableAsync: vi.fn(async () => false), shareAsync };
    await shareCard({ Sharing }, URI);
    expect(shareAsync).not.toHaveBeenCalled();
  });
});

describe("pickCardFile", () => {
  it("returns the first asset and requests a cached copy", async () => {
    const getDocumentAsync = vi.fn(async () => ({
      canceled: false,
      assets: [{ uri: "file:///tmp/card.aesmsg", name: "card.aesmsg", size: 120 }],
    }));
    const picked = await pickCardFile({ DocumentPicker: { getDocumentAsync } });
    expect(picked).toEqual({ uri: "file:///tmp/card.aesmsg", name: "card.aesmsg", size: 120 });
    expect(getDocumentAsync).toHaveBeenCalledWith({ copyToCacheDirectory: true });
  });

  it("returns null on cancel", async () => {
    const getDocumentAsync = vi.fn(async () => ({ canceled: true, assets: null }));
    expect(await pickCardFile({ DocumentPicker: { getDocumentAsync } })).toBeNull();
  });
});

describe("readCardFile", () => {
  it("reads UTF-8 over the injected FileSystem", async () => {
    const readAsStringAsync = vi.fn(async () => "{}");
    const FileSystem = { EncodingType: { UTF8: "utf8" }, readAsStringAsync };
    expect(await readCardFile({ FileSystem }, "file:///tmp/card.aesmsg")).toBe("{}");
    expect(readAsStringAsync).toHaveBeenCalledWith("file:///tmp/card.aesmsg", { encoding: "utf8" });
  });
});

describe("importContactCard", () => {
  function deps(fileText: string | Error, canceled = false) {
    const getDocumentAsync = vi.fn(async () =>
      canceled
        ? { canceled: true, assets: null }
        : { canceled: false, assets: [{ uri: "file:///tmp/card.aesmsg", name: "card.aesmsg", size: 1 }] },
    );
    const readAsStringAsync = vi.fn(async () => {
      if (fileText instanceof Error) throw fileText;
      return fileText;
    });
    return {
      DocumentPicker: { getDocumentAsync },
      FileSystem: { EncodingType: { UTF8: "utf8" }, readAsStringAsync },
    };
  }

  it("returns canceled when the picker is dismissed", async () => {
    expect(await importContactCard(deps("", true))).toEqual({ kind: "canceled" });
  });

  it("returns picked with the parsed card on a valid file", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const contents = buildContactCard("Alice", pk).contents;
    expect(await importContactCard(deps(contents))).toEqual({
      kind: "picked",
      card: { label: "Alice", publicKey: pk },
    });
  });

  it("returns error/wrong-file-type on a non-card file", async () => {
    expect(await importContactCard(deps('{"v":1}'))).toEqual({
      kind: "error",
      reason: "wrong-file-type",
    });
  });

  it("returns error/invalid-file when the file read throws", async () => {
    expect(await importContactCard(deps(new Error("read failed")))).toEqual({
      kind: "error",
      reason: "invalid-file",
    });
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm --filter @aesmsg/mobile test contact-card`
Expected: FAIL — `writeCardToCache`/`shareCard`/`pickCardFile`/`readCardFile`/`importContactCard` are not exported yet.

- [ ] **Step 3: Implement the native surfaces**

Append to `apps/mobile/src/contacts/contact-card.ts`:

```ts
// --- add to the existing top-of-file imports ---
import { CACHE_FILE_PREFIX } from "@/src/reader/attachment-cache";

// --- Native-module surfaces (minimal; tests inject spies) --------------------------------------
// Same DI shape as keys/export-backup.ts + onboarding/import-backup.ts. The production expo modules
// are wider than these minimal interfaces; the wiring bridges them with `as unknown as`.

export interface FileSystemLike {
  readonly cacheDirectory: string | null;
  readonly EncodingType: { readonly UTF8: string };
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  readAsStringAsync(uri: string, options: { encoding: string }): Promise<string>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}

export interface SharingLike {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options?: { mimeType?: string; dialogTitle?: string }): Promise<void>;
}

export interface DocumentAssetLike {
  readonly uri: string;
  readonly name: string;
  readonly size?: number | null;
}
export interface DocumentPickerResultLike {
  readonly canceled: boolean;
  readonly assets: DocumentAssetLike[] | null;
}
export interface DocumentPickerLike {
  getDocumentAsync(options?: unknown): Promise<DocumentPickerResultLike>;
}

/** A written card file + a cleanup hook (captured before any handoff). */
export interface WrittenCard {
  readonly uri: string;
  cleanup(): Promise<void>;
}

/**
 * Write the plaintext card to a unique cache path (CACHE_FILE_PREFIX so the Settings "Clear local
 * history" sweep reclaims an orphan) and return its cleanup hook. The body is a non-secret public key,
 * but hygiene is kept uniform with the backup export.
 */
export async function writeCardToCache(
  deps: { FileSystem: Pick<FileSystemLike, "cacheDirectory" | "writeAsStringAsync" | "deleteAsync"> },
  card: ContactCardFile,
): Promise<WrittenCard> {
  const { FileSystem } = deps;
  const uri = `${FileSystem.cacheDirectory}${CACHE_FILE_PREFIX}${Date.now()}-${card.filename}`;
  await FileSystem.writeAsStringAsync(uri, card.contents);
  return { uri, cleanup: () => FileSystem.deleteAsync(uri, { idempotent: true }) };
}

/**
 * Present the system share sheet for an already-written card, gated on availability. A share rejection
 * (double-tap / platform error) is non-fatal and swallowed — the file is written and the caller holds
 * cleanup.
 */
export async function shareCard(
  deps: { Sharing: SharingLike },
  uri: string,
): Promise<void> {
  const { Sharing } = deps;
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/octet-stream",
        dialogTitle: "Share contact card",
      });
    }
  } catch {
    // Intentionally ignored — non-fatal; file already written, caller holds cleanup.
  }
}

/** A card file the user selected, ready to read. */
export interface PickedCard {
  readonly uri: string;
  readonly name: string;
  readonly size: number;
}

/** Open the document picker; return the first selected file or null on cancel. */
export async function pickCardFile(
  deps: { DocumentPicker: DocumentPickerLike },
): Promise<PickedCard | null> {
  const result = await deps.DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name, size: asset.size ?? 0 };
}

/** Read a picked card file as UTF-8 (its plaintext JSON body). */
export async function readCardFile(
  deps: { FileSystem: Pick<FileSystemLike, "EncodingType" | "readAsStringAsync"> },
  uri: string,
): Promise<string> {
  return deps.FileSystem.readAsStringAsync(uri, { encoding: deps.FileSystem.EncodingType.UTF8 });
}

/** Orchestrated pick → read → parse, so the UI (ContactsFlow) only routes on the outcome. */
export type ImportCardOutcome =
  | { readonly kind: "picked"; readonly card: ParsedContactCard }
  | { readonly kind: "canceled" }
  | { readonly kind: "error"; readonly reason: "invalid-file" | "wrong-file-type" };

export async function importContactCard(deps: {
  DocumentPicker: DocumentPickerLike;
  FileSystem: Pick<FileSystemLike, "EncodingType" | "readAsStringAsync">;
}): Promise<ImportCardOutcome> {
  const picked = await pickCardFile(deps);
  if (!picked) return { kind: "canceled" };
  let text: string;
  try {
    text = await readCardFile(deps, picked.uri);
  } catch {
    return { kind: "error", reason: "invalid-file" };
  }
  const parsed = await parseContactCard(text);
  return parsed.ok ? { kind: "picked", card: parsed.card } : { kind: "error", reason: parsed.reason };
}
```

- [ ] **Step 4: Run to verify all contact-card tests pass**

Run: `pnpm --filter @aesmsg/mobile test contact-card`
Expected: PASS (build/parse from Task 1 + all native-surface + importContactCard cases).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

```bash
git add apps/mobile/src/contacts/contact-card.ts apps/mobile/tests/contact-card.test.ts
git commit -m "feat(mobile): contact-card file write/share/pick/read + import orchestration"
```

---

### Task 3: Import UI — PasteKeyScreen prefill, error screen, ContactsFlow wiring

No render tests: this codebase tests pure logic only (screens are covered by typecheck + the pure `importContactCard` tests from Task 2 + manual QA). The deliverable is verified by `typecheck` and the full mobile suite staying green.

**Files:**
- Modify: `apps/mobile/src/contacts/PasteKeyScreen.tsx` (add `initialName`)
- Create: `apps/mobile/src/contacts/ImportContactErrorScreen.tsx`
- Modify: `apps/mobile/src/contacts/ContactsFlow.tsx` (replace `import-soon` with real pick→route/error)

**Interfaces:**
- Consumes: `importContactCard`, `DocumentPickerLike`, `FileSystemLike` (Task 2).
- Produces: `PasteKeyScreen` prop `initialName?: string`; `ImportContactErrorScreen({ onBack })`.

- [ ] **Step 1: Add `initialName` to PasteKeyScreen**

In `apps/mobile/src/contacts/PasteKeyScreen.tsx`, add the prop to the interface (after `initialKey`):

```ts
  /** Pre-populate the name field (e.g. the suggested name from an imported contact card). */
  initialName?: string;
```

Add it to the destructured params and seed the state. Change the signature line and the `name` state line:

```ts
export function PasteKeyScreen({ onBack, onAdded, rekey, initialKey, initialName }: PasteKeyScreenProps) {
  const [key, setKey] = useState(initialKey ?? "");
  const [name, setName] = useState(initialName ?? "");
```

- [ ] **Step 2: Create the import-error screen**

Create `apps/mobile/src/contacts/ImportContactErrorScreen.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Icon, Medallion, Screen } from "@/src/components";
import { colors } from "@/src/theme";

// Shown when a picked "Import contact file" isn't a valid aesmsg contact card — non-JSON, missing the
// contact-card type tag (e.g. an identity-backup file picked by mistake), or a malformed key. One
// message covers every failure per the design; it is a first-class state, not a toast or a crash.

export interface ImportContactErrorScreenProps {
  onBack: () => void;
}

export function ImportContactErrorScreen({ onBack }: ImportContactErrorScreenProps) {
  return (
    <View style={styles.root}>
      <AppBar title="Import contact file" onLeading={onBack} />
      <Screen topInset={false} contentStyle={styles.content}>
        <Medallion size={72}>
          <Icon name="warning" size={32} color={colors.onSurfaceVariant} />
        </Medallion>
        <Text style={styles.heading} accessibilityRole="header">
          Couldn't import
        </Text>
        <Text style={styles.body}>
          This isn't a valid aesmsg contact file. Ask your contact to export a new contact card and try
          again.
        </Text>
        <View style={styles.actions}>
          <Button kind="outline" onPress={onBack}>
            Back
          </Button>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  heading: { fontSize: 24, fontWeight: "500", letterSpacing: -0.24, color: colors.onSurface },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 280,
  },
  actions: { width: "100%", gap: 10, marginTop: 8 },
});
```

- [ ] **Step 3: Wire the import flow in ContactsFlow**

In `apps/mobile/src/contacts/ContactsFlow.tsx`:

(a) Replace the `ComingSoonScreen` import with the new modules and native deps. Remove:

```ts
import { ComingSoonScreen } from "@/src/contacts/ComingSoonScreen";
```

Add (with the other imports; note the two native-module imports mirror KeysFlow / ImportBackup):

```ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  type DocumentPickerLike,
  type FileSystemLike,
  importContactCard,
} from "@/src/contacts/contact-card";
import { ImportContactErrorScreen } from "@/src/contacts/ImportContactErrorScreen";
```

(b) Bridge the native modules to the DI shape (add near the top of the component body, after the `route` state):

```ts
  // expo modules are wider than the pure module's minimal DI shapes; bridge with `as unknown as`
  // exactly as KeysFlow / ImportBackupScreenIntegration do. Runtime calls are identical.
  const importDeps = { DocumentPicker, FileSystem } as unknown as {
    DocumentPicker: DocumentPickerLike;
    FileSystem: Pick<FileSystemLike, "EncodingType" | "readAsStringAsync">;
  };

  async function handleImportPick() {
    const outcome = await importContactCard(importDeps);
    if (outcome.kind === "canceled") return; // stay on the add screen
    if (outcome.kind === "error") {
      setRoute({ name: "import-error" });
      return;
    }
    setRoute({ name: "paste", prefillKey: outcome.card.publicKey, prefillName: outcome.card.label });
  }
```

(c) Update the `Route` union: replace the `import-soon` member with `import-error`, and add `prefillName` to the `paste` member:

```ts
  | { name: "paste"; prefillKey?: string; prefillName?: string; contactId?: string }
  // (…other members unchanged…)
  | { name: "import-error" };
```

(d) Update the empty-store guard (currently excludes `"import-soon"`): change that entry to `"import-error"`:

```ts
    route.name !== "key-changed" &&
    route.name !== "import-error"
```

(e) In the `add` case, route the `import` method to the pick handler instead of `import-soon`:

```ts
    case "add":
      return (
        <AddContactScreen
          onBack={goList}
          onPick={(method) => {
            if (method === "scan") setRoute({ name: "scan" });
            else if (method === "paste") setRoute({ name: "paste" });
            else void handleImportPick();
          }}
        />
      );
```

(f) In the `paste` (add-mode) render, pass `initialName` from `prefillName` (the block where `rekeyId === undefined`):

```ts
      return (
        <PasteKeyScreen
          onBack={goList}
          {...(route.prefillKey !== undefined ? { initialKey: route.prefillKey } : {})}
          {...(route.prefillName !== undefined ? { initialName: route.prefillName } : {})}
          onAdded={async (id) => {
            await reload();
            goDetail(id);
          }}
        />
      );
```

(g) Replace the `import-soon` case with the `import-error` case:

```ts
    case "import-error":
      return <ImportContactErrorScreen onBack={goList} />;
```

- [ ] **Step 4: Delete the now-unused ComingSoonScreen (only if unreferenced)**

Run: `grep -rn "ComingSoonScreen" apps/mobile/src apps/mobile/tests`
Expected: no matches after Step 3. If none, delete it:

```bash
git rm apps/mobile/src/contacts/ComingSoonScreen.tsx
```

If any match remains, leave the file and skip the delete.

- [ ] **Step 5: Typecheck + run the contacts suites**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm --filter @aesmsg/mobile test contacts`
Expected: PASS (no type errors; contacts-store / contacts-display / paste-contact-error tests green).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/contacts/PasteKeyScreen.tsx apps/mobile/src/contacts/ImportContactErrorScreen.tsx apps/mobile/src/contacts/ContactsFlow.tsx
git commit -m "feat(mobile): wire .aesmsg contact-card import into Add contact"
```

---

### Task 4: Export UI — My Public Key sheet + KeysFlow handler

No render test (screen — verified by typecheck + manual QA), consistent with the rest of the mobile UI layer.

**Files:**
- Modify: `apps/mobile/src/keys/MyPublicKeyScreen.tsx` (add prop, button, name BottomSheet)
- Modify: `apps/mobile/src/keys/KeysFlow.tsx` (implement the export handler)

**Interfaces:**
- Consumes: `buildContactCard`, `writeCardToCache`, `shareCard`, `FileSystemLike`, `SharingLike` (Tasks 1–2); `isValidLabel` (`@/src/contacts/label`).
- Produces: `MyPublicKeyScreen` prop `onExportContactCard?: (displayName: string) => void`.

- [ ] **Step 1: Add the export-card affordance to MyPublicKeyScreen**

In `apps/mobile/src/keys/MyPublicKeyScreen.tsx`:

(a) Extend imports — add `Field` to the components import and `isValidLabel`:

```ts
import { AppBar, Avatar, BottomSheet, Button, Card, Field, ListRow, Screen } from "@/src/components";
import { isValidLabel } from "@/src/contacts/label";
```

(b) Add the prop to `MyPublicKeyScreenProps`:

```ts
  /** Open the contact-card export: prompts for a display name, then builds + shares the .aesmsg file.
   *  Wired by KeysFlow. */
  onExportContactCard?: (displayName: string) => void;
```

(c) Destructure it and add local sheet state (next to the existing `menuOpen` state):

```ts
export function MyPublicKeyScreen({
  publicKeyString,
  onExportBackup,
  onRotateKey,
  onExportContactCard,
}: MyPublicKeyScreenProps) {
  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cardSheetOpen, setCardSheetOpen] = useState(false);
  const [cardName, setCardName] = useState("");
```

(d) In the footer, add an "Export contact card" outline button after the "Copy public key" button (before the "Export encrypted backup" link `Pressable`):

```tsx
        <Button
          kind="outline"
          icon="cloud_upload"
          onPress={() => {
            setCardName("");
            setCardSheetOpen(true);
          }}
        >
          Export contact card
        </Button>
```

(e) Add the name BottomSheet near the existing overflow `BottomSheet` (e.g. just before it):

```tsx
      <BottomSheet visible={cardSheetOpen} onClose={() => setCardSheetOpen(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Export contact card</Text>
          <Text style={styles.sheetBody}>
            Choose the name your contact should see. They can edit it when they import your card.
          </Text>
          <Field placeholder="e.g. Elena Rodriguez" value={cardName} onChangeText={setCardName} />
          <Button
            icon="ios_share"
            disabled={!isValidLabel(cardName)}
            onPress={() => {
              setCardSheetOpen(false);
              onExportContactCard?.(cardName.trim());
            }}
          >
            Create contact card
          </Button>
        </View>
      </BottomSheet>
```

(f) Add the sheet styles to the `StyleSheet.create({...})` block:

```ts
  sheet: { padding: 20, gap: 12 },
  sheetTitle: { fontSize: 17, fontWeight: "600", color: colors.onSurface },
  sheetBody: { fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
```

- [ ] **Step 2: Implement the export handler in KeysFlow**

In `apps/mobile/src/keys/KeysFlow.tsx`:

(a) Extend the `export-backup` import to include the card helpers and their DI types:

```ts
import {
  buildContactCard,
  type FileSystemLike as CardFileSystemLike,
  shareCard,
  type SharingLike as CardSharingLike,
  writeCardToCache,
} from "@/src/contacts/contact-card";
```

(b) Add a bridged deps object next to the existing `shareDeps`:

```ts
const cardShareDeps = { FileSystem, Sharing } as unknown as {
  FileSystem: CardFileSystemLike;
  Sharing: CardSharingLike;
};
```

(c) Add the handler inside the component (after `handleExport`):

```ts
  // Export my identity as a plaintext contact card: build → write to cache → share sheet → clean up
  // the cache copy. No biometric gate (a public key is non-secret) and no success sheet (the system
  // share sheet is the confirmation). The name is UI-gated (1–80) so buildContactCard never throws.
  async function handleExportContactCard(displayName: string) {
    const card = buildContactCard(displayName, publicKeyString);
    const written = await writeCardToCache(cardShareDeps, card);
    try {
      await shareCard(cardShareDeps, written.uri);
    } finally {
      void written.cleanup();
    }
  }
```

(d) Pass it to `MyPublicKeyScreen` (the final `return`):

```tsx
    <MyPublicKeyScreen
      publicKeyString={publicKeyString}
      onExportBackup={() => setRoute({ kind: "exportBackup" })}
      onRotateKey={() => setRoute({ kind: "rotateConfirm" })}
      onExportContactCard={(name) => void handleExportContactCard(name)}
    />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/keys/MyPublicKeyScreen.tsx apps/mobile/src/keys/KeysFlow.tsx
git commit -m "feat(mobile): export contact card from My Public Key screen"
```

---

### Task 5: Full gate (typecheck + lint + tests)

**Files:** none (verification only).

- [ ] **Step 1: Run the full mobile gate**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm lint && pnpm --filter @aesmsg/mobile test`
Expected: typecheck clean; Biome lint/format clean; every Vitest suite green (including the new `contact-card` suite and all pre-existing suites).

- [ ] **Step 2: Fix any Biome findings**

If `pnpm lint` reports issues, apply safe fixes and re-run:

Run: `pnpm lint:fix && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit any lint fixes (only if Step 2 changed files)**

```bash
git add -A
git commit -m "chore(mobile): lint/format for contact-card export & import"
```

- [ ] **Step 4: Manual QA note (device / simulator)**

Not automatable here; record for the PR:
- Export: My Public Key → Export contact card → enter a name → share sheet shows `aesmsg-contact-card.aesmsg`.
- Import (happy path): Contacts → Add contact → Import contact file → pick that file → PasteKeyScreen shows the key + the suggested name (editable) → Add contact → lands on the new contact's detail, **Unverified**.
- Import (rejection): pick a non-card `.aesmsg` (e.g. an identity backup) → "Couldn't import" screen.
- Import (duplicate): import a card whose key is already saved → PasteKeyScreen shows the existing duplicate copy.

## Self-Review

**Spec coverage:**
- Plaintext JSON card + `type` discriminator → Task 1 (`buildContactCard`/`parseContactCard`, `CONTACT_CARD_TYPE`).
- No fingerprint stored; recomputed → Task 1 tests ("ignores any fingerprint field", "recovers a real fingerprint"); `addContact` recompute is pre-existing/tested.
- Fixed filename + `CACHE_FILE_PREFIX` → Task 2 (`CONTACT_CARD_FILENAME`, `writeCardToCache`).
- Export on My Public Key with name prompt → Task 4.
- Import replaces ComingSoon, routes into PasteKeyScreen, `verified:false`, dup handling → Task 3.
- Error states (cancel / invalid / wrong-type / duplicate) → Task 2 (`importContactCard` outcomes) + Task 3 (`ImportContactErrorScreen`, PasteKeyScreen dup copy).
- Single source of truth for label rule → Task 1 (`label.ts`), with the taint-avoidance rationale documented.
- Testing mirrors backup suites → Tasks 1–2.
- Out-of-scope items (bulk export, encryption, saved-contact export, name persistence) → not planned. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `PublicKeyString` used throughout; `ParseCardResult`/`ImportCardOutcome` reasons (`invalid-file`/`wrong-file-type`) match between module, tests, and ContactsFlow; `initialName` prop name consistent across PasteKeyScreen and ContactsFlow; `onExportContactCard` consistent across MyPublicKeyScreen and KeysFlow; `cardShareDeps`/`importDeps` bridges match the `Pick<FileSystemLike, …>` shapes the helpers declare. ✓
