# Metadata-Leakage Security Audit — aesmsg

**Date:** 2026-05-30
**Scope:** What a public observer learns from aesmsg's stored data when the *content* is safely encrypted.
**Status:** Audit / proposal. **No source was modified in this pass.**

---

## 0. Threat model (as commissioned)

Strict, deliberately pessimistic:

- **The entire backend store is world-readable.** Every column of every row in `links` and
  `link_ciphertexts`, *and* every ciphertext `blob`, is public. By extension the Redis
  rate-limit store is part of "the entire backend store" and is also readable.
- **The adversary can poll/scrape continuously over time** and keep their own archive. They
  see inserts, mutations (counter increments, status flips), and deletions as they happen.
- **HPKE is sound and recipient private keys are out of scope.** We are *not* asking whether
  plaintext can be decrypted — it can't. We are asking what the *surrounding data* reveals.

The crucial consequence, repeated throughout: **against a public store, hiding a field behind
an API check does nothing.** The API surface (`GET /api/messages/[id]`, `POST .../list`,
`.../open`) is unauthenticated today, but even if it were locked down, the columns it reads
are still public under this model. Real mitigation = *not storing the leaky value in
plaintext at rest*, or storing it in a coarsened/unlinkable form. The audit keeps the two
models distinct wherever the answer differs.

### Code surface reviewed

| Concern | File |
|---|---|
| Seal/open (no padding) | [`packages/crypto/src/seal.ts`](../../../packages/crypto/src/seal.ts), [`hpke.ts`](../../../packages/crypto/src/hpke.ts) |
| Wire blob framing | [`packages/crypto/src/wire.ts`](../../../packages/crypto/src/wire.ts) |
| Plaintext envelope | [`packages/crypto/src/payload.ts`](../../../packages/crypto/src/payload.ts) |
| AAD binding (what metadata is load-bearing) | [`packages/crypto/src/aad.ts`](../../../packages/crypto/src/aad.ts) |
| Recipient fingerprint derivation | [`packages/crypto/src/fingerprint.ts`](../../../packages/crypto/src/fingerprint.ts) |
| Storage schema | [`packages/server-store/migrations/0001_init.sql`](../../../packages/server-store/migrations/0001_init.sql) |
| Metadata persistence | [`packages/server-store/src/pg/link-metadata-store.ts`](../../../packages/server-store/src/pg/link-metadata-store.ts) |
| Ciphertext persistence | [`packages/server-store/src/pg/ciphertext-store.ts`](../../../packages/server-store/src/pg/ciphertext-store.ts) |
| Rate-limit keys (IP at rest) | [`packages/server-store/src/redis/rate-limit-store.ts`](../../../packages/server-store/src/redis/rate-limit-store.ts) |
| API exposure | [`apps/web/src/server/messages-handler.ts`](../../../apps/web/src/server/messages-handler.ts) |

### One load-bearing fact that constrains every mitigation

The AAD ([`aad.ts`](../../../packages/crypto/src/aad.ts)) binds, into the AEAD tag:
`linkId`, `SHA-256(raw recipient X25519 key)`, `createdAtMs`, `expiresAtMs`, `maxOpens`.
On open, the client **reconstructs this AAD** from the metadata the server hands back, then
calls `open()`. Therefore:

- **`created_at`, `expires_at`, `max_opens` are cryptographically load-bearing.** The recipient
  must receive them *byte-exactly* or the AEAD tag fails and `open()` throws `DecryptionError`.
  You cannot simply coarsen or drop these columns without also changing the AAD scheme or
  carrying the exact value inside the encrypted payload. (See §4.)
- **`recipient_fp` is NOT in the AAD.** The AAD hashes the *raw key*; `recipient_fp` is a
  *separate* SHA-256 of the canonical (`amk1:`-prefixed) key, truncated to 128 bits
  ([`fingerprint.ts`](../../../packages/crypto/src/fingerprint.ts)). It is purely informational.
  **It can be dropped or transformed at rest with zero impact on decryption.** This is what
  makes the highest-leverage mitigation cheap.

