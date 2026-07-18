# Mobile Attachment Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the compose flow's "Attach a file or photo" sheet actually attach a real file/photo to a secure message, encrypted on-device before upload.

**Architecture:** A pure, dependency-injected `pick-attachment.ts` module (mirroring the existing `reader/attachment-cache.ts` pattern) wraps the expo pickers and file reads; all mapping/validation logic is node-testable with injected spies. The React components (`AttachmentPickerSheet`, `ComposeScreen`) pass the real expo modules in. The selected file threads through the existing `ComposeSubmit → createAndSeal → encodePayload → seal` path — which already supports attachments end-to-end (crypto + reader are done).

**Tech Stack:** Expo SDK 56, `expo-image-picker`, `expo-document-picker`, `expo-file-system/legacy`, Vitest (node-env), `@aesmsg/crypto`.

---

## Background (read before starting)

- **Downstream is already built.** `packages/crypto/src/payload.ts` encodes/decodes `attachments` (filename + mimetype + bytes) AEAD-sealed inside the envelope; `apps/mobile/src/reader/` decodes, renders, and securely caches/shares them. Do NOT touch crypto, the reader, the API, or the web app.
- **Only the sender side is a stub:** `apps/mobile/src/create/AttachmentPickerSheet.tsx` has no-op rows + a hardcoded sample file; `apps/mobile/src/create/create-and-seal.ts:50` hardcodes `attachments: []`.
- **Test convention** (this repo): tests live in `apps/mobile/tests/`, run under **node-env Vitest with NO React renderer**. Native expo modules fail Flow-parse under the node runner, so all testable logic goes in a plain module with **injected** dependencies (see `apps/mobile/src/reader/attachment-cache.ts` and `apps/mobile/tests/reader-cache-cleanup.test.ts` for the exact pattern). React components are verified manually, not via renderer tests.
- **Decisions (locked in the spec, `docs/superpowers/specs/2026-06-01-mobile-attachment-picker-design.md`):** single attachment; `MAX_ATTACHMENT_BYTES = 10 MiB` (safely under the 14 MiB ciphertext API cap); drop the "free plan / 2 GB upsell" story; honest copy.
- **Native deps require a clean rebuild.** The new pickers are not available via hot reload; the final manual verification needs a fresh dev build.

## File Structure

- **Create** `apps/mobile/src/create/pick-attachment.ts` — pure + DI: `ComposeAttachment` type, `MAX_ATTACHMENT_BYTES`, `validateAttachmentSize`, `formatSize`, and `pickFromLibrary` / `pickFromCamera` / `pickDocument` returning a `PickResult` discriminated union.
- **Create** `apps/mobile/tests/pick-attachment.test.ts` — unit tests for the module (injected spies).
- **Modify** `apps/mobile/src/create/AttachmentPickerSheet.tsx` — make it functional (empty / file-attached / too-large states; real pick handlers; reconciled copy).
- **Modify** `apps/mobile/src/create/ComposeScreen.tsx` — own the selected attachment, display it, thread it into `ComposeSubmit`, relax `canSend`.
- **Modify** `apps/mobile/src/create/create-and-seal.ts` — accept the attachment and pass it to `encodePayload`.
- **Modify** `apps/mobile/tests/create-and-seal.test.ts` — assert an attachment reaches the sealed payload.
- **Modify** `apps/mobile/app.config.ts` — register the picker config plugins with iOS usage strings.
- **Modify** `apps/mobile/package.json` — new deps (added by `expo install`).

---

## Task 1: Add picker dependencies + iOS permission strings

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`)
- Modify: `apps/mobile/app.config.ts:67-80` (the `plugins` array) and `:34-47` (iOS `infoPlist`)

- [ ] **Step 1: Install the SDK-matched picker packages**

Run (from the repo root — delegates to pnpm, picks SDK-56-compatible versions):

```bash
cd apps/mobile && npx expo install expo-image-picker expo-document-picker
```

Expected: `package.json` gains `expo-image-picker` and `expo-document-picker` at `~56.x` ranges; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Register the config plugins with usage strings**

In `apps/mobile/app.config.ts`, replace the `plugins` array (currently lines 67-80) so it also configures the two pickers. The full new `plugins` value:

```ts
  plugins: [
    "expo-secure-store",
    "expo-local-authentication",
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-mark.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#141218",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "aesmsg attaches a photo only after encrypting it on this device. Photos are never uploaded in the clear.",
        cameraPermission:
          "aesmsg attaches a photo only after encrypting it on this device. Photos are never uploaded in the clear.",
      },
    ],
  ],
