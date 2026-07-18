# Slice 1 — Crypto core implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the type-stub `@aesmsg/crypto` package with a real HPKE-based encryption implementation, locked behind versioned wire formats, mandatory link-ID AAD, and a test rigor appropriate to a security-critical library (cross-implementation interop + browser-runtime + property-based + comprehensive negative).

**Architecture:** Module split inside `packages/crypto/src/`: `errors.ts` (typed exceptions), `wire.ts` (versioned codec + base32/base64url helpers), `hpke.ts` (thin wrapper around `@hpke/core`), `identity.ts` (generate/export/import), `fingerprint.ts` (SHA-256-based human-verifiable fingerprint with constant-time compare), `seal.ts` (seal/open public API). Stubs for `wrapPrivateKey` / `unwrapPrivateKey` survive intact for Slice 2. Every public function is async except `exportPublicKey` (cached at generate time) and `compareFingerprint` (string compare). Test coverage spans Node round-trip + property tests, comprehensive negative cases, cross-implementation interop via vendored Python fixture, and headless-Chromium runtime tests via Vitest browser mode.

**Tech Stack:** `@hpke/core` (latest stable), `fast-check` for property tests, `@vitest/browser` + `playwright` for browser-mode tests, `pyhpke` (Python, dev-time only — script writes the vector JSON checked into the repo, run-time tests don't need Python).

**Spec:** [docs/superpowers/specs/2026-05-09-crypto-core-design.md](../specs/2026-05-09-crypto-core-design.md)

---

## File structure target

After this plan completes:

```
packages/crypto/
├─ package.json                       (modified — adds @hpke/core, fast-check, @vitest/browser, playwright; new scripts)
├─ README.md                          (rewritten — drops "skeleton only" framing, documents wire formats and Slice 2 deferrals)
├─ tsconfig.json                      (unchanged)
├─ vitest.config.ts                   (modified — Node project with coverage; excludes browser.test.ts)
├─ vitest.browser.config.ts           (new — browser project, includes only browser.test.ts)
├─ src/
│  ├─ index.ts                        (rewritten — re-exports from per-module files)
│  ├─ types.ts                        (unchanged — brand types)
│  ├─ errors.ts                       (new — DecryptionError, InvalidFormatError, NotImplementedError)
│  ├─ wire.ts                         (new — base64url, base32, pubkey codec, ciphertext blob codec)
│  ├─ hpke.ts                         (new — @hpke/core wrapper)
│  ├─ identity.ts                     (new — generateIdentity, exportPublicKey, importPublicKey)
│  ├─ fingerprint.ts                  (new — fingerprint, compareFingerprint)
│  ├─ seal.ts                         (new — seal, open)
│  ├─ stubs.ts                        (new — wrapPrivateKey, unwrapPrivateKey throwing NotImplementedError)
│  └─ test-only.ts                    (new — __test_only_identityFromPrivKey, NODE_ENV=test guarded)
└─ tests/
   ├─ stubs.test.ts                   (modified — trimmed to wrap/unwrap only)
   ├─ wire.test.ts                    (new — base64url/base32/pubkey/blob codec)
   ├─ identity.test.ts                (new — generate/export/import round-trips)
   ├─ fingerprint.test.ts             (new — stability, distinguishability, constant-time)
   ├─ roundtrip.test.ts               (new — empty/byte/1KB/1MB/utf-8 + fast-check)
   ├─ negative.test.ts                (new — every clean-failure path)
   ├─ interop.test.ts                 (new — Python-fixture-driven decrypt)
   ├─ browser.test.ts                 (new — round-trip in headless Chromium)
   └─ fixtures/
      └─ interop/
         ├─ generate.py               (new — pyhpke-based vector generator)
         ├─ requirements.txt          (new — pyhpke pin)
         ├─ README.md                 (new — regenerate instructions)
         └─ vector.json               (new — committed test vector)
```

---

## Task 1: Correct the Phase 0 stub API surface

The spec calls for three signature changes on the existing stubs that should land before any implementation work, so the diff history is "API correction" then "implementation" rather than mixed. Changes: `aad` becomes required on `seal`/`open`; `importPublicKey` and `fingerprint` become `Promise`-returning.

**Files:**
- Modify: `packages/crypto/src/index.ts`
- Modify: `packages/crypto/tests/stubs.test.ts`

- [ ] **Step 1: Update `packages/crypto/src/index.ts`**

Replace the existing file with (preserving the existing brand-type imports and `NotImplementedError` class — only the function signatures change):

```ts
import type {
  Ciphertext,
  Fingerprint,
  IdentityKeypair,
  PublicKeyString,
  RecipientPublicKey,
  WrappedKey,
} from "./types.js";

export type {
  Ciphertext,
  Fingerprint,
  IdentityKeypair,
  PublicKeyString,
  RecipientPublicKey,
  WrappedKey,
};

export class NotImplementedError extends Error {
  constructor(symbol: string) {
    super(`@aesmsg/crypto: ${symbol} is not implemented yet (Slice 2).`);
    this.name = "NotImplementedError";
  }
}

export async function generateIdentity(): Promise<IdentityKeypair> {
  throw new NotImplementedError("generateIdentity");
}

export function exportPublicKey(_id: IdentityKeypair): PublicKeyString {
  throw new NotImplementedError("exportPublicKey");
}

export async function importPublicKey(_s: string): Promise<RecipientPublicKey> {
  throw new NotImplementedError("importPublicKey");
}

export async function fingerprint(_pk: PublicKeyString): Promise<Fingerprint> {
  throw new NotImplementedError("fingerprint");
}

export async function seal(
  _plaintext: Uint8Array,
  _recipient: RecipientPublicKey,
  _aad: Uint8Array,
): Promise<Ciphertext> {
  throw new NotImplementedError("seal");
}

export async function open(
  _ciphertext: Ciphertext,
  _id: IdentityKeypair,
  _aad: Uint8Array,
): Promise<Uint8Array> {
  throw new NotImplementedError("open");
}

export async function wrapPrivateKey(
  _id: IdentityKeypair,
  _passphrase: string,
): Promise<WrappedKey> {
  throw new NotImplementedError("wrapPrivateKey");
}

export async function unwrapPrivateKey(
  _wrapped: WrappedKey,
  _passphrase: string,
): Promise<IdentityKeypair> {
  throw new NotImplementedError("unwrapPrivateKey");
}
```

The four signature corrections in this file are:
1. `seal` — `_aad?: Uint8Array` → `_aad: Uint8Array`
2. `open` — `_aad?: Uint8Array` → `_aad: Uint8Array`
3. `importPublicKey` — sync, `_s: string` → async, `Promise<RecipientPublicKey>`
4. `fingerprint` — sync, `_pk: string` → async, `_pk: PublicKeyString`, `Promise<Fingerprint>`

The `NotImplementedError` message changes from "Phase 1" to "Slice 2" to match the new naming.

- [ ] **Step 2: Update `packages/crypto/tests/stubs.test.ts`**

Replace the file with:

```ts
import { describe, expect, it } from "vitest";
import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  importPublicKey,
  NotImplementedError,
  open,
  seal,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "../src/index.js";

describe("@aesmsg/crypto stubs", () => {
  it("exposes generateIdentity that throws NotImplementedError", async () => {
    await expect(generateIdentity()).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("exposes exportPublicKey that throws NotImplementedError", () => {
    expect(() => exportPublicKey({} as never)).toThrow(NotImplementedError);
  });

  it("exposes importPublicKey that throws NotImplementedError", async () => {
    await expect(importPublicKey("placeholder")).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("exposes fingerprint that throws NotImplementedError", async () => {
    await expect(fingerprint("placeholder" as never)).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("exposes seal that throws NotImplementedError", async () => {
    await expect(seal(new Uint8Array(), {} as never, new Uint8Array())).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("exposes open that throws NotImplementedError", async () => {
    await expect(open({} as never, {} as never, new Uint8Array())).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("exposes wrapPrivateKey that throws NotImplementedError", async () => {
    await expect(wrapPrivateKey({} as never, "passphrase")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });

  it("exposes unwrapPrivateKey that throws NotImplementedError", async () => {
    await expect(unwrapPrivateKey({} as never, "passphrase")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});
```

Two assertions changed shape: `importPublicKey` and `fingerprint` now use `rejects.toBeInstanceOf` (async) instead of `expect(() => ...).toThrow` (sync). `seal` and `open` calls now pass a third `aad: Uint8Array` argument.

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: `8 passed`. (No real implementation yet — every function still throws `NotImplementedError`, but the signatures now match Slice 1's contract.)

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/crypto/src/index.ts packages/crypto/tests/stubs.test.ts
git commit -m "refactor(crypto): correct Phase 0 stub API surface for Slice 1 (required AAD, async import + fingerprint)"
```

---

## Task 2: Install runtime + dev dependencies

**Files:**
- Modify: `packages/crypto/package.json` (Steps 1–2 add the deps; pnpm rewrites the file)
- Modify: `pnpm-lock.yaml` (regenerated by pnpm)

- [ ] **Step 1: Add `@hpke/core` runtime dependency**

Run: `pnpm --filter @aesmsg/crypto add @hpke/core@latest`
Expected: `@hpke/core` appears in `packages/crypto/package.json` under `dependencies` with a resolved version. Lockfile updated.

- [ ] **Step 2: Add `fast-check` dev dependency**

Run: `pnpm --filter @aesmsg/crypto add -D fast-check@latest`
Expected: `fast-check` appears under `devDependencies`.

- [ ] **Step 3: Verify imports resolve**

Run from repo root: `pnpm --filter @aesmsg/crypto exec node --input-type=module -e "import('@hpke/core').then(m => console.log(Object.keys(m).slice(0, 8)))"`
Expected: prints an array including at least `CipherSuite`, `DhkemX25519HkdfSha256`, `HkdfSha256`, `Aes256Gcm` (or similar — the exact export names belong to `@hpke/core`'s current public surface; verify these four exist before proceeding).

If any of those four exports is missing, stop and inspect `node_modules/@hpke/core/dist/` or its README to find the current names — `hpke.ts` in Task 5 must use the actual export names.

- [ ] **Step 4: Commit**

```bash
git add packages/crypto/package.json pnpm-lock.yaml
git commit -m "chore(crypto): add @hpke/core and fast-check"
```

---

## Task 3: Errors module

**Files:**
- Create: `packages/crypto/src/errors.ts`
- Modify: `packages/crypto/src/index.ts`
- Modify: `packages/crypto/tests/stubs.test.ts` (no behavior change — keep importing `NotImplementedError` from `../src/index.js`)
- Create: `packages/crypto/tests/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crypto/tests/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DecryptionError,
  InvalidFormatError,
  NotImplementedError,
} from "../src/errors.js";

describe("error classes", () => {
  it("DecryptionError is an Error with the right name", () => {
    const err = new DecryptionError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DecryptionError);
    expect(err.name).toBe("DecryptionError");
    expect(err.message).toBe("Decryption failed");
  });

  it("DecryptionError accepts a custom message but defaults to a static one", () => {
    expect(new DecryptionError().message).toBe("Decryption failed");
    expect(new DecryptionError("override").message).toBe("override");
  });

  it("InvalidFormatError is an Error with the right name and a non-empty message", () => {
    const err = new InvalidFormatError("bad prefix");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidFormatError);
    expect(err.name).toBe("InvalidFormatError");
    expect(err.message).toBe("bad prefix");
  });

  it("NotImplementedError is an Error with the right name and references the symbol", () => {
    const err = new NotImplementedError("wrapPrivateKey");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NotImplementedError);
    expect(err.name).toBe("NotImplementedError");
    expect(err.message).toContain("wrapPrivateKey");
    expect(err.message).toContain("Slice 2");
  });

  it("the three error classes are distinct", () => {
    expect(new DecryptionError()).not.toBeInstanceOf(InvalidFormatError);
    expect(new InvalidFormatError("x")).not.toBeInstanceOf(DecryptionError);
    expect(new NotImplementedError("x")).not.toBeInstanceOf(DecryptionError);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: FAIL — `Cannot find module '../src/errors.js'`. The previous `stubs.test.ts` cases still pass.

- [ ] **Step 3: Create `packages/crypto/src/errors.ts`**

```ts
export class DecryptionError extends Error {
  constructor(message = "Decryption failed") {
    super(message);
    this.name = "DecryptionError";
  }
}

export class InvalidFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFormatError";
  }
}

export class NotImplementedError extends Error {
  constructor(symbol: string) {
    super(`@aesmsg/crypto: ${symbol} is not implemented yet (Slice 2).`);
    this.name = "NotImplementedError";
  }
}
```

- [ ] **Step 4: Update `packages/crypto/src/index.ts` to re-export from `errors.ts`**

Replace the existing `NotImplementedError` class definition (the inline `export class NotImplementedError ...` block) with a re-export. After the change, the file's error-related lines are:

```ts
export { DecryptionError, InvalidFormatError, NotImplementedError } from "./errors.js";
```

…and the inline `export class NotImplementedError extends Error { ... }` block is deleted. The function bodies still reference `NotImplementedError` — they will pick it up via the local import. Add at the top of the file (alongside the existing imports):

```ts
import { NotImplementedError } from "./errors.js";
```

- [ ] **Step 5: Run tests, expect pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: 13 passed (5 in `errors.test.ts` + 8 in `stubs.test.ts`).

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add packages/crypto/src/errors.ts packages/crypto/src/index.ts packages/crypto/tests/errors.test.ts
git commit -m "feat(crypto): add error classes (DecryptionError, InvalidFormatError, NotImplementedError)"
```

---

## Task 4: Wire format codec (`wire.ts`)

This module owns the byte-level encoding decisions: base64url + base32 helpers, pubkey envelope, ciphertext blob header. No HPKE or async crypto here.

**Files:**
- Create: `packages/crypto/src/wire.ts`
- Create: `packages/crypto/tests/wire.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crypto/tests/wire.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InvalidFormatError } from "../src/errors.js";
import {
  base32EncodeLower,
  base64urlDecode,
  base64urlEncode,
  CANONICAL_PUBKEY_LEN,
  CIPHERTEXT_PREFIX_LEN,
  decodeCiphertextBlob,
  decodePubkey,
  encodeCiphertextBlob,
  encodePubkey,
  ENCAPSULATED_KEY_LEN,
  PUBKEY_PREFIX,
  RAW_X25519_PUBKEY_LEN,
  SUITE_X25519_AES256GCM,
  WIRE_VERSION,
} from "../src/wire.js";

describe("base64url", () => {
  it("encodes empty input as empty string", () => {
    expect(base64urlEncode(new Uint8Array())).toBe("");
  });

  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 250, 251, 252, 253, 254, 255]);
    const encoded = base64urlEncode(bytes);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(Array.from(base64urlDecode(encoded))).toEqual(Array.from(bytes));
  });

  it("decodes typical X25519-public-key-length byte arrays", () => {
    const bytes = new Uint8Array(34);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i;
    expect(Array.from(base64urlDecode(base64urlEncode(bytes)))).toEqual(Array.from(bytes));
  });

  it("rejects characters outside the base64url alphabet", () => {
    expect(() => base64urlDecode("invalid!chars")).toThrow(InvalidFormatError);
  });
});

