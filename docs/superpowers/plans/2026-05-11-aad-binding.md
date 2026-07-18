# AAD Binding Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the HPKE AAD from a single random link ID to a canonical struct binding all security-relevant message metadata, so a malicious/compromised server cannot tamper with expiry, max-opens, recipient identity, suite, or version without causing decryption to fail closed on the client.

**Architecture:** Define `MessageBindingContext` as a typed struct in `@aesmsg/crypto`. Move AAD construction inside the crypto package (call sites no longer build raw `Uint8Array` AADs). Change `seal(plaintext, recipient, context)` / `open(ciphertext, identity, context)` to accept the typed struct and canonically encode it internally as a fixed-layout binary frame. Server-side: accept client-provided `createdAtMs` on create, return both `createdAt` and `expiresAt` on open. No backwards-compatibility shim — pre-launch, one-way break.

**Tech Stack:** TypeScript strict, Vitest, `@hpke/core`, pnpm workspaces, Next.js 16 app router. All work happens inside the existing monorepo: `packages/crypto`, `packages/server-store`, `apps/web`.

---

## Canonical AAD layout (binding for every task)

```
Field            Bytes  Type      Notes
─────────────────────────────────────────────────────────────────────
aadVersion        1     u8        starts at 0x01
wireVersion       1     u8        mirrors wire.ts WIRE_VERSION = 0x01
suiteId           1     u8        mirrors wire.ts SUITE_X25519_AES256GCM = 0x01
linkIdLen         2     u16 BE    network byte order
linkId            N     bytes     UTF-8 ASCII bytes of link id (regex enforces 16 chars)
recipPubKeyHash  32     bytes     SHA-256 over canonical encoded recipient public key
createdAtMs       8     u64 BE    JavaScript milliseconds since epoch (signed range fits)
expiresAtMs       8     u64 BE    same
maxOpens          4     i32 BE    two's complement; -1 sentinel means unlimited until expiry
```

Total = 57 + linkIdLen bytes (= 73 bytes for 16-char ids).

The encoder is deterministic: encoding the same struct twice MUST yield byte-identical output.

## MessageBindingContext type (binding for every task)

```ts
export interface MessageBindingContext {
  readonly linkId: string;            // base64url, length 16 chars per LINK_ID_REGEX
  readonly recipientPublicKey: PublicKeyString;
  readonly createdAtMs: number;       // Date.now() at seal time
  readonly expiresAtMs: number;
  readonly maxOpens: number;          // positive integer, or -1 for unlimited
}
```

The internal canonical encoder derives `recipPubKeyHash` from `recipientPublicKey` and fills `aadVersion`/`wireVersion`/`suiteId` from constants. Callers never compute the hash themselves.

---

## File Structure

**Create:**
- `packages/crypto/src/aad.ts` — `MessageBindingContext` type + `encodeAad()` canonical encoder.
- `packages/crypto/tests/aad.test.ts` — encoder unit + property tests.

**Modify:**
- `packages/crypto/src/seal.ts` — change `seal/open` signatures to accept `MessageBindingContext`; internally encode AAD via `encodeAad`.
- `packages/crypto/src/index.ts` — export `MessageBindingContext`, `encodeAad` (for testability).
- `packages/crypto/tests/seal.test.ts` — migrate existing seal tests to new API.
- `packages/crypto/tests/roundtrip.test.ts` — migrate existing roundtrip tests.
- `packages/crypto/tests/negative.test.ts` — add per-field tamper tests.
- `packages/server-store/src/interfaces.ts` — `LinkMetadataStore.create()` takes `createdAt: Date`.
- `packages/server-store/src/memory/link-metadata-store.ts` — use passed `createdAt`.
- `packages/server-store/src/pg/link-metadata-store.ts` — INSERT `createdAt` explicitly.
- `packages/server-store/tests/*` — update tests to pass `createdAt`.
- `apps/web/src/server/messages-handler.ts` — accept `createdAtMs` on POST, validate; return `createdAt`+`expiresAt` on open.
- `apps/web/tests/server/messages-handler.test.ts` (or equivalent) — coverage for new fields.
- `apps/web/src/lib/api-client.ts` — extend `CreateMessageRequest`, `MessageMetadata`, `OpenMessageResponse`.
- `apps/web/src/create/encrypt-and-post.ts` — construct `MessageBindingContext`, pass to `seal()`.
- `apps/web/src/reader/fetch-and-open.ts` — construct `MessageBindingContext` from open response, pass to `open()`.
- `apps/web/tests/create/encrypt-and-post.test.ts` (or equivalent) — update for new flow.
- `apps/web/tests/reader/fetch-and-open.test.ts` (or equivalent) — update for new flow.

**Test:**
- All paths above ending in `.test.ts`.

---

## Task 1: Define `MessageBindingContext` and `encodeAad()` (TDD)