```

(`expo-document-picker` needs no config plugin or permission on iOS — the system document browser is used. No entry required.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (config is typed `ExpoConfig`; new plugin entry is valid).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.config.ts pnpm-lock.yaml
git commit -m "feat(mobile): add expo-image-picker + expo-document-picker deps and iOS usage strings"
```

---

## Task 2: Attachment types + size/format helpers (pure, TDD)

**Files:**
- Create: `apps/mobile/src/create/pick-attachment.ts`
- Test: `apps/mobile/tests/pick-attachment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/pick-attachment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatSize,
  MAX_ATTACHMENT_BYTES,
  validateAttachmentSize,
} from "@/src/create/pick-attachment";

describe("validateAttachmentSize", () => {
  it("accepts a file at or under the cap", () => {
    expect(validateAttachmentSize(0).ok).toBe(true);
    expect(validateAttachmentSize(MAX_ATTACHMENT_BYTES).ok).toBe(true);
  });

  it("rejects a file over the cap and reports its size", () => {
    const result = validateAttachmentSize(MAX_ATTACHMENT_BYTES + 1);
    expect(result.ok).toBe(false);
  });
});

describe("formatSize", () => {
  it("formats bytes as MB with one decimal", () => {
    expect(formatSize(1.2 * 1024 * 1024)).toBe("1.2 MB");
    expect(formatSize(41 * 1024 * 1024)).toBe("41.0 MB");
  });

  it("formats sub-megabyte sizes as KB", () => {
    expect(formatSize(512)).toBe("0.5 KB");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/pick-attachment.test.ts`
Expected: FAIL — cannot resolve `@/src/create/pick-attachment`.

- [ ] **Step 3: Write the minimal module**

Create `apps/mobile/src/create/pick-attachment.ts`:

```ts
import { base64ToBytes } from "@/src/lib/base64";

// Sender-side attachment picking, extracted from the React layer so the size policy and the
// native-picker → ComposeAttachment mapping can be unit-tested in plain Node without a renderer or
// the expo native modules (which fail Flow-parse under the node test runner). The sheet injects the
// production modules; tests inject spies. Mirrors reader/attachment-cache.ts.

/** Hard cap per attachment. Sits safely under the API's 14 MiB ciphertext limit once HPKE overhead
 *  (+50 bytes) and Padmé padding (~+0.25 MiB at this scale) are added — see the spec's size policy. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** A file the user selected, decrypted/plaintext in memory, ready to seal into the payload envelope. */
export interface ComposeAttachment {
  readonly filename: string;
  readonly mimetype: string;
  readonly bytes: Uint8Array;
  readonly size: number;
}

export type SizeCheck = { readonly ok: true } | { readonly ok: false; readonly size: number };

export function validateAttachmentSize(size: number): SizeCheck {
  return size > MAX_ATTACHMENT_BYTES ? { ok: false, size } : { ok: true };
}

/** Human size for the file card + over-limit copy: MB (1 decimal) at/above 1 MiB, else KB. */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

void base64ToBytes; // used by the pick functions added in the next task
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/pick-attachment.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/pick-attachment.ts apps/mobile/tests/pick-attachment.test.ts
git commit -m "feat(mobile): attachment size policy + format helpers"
```

---

## Task 3: DI pick functions (TDD)

**Files:**
- Modify: `apps/mobile/src/create/pick-attachment.ts`
- Test: `apps/mobile/tests/pick-attachment.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `apps/mobile/tests/pick-attachment.test.ts`)

Add these imports to the top of the file (merge into the existing import):

```ts
import { vi } from "vitest";
import { bytesToBase64 } from "@/src/lib/base64";
import {
  type DocumentPickerLike,
  type FileReaderLike,
  type ImagePickerLike,
  pickDocument,
  pickFromCamera,
  pickFromLibrary,
} from "@/src/create/pick-attachment";
```

Then append:

```ts
// A FileReaderLike that returns the given bytes as base64 for any uri.
function fileReaderReturning(bytes: Uint8Array): FileReaderLike {
  return {
    EncodingType: { Base64: "base64" },
    readAsStringAsync: vi.fn(async () => bytesToBase64(bytes)),
  };
}