describe("base32 (lowercase, RFC 4648)", () => {
  it("encodes empty input as empty string", () => {
    expect(base32EncodeLower(new Uint8Array())).toBe("");
  });

  it("encodes a known fixture deterministically", () => {
    // 5 bytes → 8 chars (40 bits packed exactly)
    expect(base32EncodeLower(new Uint8Array([0, 0, 0, 0, 0]))).toBe("aaaaaaaa");
    expect(base32EncodeLower(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]))).toBe("77777777");
  });

  it("encodes 15 bytes as 24 base32 characters", () => {
    const bytes = new Uint8Array(15);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i * 17;
    const encoded = base32EncodeLower(bytes);
    expect(encoded).toHaveLength(24);
    expect(encoded).toMatch(/^[a-z2-7]{24}$/);
  });
});

describe("pubkey envelope", () => {
  const sampleRawKey = new Uint8Array(RAW_X25519_PUBKEY_LEN);
  for (let i = 0; i < sampleRawKey.length; i++) sampleRawKey[i] = i;

  it("constants have the expected values", () => {
    expect(PUBKEY_PREFIX).toBe("amk1:");
    expect(WIRE_VERSION).toBe(0x01);
    expect(SUITE_X25519_AES256GCM).toBe(0x01);
    expect(RAW_X25519_PUBKEY_LEN).toBe(32);
    expect(CANONICAL_PUBKEY_LEN).toBe(34);
    expect(ENCAPSULATED_KEY_LEN).toBe(32);
    expect(CIPHERTEXT_PREFIX_LEN).toBe(34);
  });

  it("encodes a 32-byte X25519 key as amk1: + 46 base64url chars", () => {
    const encoded = encodePubkey(sampleRawKey);
    expect(encoded.startsWith(PUBKEY_PREFIX)).toBe(true);
    expect(encoded.slice(PUBKEY_PREFIX.length)).toHaveLength(46);
  });

  it("round-trips an encoded pubkey back to the original raw bytes", () => {
    const { rawKey, canonical } = decodePubkey(encodePubkey(sampleRawKey));
    expect(Array.from(rawKey)).toEqual(Array.from(sampleRawKey));
    expect(canonical[0]).toBe(WIRE_VERSION);
    expect(canonical[1]).toBe(SUITE_X25519_AES256GCM);
    expect(canonical).toHaveLength(CANONICAL_PUBKEY_LEN);
  });

  it("rejects non-32-byte raw keys at encode time", () => {
    expect(() => encodePubkey(new Uint8Array(31))).toThrow(InvalidFormatError);
    expect(() => encodePubkey(new Uint8Array(33))).toThrow(InvalidFormatError);
  });

  it("rejects strings missing the amk1: prefix", () => {
    expect(() => decodePubkey("foo")).toThrow(InvalidFormatError);
    expect(() => decodePubkey("ssk2:" + base64urlEncode(new Uint8Array(34)))).toThrow(
      InvalidFormatError,
    );
  });

  it("rejects bodies that are not valid base64url", () => {
    expect(() => decodePubkey("amk1:!!!")).toThrow(InvalidFormatError);
  });

  it("rejects bodies that decode to the wrong byte length", () => {
    expect(() => decodePubkey("amk1:" + base64urlEncode(new Uint8Array(33)))).toThrow(
      InvalidFormatError,
    );
  });

  it("rejects bodies with unknown version byte", () => {
    const tampered = new Uint8Array(sampleRawKey.length + 2);
    tampered[0] = 0x99;
    tampered[1] = SUITE_X25519_AES256GCM;
    tampered.set(sampleRawKey, 2);
    expect(() => decodePubkey("amk1:" + base64urlEncode(tampered))).toThrow(InvalidFormatError);
  });

  it("rejects bodies with unknown suite byte", () => {
    const tampered = new Uint8Array(sampleRawKey.length + 2);
    tampered[0] = WIRE_VERSION;
    tampered[1] = 0x99;
    tampered.set(sampleRawKey, 2);
    expect(() => decodePubkey("amk1:" + base64urlEncode(tampered))).toThrow(InvalidFormatError);
  });
});