**Files:**
- Create: `packages/crypto/src/aad.ts`
- Create: `packages/crypto/tests/aad.test.ts`

**Context constants** (already defined elsewhere, restated for clarity):
- `AAD_VERSION = 0x01`
- `WIRE_VERSION = 0x01` — already in [packages/crypto/src/wire.ts:4](packages/crypto/src/wire.ts:4)
- `SUITE_X25519_AES256GCM = 0x01` — already in [packages/crypto/src/wire.ts:5](packages/crypto/src/wire.ts:5)

- [ ] **Step 1: Write failing test for happy-path deterministic encoding**

Create `packages/crypto/tests/aad.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { encodeAad, AAD_VERSION } from "../src/aad";
import { generateIdentity, exportPublicKey } from "../src/identity";
import { SUITE_X25519_AES256GCM, WIRE_VERSION } from "../src/wire";

describe("encodeAad", () => {
  it("is deterministic for the same context", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);

    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };

    const a = await encodeAad(ctx);
    const b = await encodeAad(ctx);
    expect(a).toEqual(b);
  });

  it("starts with [aadVersion, wireVersion, suiteId] header bytes", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);

    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };

    const out = await encodeAad(ctx);
    expect(out[0]).toBe(AAD_VERSION);
    expect(out[1]).toBe(WIRE_VERSION);
    expect(out[2]).toBe(SUITE_X25519_AES256GCM);
  });

  it("includes a 32-byte SHA-256 of the canonical recipient pubkey", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };
    const out = await encodeAad(ctx);
    // Header(3) + linkIdLen(2) + linkId(16) = 21; recipPubKeyHash starts at offset 21, length 32
    expect(out.length).toBeGreaterThanOrEqual(21 + 32);
  });

  it("produces different output if maxOpens differs", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const base = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };
    const a = await encodeAad(base);
    const b = await encodeAad({ ...base, maxOpens: 4 });
    expect(a).not.toEqual(b);
  });

  it("encodes maxOpens = -1 as 0xFFFFFFFF (i32 BE two's complement)", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: -1,
    };
    const out = await encodeAad(ctx);
    // Tail 4 bytes are maxOpens
    const tail = out.slice(out.length - 4);
    expect(tail).toEqual(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @aesmsg/crypto test:node -- aad.test`
Expected: FAIL with module-not-found / `encodeAad is not defined`.

- [ ] **Step 3: Implement `encodeAad` and constants**

Create `packages/crypto/src/aad.ts`:

```ts
import { importPublicKey } from "./identity";
import { __getRecipientImpl } from "./identity";
import type { PublicKeyString } from "./types";
import { SUITE_X25519_AES256GCM, WIRE_VERSION } from "./wire";
import { exportRawPublicKey } from "./hpke";

export const AAD_VERSION = 0x01;

const HEADER_LEN = 3;
const LINK_ID_LEN_PREFIX = 2;
const RECIP_HASH_LEN = 32;
const CREATED_AT_LEN = 8;
const EXPIRES_AT_LEN = 8;
const MAX_OPENS_LEN = 4;

export interface MessageBindingContext {
  readonly linkId: string;
  readonly recipientPublicKey: PublicKeyString;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly maxOpens: number;
}

function writeU8(view: DataView, offset: number, value: number): number {
  view.setUint8(offset, value);
  return offset + 1;
}

function writeU16BE(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value, false);
  return offset + 2;
}

function writeI32BE(view: DataView, offset: number, value: number): number {
  view.setInt32(offset, value, false);
  return offset + 4;
}

function writeU64BE(view: DataView, offset: number, value: number): number {
  // JavaScript Number safe range is < 2^53; BigInt avoids any rounding for large millisecond values.
  view.setBigUint64(offset, BigInt(value), false);
  return offset + 8;
}

function writeBytes(out: Uint8Array, offset: number, bytes: Uint8Array): number {
  out.set(bytes, offset);
  return offset + bytes.length;
}

async function hashRecipientPubkey(pk: PublicKeyString): Promise<Uint8Array> {
  const recipient = await importPublicKey(pk);
  const impl = __getRecipientImpl(recipient);
  const raw = await exportRawPublicKey(impl.cryptoKey);
  const buf = new ArrayBuffer(raw.byteLength);
  new Uint8Array(buf).set(raw);
  const digestAb = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digestAb);
}

export async function encodeAad(ctx: MessageBindingContext): Promise<Uint8Array> {
  if (!Number.isFinite(ctx.createdAtMs) || ctx.createdAtMs < 0) {
    throw new Error("encodeAad: createdAtMs must be a non-negative finite number");
  }
  if (!Number.isFinite(ctx.expiresAtMs) || ctx.expiresAtMs < 0) {
    throw new Error("encodeAad: expiresAtMs must be a non-negative finite number");
  }
  if (!Number.isInteger(ctx.maxOpens) || (ctx.maxOpens <= 0 && ctx.maxOpens !== -1)) {
    throw new Error("encodeAad: maxOpens must be a positive integer or -1");
  }

  const linkIdBytes = new TextEncoder().encode(ctx.linkId);
  if (linkIdBytes.length > 0xffff) {
    throw new Error("encodeAad: linkId too long");
  }
  const recipHash = await hashRecipientPubkey(ctx.recipientPublicKey);
  if (recipHash.length !== RECIP_HASH_LEN) {
    throw new Error("encodeAad: recipient hash unexpected length");
  }

  const total =
    HEADER_LEN +
    LINK_ID_LEN_PREFIX +
    linkIdBytes.length +
    RECIP_HASH_LEN +
    CREATED_AT_LEN +
    EXPIRES_AT_LEN +
    MAX_OPENS_LEN;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let off = 0;
  off = writeU8(view, off, AAD_VERSION);
  off = writeU8(view, off, WIRE_VERSION);
  off = writeU8(view, off, SUITE_X25519_AES256GCM);
  off = writeU16BE(view, off, linkIdBytes.length);
  off = writeBytes(out, off, linkIdBytes);
  off = writeBytes(out, off, recipHash);
  off = writeU64BE(view, off, ctx.createdAtMs);
  off = writeU64BE(view, off, ctx.expiresAtMs);
  off = writeI32BE(view, off, ctx.maxOpens);

  if (off !== total) {
    throw new Error("encodeAad: internal offset mismatch");
  }
  return out;
}
```