describe("pickDocument", () => {
  it("maps a picked document to a ComposeAttachment with bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({
        canceled: false,
        assets: [{ uri: "file:///x", name: "Signed NDA.pdf", mimeType: "application/pdf", size: 4 }],
      })),
    };
    const result = await pickDocument({ DocumentPicker, FileSystem: fileReaderReturning(bytes) });
    expect(result.kind).toBe("picked");
    if (result.kind !== "picked") throw new Error("expected picked");
    expect(result.attachment.filename).toBe("Signed NDA.pdf");
    expect(result.attachment.mimetype).toBe("application/pdf");
    expect(result.attachment.size).toBe(4);
    expect([...result.attachment.bytes]).toEqual([1, 2, 3, 4]);
  });

  it("returns cancelled when the user dismisses the picker", async () => {
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({ canceled: true, assets: null })),
    };
    const result = await pickDocument({ DocumentPicker, FileSystem: fileReaderReturning(new Uint8Array()) });
    expect(result.kind).toBe("cancelled");
  });

  it("reports too-large from asset metadata WITHOUT reading the file", async () => {
    const FileSystem = fileReaderReturning(new Uint8Array([0]));
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({
        canceled: false,
        assets: [{ uri: "file:///big", name: "huge.bin", mimeType: "application/octet-stream", size: 41 * 1024 * 1024 }],
      })),
    };
    const result = await pickDocument({ DocumentPicker, FileSystem });
    expect(result.kind).toBe("too-large");
    if (result.kind !== "too-large") throw new Error("expected too-large");
    expect(result.size).toBe(41 * 1024 * 1024);
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  it("normalizes a path-y name to a basename and falls back on a missing mimetype", async () => {
    const bytes = new Uint8Array([9]);
    const DocumentPicker: DocumentPickerLike = {
      getDocumentAsync: vi.fn(async () => ({
        canceled: false,
        assets: [{ uri: "file:///x", name: "/tmp/sub/report.txt", mimeType: null, size: 1 }],
      })),
    };
    const result = await pickDocument({ DocumentPicker, FileSystem: fileReaderReturning(bytes) });
    if (result.kind !== "picked") throw new Error("expected picked");
    expect(result.attachment.filename).toBe("report.txt");
    expect(result.attachment.mimetype).toBe("application/octet-stream");
  });
});

describe("pickFromLibrary", () => {
  it("maps an image asset, deriving a filename when the picker omits one", async () => {
    const bytes = new Uint8Array([7, 7]);
    const ImagePicker: ImagePickerLike = {
      requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
      launchCameraAsync: vi.fn(),
      launchImageLibraryAsync: vi.fn(async () => ({
        canceled: false,
        assets: [{ uri: "file:///p", fileName: null, mimeType: "image/jpeg", fileSize: 2 }],
      })),
    };
    const result = await pickFromLibrary({ ImagePicker, FileSystem: fileReaderReturning(bytes) });
    if (result.kind !== "picked") throw new Error("expected picked");
    expect(result.attachment.filename).toBe("attachment.jpg");
    expect(result.attachment.mimetype).toBe("image/jpeg");
  });
});