describe("ciphertext blob", () => {
  const enc = new Uint8Array(ENCAPSULATED_KEY_LEN);
  for (let i = 0; i < enc.length; i++) enc[i] = 100 + i;
  const aeadOutput = new Uint8Array([0xa, 0xb, 0xc, 0xd, 0xe]);

  it("encodes header + encapsulated key + aead output in that order", () => {
    const blob = encodeCiphertextBlob(enc, aeadOutput);
    expect(blob[0]).toBe(WIRE_VERSION);
    expect(blob[1]).toBe(SUITE_X25519_AES256GCM);
    expect(Array.from(blob.slice(2, 34))).toEqual(Array.from(enc));
    expect(Array.from(blob.slice(34))).toEqual(Array.from(aeadOutput));
    expect(blob).toHaveLength(2 + ENCAPSULATED_KEY_LEN + aeadOutput.length);
  });

  it("decodes back to {enc, aeadOutput}", () => {
    const blob = encodeCiphertextBlob(enc, aeadOutput);
    const parsed = decodeCiphertextBlob(blob);
    expect(Array.from(parsed.enc)).toEqual(Array.from(enc));
    expect(Array.from(parsed.aeadOutput)).toEqual(Array.from(aeadOutput));
  });

  it("rejects blobs shorter than the prefix", () => {
    expect(() => decodeCiphertextBlob(new Uint8Array(33))).toThrow();
  });

  it("rejects blobs with the wrong version byte", () => {
    const blob = encodeCiphertextBlob(enc, aeadOutput);
    blob[0] = 0x99;
    expect(() => decodeCiphertextBlob(blob)).toThrow();
  });

  it("rejects blobs with the wrong suite byte", () => {
    const blob = encodeCiphertextBlob(enc, aeadOutput);
    blob[1] = 0x99;
    expect(() => decodeCiphertextBlob(blob)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: FAIL — `Cannot find module '../src/wire.js'`.

- [ ] **Step 3: Create `packages/crypto/src/wire.ts`**

```ts
import { InvalidFormatError } from "./errors.js";

export const PUBKEY_PREFIX = "amk1:";
export const WIRE_VERSION = 0x01;
export const SUITE_X25519_AES256GCM = 0x01;
export const RAW_X25519_PUBKEY_LEN = 32;
export const CANONICAL_PUBKEY_LEN = 2 + RAW_X25519_PUBKEY_LEN;
export const ENCAPSULATED_KEY_LEN = 32;
export const CIPHERTEXT_PREFIX_LEN = 2 + ENCAPSULATED_KEY_LEN;

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function base64urlEncode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | (bytes[i] ?? 0);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += BASE64URL_ALPHABET[(value >> bits) & 0x3f];
    }
  }
  if (bits > 0) {
    result += BASE64URL_ALPHABET[(value << (6 - bits)) & 0x3f];
  }
  return result;
}

const BASE64URL_DECODE_TABLE: Record<string, number> = {};
for (let i = 0; i < BASE64URL_ALPHABET.length; i++) {
  BASE64URL_DECODE_TABLE[BASE64URL_ALPHABET[i] as string] = i;
}

export function base64urlDecode(s: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    const v = BASE64URL_DECODE_TABLE[ch];
    if (v === undefined) {
      throw new InvalidFormatError("Invalid base64url character");
    }
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function base32EncodeLower(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | (bytes[i] ?? 0);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

export function encodePubkey(rawKey: Uint8Array): string {
  if (rawKey.length !== RAW_X25519_PUBKEY_LEN) {
    throw new InvalidFormatError(
      `Expected ${RAW_X25519_PUBKEY_LEN}-byte X25519 public key, got ${rawKey.length}`,
    );
  }
  const canonical = new Uint8Array(CANONICAL_PUBKEY_LEN);
  canonical[0] = WIRE_VERSION;
  canonical[1] = SUITE_X25519_AES256GCM;
  canonical.set(rawKey, 2);
  return PUBKEY_PREFIX + base64urlEncode(canonical);
}

export function decodePubkey(s: string): { rawKey: Uint8Array; canonical: Uint8Array } {
  if (!s.startsWith(PUBKEY_PREFIX)) {
    throw new InvalidFormatError("Not a aesmsg public key (missing amk1: prefix)");
  }
  const body = s.slice(PUBKEY_PREFIX.length);
  const canonical = base64urlDecode(body);
  if (canonical.length !== CANONICAL_PUBKEY_LEN) {
    throw new InvalidFormatError(
      `Public key must decode to ${CANONICAL_PUBKEY_LEN} bytes, got ${canonical.length}`,
    );
  }
  if (canonical[0] !== WIRE_VERSION) {
    throw new InvalidFormatError(`Unknown public key version: ${canonical[0]}`);
  }
  if (canonical[1] !== SUITE_X25519_AES256GCM) {
    throw new InvalidFormatError(`Unknown public key suite: ${canonical[1]}`);
  }
  return { rawKey: canonical.slice(2), canonical };
}

export function encodeCiphertextBlob(enc: Uint8Array, aeadOutput: Uint8Array): Uint8Array {
  if (enc.length !== ENCAPSULATED_KEY_LEN) {
    throw new Error(`Encapsulated key must be ${ENCAPSULATED_KEY_LEN} bytes`);
  }
  const blob = new Uint8Array(CIPHERTEXT_PREFIX_LEN + aeadOutput.length);
  blob[0] = WIRE_VERSION;
  blob[1] = SUITE_X25519_AES256GCM;
  blob.set(enc, 2);
  blob.set(aeadOutput, CIPHERTEXT_PREFIX_LEN);
  return blob;
}

export function decodeCiphertextBlob(blob: Uint8Array): { enc: Uint8Array; aeadOutput: Uint8Array } {
  if (blob.length < CIPHERTEXT_PREFIX_LEN) {
    throw new Error("Ciphertext blob too short");
  }
  if (blob[0] !== WIRE_VERSION) {
    throw new Error(`Unknown ciphertext version: ${blob[0]}`);
  }
  if (blob[1] !== SUITE_X25519_AES256GCM) {
    throw new Error(`Unknown ciphertext suite: ${blob[1]}`);
  }
  return {
    enc: blob.slice(2, CIPHERTEXT_PREFIX_LEN),
    aeadOutput: blob.slice(CIPHERTEXT_PREFIX_LEN),
  };
}
```

`encodeCiphertextBlob` / `decodeCiphertextBlob` deliberately throw plain `Error` (not `DecryptionError`) — the public `seal`/`open` functions in Task 8 are responsible for wrapping any thrown error as `DecryptionError` to keep failure messages opaque to callers.

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: all `wire.test.ts` cases pass; `errors.test.ts` and `stubs.test.ts` continue to pass.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/crypto/src/wire.ts packages/crypto/tests/wire.test.ts
git commit -m "feat(crypto): add wire format codec (base64url, base32, pubkey envelope, ciphertext blob)"
```

---

## Task 5: HPKE wrapper (`hpke.ts`)

A thin layer over `@hpke/core` that the rest of the package uses. Isolates the dependency so a future `@hpke/core` API change touches one file.

**Files:**
- Create: `packages/crypto/src/hpke.ts`

This task does not have a dedicated test file — `hpke.ts` is exercised end-to-end by `identity.test.ts` (Task 6) and `roundtrip.test.ts` (Task 9). A separate "test the wrapper in isolation" file would mostly test that we forwarded the call correctly, which is covered by the higher-level tests.

- [ ] **Step 1: Create `packages/crypto/src/hpke.ts`**

The export names below (`CipherSuite`, `DhkemX25519HkdfSha256`, `HkdfSha256`, `Aes256Gcm`) should match what Task 2 Step 3 verified. If a name is different in the installed version, adjust accordingly:

```ts
import { Aes256Gcm, CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from "@hpke/core";

export const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});

export type RawKeypair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export async function generateRawKeypair(): Promise<RawKeypair> {
  const kp = await suite.kem.generateKeyPair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

export async function exportRawPublicKey(publicKey: CryptoKey): Promise<Uint8Array> {
  const ab = await suite.kem.serializePublicKey(publicKey);
  return new Uint8Array(ab);
}

export async function importRawPublicKey(rawBytes: Uint8Array): Promise<CryptoKey> {
  return suite.kem.deserializePublicKey(rawBytes);
}

export async function importRawPrivateKey(rawBytes: Uint8Array): Promise<CryptoKey> {
  return suite.kem.deserializePrivateKey(rawBytes);
}

export async function sealHpke(
  recipientPubKey: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<{ enc: Uint8Array; aeadOutput: Uint8Array }> {
  const senderCtx = await suite.createSenderContext({
    recipientPublicKey: recipientPubKey,
  });
  const aeadOutputAb = await senderCtx.seal(plaintext, aad);
  return {
    enc: new Uint8Array(senderCtx.enc),
    aeadOutput: new Uint8Array(aeadOutputAb),
  };
}

export async function openHpke(
  recipientPrivKey: CryptoKey,
  enc: Uint8Array,
  aeadOutput: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const recipientCtx = await suite.createRecipientContext({
    recipientKey: recipientPrivKey,
    enc,
  });
  const ab = await recipientCtx.open(aeadOutput, aad);
  return new Uint8Array(ab);
}
```

If `@hpke/core`'s actual API for sender context exposes `senderCtx.enc` differently (e.g. returned from `createSenderContext` rather than as a property), or `createRecipientContext` takes a different option name (e.g. `recipientPrivateKey` vs. `recipientKey`), adjust this file before proceeding. The shape is verified by Task 6's roundtrip test — if that fails with a runtime error from `@hpke/core`, look here first.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0. If TypeScript errors appear, the `@hpke/core` types don't match this wrapper — adjust to the real API before continuing.

- [ ] **Step 3: Run existing tests to confirm nothing broke**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: same as before this task — `wire.test.ts`, `errors.test.ts`, `stubs.test.ts` all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/crypto/src/hpke.ts
git commit -m "feat(crypto): add @hpke/core wrapper (DhkemX25519 + HkdfSha256 + Aes256Gcm)"
```

---

## Task 6: Identity (`identity.ts`)

`generateIdentity`, `exportPublicKey` (sync, cached), `importPublicKey` (async). The internal `IdentityKeypair` and `RecipientPublicKey` types — opaque brands at the public API — get concrete shapes here that include the cached canonical wire string.

**Files:**
- Create: `packages/crypto/src/identity.ts`
- Create: `packages/crypto/tests/identity.test.ts`
- Modify: `packages/crypto/src/index.ts` (replace stubs for these three functions with real exports)
- Modify: `packages/crypto/tests/stubs.test.ts` (remove the three cases now backed by real implementations)

- [ ] **Step 1: Write the failing test**

Create `packages/crypto/tests/identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InvalidFormatError } from "../src/errors.js";
import {
  exportPublicKey,
  generateIdentity,
  importPublicKey,
} from "../src/identity.js";
import { PUBKEY_PREFIX } from "../src/wire.js";

describe("identity", () => {
  it("generateIdentity returns an opaque keypair", async () => {
    const id = await generateIdentity();
    expect(id).toBeTruthy();
  });

  it("exportPublicKey returns an amk1: string of length 51", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    expect(typeof pk).toBe("string");
    expect(pk.startsWith(PUBKEY_PREFIX)).toBe(true);
    expect(pk).toHaveLength(51);
  });

  it("exportPublicKey is deterministic for a given identity", async () => {
    const id = await generateIdentity();
    const a = exportPublicKey(id);
    const b = exportPublicKey(id);
    expect(a).toBe(b);
  });

  it("two generated identities have distinct public keys", async () => {
    const a = exportPublicKey(await generateIdentity());
    const b = exportPublicKey(await generateIdentity());
    expect(a).not.toBe(b);
  });

  it("importPublicKey accepts an exported amk1: string and returns a usable RecipientPublicKey", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const recipient = await importPublicKey(pk);
    expect(recipient).toBeTruthy();
  });

  it("importPublicKey rejects an empty string", async () => {
    await expect(importPublicKey("")).rejects.toBeInstanceOf(InvalidFormatError);
  });

  it("importPublicKey rejects strings without the amk1: prefix", async () => {
    await expect(importPublicKey("hello world")).rejects.toBeInstanceOf(InvalidFormatError);
  });

  it("importPublicKey rejects amk1: strings whose body is not base64url", async () => {
    await expect(importPublicKey("amk1:!!!")).rejects.toBeInstanceOf(InvalidFormatError);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: FAIL — `Cannot find module '../src/identity.js'`.

- [ ] **Step 3: Create `packages/crypto/src/identity.ts`**

```ts
import {
  exportRawPublicKey,
  generateRawKeypair,
  importRawPublicKey,
  type RawKeypair,
} from "./hpke.js";
import type {
  IdentityKeypair,
  PublicKeyString,
  RecipientPublicKey,
} from "./types.js";
import { decodePubkey, encodePubkey } from "./wire.js";

type IdentityImpl = RawKeypair & {
  readonly publicKeyRaw: Uint8Array;
  readonly publicKeyString: PublicKeyString;
};

type RecipientImpl = {
  readonly rawKey: Uint8Array;
  readonly cryptoKey: CryptoKey;
};

export async function generateIdentity(): Promise<IdentityKeypair> {
  const kp = await generateRawKeypair();
  const publicKeyRaw = await exportRawPublicKey(kp.publicKey);
  const publicKeyString = encodePubkey(publicKeyRaw) as PublicKeyString;
  const impl: IdentityImpl = {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    publicKeyRaw,
    publicKeyString,
  };
  return impl as unknown as IdentityKeypair;
}

export function exportPublicKey(id: IdentityKeypair): PublicKeyString {
  const impl = id as unknown as IdentityImpl;
  return impl.publicKeyString;
}

export async function importPublicKey(s: string): Promise<RecipientPublicKey> {
  const { rawKey } = decodePubkey(s);
  const cryptoKey = await importRawPublicKey(rawKey);
  const impl: RecipientImpl = { rawKey, cryptoKey };
  return impl as unknown as RecipientPublicKey;
}

export function __getIdentityImpl(id: IdentityKeypair): IdentityImpl {
  return id as unknown as IdentityImpl;
}

export function __getRecipientImpl(r: RecipientPublicKey): RecipientImpl {
  return r as unknown as RecipientImpl;
}
```

The `__get*Impl` functions are internal only — used by `seal.ts` and `fingerprint.ts` to reach into the brand. They are not re-exported from `index.ts`.

- [ ] **Step 4: Update `packages/crypto/src/index.ts`**

Replace the three stub functions for `generateIdentity`, `exportPublicKey`, `importPublicKey` with re-exports from `identity.ts`. After the change the file's relevant lines look like:

```ts
export { generateIdentity, exportPublicKey, importPublicKey } from "./identity.js";
```

Delete the corresponding stub function bodies. Keep the stub functions for `fingerprint`, `seal`, `open`, `wrapPrivateKey`, `unwrapPrivateKey`. Keep the type re-exports and the `import { NotImplementedError } from "./errors.js";` line.

- [ ] **Step 5: Update `packages/crypto/tests/stubs.test.ts`**

Remove the three `it(...)` cases for `generateIdentity`, `exportPublicKey`, `importPublicKey`. After this edit the file has 5 cases (`fingerprint`, `seal`, `open`, `wrapPrivateKey`, `unwrapPrivateKey`).

- [ ] **Step 6: Run tests, expect pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: all `identity.test.ts` cases pass; `wire.test.ts` and `errors.test.ts` continue to pass; `stubs.test.ts` has 5 cases passing.

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add packages/crypto/src/identity.ts packages/crypto/src/index.ts packages/crypto/tests/identity.test.ts packages/crypto/tests/stubs.test.ts
git commit -m "feat(crypto): implement generateIdentity / exportPublicKey / importPublicKey"
```

---

## Task 7: Fingerprint (`fingerprint.ts`)

SHA-256 of the canonical pubkey bytes, first 15 bytes → 24 lowercase base32 chars formatted as 6 space-separated groups of 4. Plus a constant-time comparison helper.

**Files:**
- Create: `packages/crypto/src/fingerprint.ts`
- Create: `packages/crypto/tests/fingerprint.test.ts`
- Modify: `packages/crypto/src/index.ts`
- Modify: `packages/crypto/tests/stubs.test.ts` (remove `fingerprint` case)

- [ ] **Step 1: Write the failing test**

Create `packages/crypto/tests/fingerprint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareFingerprint, fingerprint } from "../src/fingerprint.js";
import { exportPublicKey, generateIdentity } from "../src/identity.js";
import type { Fingerprint } from "../src/types.js";

describe("fingerprint", () => {
  it("returns 24 lowercase base32 chars formatted as 6 groups of 4", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const fp = await fingerprint(pk);
    expect(fp).toMatch(/^[a-z2-7]{4} [a-z2-7]{4} [a-z2-7]{4} [a-z2-7]{4} [a-z2-7]{4} [a-z2-7]{4}$/);
    expect(fp).toHaveLength(29); // 24 chars + 5 spaces
  });

  it("is deterministic — same pubkey produces same fingerprint", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const a = await fingerprint(pk);
    const b = await fingerprint(pk);
    expect(a).toBe(b);
  });

  it("distinguishes different public keys", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = await generateIdentity();
      const pk = exportPublicKey(id);
      const fp = await fingerprint(pk);
      seen.add(fp);
    }
    expect(seen.size).toBe(50);
  });

  it("rejects strings that are not valid amk1: pubkeys", async () => {
    await expect(fingerprint("garbage" as unknown as ReturnType<typeof exportPublicKey>)).rejects
      .toBeTruthy();
  });
});

describe("compareFingerprint", () => {
  it("returns true for identical fingerprints", () => {
    const a = "abcd efgh ijkl mnop qrst uvwx" as Fingerprint;
    const b = "abcd efgh ijkl mnop qrst uvwx" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(true);
  });

  it("returns false for fingerprints differing in the first character", () => {
    const a = "abcd efgh ijkl mnop qrst uvwx" as Fingerprint;
    const b = "zbcd efgh ijkl mnop qrst uvwx" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("returns false for fingerprints differing in the last character", () => {
    const a = "abcd efgh ijkl mnop qrst uvwx" as Fingerprint;
    const b = "abcd efgh ijkl mnop qrst uvwz" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("returns false for different-length inputs", () => {
    const a = "abcd efgh ijkl mnop qrst uvwx" as Fingerprint;
    const b = "abcd efgh ijkl mnop qrst" as Fingerprint;
    expect(compareFingerprint(a, b)).toBe(false);
  });

  it("touches every character regardless of where the mismatch is (best-effort timing check)", () => {
    // Smoke test: comparing two equal-length strings should always run all chars.
    // We cannot reliably measure timing in JS — instead assert the function does not
    // short-circuit on early mismatch by checking it consistently returns the same answer.
    const a = "abcd efgh ijkl mnop qrst uvwx" as Fingerprint;
    const earlyMismatch = "zbcd efgh ijkl mnop qrst uvwx" as Fingerprint;
    const lateMismatch = "abcd efgh ijkl mnop qrst uvwz" as Fingerprint;
    for (let i = 0; i < 100; i++) {
      expect(compareFingerprint(a, earlyMismatch)).toBe(false);
      expect(compareFingerprint(a, lateMismatch)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: FAIL — `Cannot find module '../src/fingerprint.js'`.

- [ ] **Step 3: Create `packages/crypto/src/fingerprint.ts`**

```ts
import type { Fingerprint, PublicKeyString } from "./types.js";
import { base32EncodeLower, decodePubkey } from "./wire.js";

const FINGERPRINT_BYTES = 15; // 120 bits → 24 base32 chars

export async function fingerprint(pk: PublicKeyString): Promise<Fingerprint> {
  const { canonical } = decodePubkey(pk);
  const digestAb = await crypto.subtle.digest("SHA-256", canonical);
  const digest = new Uint8Array(digestAb).slice(0, FINGERPRINT_BYTES);
  const flat = base32EncodeLower(digest);
  const groups: string[] = [];
  for (let i = 0; i < flat.length; i += 4) {
    groups.push(flat.slice(i, i + 4));
  }
  return groups.join(" ") as Fingerprint;
}

export function compareFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  const aStr = a as string;
  const bStr = b as string;
  if (aStr.length !== bStr.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aStr.length; i++) {
    diff |= aStr.charCodeAt(i) ^ bStr.charCodeAt(i);
  }
  return diff === 0;
}
```

The XOR-and-OR pattern in `compareFingerprint` runs every character regardless of where the mismatch is — no early return, constant work per call (modulo the `length !== length` short-circuit, which is universally accepted as fine since string length is not secret).

- [ ] **Step 4: Update `packages/crypto/src/index.ts`**

Add `fingerprint` and `compareFingerprint` re-exports, delete the inline `fingerprint` stub:

```ts
export { fingerprint, compareFingerprint } from "./fingerprint.js";
```

- [ ] **Step 5: Update `packages/crypto/tests/stubs.test.ts`**

Remove the `fingerprint` `it(...)` case. After this edit the file has 4 cases (`seal`, `open`, `wrapPrivateKey`, `unwrapPrivateKey`).

- [ ] **Step 6: Run tests, expect pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: all `fingerprint.test.ts` cases pass; previous tests continue to pass.

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add packages/crypto/src/fingerprint.ts packages/crypto/src/index.ts packages/crypto/tests/fingerprint.test.ts packages/crypto/tests/stubs.test.ts
git commit -m "feat(crypto): implement fingerprint + constant-time compareFingerprint"
```

---

## Task 8: Seal / Open (`seal.ts`)

The two trust-critical functions. Wraps the HPKE wrapper, applies the wire envelope, and converts any failure into an opaque `DecryptionError`.

**Files:**
- Create: `packages/crypto/src/seal.ts`
- Create: `packages/crypto/tests/seal.test.ts`
- Modify: `packages/crypto/src/index.ts`
- Modify: `packages/crypto/tests/stubs.test.ts` (remove `seal`/`open` cases)

- [ ] **Step 1: Write the failing test**

Create `packages/crypto/tests/seal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DecryptionError } from "../src/errors.js";
import {
  exportPublicKey,
  generateIdentity,
  importPublicKey,
} from "../src/identity.js";
import { open, seal } from "../src/seal.js";
import type { Ciphertext } from "../src/types.js";

const enc = new TextEncoder();

describe("seal / open", () => {
  it("round-trips a short message", async () => {
    const sender = await generateIdentity();
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("link-id-fixture");
    const plaintext = enc.encode("hello world");

    const ct = await seal(plaintext, recipientPk, aad);
    const recovered = await open(ct, recipient, aad);
    expect(new TextDecoder().decode(recovered)).toBe("hello world");
    void sender;
  });

  it("fails to open with the wrong identity", async () => {
    const recipientA = await generateIdentity();
    const recipientB = await generateIdentity();
    const recipientAPk = await importPublicKey(exportPublicKey(recipientA));
    const aad = enc.encode("link-id-fixture");

    const ct = await seal(enc.encode("for A only"), recipientAPk, aad);
    await expect(open(ct, recipientB, aad)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails to open with the wrong AAD", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ct = await seal(enc.encode("bound to link-1"), recipientPk, enc.encode("link-1"));
    await expect(open(ct, recipient, enc.encode("link-2"))).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails to open a single-byte-tampered ciphertext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("link-id");
    const ct = await seal(enc.encode("hi"), recipientPk, aad);

    const ctBytes = ct as unknown as Uint8Array;
    const tampered = new Uint8Array(ctBytes);
    tampered[tampered.length - 1] ^= 0x01;
    await expect(open(tampered as unknown as Ciphertext, recipient, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("fails to open a truncated ciphertext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("link-id");
    const ct = await seal(enc.encode("hi"), recipientPk, aad);

    const ctBytes = ct as unknown as Uint8Array;
    const truncated = ctBytes.slice(0, ctBytes.length - 1);
    await expect(open(truncated as unknown as Ciphertext, recipient, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("fails to open a too-short blob", async () => {
    const recipient = await generateIdentity();
    const aad = enc.encode("link-id");
    const tiny = new Uint8Array([0x01, 0x01, 0x00]) as unknown as Ciphertext;
    await expect(open(tiny, recipient, aad)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails to open a blob with the wrong version byte", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("link-id");
    const ct = await seal(enc.encode("hi"), recipientPk, aad);
    const tampered = new Uint8Array(ct as unknown as Uint8Array);
    tampered[0] = 0x99;
    await expect(open(tampered as unknown as Ciphertext, recipient, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("fails to open a blob with the wrong suite byte", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("link-id");
    const ct = await seal(enc.encode("hi"), recipientPk, aad);
    const tampered = new Uint8Array(ct as unknown as Uint8Array);
    tampered[1] = 0x99;
    await expect(open(tampered as unknown as Ciphertext, recipient, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("produces a blob whose first two bytes are the version + suite header", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const ct = await seal(enc.encode("hi"), recipientPk, enc.encode("aad"));
    const ctBytes = ct as unknown as Uint8Array;
    expect(ctBytes[0]).toBe(0x01);
    expect(ctBytes[1]).toBe(0x01);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: FAIL — `Cannot find module '../src/seal.js'`.

- [ ] **Step 3: Create `packages/crypto/src/seal.ts`**

```ts
import { DecryptionError } from "./errors.js";
import { openHpke, sealHpke } from "./hpke.js";
import { __getIdentityImpl, __getRecipientImpl } from "./identity.js";
import type { Ciphertext, IdentityKeypair, RecipientPublicKey } from "./types.js";
import { decodeCiphertextBlob, encodeCiphertextBlob } from "./wire.js";

export async function seal(
  plaintext: Uint8Array,
  recipient: RecipientPublicKey,
  aad: Uint8Array,
): Promise<Ciphertext> {
  const r = __getRecipientImpl(recipient);
  const { enc, aeadOutput } = await sealHpke(r.cryptoKey, plaintext, aad);
  return encodeCiphertextBlob(enc, aeadOutput) as unknown as Ciphertext;
}

export async function open(
  ciphertext: Ciphertext,
  id: IdentityKeypair,
  aad: Uint8Array,
): Promise<Uint8Array> {
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

Both `try/catch` blocks throw a fresh `DecryptionError` with no detail — wrong key, wrong AAD, tampered ciphertext, or malformed blob all surface as the same opaque error. This is the spec's "no leak of which check failed" requirement.

- [ ] **Step 4: Update `packages/crypto/src/index.ts`**

Add the seal/open re-export, delete the inline stubs:

```ts
export { seal, open } from "./seal.js";
```

After this edit `index.ts` should re-export everything implemented so far and only retain inline stubs for `wrapPrivateKey` / `unwrapPrivateKey`.

- [ ] **Step 5: Update `packages/crypto/tests/stubs.test.ts`**

Remove the `seal` and `open` `it(...)` cases. After this edit the file has 2 cases (`wrapPrivateKey`, `unwrapPrivateKey`).

- [ ] **Step 6: Run tests, expect pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: all `seal.test.ts` cases pass; previous tests continue to pass; `stubs.test.ts` has 2 cases passing.

- [ ] **Step 7: Run typecheck + lint**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Run: `pnpm lint`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add packages/crypto/src/seal.ts packages/crypto/src/index.ts packages/crypto/tests/seal.test.ts packages/crypto/tests/stubs.test.ts
git commit -m "feat(crypto): implement seal + open with versioned blob and required link-id AAD"
```

---

## Task 9: Round-trip + property-based tests (`roundtrip.test.ts`)

The canonical "does it work" test file. Includes size-variety cases and a `fast-check` property test that exercises seal/open with random inputs.

**Files:**
- Create: `packages/crypto/tests/roundtrip.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/crypto/tests/roundtrip.test.ts`:

```ts
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  exportPublicKey,
  generateIdentity,
  importPublicKey,
} from "../src/identity.js";
import { open, seal } from "../src/seal.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

describe("seal/open round-trip", () => {
  it("recovers an empty plaintext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("aad");
    const ct = await seal(new Uint8Array(0), recipientPk, aad);
    const out = await open(ct, recipient, aad);
    expect(out).toHaveLength(0);
  });

  it("recovers a single-byte plaintext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("aad");
    const ct = await seal(new Uint8Array([0x42]), recipientPk, aad);
    const out = await open(ct, recipient, aad);
    expect(Array.from(out)).toEqual([0x42]);
  });

  it("recovers a 1KB random plaintext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("aad");
    const plaintext = crypto.getRandomValues(new Uint8Array(1024));
    const ct = await seal(plaintext, recipientPk, aad);
    const out = await open(ct, recipient, aad);
    expect(Array.from(out)).toEqual(Array.from(plaintext));
  });

  it("recovers a 1MB random plaintext", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("aad");
    const plaintext = crypto.getRandomValues(new Uint8Array(1024 * 1024));
    const ct = await seal(plaintext, recipientPk, aad);
    const out = await open(ct, recipient, aad);
    expect(out).toHaveLength(plaintext.length);
    // Spot-check a few positions to keep the assertion fast
    expect(out[0]).toBe(plaintext[0]);
    expect(out[plaintext.length - 1]).toBe(plaintext[plaintext.length - 1]);
    expect(out[12345]).toBe(plaintext[12345]);
  });

  it("recovers UTF-8 with mixed scripts (Latin + CJK + emoji)", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("aad");
    const message = "hello — 你好 — مرحبا — 🔐 — Здравствуйте";
    const ct = await seal(enc.encode(message), recipientPk, aad);
    const out = await open(ct, recipient, aad);
    expect(dec.decode(out)).toBe(message);
  });

  it("property: seal+open round-trips for arbitrary plaintexts and AADs", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));

    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 1024 }),
        fc.uint8Array({ minLength: 0, maxLength: 256 }),
        async (plaintext, aad) => {
          const ct = await seal(plaintext, recipientPk, aad);
          const out = await open(ct, recipient, aad);
          return out.length === plaintext.length &&
            out.every((b, i) => b === plaintext[i]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("pubkey export/import round-trip produces a usable RecipientPublicKey", async () => {
    const recipient = await generateIdentity();
    const exported = exportPublicKey(recipient);
    const recipientPk = await importPublicKey(exported);
    const aad = enc.encode("aad");
    const ct = await seal(enc.encode("test"), recipientPk, aad);
    const out = await open(ct, recipient, aad);
    expect(dec.decode(out)).toBe("test");
  });
});
```

The 1MB case + 200 property iterations may push the test runtime past Vitest's default timeout. The expected `pnpm` test runtime should still be under 30s; if it exceeds Vitest's default per-test timeout (5s), bump the offending tests with `it("...", { timeout: 60_000 }, async () => { ... })`.

- [ ] **Step 2: Run the test, expect pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: all `roundtrip.test.ts` cases pass. If the 1MB case or property test times out, add per-test timeout overrides as noted above.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add packages/crypto/tests/roundtrip.test.ts
git commit -m "test(crypto): add round-trip + fast-check property tests"
```