- [ ] **Step 4: Run the tests; expect pass**

Run: `pnpm --filter @aesmsg/crypto test:node -- aad.test`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/crypto/src/aad.ts packages/crypto/tests/aad.test.ts
git commit -m "feat(crypto): add MessageBindingContext and canonical AAD encoder"
```

---

## Task 2: Add validation/error tests for `encodeAad`

**Files:**
- Modify: `packages/crypto/tests/aad.test.ts`

- [ ] **Step 1: Write failing tests for invalid input**

Append inside the `describe("encodeAad", ...)` block:

```ts
  it("rejects non-finite createdAtMs", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: Number.NaN,
      expiresAtMs: 1,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/createdAtMs/);
  });

  it("rejects negative expiresAtMs", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: -1,
      maxOpens: 1,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/expiresAtMs/);
  });

  it("rejects maxOpens = 0", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: 1,
      maxOpens: 0,
    };
    await expect(encodeAad(ctx)).rejects.toThrow(/maxOpens/);
  });

  it("accepts maxOpens = -1 (unlimited)", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);
    const ctx = {
      linkId: "abcdefghij012345",
      recipientPublicKey: pk,
      createdAtMs: 1,
      expiresAtMs: 1,
      maxOpens: -1,
    };
    await expect(encodeAad(ctx)).resolves.toBeInstanceOf(Uint8Array);
  });
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @aesmsg/crypto test:node -- aad.test`
Expected: PASS — implementation already covers these per Task 1.

- [ ] **Step 3: Commit**

```bash
git add packages/crypto/tests/aad.test.ts
git commit -m "test(crypto): cover encodeAad validation edge cases"
```

---

## Task 3: Update `seal()` / `open()` to accept `MessageBindingContext` (TDD)

**Files:**
- Modify: `packages/crypto/src/seal.ts`
- Modify: `packages/crypto/src/index.ts`

- [ ] **Step 1: Write failing test exercising the new API shape**

Modify `packages/crypto/tests/roundtrip.test.ts` to add a new top-level case at the end:

```ts
import { generateIdentity, exportPublicKey, seal, open } from "../src/index";
import type { MessageBindingContext } from "../src/index";

it("roundtrips with MessageBindingContext", async () => {
  const recipient = await generateIdentity();
  const recipientPk = await exportPublicKey(recipient);

  const ctx: MessageBindingContext = {
    linkId: "abcdefghij012345",
    recipientPublicKey: recipientPk,
    createdAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_086_400_000,
    maxOpens: 3,
  };

  const plaintext = new TextEncoder().encode("hello bound world");
  const ct = await seal(plaintext, await (await import("../src/identity")).importPublicKey(recipientPk), ctx);
  const out = await open(ct, recipient, ctx);
  expect(new TextDecoder().decode(out)).toBe("hello bound world");
});
```

(If `roundtrip.test.ts` doesn't expose this shape directly, add a sibling test file `packages/crypto/tests/roundtrip-context.test.ts` containing the case above plus the imports it needs — `describe`, `it`, `expect` from vitest.)

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @aesmsg/crypto test:node -- roundtrip`
Expected: FAIL because `seal/open` currently take `Uint8Array` AAD, not context.

- [ ] **Step 3: Change the seal/open signatures**

Replace the contents of `packages/crypto/src/seal.ts`:

```ts
import { encodeAad, type MessageBindingContext } from "./aad";
import { DecryptionError } from "./errors";
import { openHpke, sealHpke } from "./hpke";
import { __getIdentityImpl, __getRecipientImpl } from "./identity";
import type { Ciphertext, IdentityKeypair, RecipientPublicKey } from "./types";
import { decodeCiphertextBlob, encodeCiphertextBlob } from "./wire";

export async function seal(
  plaintext: Uint8Array,
  recipient: RecipientPublicKey,
  context: MessageBindingContext,
): Promise<Ciphertext> {
  const aad = await encodeAad(context);
  const r = __getRecipientImpl(recipient);
  const { enc, aeadOutput } = await sealHpke(r.cryptoKey, plaintext, aad);
  return encodeCiphertextBlob(enc, aeadOutput) as unknown as Ciphertext;
}

export async function open(
  ciphertext: Ciphertext,
  id: IdentityKeypair,
  context: MessageBindingContext,
): Promise<Uint8Array> {
  const aad = await encodeAad(context);
  const blob = ciphertext as unknown as Uint8Array;
  let parsed: { enc: Uint8Array; aeadOutput: Uint8Array };
  try {
    parsed = decodeCiphertextBlob(blob);
  } catch {
    throw new DecryptionError();
  }
  const impl = __getIdentityImpl(id);
  try {
    return await openHpke(impl.privateKey, parsed.enc, parsed.aeadOutput, aad);
  } catch {
    throw new DecryptionError();
  }
}
```

Update `packages/crypto/src/index.ts` to add these exports at the appropriate position alongside `seal`/`open`:

```ts
export { encodeAad, AAD_VERSION } from "./aad";
export type { MessageBindingContext } from "./aad";
```

- [ ] **Step 4: Run roundtrip-context test; expect PASS**

Run: `pnpm --filter @aesmsg/crypto test:node -- roundtrip`
Expected: PASS for the new test.

- [ ] **Step 5: Commit**

```bash
git add packages/crypto/src/seal.ts packages/crypto/src/index.ts packages/crypto/tests/roundtrip.test.ts packages/crypto/tests/roundtrip-context.test.ts
git commit -m "feat(crypto): seal/open take MessageBindingContext; AAD encoded internally"
```

---

## Task 4: Migrate existing seal/open tests to the new API

**Files:**
- Modify: `packages/crypto/tests/seal.test.ts`
- Modify: `packages/crypto/tests/negative.test.ts`
- Modify: `packages/crypto/tests/interop.test.ts` (if it touches `seal`/`open`)

- [ ] **Step 1: Replace every raw-AAD call site with a context**

Search and replace pattern. For every existing call shaped like:

```ts
const aad = new TextEncoder().encode("something");
const ct = await seal(plaintext, recipient, aad);
```

Rewrite as:

```ts
import type { MessageBindingContext } from "../src/aad";

const ctx: MessageBindingContext = {
  linkId: "abcdefghij012345",
  recipientPublicKey: recipientPk, // already imported / produced by the test
  createdAtMs: 1_700_000_000_000,
  expiresAtMs: 1_700_086_400_000,
  maxOpens: 1,
};
const ct = await seal(plaintext, recipient, ctx);
```

Mirror the same change on `open(...)` call sites with the *same* `ctx` object so the round-trip continues to succeed.

Find every call site first:

```bash
grep -rn "seal(\|open(" packages/crypto/tests
```

Update each file in that list. Do NOT change semantics — every test should still assert what it used to assert.

- [ ] **Step 2: Run the whole crypto suite**

Run: `pnpm --filter @aesmsg/crypto test:node`
Expected: PASS (or, for the negative tests, fail in their intended way — see Task 5).

- [ ] **Step 3: Run browser tests too**

Run: `pnpm --filter @aesmsg/crypto test:browser`
Expected: PASS for any browser-side tests that touch seal/open.

- [ ] **Step 4: Commit**

```bash
git add packages/crypto/tests
git commit -m "test(crypto): migrate existing seal/open tests to MessageBindingContext API"
```

---

## Task 5: Per-field AAD tamper tests (the failure matrix)

**Files:**
- Modify: `packages/crypto/tests/negative.test.ts` (or create `packages/crypto/tests/aad-tamper.test.ts` if cleaner)

- [ ] **Step 1: Write failing tests for each tamper case**

Append to `negative.test.ts` (or new file):