describe("pickFromCamera", () => {
  it("returns cancelled when camera permission is denied (no launch)", async () => {
    const ImagePicker: ImagePickerLike = {
      requestCameraPermissionsAsync: vi.fn(async () => ({ granted: false })),
      launchCameraAsync: vi.fn(),
      launchImageLibraryAsync: vi.fn(),
    };
    const result = await pickFromCamera({ ImagePicker, FileSystem: fileReaderReturning(new Uint8Array()) });
    expect(result.kind).toBe("cancelled");
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/pick-attachment.test.ts`
Expected: FAIL — `pickDocument` / `pickFromLibrary` / `pickFromCamera` and the `*Like` types are not exported.

- [ ] **Step 3: Implement the pick functions**

In `apps/mobile/src/create/pick-attachment.ts`, remove the `void base64ToBytes;` line and append:

```ts
// --- Native-module surfaces (minimal; tests inject spies) -------------------------------------

/** Subset of expo-file-system/legacy used to read picked bytes. */
export interface FileReaderLike {
  readonly EncodingType: { readonly Base64: string };
  readAsStringAsync(uri: string, options: { encoding: string }): Promise<string>;
}

export interface ImageAssetLike {
  readonly uri: string;
  readonly fileName?: string | null;
  readonly mimeType?: string | null;
  readonly fileSize?: number | null;
}

export interface ImagePickerResultLike {
  readonly canceled: boolean;
  readonly assets: ImageAssetLike[] | null;
}

/** Subset of expo-image-picker. */
export interface ImagePickerLike {
  requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  launchCameraAsync(options?: unknown): Promise<ImagePickerResultLike>;
  launchImageLibraryAsync(options?: unknown): Promise<ImagePickerResultLike>;
}

export interface DocumentAssetLike {
  readonly uri: string;
  readonly name: string;
  readonly mimeType?: string | null;
  readonly size?: number | null;
}

export interface DocumentPickerResultLike {
  readonly canceled: boolean;
  readonly assets: DocumentAssetLike[] | null;
}

/** Subset of expo-document-picker. */
export interface DocumentPickerLike {
  getDocumentAsync(options?: unknown): Promise<DocumentPickerResultLike>;
}

// --- Result + mapping --------------------------------------------------------------------------

export type PickResult =
  | { readonly kind: "picked"; readonly attachment: ComposeAttachment }
  | { readonly kind: "too-large"; readonly filename: string; readonly size: number }
  | { readonly kind: "cancelled" };

const DEFAULT_MIME = "application/octet-stream";

/** Strip any directory segments — the payload envelope stores basenames only. */
function basename(name: string): string {
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1] || name;
}

/** A few common image extensions; otherwise derive from the mime subtype, else `.bin`. */
function fallbackName(mimetype: string): string {
  const subtype = mimetype.split("/")[1] ?? "bin";
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  return `attachment.${ext}`;
}

interface NormalizedAsset {
  readonly uri: string;
  readonly filename: string;
  readonly mimetype: string;
  readonly knownSize: number | null;
}

async function buildResult(asset: NormalizedAsset, FileSystem: FileReaderLike): Promise<PickResult> {
  // Pre-check from metadata when the picker reported a size — avoids reading a huge file just to reject it.
  if (asset.knownSize != null && !validateAttachmentSize(asset.knownSize).ok) {
    return { kind: "too-large", filename: asset.filename, size: asset.knownSize };
  }
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  if (!validateAttachmentSize(bytes.length).ok) {
    return { kind: "too-large", filename: asset.filename, size: bytes.length };
  }
  return {
    kind: "picked",
    attachment: { filename: asset.filename, mimetype: asset.mimetype, bytes, size: bytes.length },
  };
}

function normalizeImage(asset: ImageAssetLike): NormalizedAsset {
  const mimetype = asset.mimeType || DEFAULT_MIME;
  return {
    uri: asset.uri,
    filename: asset.fileName ? basename(asset.fileName) : fallbackName(mimetype),
    mimetype,
    knownSize: asset.fileSize ?? null,
  };
}

function normalizeDocument(asset: DocumentAssetLike): NormalizedAsset {
  return {
    uri: asset.uri,
    filename: basename(asset.name),
    mimetype: asset.mimeType || DEFAULT_MIME,
    knownSize: asset.size ?? null,
  };
}

export interface ImagePickDeps {
  readonly ImagePicker: ImagePickerLike;
  readonly FileSystem: FileReaderLike;
}

export interface DocumentPickDeps {
  readonly DocumentPicker: DocumentPickerLike;
  readonly FileSystem: FileReaderLike;
}

export async function pickFromLibrary(deps: ImagePickDeps): Promise<PickResult> {
  const result = await deps.ImagePicker.launchImageLibraryAsync({ base64: false });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return { kind: "cancelled" };
  return buildResult(normalizeImage(asset), deps.FileSystem);
}

export async function pickFromCamera(deps: ImagePickDeps): Promise<PickResult> {
  const perm = await deps.ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { kind: "cancelled" };
  const result = await deps.ImagePicker.launchCameraAsync({ base64: false });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return { kind: "cancelled" };
  return buildResult(normalizeImage(asset), deps.FileSystem);
}

export async function pickDocument(deps: DocumentPickDeps): Promise<PickResult> {
  const result = await deps.DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = result.canceled ? null : (result.assets?.[0] ?? null);
  if (!asset) return { kind: "cancelled" };
  return buildResult(normalizeDocument(asset), deps.FileSystem);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/pick-attachment.test.ts`
Expected: PASS (all tests, including the Task 2 ones).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/pick-attachment.ts apps/mobile/tests/pick-attachment.test.ts
git commit -m "feat(mobile): DI attachment pick functions (library/camera/document)"
```

---

## Task 4: Thread the attachment through createAndSeal (TDD)

**Files:**
- Modify: `apps/mobile/src/create/create-and-seal.ts:1-22` (imports + input type) and `:50` (encodePayload call)
- Test: `apps/mobile/tests/create-and-seal.test.ts`

- [ ] **Step 1: Write the failing test** (append a new `it` inside the existing `describe("createAndSeal", …)` block in `apps/mobile/tests/create-and-seal.test.ts`)

```ts
  it("seals a supplied attachment so the recipient can decode it", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);

    let posted: CreateMessageRequest | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      posted = JSON.parse(String((init as RequestInit).body)) as CreateMessageRequest;
      return new Response(JSON.stringify({ id: posted.id }), { status: 201 });
    });

    const out = await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "see attached",
      expiresAt: new Date(Date.now() + 60_000),
      maxOpens: 1,
      attachment: {
        filename: "Signed NDA.pdf",
        mimetype: "application/pdf",
        bytes: new Uint8Array([1, 2, 3, 4]),
        size: 4,
      },
    });

    if (!posted) throw new Error("fetch mock did not capture the posted request body");
    const ciphertext = base64ToBytes(posted.ciphertext) as unknown as Parameters<typeof open>[0];
    const plaintext = await open(ciphertext, recipient, {
      linkId: out.id,
      recipientPublicKey: recipientKey,
      createdAtMs: posted.createdAtMs,
      expiresAtMs: new Date(posted.expiresAt).getTime(),
      maxOpens: posted.maxOpens,
    });
    const payload = decodePayload(plaintext);
    expect(payload.text).toBe("see attached");
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe("Signed NDA.pdf");
    expect(payload.attachments[0].mimetype).toBe("application/pdf");
    expect([...payload.attachments[0].bytes]).toEqual([1, 2, 3, 4]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/create-and-seal.test.ts`
Expected: FAIL — `attachment` is not a known property of `CreateAndSealInput` (typecheck/test error), and the sealed payload has no attachments.

- [ ] **Step 3: Implement the threading**

In `apps/mobile/src/create/create-and-seal.ts`:

a) Update the crypto import block (lines 1-9) to also import `PayloadAttachment`, and add a `ComposeAttachment` import. The import section becomes:

```ts
import {
  encodePayload,
  type Fingerprint,
  fingerprint,
  importPublicKey,
  type MessageBindingContext,
  type PayloadAttachment,
  type PublicKeyString,
  seal,
} from "@aesmsg/crypto";
import { LINK_ORIGIN, postMessage } from "@/src/api/client";
import type { ComposeAttachment } from "@/src/create/pick-attachment";
import { bytesToBase64 } from "@/src/lib/base64";
import { generateLinkId } from "@/src/lib/link-id";
import { recordSentLink } from "@/src/links/sent-links-store";
```

b) Add the field to `CreateAndSealInput` (after `label`):

```ts
  /** Optional single attachment, sealed inside the payload envelope alongside the text. */
  attachment?: ComposeAttachment | null;
```

c) Replace line 50 (`const plaintext = encodePayload({ text: input.message, attachments: [] });`) with:

```ts
  const attachments: PayloadAttachment[] = input.attachment
    ? [
        {
          filename: input.attachment.filename,
          mimetype: input.attachment.mimetype,
          bytes: input.attachment.bytes,
        },
      ]
    : [];
  const plaintext = encodePayload({ text: input.message, attachments });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/create-and-seal.test.ts`
Expected: PASS (the new test plus the two existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/create-and-seal.ts apps/mobile/tests/create-and-seal.test.ts
git commit -m "feat(mobile): seal a selected attachment into the message payload"
```

---

## Task 5: Make the AttachmentPickerSheet functional

**Files:**
- Modify: `apps/mobile/src/create/AttachmentPickerSheet.tsx` (full rewrite)

No node test (React component — verified manually per the test convention). This task is one edit + a typecheck.

- [ ] **Step 1: Rewrite the sheet**

Replace the entire contents of `apps/mobile/src/create/AttachmentPickerSheet.tsx` with:

```tsx
import * as DocumentPicker from "expo-document-picker";
// SDK 56 keeps the string-URI file helpers behind the /legacy subpath (see reader/attachment-cache).
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  BottomSheet,
  Button,
  CautionCard,
  Chip,
  Icon,
  ListGroup,
  ListRow,
  RowCard,
} from "@/src/components";
import {
  type ComposeAttachment,
  formatSize,
  MAX_ATTACHMENT_BYTES,
  type PickResult,
  pickDocument,
  pickFromCamera,
  pickFromLibrary,
} from "@/src/create/pick-attachment";
import { colors, radii, type } from "@/src/theme";

// 13 · Attachment Picker (grp-create.jsx · S_Attachment). Real on-device file/photo picking: the
// three source rows invoke the expo pickers via the DI pick-attachment module; the picked file is
// read into memory, size-checked against MAX_ATTACHMENT_BYTES, and shown in the file card. The
// plaintext bytes are sealed into the payload envelope by create-and-seal — the channel only ever
// sees ciphertext. "Attach to message" commits the pending selection to the composer.

const MAX_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);

