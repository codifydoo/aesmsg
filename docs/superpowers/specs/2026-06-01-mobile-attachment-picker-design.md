# Mobile attachment picker — sender-side attachment flow

**Date:** 2026-06-01
**Status:** Approved (brainstorm) → ready for implementation plan
**Scope:** `apps/mobile` compose flow only. No backend, crypto, or web changes.

## Problem

The compose flow's "Attach a file or photo" bottom sheet
([`AttachmentPickerSheet.tsx`](../../../apps/mobile/src/create/AttachmentPickerSheet.tsx))
is purely presentational. Its three source rows (Photo Library / Take Photo /
Browse Files) are no-ops, the selected-file card is a hardcoded sample
("Signed NDA.pdf"), and [`create-and-seal.ts`](../../../apps/mobile/src/create/create-and-seal.ts)
hardcodes `encodePayload({ text, attachments: [] })`. A user cannot actually
attach a file to a secure message.

Everything *downstream* already works:

- **Crypto** — [`packages/crypto/src/payload.ts`](../../../packages/crypto/src/payload.ts)
  fully encodes/decodes attachments (filename + mimetype + bytes), AEAD-sealed
  and Padmé-padded inside the envelope. Filenames/mimetypes never leak to the
  server.
- **Reader** — [`ReaderScreen.tsx`](../../../apps/mobile/src/reader/ReaderScreen.tsx)
  + [`attachment-cache.ts`](../../../apps/mobile/src/reader/attachment-cache.ts)
  decode incoming attachments, render them, write-to-cache → share → wipe on
  leave, with DI + tests.

So this slice wires **only the sender side**: real pickers → read bytes →
thread the selected file into the existing `encodePayload`/`seal` path.

## Decisions (locked)

1. **Single attachment**, not multiple. Matches the current design (one file
   card, "Add file" singular). The payload envelope and reader already support
   multiple, so expanding later is cheap.
2. **Cap to fit the real 14 MB ciphertext limit and fix the copy.** No backend
   change. The "Up to 25 MB on the free plan" / "Upgrade for files up to 2 GB"
   plan story is dropped — no billing/plans exist (YAGNI).

## Size policy

The API caps ciphertext at **14 MiB** (`MAX_CIPHERTEXT_BYTES`,
[`messages-handler.ts:30`](../../../apps/api/src/handlers/messages-handler.ts))
and the request body at **20 MiB** (`MAX_BODY_BYTES`). Stored
`ciphertext = padded_envelope + 50 bytes` (2 header + 32 encapsulated key +
16 GCM tag — see [`pad.ts`](../../../packages/crypto/src/pad.ts)).

Chosen cap: **`MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024` (10 MiB per file).**

- 10 MiB file → envelope ≈ 10 MiB; Padmé adds ≤ ~0.25 MiB at this scale →
  ciphertext ≈ 10.25 MiB, well under 14 MiB (≈3.7 MiB headroom for the text body).
- base64 over the wire ≈ 13.7 MiB, under the 20 MiB body limit.

The 10 MiB pick-time cap is the primary guard; if the API still rejects an
oversized upload, the composer's existing inline error
([`ComposeScreen` `error` prop](../../../apps/mobile/src/create/ComposeScreen.tsx))
surfaces it. The cap is a single shared constant so the sheet copy and the
validation stay in sync.

## Architecture

Approach: a **DI'd pure module** mirroring the established
[`attachment-cache.ts`](../../../apps/mobile/src/reader/attachment-cache.ts)
pattern — minimal injected interfaces for the expo native modules, all
mapping/validation logic pure and node-testable, React components pass the real
modules in. (Rejected: inline expo calls in the component — breaks the node-test
convention since expo modules fail Flow-parse under the node runner, and bloats
the component.)

### 1. New dependencies (native → requires a clean rebuild)

- `expo-image-picker` — Photo Library (`launchImageLibraryAsync`) and Take Photo
  (`launchCameraAsync`, with camera permission via `requestCameraPermissionsAsync`).
- `expo-document-picker` — Browse Files (`getDocumentAsync`).
- Reuse existing `expo-file-system/legacy` (`readAsStringAsync` base64) +
  `base64ToBytes` ([`apps/mobile/src/lib/base64.ts`](../../../apps/mobile/src/lib/base64.ts))
  to load picked bytes.