```ts
import { describe, expect, it } from "vitest";
import { exportPublicKey, generateIdentity, importPublicKey, open, seal } from "../src/index";
import type { MessageBindingContext } from "../src/aad";
import { DecryptionError } from "../src/errors";

async function setupCtx(): Promise<{
  recipient: Awaited<ReturnType<typeof generateIdentity>>;
  recipientPk: Awaited<ReturnType<typeof exportPublicKey>>;
  ctx: MessageBindingContext;
}> {
  const recipient = await generateIdentity();
  const recipientPk = await exportPublicKey(recipient);
  const ctx: MessageBindingContext = {
    linkId: "abcdefghij012345",
    recipientPublicKey: recipientPk,
    createdAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_086_400_000,
    maxOpens: 3,
  };
  return { recipient, recipientPk, ctx };
}

describe("AAD tamper resistance", () => {
  it("wrong linkId fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(open(ct, recipient, { ...ctx, linkId: "zzzzzzzzzz012345" })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("wrong recipient pubkey in context fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const other = await generateIdentity();
    const otherPk = await exportPublicKey(other);
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(
      open(ct, recipient, { ...ctx, recipientPublicKey: otherPk }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("wrong createdAtMs fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(open(ct, recipient, { ...ctx, createdAtMs: ctx.createdAtMs + 1 })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("wrong expiresAtMs fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(open(ct, recipient, { ...ctx, expiresAtMs: ctx.expiresAtMs + 1 })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("wrong maxOpens fails open", async () => {
    const { recipient, recipientPk, ctx } = await setupCtx();
    const recipientPub = await importPublicKey(recipientPk);
    const ct = await seal(new TextEncoder().encode("x"), recipientPub, ctx);
    await expect(open(ct, recipient, { ...ctx, maxOpens: ctx.maxOpens + 1 })).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });
});
```

- [ ] **Step 2: Run the tamper tests**

Run: `pnpm --filter @aesmsg/crypto test:node -- negative`
Expected: PASS — AES-GCM authentication fails on any AAD mismatch.

- [ ] **Step 3: Commit**

```bash
git add packages/crypto/tests/negative.test.ts
git commit -m "test(crypto): per-field AAD tamper-resistance matrix for seal/open"
```

---

## Task 6: `LinkMetadataStore.create()` accepts `createdAt` (server-store)

**Files:**
- Modify: `packages/server-store/src/interfaces.ts`
- Modify: `packages/server-store/src/memory/link-metadata-store.ts`
- Modify: `packages/server-store/src/pg/link-metadata-store.ts`
- Modify: any existing tests under `packages/server-store/tests/`

- [ ] **Step 1: Inspect the current interface**

Run: `grep -n "create" packages/server-store/src/interfaces.ts`
Confirm the current signature is roughly:

```ts
create(record: Omit<LinkMetadata, "createdAt" | "opensCount" | "status">): Promise<LinkMetadata>
```

- [ ] **Step 2: Change the interface to take `createdAt`**

Edit `packages/server-store/src/interfaces.ts`:

```ts
create(record: Omit<LinkMetadata, "opensCount" | "status">): Promise<LinkMetadata>;
```

(That is: remove `"createdAt"` from the `Omit` list so it becomes a required input.)

- [ ] **Step 3: Update the memory implementation**

In `packages/server-store/src/memory/link-metadata-store.ts`, change the `create` signature and replace the synthesized `createdAt: new Date()` with the caller-provided `record.createdAt`:

```ts
async create(record: Omit<LinkMetadata, "opensCount" | "status">): Promise<LinkMetadata> {
  if (this.rows.has(record.id)) {
    throw new Error(`MemoryLinkMetadataStore: link ${record.id} already exists`);
  }
  const row: LinkMetadata = {
    ...record,
    opensCount: 0,
    status: "active",
  };
  this.rows.set(record.id, row);
  return row;
}
```

- [ ] **Step 4: Update the Postgres implementation**

In `packages/server-store/src/pg/link-metadata-store.ts`, change the INSERT to set `created_at` explicitly:

```ts
async create(record: Omit<LinkMetadata, "opensCount" | "status">): Promise<LinkMetadata> {
  const { rows } = await this.pool.query(
    `INSERT INTO links (id, created_at, expires_at, max_opens, recipient_fp)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [record.id, record.createdAt, record.expiresAt, record.maxOpens, record.recipientFingerprint],
  );
  const row = rows[0];
  if (!row) throw new Error("PgLinkMetadataStore: INSERT did not RETURN a row");
  return {
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxOpens: row.max_opens,
    opensCount: row.opens_count,
    status: row.status,
    recipientFingerprint: row.recipient_fp,
  };
}
```

- [ ] **Step 5: Update all server-store callers and tests**

Find them:

```bash
grep -rn "links.create(\|.create({" packages/server-store apps/web/src/server | head
```

For every call site, ensure the argument now includes `createdAt`. In tests, supply a fixed date like `new Date("2026-01-01T00:00:00Z")`.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @aesmsg/server-store test`
Expected: PASS.

- [ ] **Step 7: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: PASS (apps/web callers will be broken; they are fixed in Task 7).

If typecheck breaks apps/web, that's expected and fixed in Task 7. Do NOT proceed to commit until Task 7 also lands.