export interface AttachmentPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The attachment already committed to the composer (so re-opening shows it). */
  value: ComposeAttachment | null;
  /** Commit the pending selection to the composer. */
  onConfirm: (attachment: ComposeAttachment) => void;
}

const imageDeps = { ImagePicker, FileSystem };
const documentDeps = { DocumentPicker, FileSystem };

export function AttachmentPickerSheet({
  visible,
  onClose,
  value,
  onConfirm,
}: AttachmentPickerSheetProps) {
  const [pending, setPending] = useState<ComposeAttachment | null>(value);
  const [tooLarge, setTooLarge] = useState<{ filename: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-sync local pending state to the committed value each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setPending(value);
      setTooLarge(null);
      setBusy(false);
    }
  }, [visible, value]);

  function apply(result: PickResult) {
    if (result.kind === "picked") {
      setPending(result.attachment);
      setTooLarge(null);
    } else if (result.kind === "too-large") {
      setPending(null);
      setTooLarge({ filename: result.filename, size: result.size });
    }
    // "cancelled" → leave the current state untouched.
  }

  async function run(pick: () => Promise<PickResult>) {
    if (busy) return;
    setBusy(true);
    try {
      apply(await pick());
    } catch {
      // A picker failure is non-fatal: leave the prior selection, surface nothing destructive.
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setPending(null);
    setTooLarge(null);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.heading} accessibilityRole="header">
        Attach a file or photo
      </Text>
      <Text style={styles.sub}>It is encrypted on this device before anything is uploaded.</Text>

      <View style={styles.group}>
        <ListGroup>
          <ListRow
            icon="photo_library"
            iconColor={colors.primary}
            title="Photo Library"
            onPress={() => void run(() => pickFromLibrary(imageDeps))}
          />
          <ListRow
            icon="photo_camera"
            iconColor={colors.primary}
            title="Take Photo"
            onPress={() => void run(() => pickFromCamera(imageDeps))}
          />
          <ListRow
            icon="folder"
            iconColor={colors.primary}
            title="Browse Files"
            onPress={() => void run(() => pickDocument(documentDeps))}
          />
        </ListGroup>
      </View>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.busyText}>Reading file…</Text>
        </View>
      ) : null}

      {tooLarge ? (
        <CautionCard style={styles.tooLarge}>
          <Text style={styles.tooLargeTitle}>This file is too large</Text>
          <Text style={styles.tooLargeBody}>
            {`The maximum attachment size is ${MAX_MB} MB. This file is ${formatSize(tooLarge.size)}.`}
          </Text>
        </CautionCard>
      ) : null}

      {pending && !busy ? (
        <View style={styles.fileCard}>
          <View style={styles.fileIcon}>
            <Icon name="description" size={22} color={colors.onSurfaceVariant} />
          </View>
          <View style={styles.fileMain}>
            <Text style={styles.fileName} numberOfLines={1}>
              {pending.filename}
            </Text>
            <Text style={styles.fileMeta}>{formatSize(pending.size)}</Text>
          </View>
          <RowCard onPress={clear} style={styles.removeBtn}>
            <Icon name="close" size={20} color={colors.outline} accessibilityLabel="Remove attachment" />
          </RowCard>
        </View>
      ) : null}

      <View style={styles.chipRow}>
        <Chip tone="green" icon="lock" fill>
          Encrypted on this device before upload
        </Chip>
      </View>
      <Text style={styles.limit}>{`Up to ${MAX_MB} MB per attachment`}</Text>

      <Button
        onPress={() => {
          if (pending) onConfirm(pending);
        }}
        disabled={!pending || busy}
        style={styles.attach}
      >
        Attach to message
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.h2, color: colors.onSurface },
  sub: { ...type.body, color: colors.onSurfaceVariant, marginTop: 6 },
  group: { marginTop: 16 },
  busy: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  busyText: { ...type.body, color: colors.onSurfaceVariant },
  tooLarge: { marginTop: 16 },
  tooLargeTitle: { ...type.body, fontWeight: "600", color: colors.onSurface },
  tooLargeBody: { fontSize: 13, color: colors.onSurfaceVariant, marginTop: 4 },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: radii.lg,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  fileMain: { flex: 1, minWidth: 0 },
  fileName: { ...type.body, fontWeight: "500", color: colors.onSurface },
  fileMeta: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  removeBtn: { padding: 4, backgroundColor: "transparent", borderWidth: 0 },
  chipRow: { marginTop: 16 },
  limit: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 10 },
  attach: { marginTop: 20 },
});
```

NOTE on the remove control: if `RowCard` does not accept a `backgroundColor: "transparent" / borderWidth: 0` style override cleanly, fall back to wrapping the `Icon` in a React Native `Pressable` with `onPress={clear}` and `hitSlop={8}` instead (the existing `ComposeScreen` "Add file" affordance uses `Pressable` this way). Confirm by reading `apps/mobile/src/components/RowCard.tsx` before choosing.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS. (If the `RowCard` override is rejected, apply the `Pressable` fallback from the note above, then re-run.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/create/AttachmentPickerSheet.tsx
git commit -m "feat(mobile): functional attachment picker sheet (pick/size/states)"
```