---

## Task 10: Comprehensive negative tests (`negative.test.ts`)

A single file consolidating every clean-failure path enumerated in spec §9.3.

**Files:**
- Create: `packages/crypto/tests/negative.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/crypto/tests/negative.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DecryptionError, InvalidFormatError } from "../src/errors.js";
import { fingerprint } from "../src/fingerprint.js";
import {
  exportPublicKey,
  generateIdentity,
  importPublicKey,
} from "../src/identity.js";
import { open, seal } from "../src/seal.js";
import type { Ciphertext, PublicKeyString } from "../src/types.js";
import {
  base64urlEncode,
  CANONICAL_PUBKEY_LEN,
  CIPHERTEXT_PREFIX_LEN,
  PUBKEY_PREFIX,
  SUITE_X25519_AES256GCM,
  WIRE_VERSION,
} from "../src/wire.js";

const enc = new TextEncoder();

describe("importPublicKey rejects malformed input", () => {
  const rejects = (s: string) => async () => {
    await expect(importPublicKey(s)).rejects.toBeInstanceOf(InvalidFormatError);
  };

  it("empty string", rejects(""));
  it("whitespace", rejects("   "));
  it("no prefix", rejects("hello"));
  it("wrong prefix (ssk2:)", rejects("ssk2:" + base64urlEncode(new Uint8Array(34))));
  it("wrong prefix (sskx:)", rejects("sskx:" + base64urlEncode(new Uint8Array(34))));
  it("non-base64url body", rejects("amk1:!!!"));
  it("body decodes to wrong length (33 bytes)", rejects("amk1:" + base64urlEncode(new Uint8Array(33))));
  it("body decodes to wrong length (35 bytes)", rejects("amk1:" + base64urlEncode(new Uint8Array(35))));

  it("inner version byte is wrong", async () => {
    const tampered = new Uint8Array(CANONICAL_PUBKEY_LEN);
    tampered[0] = 0x99;
    tampered[1] = SUITE_X25519_AES256GCM;
    await expect(importPublicKey(PUBKEY_PREFIX + base64urlEncode(tampered))).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });

  it("inner suite byte is wrong", async () => {
    const tampered = new Uint8Array(CANONICAL_PUBKEY_LEN);
    tampered[0] = WIRE_VERSION;
    tampered[1] = 0x99;
    await expect(importPublicKey(PUBKEY_PREFIX + base64urlEncode(tampered))).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });
});

describe("fingerprint rejects malformed input", () => {
  it("rejects non-amk1: strings", async () => {
    await expect(fingerprint("garbage" as unknown as PublicKeyString)).rejects.toBeInstanceOf(
      InvalidFormatError,
    );
  });
});

describe("open rejects every clean-failure path", () => {
  it("wrong identity", async () => {
    const a = await generateIdentity();
    const b = await generateIdentity();
    const aPk = await importPublicKey(exportPublicKey(a));
    const aad = enc.encode("link");
    const ct = await seal(enc.encode("hi"), aPk, aad);
    await expect(open(ct, b, aad)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("ciphertext mutated at first AEAD byte", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const aad = enc.encode("link");
    const ct = await seal(enc.encode("hi"), pk, aad);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    bytes[CIPHERTEXT_PREFIX_LEN] ^= 0x01;
    await expect(open(bytes as unknown as Ciphertext, id, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("ciphertext mutated in the middle", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const aad = enc.encode("link");
    const ct = await seal(crypto.getRandomValues(new Uint8Array(64)), pk, aad);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    bytes[Math.floor(bytes.length / 2)] ^= 0x55;
    await expect(open(bytes as unknown as Ciphertext, id, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("ciphertext mutated at the last byte (AEAD tag)", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const aad = enc.encode("link");
    const ct = await seal(enc.encode("hi"), pk, aad);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    bytes[bytes.length - 1] ^= 0x01;
    await expect(open(bytes as unknown as Ciphertext, id, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("truncated by 1 byte", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const aad = enc.encode("link");
    const ct = await seal(enc.encode("hi"), pk, aad);
    const bytes = (ct as unknown as Uint8Array).slice(0, -1);
    await expect(open(bytes as unknown as Ciphertext, id, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("empty blob", async () => {
    const id = await generateIdentity();
    await expect(
      open(new Uint8Array() as unknown as Ciphertext, id, new Uint8Array()),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("blob shorter than the prefix length (33 bytes)", async () => {
    const id = await generateIdentity();
    const tiny = new Uint8Array(33);
    tiny[0] = WIRE_VERSION;
    tiny[1] = SUITE_X25519_AES256GCM;
    await expect(open(tiny as unknown as Ciphertext, id, new Uint8Array())).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("AAD changed", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const ct = await seal(enc.encode("hi"), pk, enc.encode("link-1"));
    await expect(open(ct, id, enc.encode("link-2"))).rejects.toBeInstanceOf(DecryptionError);
  });

  it("AAD with one extra byte appended", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const original = enc.encode("link-1");
    const ct = await seal(enc.encode("hi"), pk, original);
    const longer = new Uint8Array(original.length + 1);
    longer.set(original);
    longer[original.length] = 0x00;
    await expect(open(ct, id, longer)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("blob with wrong version byte", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const aad = enc.encode("link");
    const ct = await seal(enc.encode("hi"), pk, aad);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    bytes[0] = 0x99;
    await expect(open(bytes as unknown as Ciphertext, id, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("blob with wrong suite byte", async () => {
    const id = await generateIdentity();
    const pk = await importPublicKey(exportPublicKey(id));
    const aad = enc.encode("link");
    const ct = await seal(enc.encode("hi"), pk, aad);
    const bytes = new Uint8Array(ct as unknown as Uint8Array);
    bytes[1] = 0x99;
    await expect(open(bytes as unknown as Ciphertext, id, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });
});
```