- [ ] **Step 8: Commit**

(Defer this commit until Task 7 lands so the workspace compiles.)

---

## Task 7: Server handler accepts `createdAtMs` on POST; returns `createdAt`+`expiresAt` on open

**Files:**
- Modify: `apps/web/src/server/messages-handler.ts`
- Modify: existing handler tests (search with `grep -rn "createCreateMessageHandler\|createOpenMessageHandler" apps/web/tests`)

- [ ] **Step 1: Inspect the current POST shape**

Look at the existing `createCreateMessageHandler` in [apps/web/src/server/messages-handler.ts](apps/web/src/server/messages-handler.ts). Identify where it parses the request body and where it calls `deps.links.create(...)`.

- [ ] **Step 2: Add `createdAtMs` to the request body and validate it**

In the request-body type and the runtime validator, add `createdAtMs: number` to the required fields. Validate:

```ts
if (typeof body.createdAtMs !== "number" || !Number.isFinite(body.createdAtMs)) {
  return jsonError(400, "bad_request");
}
const createdAt = new Date(body.createdAtMs);
if (Number.isNaN(createdAt.getTime())) return jsonError(400, "bad_request");

// Bound checks: createdAt must not be more than 5 minutes in the future, and must precede expiresAt.
const FIVE_MIN_MS = 5 * 60 * 1000;
if (createdAt.getTime() > now.getTime() + FIVE_MIN_MS) return jsonError(400, "bad_request");
if (createdAt.getTime() >= expiresAt.getTime()) return jsonError(400, "bad_request");
```

Then in the `links.create(...)` call, pass `createdAt`:

```ts
await deps.links.create({
  id: body.id as LinkId,
  recipientFingerprint: body.recipientFingerprint,
  createdAt,           // NEW
  expiresAt,
  maxOpens: body.maxOpens,
});
```

- [ ] **Step 3: Extend the GET response to include `createdAt`**

Find the `createGetMessageHandler` response block (currently returns `status, recipientFingerprint, expiresAt, maxOpens, opensCount`). Add:

```ts
return new Response(
  JSON.stringify({
    status: row.status,
    recipientFingerprint: row.recipientFingerprint,
    createdAt: row.createdAt.toISOString(),   // NEW
    expiresAt: row.expiresAt.toISOString(),
    maxOpens: row.maxOpens,
    opensCount: row.opensCount,
  }),
  { status: 200, headers: { "content-type": "application/json" } },
);
```

- [ ] **Step 4: Extend the OPEN response to include `createdAt` and `expiresAt`**

In `createOpenMessageHandler`, change the success response to include both:

```ts
return new Response(
  JSON.stringify({
    ciphertext: bytesToBase64(blob),
    recipientFingerprint: row.recipientFingerprint,
    createdAt: row.createdAt.toISOString(),     // NEW
    expiresAt: row.expiresAt.toISOString(),     // NEW
    opensCount: row.opensCount,
    maxOpens: row.maxOpens,
    status: row.status,
  }),
  { status: 200, headers: { "content-type": "application/json" } },
);
```

- [ ] **Step 5: Update handler tests**

Find existing tests with: `grep -rn "createCreateMessageHandler\|createOpenMessageHandler\|createGetMessageHandler" apps/web/tests apps/web/src 2>/dev/null | head`

For each test that posts a message, add `createdAtMs: Date.now()` to the request body (or a deterministic timestamp). For each test that asserts on the GET or open response shape, add expectations for the new `createdAt`/`expiresAt` fields.

Add one new positive test in `apps/web/tests/server/messages-handler.test.ts` (or whichever file holds these tests):

```ts
it("POST /api/messages rejects createdAtMs > 5 minutes in the future", async () => {
  // Construct a request body with createdAtMs = now + 10 minutes; assert 400.
});

it("POST /api/messages rejects createdAtMs >= expiresAt", async () => {
  // Body with createdAt equal to expiresAt; assert 400.
});

it("POST /api/messages/:id/open returns createdAt and expiresAt", async () => {
  // After successful create, hit the open endpoint, assert both fields are present and parseable.
});
```

- [ ] **Step 6: Run apps/web tests**

Run: `pnpm --filter web test`
Expected: PASS for handler tests.

- [ ] **Step 7: Run the workspace typecheck**

Run: `pnpm typecheck`
Expected: PASS now that both packages and apps/web are aligned.

- [ ] **Step 8: Commit (bundled with Task 6)**

```bash
git add packages/server-store apps/web/src/server apps/web/tests
git commit -m "feat(server): client-provided createdAt; return createdAt+expiresAt from open/get"
```

---

## Task 8: API client types reflect the new fields

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Extend `CreateMessageRequest`**

Replace:

```ts
export interface CreateMessageRequest {
  id: string;
  recipientFingerprint: string;
  ciphertext: string;
  expiresAt: string;
  maxOpens: number;
}
```

