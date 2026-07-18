# aesmsg security model

This document describes, honestly and precisely, what aesmsg's cryptography does and
does **not** protect. It is written to be accurate to the code in
[`@aesmsg/crypto`](../packages/crypto/README.md), not to marketing copy. Where a
property is a deliberate design tradeoff — most importantly, the **absence of forward
secrecy** — it is stated plainly here.

aesmsg is an **encryption layer over channels you already use** (Slack, WhatsApp,
email, SMS, …). It is not a chat app. You encrypt content on your device, upload only
ciphertext, get back a link, and paste that link into whatever channel you like. The
channel only ever carries an opaque pointer.

> **Copy discipline:** this product never claims "unbreakable", "impossible to hack",
> or "military-grade". The accurate claims are **end-to-end encrypted**, **zero-knowledge
> backend**, and **private keys stay on your device**. This document holds itself to the
> same standard — it describes bounded guarantees, not absolutes.

---

## 1. What the model IS

### 1.1 Primitive: HPKE (RFC 9180)

Each message is sealed with **HPKE (RFC 9180) `mode_base`** via
[`@hpke/core`](https://github.com/dajiaji/hpke-js). The suite is fixed:

| Component | Choice |
|---|---|
| KEM | `DhkemX25519HkdfSha256` (DHKEM over X25519, HKDF-SHA256) |
| KDF | `HkdfSha256` |
| AEAD | `Aes256Gcm` (AES-256-GCM) |

Verified against [`packages/crypto/src/hpke.ts`](../packages/crypto/src/hpke.ts)
(`buildSuite` wires exactly `DhkemX25519HkdfSha256` + `HkdfSha256` + `Aes256Gcm`) and
[`packages/crypto/README.md`](../packages/crypto/README.md#suite-hpke-sealopen).

On React Native / Hermes, where Web Crypto lacks X25519, a pure-JS `@noble/curves` KEM
is selected transparently and produces a **byte-identical** HPKE wire format (guarded by
an RFC 9180 interop fixture). KDF and AEAD are identical across all targets.

### 1.2 Per-message ephemeral sender key, sealed to a long-lived recipient key

HPKE `mode_base` generates a **fresh ephemeral sender keypair for every `seal()` call**.
The ephemeral public key is encapsulated into the 32-byte `enc` value that prefixes the
ciphertext blob (`sealHpke` in
[`hpke.ts`](../packages/crypto/src/hpke.ts) returns `senderCtx.enc`; the wire layout is
`version || suite || enc[32] || aead_output` per the
[README](../packages/crypto/README.md#wire-formats-versioned)).

Crucially, the message is sealed to the **recipient's long-lived identity public key**
(`seal()` in [`seal.ts`](../packages/crypto/src/seal.ts) takes a
`RecipientPublicKey` derived from the recipient's persistent `amk1:` key). The sender key
is ephemeral; **the recipient key is not.** That asymmetry is the whole reason there is no
forward secrecy — see [§2](#2-no-forward-secrecy).

### 1.3 AAD binds link metadata into the ciphertext

Every seal/open passes an **Additional Authenticated Data (AAD)** blob that binds the
link's metadata to the ciphertext, so a malicious server cannot serve one of the
recipient's ciphertexts under a different link ID or with altered limits. The AAD is
built by [`encodeAad`](../packages/crypto/src/aad.ts) and covers:

- an AAD version byte, the wire version, and the suite byte;
- the **link ID** (exactly 16 bytes);
- a **SHA-256 hash of the recipient's raw X25519 public key** (binds the intended
  recipient; note this hash is *not* the same value as the user-facing fingerprint);
- `createdAtMs` **only** for legacy v1 links (v2 drops it so the server never stores it);
- `expiresAtMs` and `maxOpens`.

`open()` reconstructs this AAD from the same context; any mismatch — wrong link ID,
tampered expiry/max-opens, malformed metadata — fails as a **terminal `DecryptionError`,
never a retryable error** ([`seal.ts`](../packages/crypto/src/seal.ts) lines around the
`encodeAad`/`openHpke` try blocks). There is intentionally **no v1↔v2 AAD fallback**: one
ciphertext authenticates under exactly one AAD.

### 1.4 Zero-knowledge backend

The server stores only **ciphertext + minimal metadata**: link ID, ciphertext blob,
status, expiry, max-opens, and open count. It never receives plaintext, private keys,
message previews, filenames, or mimetypes — filenames and mimetypes live *inside* the
AEAD-sealed envelope ([`payload.ts`](../packages/crypto/src/payload.ts)). The operator
metrics and abuse-purge surfaces are aggregate- or single-id-scoped and expose no
plaintext; see the [ops runbook](./ops-runbook.md).

### 1.5 MitM defense: manual fingerprint verification

Trust in a recipient's public key is established by comparing a **fingerprint** out of
band (read aloud, or QR scan), not by trusting the server's copy of a key. The
fingerprint ([`fingerprint.ts`](../packages/crypto/src/fingerprint.ts)) is:

```
"AM-" || first 128 bits of SHA-256( 34-byte canonical public-key bytes ), as 8 hex groups
```

e.g. `AM-A91C-22F0-78BB-19D2-…`. Comparison is constant-time (`compareFingerprint`). If
two people confirm identical `AM-…` fingerprints, a network attacker cannot have
substituted a key in between (a machine-in-the-middle would present a *different*
fingerprint). This is the product's defense against key substitution; the crypto alone
cannot detect a swapped key without this human step.

### 1.6 Key rotation (shipped in the app)

App-level **key rotation with old-key retention is a shipped feature** (PRD feature 2.3,
roadmap 2.4).
A user can rotate to a new identity keypair while **retaining their old private keys on
the device**, so that in-flight and previously-sent links sealed to a prior key still
open.

On rotation the app generates a fresh keypair that becomes the **active** identity used
for all new sends and receives; the previous keypair is moved into a **retained,
device-secret-wrapped** retired set, kept under the *same* at-rest protection as the
active key. The write is crash-safe — the retired blob is persisted **before** the active
pointer is flipped — so a crash leaves the identity either fully rotated or unchanged,
never bricked. The recipient reader then tries the active key first and falls back through
the retired keys, so messages already sealed to an old key still decrypt. The new key's
**fingerprint is surfaced for re-verification** so contacts can re-confirm it out of band.
Rotation therefore caps how many *future* messages a compromised *old* key can ever read.

Verified against
[`apps/mobile/src/identity/identity-machine.ts`](../apps/mobile/src/identity/identity-machine.ts)
(`rotate()` generates the new active key and retains the retired private key under the
device secret, with crash-safe write ordering),
[`apps/mobile/src/keys/KeysFlow.tsx`](../apps/mobile/src/keys/KeysFlow.tsx) (wires
`actions.rotate()` behind the Rotate-Key / Rotate-Success screens),
[`apps/mobile/src/identity/decrypt-keys.ts`](../apps/mobile/src/identity/decrypt-keys.ts)
(reader tries the active key then each retired key — consumed in
`navigation/ReaderFlow.tsx`), and
[`apps/mobile/tests/keys-rotate-enabled.test.ts`](../apps/mobile/tests/keys-rotate-enabled.test.ts).

> **Scope nuance:** rotation is **orchestrated in the app**, not exposed as a primitive by
> `@aesmsg/crypto`. That package lists "key rotation" under its
> [What's NOT here](../packages/crypto/README.md#whats-not-here) because it deliberately
> ships no rotation *function* — the multi-key retention and legacy-link fallback live in
> the mobile identity layer above it. The user-facing capability is shipped; only the
> in-package crypto primitive is intentionally absent.

### 1.7 Private keys at rest

Private keys never leave the device except as a user-initiated **encrypted backup**. In
both cases the private key is wrapped with **Argon2id (RFC 9106)** → **AES-256-GCM**
([`wrap.ts`](../packages/crypto/src/wrap.ts),
[`argon2.ts`](../packages/crypto/src/argon2.ts)) — but the two contexts deliberately use
**different Argon2id cost parameters**, because they defend against different things:

- **Exported passphrase-protected backup file — heavy Argon2id (m = 64 MiB, t = 3, p = 1).**
  A backup is unlocked by a **human passphrase**, a low-entropy secret an attacker could
  brute-force offline if they obtain the file. The heavy, memory-hard cost is what makes
  each guess expensive. This is
  [`DEFAULT_WRAP_KDF_PARAMS`](../packages/crypto/src/wrap.ts) and is the default for
  `wrapPrivateKey`.
- **On-device at-rest wrap — lighter Argon2id (m = 2 MiB, t = 1, p = 1).** On the device,
  the key-encryption key is derived not from a passphrase but from a **256-bit random
  device secret** (a CSPRNG value held in the biometric-gated platform key store). With
  256 bits of entropy there is no brute-forceable surface at all (2²⁵⁶ candidates), so
  memory-hardness buys **no additional security** — it would only cost ~a minute of pure-JS
  Argon2id on Hermes at every unlock for zero benefit. The device secret itself is what
  gates access, and it is protected by the OS keystore + biometrics, not by the KDF cost.
  This is
  [`MOBILE_KDF_PARAMS`](../apps/mobile/src/identity/kdf-policy.ts).

This split is a **deliberate, sound design**, not a weakness: heavy KDF where a human
passphrase is the only barrier, light KDF where the barrier is already a full-entropy
random key behind the keystore. The message crypto and the at-rest AES-256-GCM wrap are
unchanged in both cases — only the KEK-derivation cost differs. On native, the wrapped
envelope lives in the platform key store (Secure Enclave / StrongBox via
`expo-secure-store`) behind a biometric/device-secret gate.

---

## 2. NO FORWARD SECRECY

**aesmsg does not provide forward secrecy. State this plainly.**

Messages are sealed to a recipient's **long-lived identity key**, not to an ephemeral,
per-conversation ratchet key (there is nothing like Signal's Double Ratchet here). The
HPKE ephemeral key protects the *sender* side of each message, but the *recipient's*
decryption key is the same static X25519 private key across all their messages.

**Consequence:** if a recipient's **private key** is ever compromised — device
extraction, or an offline brute-force of a weak backup passphrase — that key
**retroactively decrypts the plaintext of any past message an attacker can still get the
ciphertext for.** This is the defining property of a long-lived identity key: aesmsg has
**no forward secrecy** for the recipient's static decryption key.

Concretely, an attacker who **captured a ciphertext while it was live** (off the wire, or
from a snapshot of the store) and **later obtains the recipient's private key** can
decrypt that ciphertext. No key-erasure on the server can prevent this, because the
attacker already holds the bytes.

### 2.1 Mitigations that BOUND the exposure (but are not forward secrecy)

The following measures shrink *how much* past ciphertext is retrievable, and *how long*.
They are real and worth relying on — but they are operational bounds, **not** a
cryptographic forward-secrecy guarantee:

- **Server-side ciphertext is purged the moment a link goes terminal** — on **expiry**,
  on the **last allowed open**, or on **revoke**. The purge is transactional with the
  status flip (see the pg store's atomic open-consume-and-purge CTE and the
  `expirePastDue()` sweep; operator-side detail in the
  [ops runbook §3](./ops-runbook.md#3-purge-a-reported-link-id-abuse--csam--legal)). So a
  ciphertext that has already expired/been fully opened/been revoked is usually **no
  longer retrievable from the server at all** — a later key compromise finds nothing there
  to decrypt.
- **Private keys never leave the device** unencrypted, and are Argon2id + AES-256-GCM
  wrapped behind a biometric/device-secret gate ([§1.7](#17-private-keys-at-rest)),
  raising the bar to obtain the key in the first place.
- **Key rotation** ([§1.6](#16-key-rotation-shipped-in-the-app)) caps
  which *future* messages a compromised *old* key can read.
- **A global server retention ceiling bounds *active* links, not just terminal ones.**
  Independently of the per-link expiry / last-open / revoke purges above, the API rejects
  (opaque `400`) any create whose lifetime (`expiresAt − now`) exceeds a global ceiling —
  **default 365 days**, configurable via **`AESMSG_MAX_RETENTION_MS`** (plus a ~1 hour
  clock-skew grace). This is the reason the client offers a bounded "1 year (maximum)"
  option and no "never" / "forever" one: no link can outlive the ceiling, so the
  zero-knowledge backend cannot be turned into a permanent blob host. The server
  **rejects rather than clamps**, because the chosen `expiresAt` is bound into the HPKE AAD
  and the recipient rebuilds that AAD from the server-returned metadata — silently changing
  `expiresAt` would break decryption, so the client must resend a ceiling-compliant expiry it
  also sealed with.

### 2.2 The precise boundary

> The purge mitigations reduce the **window during which a past ciphertext remains
> retrievable** from the server. They do **not** provide forward secrecy: any ciphertext
> an adversary captured **while it was live** stays decryptable if that adversary later
> obtains the recipient's private key. Forward secrecy would make a past message
> undecryptable *even to someone holding both the captured ciphertext and the current
> long-term key* — aesmsg does not offer that today.

---

## 3. What is NOT protected / out of scope

- **Metadata the server necessarily sees.** To route, expire, and rate-limit links, the
  backend inherently observes: the **link ID**, **expiry**, **max-opens** / open count,
  **timing** (creation and open times), and **ciphertext size**. Content, filenames, and
  mimetypes are inside the AEAD envelope and are not exposed; ciphertext **size** is
  blunted by **Padmé length-hiding padding** applied inside the sealed plaintext
  ([`pad.ts`](../packages/crypto/src/pad.ts),
  [`payload.ts`](../packages/crypto/src/payload.ts), `PAYLOAD_VERSION 0x02`), which leaks
  only `O(log log L)` bits of length — but size is bucketed, not fully hidden.
- **Traffic analysis.** Who creates/opens which links, and when, is observable to the
  backend operator and to a network observer positioned to watch the API. aesmsg does not
  mix, delay, or anonymize this traffic.
- **A compromised endpoint device.** If the sender's or recipient's device is compromised
  (malware, a hostile OS, physical extraction with the key unlocked), the crypto cannot
  help — plaintext and the unlocked private key are on that device.
- **Plaintext after the recipient decrypts it.** Once decrypted, the content is the user's
  responsibility. The client mitigates leakage (clipboard auto-clear, background blur,
  screenshot blocking where the platform allows, biometric-gated opens) but cannot
  guarantee the plaintext isn't screenshotted, copied, or forwarded.
- **The transport channel.** The link is pasted into Slack / WhatsApp / email / SMS. That
  channel sees the **link** (a pointer), never the plaintext or the private key — but the
  channel does learn that a link was sent, to whom, and when. A link on its own, without
  the recipient's private key, is useless for decryption.
- **Sender authentication.** The suite is HPKE `mode_base`, **not** `mode_auth`, so a
  ciphertext does not cryptographically prove *who* sealed it. Recipient trust comes from
  the out-of-band fingerprint of the *recipient's* key, not from an authenticated sender
  identity. (Listed under "What's NOT here" in the
  [crypto README](../packages/crypto/README.md#whats-not-here).)
- **Pro entitlements are enforced client-side only (v1) — SEC-6.** The API is
  unauthenticated and has no notion of accounts or tiers, so "Pro" features (custom expiry,
  larger attachments, priority support) are gated entirely in the honest client and are
  therefore **self-grantable** by a modified client. This is an accepted v1 tradeoff, not a
  cryptographic capability. Crucially, the **server-side limits do not depend on Pro status**:
  the retention ceiling ([§2.1](#21-mitigations-that-bound-the-exposure-but-are-not-forward-secrecy)),
  the ciphertext-size cap, and the per-IP rate limits apply **uniformly to everyone**, so a
  self-granted "Pro" client cannot exceed them. Per-tier server enforcement would require
  introducing authenticated identity, which is out of scope for the current no-accounts,
  zero-knowledge posture.

---

## 4. Threat model summary

"Live" below means a link that has not yet expired, been fully opened, or been revoked
(its ciphertext is still stored). "Purged" means terminal — the ciphertext is gone from
the server.

| Adversary | Can do | Cannot do |
|---|---|---|
| **Backend operator / scraped backend DB** | See link IDs, expiry, max-opens, open counts, timing, and **padded** ciphertext size; hold ciphertext blobs of **live** links; observe API traffic patterns. | Read any plaintext; recover private keys; read previews/filenames; recover ciphertext already purged on expiry/last-open/revoke. Zero-knowledge holds — the server never has a decryption key. |
| **Network machine-in-the-middle** | Observe that links/opens happen and their timing; attempt to substitute a recipient's public key. | Decrypt ciphertext (AES-256-GCM + X25519); succeed at key substitution **if** the parties verify the `AM-…` fingerprint out of band (mismatched fingerprint exposes the swap). |
| **Someone who later obtains a device's private key** (extraction or brute-forced backup passphrase) | Decrypt **any past ciphertext they can still get** — i.e. links still live, or ciphertext they captured earlier while it was live. **This is the no-forward-secrecy exposure.** | Decrypt ciphertext that was purged on terminal transition **and** which they never captured while live (there are no bytes left to decrypt); read messages sealed only to a *rotated-away* key they don't hold. |
| **Someone who only has the link** | Fetch the opaque landing/pointer; consume an open if they take an explicit fetch action within limits. | Decrypt anything — the link is a pointer, not a secret; decryption requires the recipient's private key, which the link does not contain. |

---

## 5. Copy rules for anything that surfaces this model

- **Never** say "unbreakable", "impossible to hack", or "military-grade".
- **Do** say **end-to-end encrypted**, **zero-knowledge backend**, **private keys stay on
  your device**, **only the intended recipient can decrypt**.
- **Do not** imply forward secrecy, perfect secrecy, or that a stolen key can't read old
  messages. It can, for anything still retrievable — [§2](#2-no-forward-secrecy).
- Keep deep crypto terminology behind an "advanced" / expandable surface; the primary
  flows should read as a calm SaaS product.
- If a detail is uncertain, describe it **conservatively** and cite the source file rather
  than overclaiming — the same rule this document follows.

---

## Sources verified against

Crypto claims in this document were checked against the following source files (not
against README prose alone):

- [`packages/crypto/src/hpke.ts`](../packages/crypto/src/hpke.ts) — suite = X25519 KEM +
  HKDF-SHA256 + AES-256-GCM; per-seal ephemeral `enc`; native/noble KEM parity.
- [`packages/crypto/src/seal.ts`](../packages/crypto/src/seal.ts) — seal-to-recipient-key,
  AAD binding, terminal `DecryptionError` on any AAD/parse/AEAD failure.
- [`packages/crypto/src/aad.ts`](../packages/crypto/src/aad.ts) — exact AAD field layout
  (version/suite, link ID, recipient-key hash, expiry, max-opens; v1-only createdAt; no
  fallback).
- [`packages/crypto/src/fingerprint.ts`](../packages/crypto/src/fingerprint.ts) — `AM-`
  128-bit fingerprint, constant-time compare.
- [`packages/crypto/src/argon2.ts`](../packages/crypto/src/argon2.ts) /
  [`wrap.ts`](../packages/crypto/src/wrap.ts) — Argon2id (RFC 9106) → AES-256-GCM wrap;
  `DEFAULT_WRAP_KDF_PARAMS` (64 MiB/3/1) for the passphrase backup — and
  [`apps/mobile/src/identity/kdf-policy.ts`](../apps/mobile/src/identity/kdf-policy.ts)
  `MOBILE_KDF_PARAMS` (2 MiB/1/1) for the on-device wrap over the 256-bit device secret.
- [`apps/mobile/src/identity/identity-machine.ts`](../apps/mobile/src/identity/identity-machine.ts) /
  [`keys/KeysFlow.tsx`](../apps/mobile/src/keys/KeysFlow.tsx) /
  [`identity/decrypt-keys.ts`](../apps/mobile/src/identity/decrypt-keys.ts) — shipped
  app-level key rotation: new active key, retained device-secret-wrapped retired keys,
  crash-safe write ordering, and active-then-retired reader fallback.
- [`packages/crypto/src/pad.ts`](../packages/crypto/src/pad.ts) /
  [`payload.ts`](../packages/crypto/src/payload.ts) — Padmé length-hiding padding inside
  the sealed envelope.
- [`packages/crypto/README.md`](../packages/crypto/README.md) — suite table, wire formats,
  and the "What's NOT here" list (no `mode_auth` sender auth; key rotation not in-package).

Related product/ops references:

- [`docs/ops-runbook.md`](./ops-runbook.md) — terminal-transition ciphertext purge and the
  operator abuse-purge tool.
</content>
</invoke>
