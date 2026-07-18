# Slice 1 — Crypto core implementation (`@aesmsg/crypto`)

**Date:** 2026-05-09
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Supersedes / extends:** [`2026-05-09-project-init-design.md`](2026-05-09-project-init-design.md) §6

## 1. Context

Phase 0 landed a `@aesmsg/crypto` skeleton: type stubs, README documenting the intended HPKE-based suite, and a `stubs.test.ts` asserting that every public function throws `NotImplementedError`. Slice 1 of Phase 1 lands the **real implementation** of the encryption primitives the rest of the product depends on, with a test rigor appropriate to a security product (cross-implementation interop + browser-runtime + property-based + negative).

The crypto package is the trust foundation. It must be:

- **Standards-compliant** (HPKE per RFC 9180), demonstrably interoperable with another implementation
- **Side-channel-aware** for the comparisons that matter (constant-time fingerprint equality)
- **DOM-free, network-free, storage-free** so it ports to mobile and runs in tests under Node
- **Forward-compatible**: wire formats are versioned so a future suite rotation does not break in-flight pubkeys, fingerprints, or stored ciphertext

Slice 2 (next in Phase 1) lands `wrapPrivateKey` / `unwrapPrivateKey` paired with the IndexedDB-backed browser key store; this spec **deliberately defers** that work because the wrapped-blob envelope format benefits from being co-designed with its only consumer.

## 2. Goals

- Replace the six trust-critical stubs with real, tested implementations: `generateIdentity`, `exportPublicKey`, `importPublicKey`, `fingerprint`, `seal`, `open`.
- Lock the **wire formats** (pubkey string, ciphertext blob, fingerprint string) with a version-and-suite prefix so future suite rotation is possible without breaking shared pubkeys or stored ciphertext.
- Lock the **AAD contract**: `seal` and `open` require an AAD, which callers must set to the canonical link ID bytes — gives defense-in-depth against server-side ciphertext substitution between two of the same recipient's links.
- Reach ≥95% line coverage with a test suite that includes:
  - Round-trip property tests
  - Negative tests for every clean-failure path
  - **Cross-implementation interop** via a vendored Python `cryptography` HPKE fixture
  - **Browser-runtime tests** in headless Chromium via Vitest browser mode

## 3. Non-goals

- `wrapPrivateKey` / `unwrapPrivateKey` — Slice 2.
- Any UI, network code, or storage code — Slice 2+.
- Sender authentication via HPKE `mode_auth` — base mode is sufficient for the PRD's anonymous-sender model and matches the recipient-only-decrypt promise. `mode_auth` is a candidate for Phase 2/3 if we add a "verified sender" tier.
- Suite rotation logic — the wire format reserves the suite byte but Slice 1 only defines suite `0x01`. A second suite arrives only when post-quantum hybrids stabilize.
- IANA HPKE suite IDs — we use a private 1-byte field (`0x01`) for tightness; conversion to IANA values, if ever needed, is a one-line mapping.

## 4. Public API

The Slice 1 implementation revises the Phase 0 stub signatures in three ways: `aad` becomes **required** on `seal`/`open`, and `importPublicKey` + `fingerprint` become **async** (their underlying Web Crypto operations — `subtle.importKey` and `subtle.digest` — are async-only). `exportPublicKey` stays sync because we cache the canonical wire string at identity-generation time, so reading it is a property access.

```ts
// Identity
export function generateIdentity(): Promise<IdentityKeypair>;
export function exportPublicKey(id: IdentityKeypair): PublicKeyString;     // sync — cached
export function importPublicKey(s: string): Promise<RecipientPublicKey>;   // async — Web Crypto importKey

// Fingerprints (manual verification UX)
export function fingerprint(pk: PublicKeyString): Promise<Fingerprint>;    // async — Web Crypto digest
export function compareFingerprint(a: Fingerprint, b: Fingerprint): boolean; // constant-time, sync

// Sealing (anonymous sender → recipient public key)
export function seal(
  plaintext: Uint8Array,
  recipient: RecipientPublicKey,
  aad: Uint8Array,
): Promise<Ciphertext>;
export function open(
  ciphertext: Ciphertext,
  id: IdentityKeypair,
  aad: Uint8Array,
): Promise<Uint8Array>;

// Errors
export class DecryptionError extends Error {}     // any seal/open failure (no detail leak)
export class InvalidFormatError extends Error {}  // wire format / version / suite parse failures
export class NotImplementedError extends Error {} // still thrown by wrap/unwrap until Slice 2
```

