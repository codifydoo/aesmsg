# @aesmsg/crypto

Trust-critical encryption primitives for aesmsg.
**No DOM. No network. No storage.** Standards-compliant HPKE (RFC 9180).

## Status

Slices 1 and 2 complete: full HPKE seal/open + identity + fingerprint, plus
Argon2id-based wrap/unwrap. No `NotImplementedError` paths remain.

## Public API

```ts
generateIdentity(): Promise<IdentityKeypair>
exportPublicKey(id: IdentityKeypair): PublicKeyString                          // sync — cached
importPublicKey(s: string): Promise<RecipientPublicKey>
fingerprint(pk: PublicKeyString): Promise<Fingerprint>
truncateFingerprint(fp: Fingerprint, groups: number): string                   // for condensed displays
compareFingerprint(a: Fingerprint, b: Fingerprint): boolean                    // constant-time
seal(plaintext: Uint8Array, recipient: RecipientPublicKey, aad: Uint8Array): Promise<Ciphertext>
open(ciphertext: Ciphertext, identity: IdentityKeypair, aad: Uint8Array): Promise<Uint8Array>
wrapPrivateKey(id: IdentityKeypair, passphrase: string): Promise<WrappedKey>
unwrapPrivateKey(wrapped: WrappedKey, passphrase: string): Promise<IdentityKeypair>

class DecryptionError      // any seal/open or generic wrap failure
class BadPassphraseError   // unwrap with wrong passphrase (extends DecryptionError)
class InvalidFormatError   // wire format / version / KDF / suite parse failures
```

## Suite (HPKE seal/open)

HPKE (RFC 9180) `mode_base` via [`@hpke/core`](https://github.com/dajiaji/hpke-js):

| Component | Choice |
|---|---|
| KEM | `DhkemX25519HkdfSha256` |
| KDF | `HkdfSha256` |
| AEAD | `Aes256Gcm` |

## Wire formats (versioned)

**Public key string** (51 chars total):

```
amk1:<base64url( 0x01 || 0x01 || raw_x25519_pubkey[32] )>
```

**Ciphertext blob** (raw bytes, encoding for transport is the caller's choice):

```
0x01 || 0x01 || encapsulated_key[32] || aead_output[variable, includes 16-byte tag]
```

**Fingerprint** (42 chars: `AM-` prefix + 32 uppercase hex in 8 dash-separated groups, 128 bits):

```
sha-256( 34-byte canonical pubkey bytes ) -> first 16 bytes -> "AM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
```

`truncateFingerprint(fp, groups)` returns the first N hex groups joined by single spaces (no `AM-` prefix), for condensed UI displays — e.g. `truncateFingerprint(fp, 4)` → `"A91C 22F0 78BB 19D2"`.

The `0x01 || 0x01` prefix is `version_byte || suite_byte`. Future suites get a
new suite byte; future format breaks get a new version byte. `importPublicKey`
and `open` reject unknown values cleanly.

## AAD contract

`seal` and `open` require an `aad: Uint8Array` argument. Callers must pass
the UTF-8 bytes of the canonical link ID string. Without the matching AAD,
`open` throws `DecryptionError` — this prevents a malicious server from
substituting one of the recipient's ciphertexts under a different link ID.

The crypto package does not generate or validate link IDs; it treats AAD as
opaque bytes. Link-ID generation lives in the storage layer.

## Wrap / unwrap (Slice 2)

`wrapPrivateKey(id, passphrase)` and `unwrapPrivateKey(wrapped, passphrase)`
let consumers persist an identity at rest. The wrapped key is a JSON envelope:

```json
{
  "v": 1,
  "kdf": "argon2id-aes256gcm",
  "m_kib": 65536,
  "t": 3,
  "p": 1,
  "salt": "<base64url, 16 bytes>",
  "iv":   "<base64url, 12 bytes>",
  "ct":   "<base64url, 32 priv bytes + 16 byte AEAD tag>",
  "pub":  "<base64url, 32 raw pubkey bytes — not secret>"
}
```

- KDF: Argon2id via `hash-wasm`, OWASP "moderate" (m=64 MiB, t=3, p=1).
- AEAD: AES-256-GCM (Web Crypto), fresh 12-byte IV per wrap.
- Errors: `BadPassphraseError` (subclass of `DecryptionError`) when the wrap
  key doesn't match. `DecryptionError` for tampered ciphertext.
  `InvalidFormatError` for envelope shape / version / KDF id violations.
- The envelope is at-rest only — never travels across the network. The native
  apps store it in the platform-native key store (SecureEnclave / StrongBox via
  `expo-secure-store`).

The wrap path is intentionally not interop-tested against another HPKE
implementation: aesmsg wrapped blobs live only in a aesmsg client's
local storage, so cross-implementation compatibility is irrelevant.

## Tests

Run `pnpm --filter @aesmsg/crypto test` (Node + browser).

| File | Purpose |
|---|---|
| `wire.test.ts` | base64url, base32, pubkey envelope, ciphertext blob codec |
| `errors.test.ts` | error class shapes |
| `identity.test.ts` | `generateIdentity` / `exportPublicKey` / `importPublicKey` |
| `fingerprint.test.ts` | format + stability + constant-time compare |
| `seal.test.ts` | seal/open round-trip + version/suite/AAD checks |
| `roundtrip.test.ts` | empty / 1-byte / 1KB / 1MB / UTF-8 + 200-iteration `fast-check` property |
| `negative.test.ts` | every clean-failure path (wrong key, tamper, AAD mismatch, etc.) |
| `interop.test.ts` | decrypts a ciphertext sealed by `pyhpke` (RFC 9180 reference impl) |
| `browser.test.ts` | round-trip in headless Chromium via Vitest browser mode |
| `test-only.test.ts` | `__test_only_identityFromIKM` — used by interop, NODE_ENV-guarded |
| `wrap.test.ts` | wrapPrivateKey / unwrapPrivateKey round-trip + negative |

The interop fixture is regenerated by
[`tests/fixtures/interop/generate.py`](tests/fixtures/interop/) — see that
folder's README. Python is required only at fixture regeneration time; the
test runtime reads the committed `vector.json`.

Coverage gate: ≥95% lines on `src/`.

## Why interop instead of RFC 9180 KAT vectors

RFC 9180 Appendix A does not contain a published KAT for our exact suite
(X25519 KEM + AES-256-GCM AEAD; A.1 is X25519 + AES-128, A.4 is P-521 +
AES-256). The committed `vector.json`, sealed by an independent RFC 9180
implementation (`pyhpke`), proves wire-format compliance more strongly than a
single fixed KAT would.

## Portability

DOM-free, network-free, storage-free. The same primitives run on:

- React Native / native mobile (the shipped iOS + Android apps) — on Hermes,
  `crypto.subtle` lacks X25519, so the pure-JS `@noble/curves` fallback is
  auto-selected (wire-format-identical, guarded by the RFC 9180 interop fixture).
- Server-side (Node) — used in tests only; never on the production server
  runtime, since the server never sees plaintext.

## What's NOT here

- At-rest key storage — the native apps own this, storing the wrapped envelope
  in the platform-native key store (SecureEnclave / StrongBox via
  `expo-secure-store`).
- Sender authentication (HPKE `mode_auth`).
- Key rotation, multi-device sync, forgot-passphrase recovery
  (the last is an intentional non-feature).