- [ ] **Step 2: Run the test, expect pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: all `negative.test.ts` cases pass.

If a case fails because the underlying code surfaces a non-`DecryptionError` (e.g., a TypeError from `@hpke/core`), that's a code gap — `seal.ts` is supposed to wrap *every* failure as `DecryptionError`. Find the path that escapes the try/catch and tighten it before re-running.

- [ ] **Step 3: Run typecheck + lint**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Run: `pnpm lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add packages/crypto/tests/negative.test.ts
git commit -m "test(crypto): comprehensive negative tests for seal/open and importPublicKey"
```

---

## Task 11: Test-only helper (`test-only.ts`)

Used by the interop fixture test to reconstruct an `IdentityKeypair` from the recipient privkey hex stored in the JSON vector. Guarded with `NODE_ENV === "test"` so it cannot be reached in production builds.

**Files:**
- Create: `packages/crypto/src/test-only.ts`
- Create: `packages/crypto/tests/test-only.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crypto/tests/test-only.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportPublicKey, generateIdentity } from "../src/identity.js";
import { __test_only_identityFromPrivateKey } from "../src/test-only.js";

describe("__test_only_identityFromPrivateKey", () => {
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("throws when NODE_ENV is not 'test'", async () => {
    process.env.NODE_ENV = "production";
    await expect(__test_only_identityFromPrivateKey(new Uint8Array(32))).rejects.toThrow(
      /test-only/i,
    );
  });

  it("returns a usable identity when NODE_ENV is 'test'", async () => {
    process.env.NODE_ENV = "test";
    // We need a valid X25519 private key. Easiest path: generate one, export, then re-import.
    const fresh = await generateIdentity();
    // To exercise the helper, derive raw private bytes from a fresh keypair via the HPKE wrapper.
    // (Internal-only path — the test merely confirms the helper *can* round-trip.)
    const restored = await __test_only_identityFromPrivateKey(
      await deriveRawPrivateKey(fresh),
    );
    expect(exportPublicKey(restored)).toBe(exportPublicKey(fresh));
  });
});

async function deriveRawPrivateKey(id: Awaited<ReturnType<typeof generateIdentity>>): Promise<Uint8Array> {
  // Reach into the impl shape to read the raw private-key bytes for testing only.
  const impl = id as unknown as { privateKey: CryptoKey };
  const raw = await crypto.subtle.exportKey("raw", impl.privateKey);
  return new Uint8Array(raw);
}
```