- iOS usage strings (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`)
  via the picker config plugins in the Expo app config.

### 2. New module `apps/mobile/src/create/pick-attachment.ts` (pure + DI)

- Type `ComposeAttachment { filename: string; mimetype: string; bytes: Uint8Array; size: number }`.
- Minimal `ImagePickerLike` / `DocumentPickerLike` / `FileSystemLike` interfaces
  (only the methods used), so tests inject spies.
- `pickFromLibrary(deps)`, `pickFromCamera(deps)`, `pickDocument(deps)` →
  read the picked URI to bytes, normalize the filename to a basename, supply a
  mimetype fallback (`application/octet-stream`), and return
  `ComposeAttachment | null` (null = the user cancelled).
- `MAX_ATTACHMENT_BYTES` constant, `validateAttachmentSize(size)` (returns ok /
  too-large with the actual size), and a `formatSize(bytes)` helper for the card
  and the over-limit copy.

### 3. `AttachmentPickerSheet.tsx` — make it functional

Three states from the design
([`ai_design_prompts_mobile.md:366-371`](../../../all_design_screens/ai_design_prompts_mobile.md)),
keeping the shipped 3-row layout (not the full dashed drop-zone variant):

- **empty** — the three source rows call the pick handlers.
- **file attached** — real card: type icon, filename, formatted size, remove-X;
  green "Encrypted on this device before upload" note; enabled footer.
- **too large** — amber card "This file is too large" / "The maximum attachment
  size is 10 MB. This file is {N} MB."; footer disabled.

The sheet holds a **local pending** selection (initialized from the committed
value when it opens). Picking updates pending; **"Attach to message"** commits it
via `onConfirm(attachment)` and closes; dismiss/close discards the pending pick.
The thin React glue (calling the DI module with the real expo modules) lives in
the sheet/composer; all testable logic is in the module.

### 4. `ComposeScreen.tsx` — own + display + thread the selection

- New state `attachment: ComposeAttachment | null`.
- Show a compact attached-file chip/row near the "Add file" affordance, with a
  remove control, when a file is committed.
- `canSend` becomes *(message non-empty **OR** attachment present) AND a valid
  recipient AND not busy* — a file can be sent with no note (the payload already
  permits empty text).
- Add `attachment` to the `ComposeSubmit` contract.

### 5. Seal path — `create-and-seal.ts`

- `CreateAndSealInput` gains the attachment.
- Map `ComposeAttachment → PayloadAttachment` (`{ filename, mimetype, bytes }`)
  and pass it to `encodePayload({ text, attachments })`, replacing the hardcoded
  `attachments: []`. No other change to the seal/upload contract.

## Tests (TDD, node-env, in `apps/mobile/tests/`)

- `pick-attachment.test.ts`:
  - each source maps a picker result → `ComposeAttachment` (filename, mimetype,
    bytes, size);
  - cancellation → `null`;
  - filename basename normalization;
  - mimetype fallback when the picker omits it;
  - oversize → `validateAttachmentSize` reports too-large with the real size;
  - `formatSize` output.
- Extend `create-and-seal.test.ts`: a supplied attachment reaches `encodePayload`
  (and an empty/absent attachment still yields `attachments: []`).

## Non-goals

- `PermissionsPrimingScreen` stays a placeholder — OS prompts at point-of-use are
  sufficient.
- Multiple attachments (single chosen; infra supports it later).
- The full dashed "drop-zone" empty state from the design spec — keep the shipped
  3-row layout.
- The "Pro upsell / 2 GB" plan story — no billing exists.
- Camera ("Take Photo") can only be verified on a real device, not the iOS
  simulator.

## Verification

- `pnpm --filter @aesmsg/mobile test` (or the workspace test script) — new + existing green.
- `pnpm typecheck`, `pnpm lint`.
- Clean iOS dev build on a device to exercise the real pickers (camera is
  device-only); confirm: pick from library/files → card shows real name/size →
  "Attach to message" → encrypt & create link → open the link in the reader and
  confirm the attachment decrypts and saves.