---

## Task 6: Wire the selection into ComposeScreen

**Files:**
- Modify: `apps/mobile/src/create/ComposeScreen.tsx` (imports, state, `canSend`, `submit`, footer display, the `<AttachmentPickerSheet>` props, and the `ComposeSubmit` interface)

No node test (React component). One edit + typecheck. `CreateFlow.tsx` needs **no change** — it passes the whole `ComposeSubmit` object straight to `createAndSeal`, and the new optional `attachment` field is accepted structurally.

- [ ] **Step 1: Add the import** (after the `recipient` imports near line 11-13)

```tsx
import type { ComposeAttachment } from "@/src/create/pick-attachment";
```

- [ ] **Step 2: Extend the `ComposeSubmit` interface** (lines 29-34) — add the field:

```tsx
export interface ComposeSubmit {
  recipientPublicKeyString: string;
  message: string;
  expiresAt: Date;
  maxOpens: MaxOpensChoice;
  attachment: ComposeAttachment | null;
}
```

- [ ] **Step 3: Add component state** (after the `requireBiometric` state, line 61):

```tsx
  const [attachment, setAttachment] = useState<ComposeAttachment | null>(null);
```

- [ ] **Step 4: Relax `canSend` and include the attachment in `submit`** — replace the `canSend` const (line 122) and the `submit` function (lines 124-132):