---

## 1. Field-by-field leak table

Stored fields: `links(id, status, created_at, expires_at, max_opens, opens_count, recipient_fp)`
and `link_ciphertexts(link_id, blob, size)`.

| Field | In isolation | In correlation | Under repeated polling over time |
|---|---|---|---|
| **`id` / `link_id`** (16-char base64url = 96-bit random) | Opaque, unguessable, carries no semantics. Good. | Primary/foreign key joining a row to its blob. | A *new row appearing* is itself an event the poller timestamps — see "the polling clock" below. The id never needs guessing here; the whole table is already public. |
| **`status`** (`active` / `revoked` / `expired`) | Lifecycle state of one secret. | `expired` is ambiguous *until* combined with `opens_count` vs `max_opens` and `expires_at` vs now: if `opens_count == max_opens` → "consumed/read to its limit"; if `expires_at < now` → "timed out". `revoked` is unambiguous and **distinct**: a human pressed *revoke*. | The transition is observable: `active → revoked` mid-life signals a manual recall — mistake, wrong recipient, suspected compromise, or panic. `active → expired` at `opens_count == max_opens` is a **read receipt for the final open**. The *sequence and timing* of these flips is sender/recipient behaviour, exposed to the world. |
| **`created_at`** (timestamptz, ms precision, client wall-clock within ±5 min of server) | Absolute UTC instant a secret was minted. | `expires_at − created_at` = the **chosen TTL**, drawn from a tiny known set (10m / 1h / 24h / 7d / custom) → reveals the sender's urgency/sensitivity judgement per message. | **Timing & timezone inference.** Group a recipient's messages (via `recipient_fp`, below) and histogram `created_at`: the clusters fall in that party's working hours → infers **timezone, business hours, sleep schedule, weekends, vacations**, and **incident spikes** (a burst of credential shares at 03:00 = an outage/rotation event). Inter-arrival times give traffic-analysis structure. |
| **`expires_at`** (timestamptz) | When the server copy becomes unavailable. | With `created_at`, yields the TTL bucket (above). | A countdown the world can watch; the moment a blob is *purged before* its `expires_at` flags a revoke even if `status` were hidden. |
| **`max_opens`** (`1` / `3` / `-1`) | The handoff pattern: `1` = single-use credential drop; `3` = small known audience; `-1` = broadcast-until-expiry. | With `opens_count`, gives "opens remaining". With TTL, profiles the use case (e.g. `max_opens=1` + 10m = a password handed off live). | Small discrete set → a clean classifier for *what kind of secret* this is. |
| **`opens_count`** (integer, monotonic) | How many times the recipient fetched the ciphertext. | With `max_opens` → opens remaining and "is it spent". | **World-visible read receipts with no consent.** Poll and watch `0 → 1`: the **exact instant the recipient opened** the secret. `created_at → first open` delta = recipient responsiveness / online pattern. Each subsequent increment is another access event. This is a cross-the-internet "Seen ✓✓" that neither party opted into. |
| **`recipient_fp`** (`SM-XXXX-…`, 128-bit, **deterministic per recipient public key**) | A stable pseudonym for *whoever holds that key*. | **Linkability / social graph.** Because the value is a pure function of the recipient's public key, **every link ever sent to the same recipient shares the same `recipient_fp`.** `GROUP BY recipient_fp` reconstructs, for the entire service: how many distinct recipients exist, how many secrets each receives, from how many senders (when joined with `created_at` clustering), and the **shape of the communication graph**. If the adversary independently learns *one* mapping (a published `amk1:` key → person, e.g. from a profile, an email signature, a contact card), that pseudonym **deanonymizes the whole cluster** retroactively and going forward. | Over time the cluster grows; the graph sharpens; a single later identity leak unmasks all historical and future links to that node. This is the single most damaging *metadata* field. |
| **`blob`** (bytea, the ciphertext) | Opaque bytes — content is safe. | Its **length** is not safe — see §2. | Archivable forever; ephemerality controls do not erase the adversary's copy — see §3. |
| **`size`** (integer) | Redundant copy of `length(blob)`. **Exact plaintext length = `size − 50`.** | Lets an observer classify "short token" vs "long document" *without even reading the blob* — see §2 for the proof against the two live rows. | Stable per row; trivially scraped. |