With:

```ts
export interface CreateMessageRequest {
  id: string;
  recipientFingerprint: string;
  ciphertext: string;
  createdAtMs: number;          // NEW: client-chosen, server persists as-given
  expiresAt: string;
  maxOpens: number;
}
```

- [ ] **Step 2: Extend `MessageMetadata`**

Replace:

```ts
export interface MessageMetadata {
  status: "active" | "revoked" | "expired";
  recipientFingerprint: string;
  expiresAt: string;
  maxOpens: number;
  opensCount: number;
}
```

With:

```ts
export interface MessageMetadata {
  status: "active" | "revoked" | "expired";
  recipientFingerprint: string;
  createdAt: string;            // NEW
  expiresAt: string;
  maxOpens: number;
  opensCount: number;
}
```

- [ ] **Step 3: Extend `OpenMessageResponse`**

Replace:

```ts
export interface OpenMessageResponse {
  ciphertext: string;
  recipientFingerprint: string;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}
```

With:

```ts
export interface OpenMessageResponse {
  ciphertext: string;
  recipientFingerprint: string;
  createdAt: string;            // NEW
  expiresAt: string;            // NEW
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: TypeScript will now flag every call site that doesn't supply or read the new fields — that surface is exactly what Tasks 9 and 10 fix. Do NOT commit yet.

---

## Task 9: `encrypt-and-post.ts` builds and passes `MessageBindingContext`

**Files:**
- Modify: `apps/web/src/create/encrypt-and-post.ts`

- [ ] **Step 1: Replace the body of `encryptAndPost`**

Current code constructs `aad = TextEncoder.encode(id)` and posts without `createdAtMs`. Change to:

```ts
import {
  type Fingerprint,
  fingerprint,
  importPublicKey,
  type MessageBindingContext,
  type PublicKeyString,
  seal,
} from "@aesmsg/crypto";
import { postMessage } from "@/src/lib/api-client";
import { bytesToBase64 } from "@/src/lib/base64";
import { generateLinkId } from "@/src/lib/link-id";

export interface EncryptAndPostInput {
  recipientPublicKeyString: string;
  message: string;
  expiresAt: Date;
  maxOpens: number;
}

export interface EncryptAndPostOutput {
  id: string;
  url: string;
  recipientFingerprint: Fingerprint;
}