```tsx
  const canSend = (message.trim().length > 0 || attachment !== null) && fp !== null && !keyError && !busy;

  function submit() {
    if (!canSend) return;
    onSubmit({
      recipientPublicKeyString: recipientKey.trim(),
      message,
      expiresAt: expiryToDate(expiry, new Date()),
      maxOpens,
      attachment,
    });
  }
```

- [ ] **Step 5: Show the committed attachment in the composer.** In the message card, replace the `messageFooter` block (lines 185-197) with a version that swaps "Add file" for an attached-file row once a file is committed:

```tsx
          <View style={styles.messageFooter}>
            <Pressable
              onPress={() => setSheet("attachment")}
              accessibilityRole="button"
              accessibilityLabel="Add file"
              style={styles.addFile}
              hitSlop={6}
            >
              <Icon name="attach_file" size={18} color={colors.primary} />
              <Text style={styles.addFileText}>{attachment ? "Change file" : "Add file"}</Text>
            </Pressable>
            <Text style={styles.deviceNote}>Plaintext never leaves this device</Text>
          </View>
          {attachment ? (
            <View style={styles.attachedRow}>
              <Icon name="description" size={18} color={colors.onSurfaceVariant} />
              <Text style={styles.attachedName} numberOfLines={1}>
                {attachment.filename}
              </Text>
              <Pressable
                onPress={() => setAttachment(null)}
                accessibilityRole="button"
                accessibilityLabel="Remove attachment"
                hitSlop={8}
              >
                <Icon name="close" size={18} color={colors.outline} />
              </Pressable>
            </View>
          ) : null}
```