### The polling clock (a leak that has no column)

Even with `created_at` deleted, a continuously-polling adversary **timestamps each new row's
first appearance themselves**. So creation *time* is never fully hidden from this threat model;
dropping `created_at` removes the *self-reported, millisecond-precise, timezone-bearing*
timestamp and the `expires_at − created_at` TTL delta, but not the coarse "a secret was created
around now" signal. Stated honestly here so §4 doesn't over-promise.

### Out-of-band but in-scope: client IP in the Redis store

[`redis/rate-limit-store.ts`](../../../packages/server-store/src/redis/rate-limit-store.ts)
writes keys of the form `ratelimit:messages:<ip>:<window>` (and `…:get:`, `…:open:`,
`…:revoke:` variants), where `<ip>` comes from `x-forwarded-for` / `x-real-ip` in the handler.
Under "the **entire** backend store is public," scraping Redis maps **raw client IP addresses to
endpoint + 60-second window**. That correlates *senders to create events* and *readers to open
events* by IP and time — a deanonymization vector arguably worse than `recipient_fp`, and one
not in the original field list. **Flagged for the mitigations section (§4.6).**

---

## 2. Ciphertext length leak

### Does the seal path pad? No.

`seal()` → `sealHpke()` runs AES-256-GCM (`@hpke/core`,
[`hpke.ts`](../../../packages/crypto/src/hpke.ts)). GCM is CTR-mode: **ciphertext length ==
plaintext length**, plus a fixed 16-byte tag. `encodeCiphertextBlob()`
([`wire.ts`](../../../packages/crypto/src/wire.ts)) prepends a fixed 34-byte header
(`1` version + `1` suite + `32` encapsulated key). **Nowhere is the plaintext padded.** The
plaintext envelope ([`payload.ts`](../../../packages/crypto/src/payload.ts)) is also unpadded —
it is tightly length-prefixed (`textLen`, per-attachment `contentLen`).

### Exact leak

```
blob_size = 2 (header) + 32 (enc) + plaintext_len + 16 (GCM tag)
          = plaintext_len + 50
⇒  plaintext_len = blob_size − 50      (and size − 50 for the `size` column)
```

This is **exact, not approximate.** Verified against the two live production rows:

| `link_id` | `size` | Recovered plaintext | Interpretation |
|---|---|---|---|
| `jHc40kY3h-8i5c8E` | 64 | **14 bytes** | Minus the 7-byte v1 envelope header → ~7 bytes of text. A **short token / PIN / password**. |
| `rRbV3w5GGbo1j4rv` | 1873 | **1823 bytes** | ~1.8 KB of content. A **long note, config block, `.env`, or document**. |

An observer holding **only the `size` column** — or just the blob length — separates "a
credential" from "a document" with byte precision, and can track size *distributions* per
`recipient_fp` over time (e.g. "this recipient receives weekly ~4 KB blobs" = recurring
report/export). For many real secrets the length alone is near-identifying: a 26-char AWS
access key id, a 36-char UUID token, a 64-hex API key, a known vendor's fixed-format invoice
PDF — all have characteristic lengths.

### Proposed fix: fixed-bucket padding, applied BEFORE the HPKE seal

Padding must sit **inside the AEAD** (so it is encrypted, authenticated, and invisible to the
server — preserving zero-knowledge) and inside a **length-framed container** (so the recipient
can strip it deterministically). `seal()` receives an opaque `Uint8Array` with no framing of its
own, so padding cannot live there. The correct home is the **plaintext envelope** in
`payload.ts`, with the bucketing policy factored into a small pure module.