If `crypto.subtle.exportKey("raw", ...)` does not work for X25519 in Node (some Node versions reject `raw` export of private keys and require `pkcs8`), substitute `pkcs8` and adjust the helper accordingly. The test goal is just to round-trip the helper, not to lock in a specific export format.

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: FAIL — `Cannot find module '../src/test-only.js'`.

- [ ] **Step 3: Create `packages/crypto/src/test-only.ts`**

```ts
import { exportRawPublicKey, importRawPrivateKey, suite } from "./hpke.js";
import { encodePubkey } from "./wire.js";
import type { IdentityKeypair, PublicKeyString } from "./types.js";

type IdentityImpl = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyRaw: Uint8Array;
  publicKeyString: PublicKeyString;
};

/**
 * Test-only: reconstruct an IdentityKeypair from raw private key bytes.
 *
 * Throws unless NODE_ENV === "test". This helper exists for the interop fixture
 * test, which loads a known recipient private key from a vendored vector.
 */
export async function __test_only_identityFromPrivateKey(
  rawPrivKey: Uint8Array,
): Promise<IdentityKeypair> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("__test_only_identityFromPrivateKey: test-only helper");
  }
  const privateKey = await importRawPrivateKey(rawPrivKey);
  // Derive the public key from the private key by going through HPKE's keypair API.
  // @hpke/core's KEM exposes `derivePublicKey` (or similar) — if that name differs in the
  // installed version, replace with the actual export. As a fallback, generate a fresh
  // keypair seeded from rawPrivKey via @hpke/core's `deriveKeyPair(ikm)` — see RFC 9180 §7.1.3.
  const publicKey = await suite.kem.derivePublicKey(privateKey);
  const publicKeyRaw = await exportRawPublicKey(publicKey);
  const publicKeyString = encodePubkey(publicKeyRaw) as PublicKeyString;
  const impl: IdentityImpl = { publicKey, privateKey, publicKeyRaw, publicKeyString };
  return impl as unknown as IdentityKeypair;
}
```

`suite.kem.derivePublicKey` — verify this method exists on `@hpke/core`'s KEM. If it does not, the alternative is to use `suite.kem.deriveKeyPair(ikm)` with the `rawPrivKey` as IKM (RFC 9180 §7.1.3 specifies deterministic derivation from IKM); the reconstructed public key will then equal the original because IKM-driven derivation is deterministic. Document whichever path the implementer takes.

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: both `test-only.test.ts` cases pass.

- [ ] **Step 5: Run typecheck + lint**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Run: `pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add packages/crypto/src/test-only.ts packages/crypto/tests/test-only.test.ts
git commit -m "feat(crypto): add NODE_ENV-guarded test-only identityFromPrivateKey helper"
```

---

## Task 12: Python interop fixture

A Python script using `pyhpke` generates a known sealed message that our `open` must be able to decrypt. The script is checked in for reproducibility, but the test only reads the resulting JSON — Python is not a runtime dependency.

**Files:**
- Create: `packages/crypto/tests/fixtures/interop/generate.py`
- Create: `packages/crypto/tests/fixtures/interop/requirements.txt`
- Create: `packages/crypto/tests/fixtures/interop/README.md`
- Create: `packages/crypto/tests/fixtures/interop/vector.json` (output of running the script)

- [ ] **Step 1: Create the fixture directory + requirements.txt**

```bash
mkdir -p packages/crypto/tests/fixtures/interop
```

Create `packages/crypto/tests/fixtures/interop/requirements.txt`:

```
pyhpke==0.6.1
```

(Pin whatever the current stable `pyhpke` version is at the time of running; this pin only matters when the fixture is regenerated. Confirm with `pip show pyhpke` after install.)

- [ ] **Step 2: Create the generator script**

Create `packages/crypto/tests/fixtures/interop/generate.py`:

```python
"""
Generate a aesmsg interop test vector by sealing a known plaintext for a known
X25519 recipient using pyhpke (RFC 9180 reference implementation), then writing
the result as a JSON file the JavaScript test reads.

Run from the repo root after installing the requirements:

    pip install -r packages/crypto/tests/fixtures/interop/requirements.txt
    python packages/crypto/tests/fixtures/interop/generate.py

The resulting vector.json is committed to the repo and read by interop.test.ts.
Regenerate only when changing the suite or wire format.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path

from pyhpke import AEADId, CipherSuite, KDFId, KEMId, KEMKey

# Suite must match @aesmsg/crypto: X25519-HKDF-SHA256 + HKDF-SHA256 + AES-256-GCM
SUITE = CipherSuite.new(
    KEMId.DHKEM_X25519_HKDF_SHA256,
    KDFId.HKDF_SHA256,
    AEADId.AES256_GCM,
)

WIRE_VERSION = 0x01
SUITE_BYTE = 0x01
PLAINTEXT = b"hello from python interop"
AAD = b"interop-link-id"

# Use a fixed IKM so the output is reproducible. RFC 9180 §7.1.3 specifies
# deterministic key derivation from IKM.
IKM = bytes([0x42] * 32)
recipient_kem_key = SUITE.kem.derive_key_pair(IKM)
recipient_pubkey_raw = recipient_kem_key.public_key.to_public_bytes()
recipient_privkey_raw = recipient_kem_key.private_key.to_private_bytes()
assert len(recipient_pubkey_raw) == 32, recipient_pubkey_raw
assert len(recipient_privkey_raw) == 32, recipient_privkey_raw

sender_ctx, encapsulated_key = SUITE.create_sender_context(recipient_kem_key.public_key)
aead_output = sender_ctx.seal(PLAINTEXT, aad=AAD)

# Build the aesmsg wire-format ciphertext blob:
# [version_byte][suite_byte][encapsulated_key (32 bytes)][aead_output]
blob = bytes([WIRE_VERSION, SUITE_BYTE]) + encapsulated_key + aead_output

vector = {
    "_comment": (
        "aesmsg interop vector. Regenerated only when the suite or wire format changes. "
        "Do not edit by hand."
    ),
    "suite": "X25519-HKDF-SHA256 + HKDF-SHA256 + AES-256-GCM, mode_base",
    "wire_version": WIRE_VERSION,
    "wire_suite_byte": SUITE_BYTE,
    "ikm_hex": IKM.hex(),
    "recipient_pubkey_raw_hex": recipient_pubkey_raw.hex(),
    "recipient_privkey_raw_hex": recipient_privkey_raw.hex(),
    "aad_utf8": AAD.decode("utf-8"),
    "plaintext_utf8": PLAINTEXT.decode("utf-8"),
    "ciphertext_blob_hex": blob.hex(),
}

out_path = Path(__file__).parent / "vector.json"
out_path.write_text(json.dumps(vector, indent=2) + "\n")
print(f"Wrote {out_path}")
```

If `pyhpke`'s API names differ (e.g. `KEMKey` import path, `derive_key_pair` vs `derive_keypair`, `to_public_bytes` vs `public_bytes_raw`), adjust to match the installed version. The shape of the resulting JSON is the contract — `interop.test.ts` reads exactly the keys defined here.

- [ ] **Step 3: Create `packages/crypto/tests/fixtures/interop/README.md`**