The two error classes are distinct so consumers can decide whether to surface a "not a aesmsg key" hint (parse failure → `InvalidFormatError`) or a generic "could not decrypt" message (any decryption failure → `DecryptionError`). `DecryptionError` does **not** distinguish between wrong-key, tampered-ciphertext, or AAD-mismatch — surfacing those distinctions helps an attacker more than the user.

The Phase 0 stub signatures had `aad?: Uint8Array` (optional) and `importPublicKey` / `fingerprint` as sync. Slice 1's first commit updates the stubs to the corrected signatures (required AAD, async `importPublicKey` + `fingerprint`) and updates `stubs.test.ts` accordingly, so the API correction lands cleanly in history rather than mid-implementation. After Slice 1, the wrapped-key stubs are the only `NotImplementedError` paths remaining.

## 5. Wire formats

### 5.1 Pubkey string

```
amk1:<base64url( 0x01 || 0x01 || raw_x25519_pubkey[32] )>
```

- `amk1:` — text prefix, human-readable identifier ("aesmsg key v1")
- `0x01` — wire-format version byte
- `0x01` — suite byte (X25519-HKDF-SHA256 + AES-256-GCM, mode_base)
- 32 bytes — raw X25519 public key per RFC 7748
- Base64url is unpadded (no `=`)
- Total encoded length: 5 (`amk1:`) + 46 (base64url of 34 bytes, unpadded) = 51 chars

`importPublicKey` rejects, with `InvalidFormatError`:
- Missing or wrong text prefix
- Base64url decode failure
- Decoded length not exactly 34 bytes
- Unknown version byte (anything other than `0x01`)
- Unknown suite byte (anything other than `0x01`)

### 5.2 Ciphertext blob

```
0x01 || 0x01 || encapsulated_key[32] || aead_output[variable, includes 16-byte tag]
```