**Where it goes:**

1. **New module `packages/crypto/src/pad.ts`** — pure byte math, no DOM/network/storage (honours
   the package constraint). Exports the bucket policy:
   ```ts
   // fixed buckets for the common case…
   export const PAD_BUCKETS = [256, 1024, 4096] as const;
   // …then Padmé (Nikitin et al., PETS 2019) above 4096 to bound overhead on large attachments.
   export function targetPaddedLen(rawLen: number): number { /* next bucket ≥ rawLen, else Padmé */ }
   ```
   Fixed buckets below 4 KB cover tokens/notes/small configs; switching to **Padmé** above 4 KB
   caps padding overhead at ~12 % while leaking only `O(log log L)` bits of length — fixed
   small buckets would explode overhead on the 14 MB attachment ceiling.

2. **`packages/crypto/src/payload.ts`** — bump `PAYLOAD_VERSION` `0x01 → 0x02` and add a padding
   trailer *after* the attachments section, still inside the envelope (hence inside the AEAD):
   ```
   …attachments…
   u32 padLen
   ..  padLen zero bytes
   ```
   `encodePayload` calls `targetPaddedLen()` to choose `padLen` so the whole envelope lands on a
   bucket boundary; `decodeStrict` reads `padLen`, consumes the pad, then keeps its existing
   `off === bytes.length` trailing-bytes check. The v0x01 legacy-text fallback in
   `decodePayload` is unaffected (version byte distinguishes them).

3. **No change to `seal.ts`, `wire.ts`, `hpke.ts`, the schema, or the API.** The blob simply
   becomes `bucket + 50` bytes; `size` is stored as the padded length and stops being a precise
   oracle (it now reveals only the coarse bucket — see residuals §5).

**Cost:** storage/bandwidth overhead (bounded by the scheme), and a payload format version bump
with a migration note for in-flight pre-0x02 links (they remain readable via the unchanged
decoder paths).

---

## 3. Ephemerality under a public store

`expiry`, `max_opens`, and `revoke` are implemented as server-side state transitions plus
deletion of the server's blob copy (`expirePastDue()` and the `ON DELETE CASCADE` /
`DELETE FROM link_ciphertexts`). They are **availability controls, not erasure guarantees.**

Walk it through the threat model — an adversary who already scraped the blob:

- **Expiry** deletes the *server's* copy. The adversary's archived copy persists.
- **`max_opens`** caps *server-mediated* fetches. The adversary already holds the bytes; the cap
  is irrelevant to them. (It also means a silent scrape doesn't consume the legitimate
  recipient's open budget — but `opens_count` still leaks the legitimate opens, §1.)
- **Revoke** purges the *server's* copy. The adversary's copy persists. Worse, the *premature*
  purge is itself an observable event (a blob vanishing before `expires_at`).

**What ephemerality actually buys, stated plainly:**

- The plaintext stays confidential **only because HPKE does its job** — *not* because the
  ciphertext was "destroyed." Under a public store the ciphertext is, for practical purposes,
  **permanent**.
- aesmsg uses **HPKE base mode with a long-lived recipient key → there is no forward
  secrecy.** A *future* compromise of the recipient's private key **retroactively decrypts every
  archived ciphertext ever sent to that key.** "Self-destruct after 10 minutes" does **not**
  protect against this; the only thing standing between an archived blob and disclosure is the
  continued secrecy of one long-lived private key. This is the most important honest finding in
  the whole audit.

**Where the UI / product copy over-claims** (CLAUDE.md, `messanger.md`, the result/expired
screens):

| Claim | Reality under a public store |
|---|---|
| "Links can **self-destruct** (10m / 1h / 24h / 7d)." | The *server's* copy self-destructs. Any copy already fetched/scraped does not. |
| "Revocation **purges the ciphertext from the server**." | Literally true — *from the server*. It does not purge copies already pulled by the recipient or an interceptor. The word "purges" reads as global erasure. |
| "The message is **unrecoverable** on that device." (wrong-key) | True for *that device* / *wrong key*. Not a statement about archived ciphertext + future key compromise. |
| Implicit: expiry means "the secret is gone." | The secret's *ciphertext* may be gone from the server but not from the world; its *confidentiality* rests entirely on the private key, with **no forward secrecy**. |

**Recommended framing:** present expiry/max-opens/revoke as *"limits how long and how many times
the link stays fetchable from aesmsg"* — a window-of-availability control — and **never** as
"the content is destroyed everywhere." If stronger guarantees are wanted, they belong in crypto
(ephemeral/rotating recipient keys for forward secrecy), not in a server delete.

---

## 4. Mitigations, ranked by leverage

Leverage = (severity of leak removed) × (feasibility, given the AAD constraint in §0).

### 4.1 — HIGHEST: Replace `recipient_fp` with a per-link unlinkable token (or drop it)

**Leak killed:** social-graph linkability + retroactive deanonymization (§1, the worst
metadata field). **Feasibility:** high — `recipient_fp` is *not* in the AAD, so this never
touches decryption.

A spectrum, best first:

- **(a) Drop `recipient_fp` from storage entirely.** The recipient already possesses the link
  and their own key; they identify "is this mine?" by **trial decryption** — `open()` already
  returns a clean `DecryptionError` on the wrong key (the product's "wrong key = no decryption"
  invariant). The sender's `/links` page does **not** need the server's copy: per
  `apps/web/AGENTS.md` (Slice 7) the sender's local IndexedDB sent-links store already holds the
  recipient fingerprint client-side, and `<DashboardScreen>`/`<LinkRow>` read it from there.
  **Net: zero linkability at rest, no UX regression for single-key users.**
  - *One real UX cost, stated honestly:* the recipient's `<LandingScreen>` currently uses the
    server-returned fingerprint for a **pre-decryption** "this link is for a different key" hint
    ([`reader/LandingScreen.tsx:37`](../../../apps/web/src/reader/LandingScreen.tsx) compares it
    to `myFingerprint`). Without the stored value the reader cannot compute the *intended*
    fingerprint, so this pre-flight hint goes away — correctness is preserved (the user simply
    hits the existing `DecryptionError` path on a wrong-key attempt), but the friendlier
    "wrong key" pre-check is lost. Acceptable; it trades a minor hint for the biggest at-rest
    leak.
  - *Changes:* migration `0002` drops the column; stop requiring `recipientFingerprint` in the
    `POST /api/messages` body ([`messages-handler.ts:64,105,141`](../../../apps/web/src/server/messages-handler.ts));
    remove it from the `GET` / `open` / `list` responses (same file, lines 185, 227, 286); the
    sender UI keeps reading the local copy; the reader drops the pre-flight mismatch check (or
    keeps a softer post-decrypt version using its own derived fingerprint).

- **(b) If a server-side "which of my keys?" hint is genuinely required** (recipient holds many
  keys and won't trial-decrypt against all), move that hint **inside the encrypted payload**
  (a new optional envelope field in `payload.ts` v0x02) — then it is invisible to the server by
  construction.

- **(c) Weaker middle ground (only if (a)/(b) are rejected):** store a *per-link* token
  `H(link_id ‖ raw_recipient_key)[:8]` instead of the recipient-stable fingerprint. Each link
  gets a different value, so `GROUP BY` no longer clusters by recipient — **but** an adversary
  who already knows a candidate public key can recompute the token for every `link_id` and
  re-cluster. Public keys are semi-public (you hand them out to receive mail), so this only
  blocks adversaries who *don't* have the key. State this limitation explicitly; prefer (a).

**Recommendation: (a), with (b) reserved for the multi-key case.**

### 4.2 — HIGH: Fixed-bucket length padding (§2)

**Leak killed:** exact plaintext length (token-vs-document classifier, length-fingerprinting).
**Feasibility:** high, fully self-contained in `packages/crypto`, no schema/API change.
Implementation and exact location detailed in §2 (`pad.ts` + `payload.ts` v0x02 trailer).
Independent of every other mitigation — ship it on its own.

### 4.3 — MEDIUM-HIGH: Drop / coarsen `created_at` (requires AAD reconciliation)

**Leak reduced:** millisecond, timezone-bearing creation timestamp; and the
`expires_at − created_at` **TTL-bucket inference** (dropping `created_at` makes the delta
uncomputable). **Feasibility constraint:** `created_at` is **AAD-load-bearing** (§0) — naive
coarsening breaks `open()`. Two honest paths:

- **(a) Remove `createdAtMs` from the AAD** (`aad.ts`), keeping `linkId` (unique) + `expiresAtMs`
  (bounds validity) as the binding fields. `created_at` adds little authentication value beyond
  what `linkId` already provides. Then the column can be **dropped** (or coarsened to the day for
  ops). *Touches `aad.ts`, the handler, and is a wire-format/AAD version bump — all in-flight
  links keyed to the old AAD must be migrated or grandfathered by AAD version.*
- **(b) Keep the AAD as-is but carry the exact `createdAtMs` inside the encrypted payload**, and
  store only a coarse `created_at` (or none) in the DB. The recipient recovers the exact value
  from the decrypted envelope to rebuild the AAD. *Touches `payload.ts` (v0x02 field) + handler.*

Either way, **`expires_at` must remain** (the server enforces expiry and it is AAD-bound), so the
absolute expiry instant stays visible; coarsening it to the minute and/or adding jitter blunts
the TTL-preset inference further but carries the same AAD cost as `created_at`. Recommend **(a)**
as the cleaner long-term shape, bundled with the §4.2 version bump to amortize one migration.

### 4.4 — MEDIUM: Don't expose `opens_count` / `status` via unauthenticated API; collapse status

The user's question — *do these need to be world-readable at all?* — splits by threat model:

- **Against "anyone with the link_id" (the weaker, real-today model):** No. `GET`, `list`, and
  `open` currently return `opensCount` and `status` to any caller who knows the id, enabling
  casual read-receipt scraping. **Gate these behind sender/recipient proof** (e.g. a capability
  token in the URL *fragment* that never reaches the server in logs, checked server-side) so only
  the two parties see open-state. Enforcement (`max_opens`) needs `opens_count` server-side, but
  enforcement ≠ publication — the counter need not appear in any response.
- **Against the strict public-store model (this audit):** Hiding it from the API is **not enough**
  — the column itself is public. Genuine reduction:
  - **Collapse `status` to `active` / `inactive`** (stop distinguishing `revoked` from `expired`).
    This mutes the high-signal "human pressed revoke" event. (Residual: a blob disappearing
    *before* `expires_at` still implies a manual revoke — §5.)
  - **`opens_count` is a true residual** under this model: enforcement requires a per-link
    monotonic counter, and any plaintext counter at rest is a read receipt. Privacy-preserving
    open-counting (e.g. tokenized one-time fetch grants that don't persist a per-link tally) is
    possible but is real cryptographic engineering — **out of scope for Phase 1; document it as a
    known residual rather than pretending the API change fixes it.**

### 4.5 — LOW (given threat model): Remove the redundant `size` column

`size` duplicates `length(blob)`; since the blob is public here, dropping the column doesn't stop
the length leak — **§4.2 padding is the actual fix.** Worth doing as defense-in-depth for the
weaker model (where blob bytes might be access-controlled but a `size` column slips out via an
admin/metrics surface). Keep `size` in sync with the *padded* length once §4.2 lands.

### 4.6 — Adjacent but important: stop putting client IPs in the Redis store (§1)

`ratelimit:messages:<ip>:<window>` exposes sender/reader IPs under the public-store model.
**Mitigation:** key the limiter on a **salted hash** of the IP with a server-held secret salt
(`HMAC(salt, ip)`), or a coarse network bucket, instead of the raw IP; rely on Redis TTL so keys
don't linger. Keeps rate limiting functional while removing raw IPs at rest. *Touches
`redis/rate-limit-store.ts` and the `getClientIp` call sites in the handler.*

### Ranking summary

| # | Mitigation | Leak removed | Effort | AAD impact |
|---|---|---|---|---|
| 4.1 | Drop/blind `recipient_fp` | Social graph, deanonymization | Low | None |
| 4.2 | Bucket padding pre-seal | Exact plaintext length | Low-Med | None |
| 4.3 | Drop/coarsen `created_at` | Timing, timezone, TTL delta | Med-High | **Yes** (version bump) |
| 4.4 | Hide/collapse `opens_count`/`status` | Read receipts, revoke signal | Med | None |
| 4.6 | Hash IPs in Redis | Sender/reader IP at rest | Low | None |
| 4.5 | Drop redundant `size` | (defense-in-depth) | Low | None |

Bundle **4.3 + 4.2** into a single payload/AAD version bump to pay one migration. Ship **4.1**,
**4.4**, and **4.6** independently — none of them touch crypto.

---

## 5. Residual leaks (honest, after all mitigations)

Even with every mitigation above:

1. **Existence and the polling clock.** Rows exist; a continuous scraper timestamps each new row's
   appearance itself. Dropping `created_at` removes the precise, timezone-bearing, AAD-bound
   timestamp and the TTL delta — it does **not** hide that "a secret was created around now."
   Aggregate traffic volume and rhythm remain visible.
2. **Coarse size class.** Padding replaces an exact length with a bucket. Token-vs-document is
   blurred but not erased; Padmé still leaks `O(log log L)` bits. A 14-byte secret and a 9 MB
   attachment land in different buckets by necessity.
3. **Coarse lifetime.** `expires_at` must stay for server enforcement, so an approximate
   lifetime/urgency band is always visible (coarsening + jitter only blunt it).
4. **Deletion timing as a side channel.** With `status` collapsed and `opens_count`/responses
   hidden, a blob row **disappearing before its `expires_at`** still implies a manual revoke, and
   a blob disappearing *at* `expires_at` still marks consumption/timeout. The *fact and time of
   purge* is observable to a poller regardless of which columns exist.
5. **`opens_count` enforcement residual.** Any per-link monotonic counter kept for `max_opens`
   enforcement is, at rest, a read receipt — only removable by re-architecting open-counting
   (§4.4), which is beyond Phase 1.
6. **Weak timing co-occurrence.** Per-link unlinkable tokens break the at-rest social graph, but
   two links inserted within the same poll window can still hint at a batch/scripted send; large
   correlated bursts remain analyzable.
7. **Out-of-band identity correlation.** If the adversary learns a recipient's public key *and*
   the deployment kept any key-derived value (the §4.1(c) middle ground), re-clustering is
   possible. Only the full drop (§4.1(a)) closes this.

**Bottom line.** With content encryption assumed sound, aesmsg's residual exposure to a
world-readable, continuously-polled store is **traffic analysis**: that secrets exist, roughly
when, roughly how large, roughly how long they live, and when they are consumed or recalled —
plus, until §4.1 ships, *to whom* (linkable) and *exactly how large* (to the byte). The mitigations
collapse the high-signal, identity-bearing leaks (`recipient_fp`, exact length, ms timestamps,
read receipts, IPs) into coarse, non-identifying aggregates. They cannot make an inherently
public, append-then-delete store look empty — and the deepest finding is orthogonal to all of
them: **with no forward secrecy, every archived ciphertext is one private-key compromise away
from disclosure, which "self-destruct" does not change.**