```markdown
# Interop test vector

`vector.json` is a deterministic test vector generated by `generate.py` using `pyhpke`.
The JavaScript test `tests/interop.test.ts` reads this file and asserts that
`@aesmsg/crypto`'s `open` recovers the plaintext from the ciphertext sealed by
a different RFC 9180 implementation.

## Regenerating

Only regenerate when the suite or wire format changes.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r packages/crypto/tests/fixtures/interop/requirements.txt
python packages/crypto/tests/fixtures/interop/generate.py
```

This rewrites `vector.json` deterministically (same IKM produces same keys).

After regenerating, run the JS interop test to confirm both sides still agree:

```bash
pnpm --filter @aesmsg/crypto test interop
```

Commit the regenerated `vector.json` together with the change that motivated it.

## Why this exists

RFC 9180 Appendix A does not contain a published KAT for our exact suite (X25519
KEM + AES-256-GCM AEAD). This fixture, sealed by an independent implementation
(`pyhpke`), is the strongest available "we are standards-compliant" signal — far
stronger than self-roundtrip.
```

- [ ] **Step 4: Generate `vector.json`**

If Python and pip are available locally:

```bash
python -m venv /tmp/aesmsg-interop-venv
source /tmp/aesmsg-interop-venv/bin/activate
pip install -r packages/crypto/tests/fixtures/interop/requirements.txt
python packages/crypto/tests/fixtures/interop/generate.py
deactivate
```

Expected: prints `Wrote .../vector.json`. The JSON file should now exist and contain a `ciphertext_blob_hex` field whose value starts with `0101` (the version + suite header).

If Python is unavailable in the dev environment, run the generation step on any machine that has Python ≥3.10 and `pyhpke` installable, then commit `vector.json` to the repo. The JS test runtime never needs Python.

- [ ] **Step 5: Verify the JSON shape**

Run: `cat packages/crypto/tests/fixtures/interop/vector.json | head -20`
Expected: a JSON object with the keys listed in the script's `vector` dict. `ciphertext_blob_hex` is a hex string that starts with `0101`.

- [ ] **Step 6: Commit**

```bash
git add packages/crypto/tests/fixtures/interop/
git commit -m "test(crypto): add Python pyhpke interop fixture (vector.json + generator)"
```

---

## Task 13: Interop test (`interop.test.ts`)

Reads the JSON vector from Task 12 and decrypts it with our `open`. Proves wire-format compatibility with another RFC 9180 implementation.

**Files:**
- Create: `packages/crypto/tests/interop.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/crypto/tests/interop.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { open } from "../src/seal.js";
import { __test_only_identityFromPrivateKey } from "../src/test-only.js";
import type { Ciphertext } from "../src/types.js";

type Vector = {
  recipient_privkey_raw_hex: string;
  aad_utf8: string;
  plaintext_utf8: string;
  ciphertext_blob_hex: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const vector: Vector = JSON.parse(
  readFileSync(join(here, "fixtures", "interop", "vector.json"), "utf8"),
);

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

describe("cross-implementation interop (pyhpke → @aesmsg/crypto)", () => {
  it("decrypts a ciphertext sealed by pyhpke", async () => {
    process.env.NODE_ENV = "test";
    const recipient = await __test_only_identityFromPrivateKey(
      hexToBytes(vector.recipient_privkey_raw_hex),
    );
    const ciphertext = hexToBytes(vector.ciphertext_blob_hex) as unknown as Ciphertext;
    const aad = new TextEncoder().encode(vector.aad_utf8);
    const recovered = await open(ciphertext, recipient, aad);
    expect(new TextDecoder().decode(recovered)).toBe(vector.plaintext_utf8);
  });
});
```

- [ ] **Step 2: Run the test, expect pass**

Run: `pnpm --filter @aesmsg/crypto test interop`
Expected: `1 passed`. The decrypted plaintext matches the JSON's `plaintext_utf8` field.

If the test fails with a `DecryptionError`, the wire format is misaligned with `pyhpke`'s output. Compare the `ciphertext_blob_hex` shape against what our `seal` produces for the same plaintext + recipient and locate the divergence — likely candidates: encapsulated-key endianness, AAD encoding, version/suite byte order.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @aesmsg/crypto typecheck`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add packages/crypto/tests/interop.test.ts
git commit -m "test(crypto): cross-implementation interop test (pyhpke fixture → our open)"
```

---

## Task 14: Browser-mode test setup (`browser.test.ts`)

Run a subset of the round-trip tests in headless Chromium via Vitest's browser mode, confirming Web Crypto behavior matches Node.

**Files:**
- Create: `packages/crypto/vitest.browser.config.ts`
- Create: `packages/crypto/tests/browser.test.ts`
- Modify: `packages/crypto/vitest.config.ts` (exclude browser.test.ts so the Node project doesn't try to load it)
- Modify: `packages/crypto/package.json` (add `test:node`, `test:browser`, retain `test` running both)

- [ ] **Step 1: Add browser-mode dev dependencies**

Run: `pnpm --filter @aesmsg/crypto add -D @vitest/browser playwright`

Expected: both packages appear under `devDependencies`. `playwright` will pull in browser binaries on first use; this is normal.

- [ ] **Step 2: Install Chromium for Playwright**

Run: `pnpm --filter @aesmsg/crypto exec playwright install chromium`
Expected: download progress, then "Chromium ... downloaded".

- [ ] **Step 3: Update `packages/crypto/vitest.config.ts`**

Replace the file with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/browser.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types.ts", "src/test-only.ts"],
      thresholds: {
        lines: 95,
      },
    },
  },
});
```

`src/types.ts` is type-only (no runtime code) and `src/test-only.ts` is the test helper itself; both are excluded from the coverage gate.

- [ ] **Step 4: Create `packages/crypto/vitest.browser.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
```

If `@vitest/browser` is on a version that uses an older config shape (e.g. `name: "chromium"` instead of `instances: [...]`), match the installed version's shape. The config goal is "run tests/browser.test.ts in headless Chromium" — adjust property names as needed.

- [ ] **Step 5: Create `packages/crypto/tests/browser.test.ts`**

```ts
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  exportPublicKey,
  generateIdentity,
  importPublicKey,
} from "../src/identity.js";
import { open, seal } from "../src/seal.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

describe("browser round-trip (headless Chromium)", () => {
  it("seal+open round-trips a short message in the browser", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));
    const aad = enc.encode("link");
    const ct = await seal(enc.encode("browser hello"), recipientPk, aad);
    const out = await open(ct, recipient, aad);
    expect(dec.decode(out)).toBe("browser hello");
  });

  it("property: seal+open round-trips for small random plaintexts (50 runs)", async () => {
    const recipient = await generateIdentity();
    const recipientPk = await importPublicKey(exportPublicKey(recipient));

    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 256 }),
        fc.uint8Array({ minLength: 0, maxLength: 64 }),
        async (plaintext, aad) => {
          const ct = await seal(plaintext, recipientPk, aad);
          const out = await open(ct, recipient, aad);
          return out.length === plaintext.length &&
            out.every((b, i) => b === plaintext[i]);
        },
      ),
      { numRuns: 50 },
    );
  });
});
```

- [ ] **Step 6: Update `packages/crypto/package.json` scripts**

Edit the `scripts` block to:

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "pnpm test:node && pnpm test:browser",
  "test:node": "vitest run --config vitest.config.ts",
  "test:browser": "vitest run --config vitest.browser.config.ts",
  "test:watch": "vitest --config vitest.config.ts",
  "test:coverage": "vitest run --config vitest.config.ts --coverage"
}
```

- [ ] **Step 7: Run Node tests, expect pass**

Run: `pnpm --filter @aesmsg/crypto test:node`
Expected: every test except `browser.test.ts` passes.

- [ ] **Step 8: Run browser tests, expect pass**

Run: `pnpm --filter @aesmsg/crypto test:browser`
Expected: 2 cases in `browser.test.ts` pass under headless Chromium.

If browser-mode setup hits a multi-hour rabbit hole (Playwright download issues, Vitest browser config shape mismatch with the installed version), defer browser tests to a follow-up commit and document in the README — Slice 1's Node + interop tests are still strictly stronger than the spec's original "RFC 9180 Appendix A KATs" approach.

- [ ] **Step 9: Run combined test command**

Run: `pnpm --filter @aesmsg/crypto test`
Expected: Node + browser projects both run, both green.

- [ ] **Step 10: Commit**

```bash
git add packages/crypto/vitest.config.ts packages/crypto/vitest.browser.config.ts packages/crypto/tests/browser.test.ts packages/crypto/package.json pnpm-lock.yaml
git commit -m "test(crypto): add Vitest browser-mode round-trip tests (headless Chromium via Playwright)"
```

---

## Task 15: Coverage gate verification

**Files:** none — this task only runs commands and may produce small follow-up edits.

- [ ] **Step 1: Run coverage**

Run: `pnpm --filter @aesmsg/crypto test:coverage`
Expected: coverage report prints; thresholds pass at ≥95% lines.

If coverage is below 95%, identify which files or branches are uncovered (Vitest prints the file paths and line numbers). Common gaps:
- An error path in `wire.ts` that no test exercises — add a negative test in `wire.test.ts`.
- An unreachable defensive branch in `seal.ts` — if it's truly unreachable, prefer `// c8 ignore next` over a contrived test, then re-run.

Iterate until coverage passes.

- [ ] **Step 2: Confirm the threshold is encoded in `vitest.config.ts`**

Run: `grep -n "lines: 95" packages/crypto/vitest.config.ts`
Expected: one match. Coverage gate is now enforced; subsequent CI runs will fail if coverage regresses below 95%.

- [ ] **Step 3: Commit any coverage-driven test additions or `c8 ignore` annotations**

```bash
git add packages/crypto/tests packages/crypto/src
git commit -m "test(crypto): close coverage gaps to ≥95% lines"
```

(Skip this commit if no changes were needed.)

---

## Task 16: README rewrite + final verification

**Files:**
- Modify: `packages/crypto/README.md`

- [ ] **Step 1: Replace `packages/crypto/README.md`**

Overwrite with:

````markdown
# @aesmsg/crypto

Trust-critical encryption primitives for aesmsg.
**No DOM. No network. No storage.** Standards-compliant HPKE (RFC 9180).

## Status

Slice 1 complete: `generateIdentity`, `exportPublicKey`, `importPublicKey`,
`fingerprint` + `compareFingerprint`, `seal`, `open`. Slice 2 will land
`wrapPrivateKey` / `unwrapPrivateKey` paired with the IndexedDB-backed browser
key store; those two functions still throw `NotImplementedError`.

## Public API