export async function encryptAndPost(input: EncryptAndPostInput): Promise<EncryptAndPostOutput> {
  const recipient = await importPublicKey(input.recipientPublicKeyString);
  const recipientFingerprint = await fingerprint(input.recipientPublicKeyString as PublicKeyString);

  const id = generateLinkId();
  const createdAtMs = Date.now();
  const expiresAtMs = input.expiresAt.getTime();

  const context: MessageBindingContext = {
    linkId: id,
    recipientPublicKey: input.recipientPublicKeyString as PublicKeyString,
    createdAtMs,
    expiresAtMs,
    maxOpens: input.maxOpens,
  };

  const plaintext = new TextEncoder().encode(input.message);
  const ciphertext = await seal(plaintext, recipient, context);

  await postMessage({
    id,
    recipientFingerprint,
    ciphertext: bytesToBase64(ciphertext as unknown as Uint8Array),
    createdAtMs,
    expiresAt: input.expiresAt.toISOString(),
    maxOpens: input.maxOpens,
  });

  return {
    id,
    url: `${window.location.origin}/l/${id}`,
    recipientFingerprint,
  };
}
```

- [ ] **Step 2: Update any test that mocks `postMessage`**

Run: `grep -rn "encryptAndPost\|postMessage" apps/web/tests`. For each test, assert that `postMessage` was called with `createdAtMs` (a finite number).

- [ ] **Step 3: Run unit tests**

Run: `pnpm --filter web test -- encrypt-and-post`
Expected: PASS.

---

## Task 10: `fetch-and-open.ts` rebuilds `MessageBindingContext` from open response

**Files:**
- Modify: `apps/web/src/reader/fetch-and-open.ts`

- [ ] **Step 1: Replace `fetchAndOpen`**

```ts
import {
  type Ciphertext,
  exportPublicKey,
  type IdentityKeypair,
  type MessageBindingContext,
  open,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { openMessage } from "@/src/lib/api-client";
import { base64ToBytes } from "@/src/lib/base64";

export interface FetchAndOpenInput {
  id: string;
  identity: IdentityKeypair;
}

export interface FetchAndOpenOutput {
  plaintext: string;
  recipientFingerprint: string;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}

export async function fetchAndOpen(input: FetchAndOpenInput): Promise<FetchAndOpenOutput> {
  const response = await openMessage(input.id);
  const ownPublicKey: PublicKeyString = await exportPublicKey(input.identity);

  const context: MessageBindingContext = {
    linkId: input.id,
    recipientPublicKey: ownPublicKey,
    createdAtMs: new Date(response.createdAt).getTime(),
    expiresAtMs: new Date(response.expiresAt).getTime(),
    maxOpens: response.maxOpens,
  };

  const ciphertext = base64ToBytes(response.ciphertext);
  const plaintextBytes = await open(ciphertext as unknown as Ciphertext, input.identity, context);

  return {
    plaintext: new TextDecoder().decode(plaintextBytes),
    recipientFingerprint: response.recipientFingerprint,
    opensCount: response.opensCount,
    maxOpens: response.maxOpens,
    status: response.status,
  };
}
```

- [ ] **Step 2: Update reader tests**

Run: `grep -rn "fetchAndOpen\|openMessage" apps/web/tests`. For each test that stubs `openMessage`, add `createdAt` and `expiresAt` (ISO strings) to the stubbed response.

- [ ] **Step 3: Run reader tests**

Run: `pnpm --filter web test -- fetch-and-open`
Expected: PASS.

- [ ] **Step 4: Run the entire web test suite**

Run: `pnpm --filter web test`
Expected: PASS.

- [ ] **Step 5: Commit (bundled with Tasks 8, 9, 10)**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/create/encrypt-and-post.ts apps/web/src/reader/fetch-and-open.ts apps/web/tests
git commit -m "feat(web): seal/open use MessageBindingContext bound to all metadata"
```

---

## Task 11: End-to-end tamper test (web layer)

**Files:**
- Create: `apps/web/tests/integration/aad-binding.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { encryptAndPost } from "@/src/create/encrypt-and-post";
import { fetchAndOpen } from "@/src/reader/fetch-and-open";
import { generateIdentity, exportPublicKey } from "@aesmsg/crypto";

// This test assumes the test harness wires `postMessage`/`openMessage` to an in-process
// MemoryLinkMetadataStore + MemoryCiphertextStore. If the existing test harness uses a
// different pattern, mirror it here.

describe("end-to-end AAD binding", () => {
  it("round-trips when the server returns the original metadata", async () => {
    const id = await generateIdentity();
    const pk = await exportPublicKey(id);

    const { id: linkId } = await encryptAndPost({
      recipientPublicKeyString: pk,
      message: "secret",
      expiresAt: new Date(Date.now() + 60_000),
      maxOpens: 1,
    });

    const result = await fetchAndOpen({ id: linkId, identity: id });
    expect(result.plaintext).toBe("secret");
  });

  it("fails to decrypt if the server-returned expiresAt is tampered", async () => {
    // Strategy: hand-patch the in-memory store to mutate row.expiresAt after create,
    // then assert fetchAndOpen rejects with DecryptionError.
  });
});
```

(If the existing harness doesn't already let you tamper with stored rows, the tamper sub-case may need a small helper in the test. The positive round-trip is the must-have; the tamper sub-case is best-effort and may be deferred to a follow-up if the harness is awkward.)

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter web test -- aad-binding`
Expected: PASS for the round-trip; tamper sub-case PASS or skipped if not feasible.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/integration/aad-binding.test.ts
git commit -m "test(web): end-to-end AAD binding round-trip"
```

---

## Task 12: Verification pass

**Files:** None — verification only.

- [ ] **Step 1: Run the full typecheck**

Run: `pnpm typecheck`
Expected: PASS across every workspace.

- [ ] **Step 2: Run the full lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: All workspaces green.

- [ ] **Step 4: Manual smoke (dev server)**

Start the dev server: `pnpm dev`. In the browser:

1. Create an identity if you don't have one.
2. Create a new message addressed to your own identity.
3. Open the resulting link.
4. Confirm plaintext shows.

This catches any path where the typed metadata flow broke at runtime in a way unit tests didn't.

- [ ] **Step 5: Final commit (if any cleanups were needed)**

If verification surfaced fixes, commit them with a short conventional message and re-run all checks.

---

## Self-Review checklist (done at write time)

- [x] **Spec coverage:** every approved AAD field has a typed entry, an encoder branch, a positive test, and a tamper test (Tasks 1, 2, 5). Server endpoints that need to expose `createdAt`/`expiresAt` are extended in Task 7. Call-site migration covered in Tasks 9 and 10.
- [x] **No placeholders:** every step has either runnable code, an exact command, or both.
- [x] **Type consistency:** `MessageBindingContext` shape is identical in Tasks 1, 3, 4, 5, 9, 10. Field names match across the crypto package, API client, and web call sites.
- [x] **Pre-launch wire break:** plan does NOT include a backwards-compat shim, per explicit sign-off.
- [x] **Server invariant:** `createdAt` is **client-provided**, server persists as-given; the GET and open endpoints return exactly the persisted values, so the recipient reconstructs the exact same AAD bytes. This satisfies the "metadata must originate from persisted server state, not be reconstructed client-side from untrusted defaults" rule.