- [ ] **Step 6: Pass real props to the sheet** — replace the `<AttachmentPickerSheet … />` block (lines 261-265):

```tsx
      <AttachmentPickerSheet
        visible={sheet === "attachment"}
        onClose={() => setSheet(null)}
        value={attachment}
        onConfirm={(a) => {
          setAttachment(a);
          setSheet(null);
        }}
      />
```

- [ ] **Step 7: Add the styles** — inside the `StyleSheet.create({ … })` (after the `addFileText` entry, line 339), add:

```tsx
  attachedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  attachedName: { ...type.body, color: colors.onSurface, flex: 1, minWidth: 0 },
```

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/create/ComposeScreen.tsx
git commit -m "feat(mobile): attach a selected file to the composed message"
```

---

## Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full mobile test suite**

Run: `pnpm --filter @aesmsg/mobile test`
Expected: PASS — all suites green, including `pick-attachment.test.ts` and `create-and-seal.test.ts`.

- [ ] **Step 2: Typecheck + lint the workspace**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (If Biome reports formatting, run `pnpm lint:fix` and re-run; commit any formatting fix.)

- [ ] **Step 3: Clean iOS dev build for on-device verification**

The new pickers are native modules, so a fresh dev build is required (hot reload will not pick them up). Build and launch on a device/simulator per `apps/mobile/README.md` (memory: pod install with the macOS SDKROOT/LIBRARY_PATH workaround on Xcode 26.5, then `xcodebuild`).

Manual checks:
- Compose → "Add file" → **Browse Files**: pick a PDF/doc → the file card shows the real name + size → "Attach to message" → the composer shows the attached-file row.
- "Encrypt & create link" → open the resulting `/l/:id` link in the reader → the attachment decrypts and saves/shares.
- Pick a file > 10 MB → the amber "This file is too large" card shows with the real size and the footer is disabled.
- **Photo Library** picks an image (works on simulator). **Take Photo** requires a real device (no simulator camera); confirm the camera permission prompt appears on first use.

- [ ] **Step 4: Final commit (if lint produced changes)**

```bash
git add -A
git commit -m "chore(mobile): formatting after attachment picker"
```

---

## Self-Review notes (already reconciled)

- **Spec coverage:** deps + permissions (Task 1), size policy + helpers (Task 2), pickers (Task 3), seal threading (Task 4), sheet states + copy (Task 5), composer threading + relaxed `canSend` (Task 6), verification incl. on-device + camera caveat (Task 7). All spec sections map to a task.
- **Type consistency:** `ComposeAttachment` (`pick-attachment.ts`) is the single selected-file type used by the sheet, `ComposeSubmit`, and `CreateAndSealInput`; it maps to crypto's `PayloadAttachment` only in `create-and-seal.ts`. `PickResult` kinds (`picked` / `too-large` / `cancelled`) are consistent across the module and the sheet.
- **Non-goals respected:** single attachment only; no plan/upsell; `PermissionsPrimingScreen` untouched; the 3-row layout (not the dashed drop-zone) retained.