- `0x01` version byte · `0x01` suite byte
- 32 bytes — HPKE encapsulated key for X25519 KEM (this is the ephemeral pubkey for the sender's one-shot DH)
- Remainder — AES-256-GCM output (ciphertext concatenated with the 16-byte authentication tag, per the AEAD's standard output layout)
- No length prefixes — the encapsulated key is fixed 32 bytes for X25519, and the AEAD output runs to end-of-blob

`Ciphertext` is a branded `Uint8Array`. The package returns raw bytes; how the consumer transports them (base64url over JSON, raw binary in a `POST` body, etc.) is the consumer's choice.

`open` rejects, with `DecryptionError`:
- Length < 34 bytes (impossible to even contain the encapsulated key + tag)
- Unknown version byte
- Unknown suite byte
- Any HPKE / AEAD failure (wrong recipient key, tampered ciphertext, tampered AAD)

(Length / version / suite parse failures throw `DecryptionError`, not `InvalidFormatError` — at the `open` boundary we treat all failures as one opaque category to avoid leaking which check failed.)

### 5.3 Fingerprint

```
sha-256( 34-byte canonical pubkey bytes ) → first 15 bytes → base32 → "abcd efgh ijkl mnop qrst uvwx"
```

- "Canonical pubkey bytes" = the 34 bytes inside the `amk1:` envelope (version + suite + raw key), so the fingerprint binds the version and suite as well as the key
- 15 bytes = 120 bits, encoded as 24 base32 characters
- Lowercase, RFC 4648 base32 alphabet, no padding
- Formatted as 6 groups of 4 chars separated by single ASCII spaces
- `Fingerprint` is a branded `string`
- `compareFingerprint(a, b)` uses constant-time equality (compare every byte regardless of result; XOR-and-OR pattern)

## 6. Algorithms & dependencies

| Concern | Choice | Notes |
|---|---|---|
| Hybrid PKE | **HPKE (RFC 9180)** | `mode_base` — anonymous sender |
| KEM | `DhkemX25519HkdfSha256` | RFC 9180 §7.1.2 |
| KDF | `HkdfSha256` | RFC 9180 §7.2 |
| AEAD | `Aes256Gcm` | RFC 9180 §7.3 |
| HPKE library | `@hpke/core` (latest stable at impl time) | Provides typed APIs for the suite above |
| Hashing for fingerprints | SHA-256 via Web Crypto (`crypto.subtle.digest`) | Globally available in Node 19+ and all browsers |
| Random source | `crypto.getRandomValues` | Globally available, no polyfill |
| Base32 / base64url | Vendored helpers | ~30 lines each, no extra deps |

Wire suite ID `0x01` is private to aesmsg, intentionally not the IANA HPKE suite ID — keeps the field at 1 byte. If we ever add a second suite, we map our 1-byte IDs to the underlying library suites in one place.

## 7. AAD contract

- `seal(plaintext, recipient, aad)` and `open(ciphertext, identity, aad)` both require `aad: Uint8Array`.
- Documented contract: the caller must pass the **UTF-8 bytes of the canonical link ID string** as AAD. The crypto package does not generate link IDs — that is a URL-routing concern owned by the consumer (Slice 2).
- The crypto package does not validate that the AAD "looks like a link ID" — it treats the bytes opaquely and binds them to the ciphertext via HPKE's AAD parameter.
- Effect: the recipient's `open` succeeds only if the bytes provided as AAD on decryption match exactly the bytes provided as AAD on sealing. If a server substitutes ciphertext from one of the recipient's links into a different link, the recipient computes AAD from the new URL, the AADs don't match, `open` throws.
- `LinkId` brand type, link-ID generation, and canonical encoding all live in Slice 2's storage layer. Slice 1 tests exercise the contract using a fixture link ID string.

## 8. Error model

```ts
export class DecryptionError extends Error { name = "DecryptionError"; }
export class InvalidFormatError extends Error { name = "InvalidFormatError"; }
export class NotImplementedError extends Error { name = "NotImplementedError"; }
```

- `InvalidFormatError` — thrown by `importPublicKey` when the input is not a parseable `amk1:` string. Lets the UI distinguish "this isn't a aesmsg pubkey" from "decryption failed".
- `DecryptionError` — thrown by `open` for **any** failure: wrong key, tampered ciphertext, AAD mismatch, malformed blob. Single opaque error to avoid side-channel-via-error-message.
- `NotImplementedError` — still thrown by `wrapPrivateKey` / `unwrapPrivateKey` until Slice 2.

No error contains plaintext, key material, or details about which check failed. Error messages are static strings.

## 9. Test plan (rungs A + B + C)

Five files in `packages/crypto/tests/`:

### 9.1 `stubs.test.ts` (trim from existing)

After Slice 1, only `wrapPrivateKey` and `unwrapPrivateKey` remain `NotImplementedError`. Trim the existing 8-case file to 2 cases asserting those two still throw.

### 9.2 `roundtrip.test.ts`

- Generate identity, export pubkey, import pubkey, seal, open, assert plaintext recovered.
- Cases: empty plaintext · single byte · 1KB · 1MB · UTF-8 with mixed scripts (Latin + CJK + emoji).
- Property test (via `fast-check`): `∀ random plaintext (0..1024 bytes), random AAD (0..256 bytes), seal+open recovers plaintext`. Run 200 iterations.
- Pubkey export/import round-trip: `importPublicKey(exportPublicKey(id))` produces a `RecipientPublicKey` equivalent for sealing.
- Fingerprint stability: same pubkey → same fingerprint across multiple calls.
- Fingerprint distinguishability: different pubkeys → different fingerprints (probabilistic; verified across 100 generated identities).

### 9.3 `negative.test.ts`

Every clean-failure path:

- `open` with wrong identity → `DecryptionError`
- `open` with single-byte mutation of ciphertext (every byte position; fast-check shrunk if too slow → spot-check 10 random positions) → `DecryptionError`
- `open` with truncated ciphertext (lengths 0, 1, 33, 34, n-1) → `DecryptionError`
- `open` with mutated AAD → `DecryptionError`
- `open` with original AAD bytes plus one extra byte → `DecryptionError`
- `open` with version byte changed → `DecryptionError`
- `open` with suite byte changed → `DecryptionError`
- `importPublicKey("")` → `InvalidFormatError`
- `importPublicKey("ssk2:...")` (wrong version prefix) → `InvalidFormatError`
- `importPublicKey("amk1:not-base64!")` → `InvalidFormatError`
- `importPublicKey("amk1:" + base64url(33 random bytes))` (wrong length) → `InvalidFormatError`
- `importPublicKey` with valid base64url but wrong inner version byte → `InvalidFormatError`
- `importPublicKey` with valid base64url but wrong suite byte → `InvalidFormatError`
- `compareFingerprint` returns `true` for identical fingerprints, `false` for any difference, and (timing test, best-effort) is approximately constant-time over 1000 iterations vs. early-exit comparison

### 9.4 `interop.test.ts` (rung B — cross-implementation)

A vendored fixture proves we are wire-compatible with another RFC 9180 implementation.

- `tests/fixtures/interop/generate.py` — Python script using the `cryptography` library's HPKE support. Generates:
  - A static recipient X25519 keypair (deterministic seed for reproducibility)
  - A sealed message for that recipient with a fixed plaintext, fixed AAD, and a fixed ephemeral seed (deterministic for reproducibility)
  - Writes `tests/fixtures/interop/vector.json` with `{recipient_privkey_hex, recipient_pubkey_hex, plaintext_utf8, aad_utf8, ciphertext_blob_hex}`
- `tests/fixtures/interop/vector.json` is committed to the repo; the script is documented as "regenerate only when changing the suite".
- `interop.test.ts`:
  - Reads `vector.json`.
  - Reconstructs an `IdentityKeypair` from the privkey hex (via a small `__test_only_identityFromPrivKey` helper, exported only when `NODE_ENV === "test"` — flagged in code so it cannot be misused in prod).
  - Wraps `ciphertext_blob_hex` into a `Ciphertext` and calls `open(ciphertext, identity, utf8(aad))`.
  - Asserts the resulting plaintext bytes equal `utf8(plaintext_utf8)`.
- One direction in Slice 1 (their seal → our open). Reverse direction (our seal → their open) is a stretch goal — wired in only if the Python fixture is easy to invoke at test time.

If Python is not available in CI, the regenerated `vector.json` is committed and the test reads it directly. Python is not a runtime dependency of the package, only a generation tool for the fixture.

### 9.5 `browser.test.ts` (rung C — browser runtime)

- Adds `@vitest/browser` and `playwright` as dev deps.
- A browser-mode Vitest project runs the same round-trip cases as `roundtrip.test.ts` in headless Chromium, confirming Web Crypto behavior matches Node's globally-available crypto.
- Property test iterations are reduced (50 iterations instead of 200) since the browser run is slower; the full 200 still runs in Node.
- Configured as a separate Vitest project so `pnpm --filter @aesmsg/crypto test` runs both Node and browser, but `pnpm --filter @aesmsg/crypto test:node` can run just Node for fast iteration.

### 9.6 Coverage gate

- ≥95% line coverage on `packages/crypto/src/**`. Coverage report via Vitest's `v8` provider.
- Branch coverage reported but not gated.

## 10. File layout

After Slice 1:

```
packages/crypto/
├─ package.json                  (adds @hpke/core, fast-check, @vitest/browser, playwright)
├─ README.md                     (revised — drops "skeleton only" framing)
├─ src/
│  ├─ index.ts                   (real exports)
│  ├─ types.ts                   (existing brands)
│  ├─ errors.ts                  (DecryptionError, InvalidFormatError, NotImplementedError)
│  ├─ wire.ts                    (pubkey + ciphertext + fingerprint codec; base64url + base32 helpers)
│  ├─ hpke.ts                    (thin wrapper around @hpke/core's CipherSuite)
│  ├─ identity.ts                (generateIdentity, exportPublicKey, importPublicKey)
│  ├─ fingerprint.ts             (fingerprint + compareFingerprint, constant-time eq)
│  ├─ seal.ts                    (seal, open)
│  └─ test-only.ts               (identityFromPrivKey for interop fixture; throws unless NODE_ENV=test)
├─ tests/
│  ├─ stubs.test.ts              (trimmed to wrap/unwrap)
│  ├─ roundtrip.test.ts
│  ├─ negative.test.ts
│  ├─ interop.test.ts
│  ├─ browser.test.ts
│  └─ fixtures/
│     └─ interop/
│        ├─ generate.py
│        └─ vector.json
├─ tsconfig.json
├─ vitest.config.ts              (Node project — coverage enabled, includes everything except browser.test.ts)
└─ vitest.browser.config.ts      (browser project — extends vitest.config.ts, includes only browser.test.ts, Playwright provider, headless Chromium)
```

## 11. Definition of done

- All six functions implemented and tested.
- All five test files green: `roundtrip`, `negative`, `interop`, `browser`, `stubs`.
- `pnpm --filter @aesmsg/crypto test` exits 0 in Node and in browser mode.
- Line coverage ≥95% on `src/`.
- `pnpm --filter @aesmsg/crypto typecheck` clean.
- `pnpm lint` clean (Biome).
- `packages/crypto/README.md` revised: drops "skeleton only" wording, documents wire formats, KAT/interop test approach, and lists what remains in Slice 2 (`wrap`/`unwrap`).
- The Phase 0 stub signature corrections (optional → required `aad`, sync → async `importPublicKey` + `fingerprint`) are reflected in the stub source and tests in the very first Slice 1 commit, so the API surface change lands cleanly in history rather than in the middle of an implementation commit.

## 12. Risks & mitigations

- **`@hpke/core` surface drift.** The library is alive and may have moved its API since the version we saw at scaffold time. Mitigation: thin wrapper in `hpke.ts` so any breaking change is contained to one file; pin the version explicitly.
- **Vitest browser mode setup friction.** First-time setup of `@vitest/browser` + Playwright can be painful (browser binary install, headless config). Mitigation: implementation plan includes a discrete "verify browser mode boots" task before adding browser-specific tests; if it's a multi-hour rabbit hole, browser-mode tests can be deferred to a Slice 1.1 follow-up without blocking the rest.
- **Python fixture portability.** The generate script depends on a specific `cryptography` version. Mitigation: pin in a `requirements.txt` next to the script; commit the resulting `vector.json` so the test does not need Python at run-time.
- **Constant-time comparison verification.** Empirical timing tests in JS are noisy. Mitigation: test for *correctness* of `compareFingerprint` and the *presence* of a constant-time pattern (no early return, all bytes touched); do not gate on timing variance.
- **No RFC 9180 Appendix A vector for our exact suite.** The init spec implied there would be one; there isn't (A.1 is X25519 + AES-128, A.4 is P-521 + AES-256). Mitigation: the `interop.test.ts` against `cryptography`'s HPKE is the standards-compliance test, which is strictly stronger than a single fixed vector. The init spec's mention of "RFC 9180 Appendix A test cases for the chosen suite" is corrected here.

## 13. Out of scope for this spec

- `wrapPrivateKey` / `unwrapPrivateKey` and the IndexedDB key store (Slice 2)
- Any UI, API route, or storage adapter (Slice 2+)
- Suite rotation / multi-suite acceptance (future)
- Sender authentication via HPKE `mode_auth` (future)
- File / large-blob streaming (Phase 2)