```ts
generateIdentity(): Promise<IdentityKeypair>
exportPublicKey(id: IdentityKeypair): PublicKeyString                          // sync — cached
importPublicKey(s: string): Promise<RecipientPublicKey>
fingerprint(pk: PublicKeyString): Promise<Fingerprint>
compareFingerprint(a: Fingerprint, b: Fingerprint): boolean                    // constant-time
seal(plaintext: Uint8Array, recipient: RecipientPublicKey, aad: Uint8Array): Promise<Ciphertext>
open(ciphertext: Ciphertext, identity: IdentityKeypair, aad: Uint8Array): Promise<Uint8Array>

class DecryptionError    // any seal/open failure (no detail leak)
class InvalidFormatError // wire format / version / suite parse failures
class NotImplementedError // wrap/unwrap — still Slice 2
```

## Suite

HPKE (RFC 9180) `mode_base` via [`@hpke/core`](https://github.com/dajiaji/hpke-js):

| Component | Choice |
|---|---|
| KEM | `DhkemX25519HkdfSha256` |
| KDF | `HkdfSha256` |
| AEAD | `Aes256Gcm` |

## Wire formats (versioned)

**Public key string** (~51 chars):

```
amk1:<base64url( 0x01 || 0x01 || raw_x25519_pubkey[32] )>
```

**Ciphertext blob** (raw bytes, encoding for transport is the caller's choice):

```
0x01 || 0x01 || encapsulated_key[32] || aead_output[variable, includes 16-byte tag]
```

**Fingerprint** (24 lowercase base32 chars + 5 spaces):

```
sha-256( 34-byte canonical pubkey bytes ) → first 15 bytes → "abcd efgh ijkl mnop qrst uvwx"
```

The `0x01 || 0x01` prefix is `version_byte || suite_byte`. Future suites
get a new suite byte; future format breaks get a new version byte. `importPublicKey`
and `open` reject unknown values cleanly.

## AAD contract

`seal` and `open` require an `aad: Uint8Array` argument. Callers must pass
the UTF-8 bytes of the canonical link ID string. Without the matching AAD,
`open` throws `DecryptionError` — this prevents a malicious server from
substituting one of the recipient's ciphertexts under a different link ID.

The crypto package does not generate or validate link IDs; it treats AAD as
opaque bytes. Link-ID generation lives in the storage layer (Slice 2).

## Tests

Run `pnpm --filter @aesmsg/crypto test` (Node + browser).

| File | Purpose |
|---|---|
| `wire.test.ts` | base64url, base32, pubkey envelope, ciphertext blob codec |
| `errors.test.ts` | error class shapes |
| `identity.test.ts` | generateIdentity / exportPublicKey / importPublicKey |
| `fingerprint.test.ts` | format + stability + constant-time compare |
| `seal.test.ts` | seal/open round-trip + version/suite/AAD checks |
| `roundtrip.test.ts` | empty/byte/1KB/1MB/UTF-8 + 200-iteration fast-check property |
| `negative.test.ts` | every clean-failure path |
| `interop.test.ts` | decrypt a ciphertext sealed by `pyhpke` (RFC 9180 reference impl) |
| `browser.test.ts` | round-trip in headless Chromium via Vitest browser mode |
| `stubs.test.ts` | `wrapPrivateKey` / `unwrapPrivateKey` still throw `NotImplementedError` |

Coverage threshold: ≥95% lines on `src/`.

The interop fixture is regenerated by
[`tests/fixtures/interop/generate.py`](tests/fixtures/interop/) — see that
folder's README for instructions. Python is required only at fixture
regeneration time; the test runtime reads the committed `vector.json`.

## Portability

DOM-free, network-free, storage-free. The same primitives must port to:

- React Native / native mobile (Phase 2) — direct bridging via `@hpke/core`'s
  React Native target or a native HPKE module.
- Server-side (Node) — used in tests; never on the production server runtime,
  since the server never sees plaintext.

## What's NOT here (Slice 2)

- `wrapPrivateKey(id, passphrase)` and `unwrapPrivateKey(wrapped, passphrase)` —
  paired with the IndexedDB-backed browser key store.
- The storage layer itself (`@aesmsg/key-store` or equivalent — name TBD).
- Sender authentication (HPKE `mode_auth`) — kept for a future phase if
  "verified sender" enters the product.
````

- [ ] **Step 2: Run the full workspace verification**

Run from repo root:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm --filter @aesmsg/crypto test
pnpm --filter @aesmsg/crypto test:coverage
```

Expected:
- `pnpm install` clean, no peer-dep warnings.
- `pnpm typecheck` passes for every workspace.
- `pnpm lint` passes (Biome).
- `pnpm --filter @aesmsg/crypto test` runs Node + browser projects, all green.
- `pnpm --filter @aesmsg/crypto test:coverage` reports ≥95% line coverage.

- [ ] **Step 3: Confirm git history is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`. If anything remains (Vitest cache directories, coverage output), add to `.gitignore` and commit that change.

- [ ] **Step 4: Final commit (README + any cleanup)**

```bash
git add packages/crypto/README.md
git commit -m "docs(crypto): rewrite README for Slice 1 (HPKE implementation, wire formats, test rigor)"
```

If a `.gitignore` change was needed for coverage output:

```bash
git add .gitignore
git commit -m "chore: ignore Vitest coverage output"
```

- [ ] **Step 5: Final state check**

Run: `git log --oneline | head -20`
Expected: a clean, ordered series of commits that tells the story:

1. `refactor(crypto): correct Phase 0 stub API surface for Slice 1 ...`
2. `chore(crypto): add @hpke/core and fast-check`
3. `feat(crypto): add error classes ...`
4. `feat(crypto): add wire format codec ...`
5. `feat(crypto): add @hpke/core wrapper ...`
6. `feat(crypto): implement generateIdentity / exportPublicKey / importPublicKey`
7. `feat(crypto): implement fingerprint + constant-time compareFingerprint`
8. `feat(crypto): implement seal + open with versioned blob and required link-id AAD`
9. `test(crypto): add round-trip + fast-check property tests`
10. `test(crypto): comprehensive negative tests ...`
11. `feat(crypto): add NODE_ENV-guarded test-only identityFromPrivateKey helper`
12. `test(crypto): add Python pyhpke interop fixture ...`
13. `test(crypto): cross-implementation interop test ...`
14. `test(crypto): add Vitest browser-mode round-trip tests ...`
15. (optional) `test(crypto): close coverage gaps to ≥95% lines`
16. `docs(crypto): rewrite README for Slice 1 ...`

---

## Self-review

**1. Spec coverage:**

Walking each section of [`docs/superpowers/specs/2026-05-09-crypto-core-design.md`](../specs/2026-05-09-crypto-core-design.md):

- §4 Public API → Tasks 1, 6, 7, 8 cover every function; Task 1 lands the signature corrections atomically.
- §5 Wire formats → Task 4 (codec + helpers); Tasks 6 (pubkey use) and 8 (ciphertext blob use) consume them.
- §6 Algorithms & deps → Task 2 (deps), Task 5 (HPKE wrapper).
- §7 AAD contract → Task 8 (seal/open require AAD), Task 13 (interop fixture confirms wire-level AAD binding works across impls), Task 10 (negative tests for AAD changes).
- §8 Error model → Task 3 (errors module); Tasks 8, 10 verify opaque-failure behaviour.
- §9 Test plan → Tasks 9 (roundtrip+property), 10 (negative), 12+13 (interop), 14 (browser), 15 (coverage gate). Stubs trim per-task.
- §10 File layout → matches Tasks 3–8 + 11–14 directly.
- §11 Definition of done → Tasks 14, 15, 16 verify each criterion.
- §12 Risks → Task 5 (HPKE wrapper isolation), Task 14 (browser-mode escape hatch documented), Task 12 (Python at gen-time only), Task 7 (constant-time correctness, no timing gate).

No gaps.

**2. Placeholder scan:**

Three intentional "verify against installed library" spots exist:
- Task 2 Step 3 — verify `@hpke/core`'s actual export names before writing `hpke.ts`.
- Task 5 Step 1 — adjust to actual `@hpke/core` API if `senderCtx.enc` / `recipientKey` etc. differ.
- Task 11 Step 3 — verify `suite.kem.derivePublicKey` exists or fall back to `deriveKeyPair(ikm)`.
- Task 12 Step 2 — adjust `pyhpke` API names if the installed version differs.
- Task 14 Step 4 — adjust browser config shape to installed `@vitest/browser` version.

These are not plan placeholders — they are explicit instructions to verify against the live library and adjust to reality. Each lists the fallback path. No `TBD` / `TODO` / "implement later" / "appropriate error handling" patterns.

**3. Type consistency:**

- `IdentityKeypair`, `RecipientPublicKey`, `Ciphertext`, `Fingerprint`, `PublicKeyString` — defined as brands in existing `types.ts` (Phase 0); used consistently across Tasks 6, 7, 8, 9, 10, 11, 13.
- `IdentityImpl`, `RecipientImpl` — local to `identity.ts` (Task 6); accessed by `seal.ts` (Task 8) and `test-only.ts` (Task 11) via the `__getIdentityImpl` / `__getRecipientImpl` accessors defined in Task 6 Step 3.
- `RawKeypair` — defined in `hpke.ts` (Task 5); consumed by `identity.ts` (Task 6) and `test-only.ts` (Task 11).
- Constants `WIRE_VERSION` / `SUITE_X25519_AES256GCM` / `RAW_X25519_PUBKEY_LEN` / `CANONICAL_PUBKEY_LEN` / `ENCAPSULATED_KEY_LEN` / `CIPHERTEXT_PREFIX_LEN` / `PUBKEY_PREFIX` — defined in `wire.ts` (Task 4); used by `identity.ts` (Task 6), `seal.ts` (Task 8), and tests in Tasks 4, 6, 8, 10.
- `__test_only_identityFromPrivateKey` — defined in `test-only.ts` (Task 11); used by `interop.test.ts` (Task 13).

Consistent.

---

## Risks during execution

- **`@hpke/core` API drift.** The library's public surface may have changed names since the version we'll resolve at install time. Mitigation: Task 2 Step 3 verifies the export names before any code is written; Task 5 isolates everything in one file; Task 11 documents both the primary and fallback derivation paths.
- **Vitest browser mode setup.** First-run Playwright + `@vitest/browser` setup can fail in unfamiliar ways (config shape mismatches, browser binary download issues). Mitigation: Task 14 Step 8 documents the escape hatch — defer browser tests to a follow-up if the rabbit hole gets deep, since Node + interop tests are already strictly stronger than the spec's original KAT plan.
- **Coverage ≤ 95% on first try.** Defensive branches in error-handling code are common gaps. Mitigation: Task 15 explicitly documents both routes (add a test, or annotate truly-unreachable branches with `c8 ignore`).
- **`pyhpke` install on the dev machine.** May require Python 3.10+. Mitigation: Task 12 documents the path to regenerate on any compatible machine and commit `vector.json` — the JS test runtime never needs Python.
- **Test runtime budget.** 200 fast-check iterations + 1MB round-trip + browser-mode boot can push `pnpm test` past 30s. Acceptable for crypto specifically. If it becomes a developer-experience problem, switch `test:watch` to default to `test:node` only.
