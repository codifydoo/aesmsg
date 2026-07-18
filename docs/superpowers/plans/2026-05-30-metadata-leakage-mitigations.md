# Implementation Plan — Metadata-Leakage Mitigations

**Date:** 2026-05-30
**Spec:** [`../specs/2026-05-30-metadata-leakage-audit.md`](../specs/2026-05-30-metadata-leakage-audit.md)
**Scope decision (locked by user):** full **drop** of `recipient_fp`; UI/copy scope =
backend/crypto + reader UI rework + honest in-app copy in React components. **Do NOT** edit
`all_design_screens/` mockups or the PRD/`messanger.md` in this pass (flagged as follow-ups).

## Review adjudication (2026-05-30, 4-lens adversarial review) — APPLIED

Verdict: **GO with edits**. Two reviewers analyzed a non-existent codebase (pipe-join
`serializeAad`/`envelope.ts`/`rowToMetadata.toISOString()`/`ACCESS_LOG_IP_HMAC_KEY`) — their
"blockers" are false positives against the real binary-AAD code. The surviving must-fix edits,
folded into the steps below:

- **A (crypto):** Pad bucket math must bucket on the **trailer-inclusive** length to avoid a
  negative `padLen`: `target = targetPaddedLen(bodyLen + 4); padLen = target - (bodyLen + 4)`
  (provably ≥ 0; `bodyLen` = envelope minus pad trailer; `+4` = the `u32 padLen` field).
- **B (crypto):** **No two-AAD acceptance.** AAD version is selected **deterministically by
  presence of `createdAtMs`** — present → v1, absent → v2 — in `encodeAad()`. This makes
  `seal()`/`open()` symmetric and **literally unchanged** (both already call `encodeAad(ctx)`):
  legacy/interop callers pass `createdAtMs` → v1 (byte-identical, stays green); new app code
  omits it → v2. The application layer drives v2 by omitting createdAt; the server returns
  `createdAt` only for legacy v1 rows (NULL for v2), so the recipient reconstructs the right
  AAD with a single attempt.
- **B-corollary:** **Keep `createdAt` (nullable) in the OPEN response** — it is load-bearing
  for decrypting the 2 live v1 rows. Drop it only from the GET preview (unused by clients) and
  never store it for new v2 rows. This corrects original step 3c.
- **C (crypto):** v2 pad-trailer parse uses explicit `need(4)`/`need(padLen)` → `InvalidFormatError`.
- **D (compat):** Add an `aad.test.ts` assertion that `encodeAad(interopCtx)` byte-equals the
  vector's `aad_encoded_hex`; add v2 as a NEW fixture; never mutate `vector.json`.
- **E (blast radius):** Explicit edits for `refresh-and-list.ts` (drop `entry.recipientFingerprint ??`,
  keep local `record.recipientFingerprint`), `fetch-and-open.ts:34/46`, `ReaderScreen.tsx:98`.
  **Corrected 4d:** mobile target is `reader/LandingScreen.tsx` + `api/client.ts`, NOT
  `LinkDetailsScreen`/`links-data.ts` (those are static mock data — DO NOT EDIT). DO-NOT-EDIT
  fence (legitimate local sender data): `sent-links-store.ts`, `CreateScreen.tsx`,
  `DashboardScreen.tsx`, `links/{types.ts,LinkRow.tsx,LinksTable.tsx}`, mobile `links-data.ts`.
- **F (security):** `hashIp` **fails closed** — in production throw if `RATE_LIMIT_IP_SALT` is
  unset or < 32 bytes; dev/test may use an empty/ephemeral salt.
- **G (crypto):** v2 AAD keeps absolute `expiresAtMs` safe-integer/positive + `maxOpens` guards.
- **H (crypto):** Padmé monotonicity/overhead tests at the bucket→Padmé seam.

Out-of-scope residuals acknowledged (not this pass): unauthenticated detail endpoint /
owner-gating, `opens_count` enforcement-vs-publication, coarsening legacy createdAt.

## Guiding constraints

- **Never silently break decryption of stored ciphertext.** The interop test vector
  (`packages/crypto/tests/fixtures/interop/vector.json`) is a v1-AAD blob sealed by `pyhpke`;
  it MUST keep decrypting. The 2 live DB rows (v1 envelope, createdAt-in-AAD) MUST keep
  decrypting until they age out (≤7d TTL).
- `packages/crypto` stays DOM/network/storage-free. No new deps.
- TDD throughout: every step red→green; full suite green before moving on.
- Follow `apps/web/AGENTS.md` import conventions (no extensions on static imports).

## Core insight that makes this safe

`createdAtMs` is bound **only in the AAD**, never in the ciphertext blob framing
(`wire.ts`). Padding changes the **plaintext envelope** (`payload.ts`, inside the AEAD), not
the blob framing. Therefore **`WIRE_VERSION` does NOT change** — `encodeCiphertextBlob` /
`decodeCiphertextBlob` are untouched. Version-awareness is handled at two independent layers:

1. **Payload version** (inside ciphertext): `PAYLOAD_VERSION 0x01 → 0x02` adds a pad trailer.
   `decodePayload` already version-branches; extend `decodeStrict` to accept v1 (no pad) and
   v2 (pad trailer). Legacy-UTF-8 fallback unchanged.
2. **AAD version** (reconstructed, never stored): new `AAD_VERSION 0x02` drops the
   `createdAtMs` field. `open()` picks the AAD version from **whether the caller supplies
   `createdAtMs`**: present (old rows, server still has it) → try v1 AAD; absent (new rows) →
   v2 AAD. Belt-and-suspenders: if createdAt is present, try v1 then fall back to v2.

This means: new messages never need `created_at` stored; old messages keep working via the
nullable column until expiry.

---

## Phase 1 — `packages/crypto` (foundation; everything depends on it)

### 1a. `src/pad.ts` (NEW) — bucket policy, pure byte math
- `export const PAD_BUCKETS = [256, 1024, 4096] as const;`
- `export function targetPaddedLen(rawLen: number): number` — smallest bucket ≥ rawLen; above
  4096 use **Padmé** (Nikitin et al., PETS 2019): `targetPaddedLen` rounds up to a value whose
  low bits are zeroed per Padmé, capping overhead ~12% while leaking O(log log L) bits.
- Pure, no imports beyond local. Unit tests: `tests/pad.test.ts` — boundaries (0, 1, 255,
  256, 257, 1024, 4095, 4096, 4097, large), monotonicity, overhead bound, `result ≥ rawLen`.

### 1b. `src/payload.ts` — PAYLOAD_VERSION 0x02 + pad trailer
- Bump `PAYLOAD_VERSION = 0x02`.
- `encodePayload`: after writing attachments, compute `padLen` so the **total envelope length
  == targetPaddedLen(unpaddedLen)**; append `u32 padLen` + `padLen` zero bytes. (Account for
  the 4 pad-length bytes themselves when solving for the bucket.)
- `decodeStrict`: accept version `0x01` (legacy: no pad trailer, current parse) **and** `0x02`
  (read attachments, then `u32 padLen`, consume `padLen` bytes, then keep the
  `off === bytes.length` trailing-byte check). Pad bytes are NOT required to be zero on read
  (authenticated already) — but assert they exist.
- Legacy UTF-8 fallback in `decodePayload` unchanged.
- Tests: `tests/payload.test.ts` — v2 round-trips, **v1 envelope still decodes** (hand-built
  v1 bytes), padded length lands on a bucket, pad survives binary content, legacy fallback.

### 1c. `src/aad.ts` — AAD v2 (no createdAt), keep v1 byte-identical
- Keep the **current encoder verbatim** as the v1 path (the interop vector's `aad_encoded_hex`
  depends on exact bytes). Rename internally to `encodeAadV1`; add `encodeAadV2` (no
  `createdAtMs`, `AAD_VERSION = 0x02`, drops the `expiresAtMs > createdAtMs` check, keeps the
  recipient-hash + linkId + expiresAt + maxOpens fields and the WIRE/SUITE header bytes).
- `MessageBindingContext.createdAtMs` becomes `createdAtMs?: number`.
- `encodeAad(ctx)` (the existing export): if `createdAtMs == null` → v2, else → v1. Add a
  helper `encodeAadForVersion(ctx, version)` or just export both encoders for `seal`/`open`.
- `AAD_VERSION` constant: keep `0x01`, add `AAD_VERSION_V2 = 0x02`.
- Tests: `tests/aad.test.ts` — v1 layout assertions **unchanged** (regression guard); new v2
  layout block (total length = v1 − 8; createdAt field absent; AAD_VERSION byte = 0x02).

### 1d. `src/seal.ts` — seal v2; open version-aware
- `seal`: build **v2 AAD** (no createdAt). `MessageBindingContext` passed by callers no longer
  needs createdAtMs.
- `open`: if `context.createdAtMs != null` → try v1 AAD; on `DecryptionError`, retry with v2
  AAD. If `createdAtMs == null` → v2 AAD only. Any failure → `DecryptionError` (unchanged
  external behavior).
- Tests: `tests/seal.test.ts` — new seal→open round-trip (v2, no createdAt); **open of a
  v1-sealed blob with createdAt still works** (regression); wrong-key/tamper/truncation
  unchanged. `tests/interop.test.ts` — vector still decrypts (it passes createdAtMs → v1 path).

### 1e. `src/index.ts`
- Export `PAD_BUCKETS`, `targetPaddedLen` (optional, for reuse/testing). `PAYLOAD_VERSION`
  already exported. Keep AAD encoders unexported (tests import from `./aad` directly).

**Gate:** `pnpm --filter @aesmsg/crypto test` + browser config green; interop + cross-backend pass.

---

## Phase 2 — `packages/server-store` (drop recipient_fp; createdAt nullable)

### 2a. `migrations/0002_drop_recipient_fp_and_nullable_createdat.sql` (NEW)
```sql
ALTER TABLE links DROP COLUMN recipient_fp;
ALTER TABLE links ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE links ALTER COLUMN created_at DROP DEFAULT;
```
(Old rows keep their `created_at`; new inserts write NULL. A future `0003` can drop the column
entirely once all v1 links have expired — noted, not done here.)

### 2b. `src/types.ts` — `LinkMetadata`: remove `recipientFingerprint`; `createdAt: Date | null`.
### 2c. `src/interfaces.ts` — `create(record: Omit<LinkMetadata, "opensCount" | "status" | "createdAt">)`
  (create no longer accepts createdAt — server stops storing it for new links).
### 2d. `src/pg/link-metadata-store.ts` — drop `recipient_fp` from all SQL; `INSERT` omits
  `created_at` (→ NULL); `Row.created_at: Date | null`; `rowToMeta` maps `createdAt: row.created_at`.
### 2e. `src/memory/link-metadata-store.ts` — drop `recipientFingerprint`; new rows `createdAt: null`.
### 2f. Tests: `tests/shared-link-metadata-suite.ts` (drop recipientFingerprint inputs/asserts;
  expect `createdAt: null` on create), `tests/pg.test.ts`, `tests/memory.test.ts`,
  `tests/migrate.test.ts` (0002 applies cleanly).

**Gate:** `pnpm --filter @aesmsg/server-store test` (memory always; pg/redis if DB env set).

---

## Phase 3 — `apps/web` (API + sender + reader + copy + IP hashing)

### 3a. `src/server/hash-ip.ts` (NEW) — `hashIp(ip): string` = `HMAC-SHA256(salt, ip)` hex,
  `salt = process.env.RATE_LIMIT_IP_SALT ?? ""` via `node:crypto`. Empty salt still removes
  cleartext IP; a real secret keys it. Unit test with/without salt.
### 3b. `src/lib/api-client.ts` — `CreateMessageRequest`: drop `recipientFingerprint` AND
  `createdAtMs`. `MessageMetadata`/`OpenMessageResponse`: drop `recipientFingerprint`, drop
  `createdAt`. `ListResultEntry`: drop `recipientFingerprint`.
### 3c. `src/server/messages-handler.ts` —
  - POST: drop `recipientFingerprint` + `createdAtMs` from `RequestBody`, validation, and the
    `create()` call; remove `FINGERPRINT_REGEX`; **keep** the createdAt sanity window removed
    (no longer relevant). Hash IP via `hashIp()` in all 5 rate-limit keys.
  - GET/open/list: remove `recipientFingerprint` and `createdAt` from responses.
### 3d. `src/create/encrypt-and-post.ts` — context omits `createdAtMs`; `seal` → v2; stop
  sending `recipientFingerprint`/`createdAtMs` to `postMessage`. **Keep** deriving
  `recipientFingerprint` locally (for the sent-links IndexedDB record + return value — local,
  sender-only, not a leak). Still records `createdAt` locally for the sender's own list.
### 3e. `src/reader/fetch-and-open.ts` — context omits `createdAtMs` (open uses v2; for any
  legacy link the server no longer returns createdAt, so v2 is correct). Derive the reader's
  **own** fingerprint locally (`fingerprint(exportPublicKey(identity))`) and return it as
  `recipientFingerprint` — truthful (successful decrypt proves it was sealed for this key).
### 3f. `src/reader/LandingScreen.tsx` — drop `recipientFingerprint`/`myFingerprint` props,
  the mismatch `<aside>`, and the "Sealed For" row (we can no longer know the intended
  recipient pre-decrypt). Honest copy pass on expiry/views recap.
### 3g. `src/reader/ReaderScreen.tsx` — stop passing `recipientFingerprint`/`myFingerprint` to
  `LandingScreen`; `DecryptedScreen` keeps showing the (now locally-derived) fingerprint.
### 3h. Honest-ephemerality copy (in-app React only): adjust strings in `LandingScreen`,
  `DecryptedScreen`, `LinkUnavailableScreen`, `ResultScreen`, and any expiry helper that says
  "self-destruct/destroyed" → "stops being available from aesmsg" framing. No mockup edits.
### 3i. Tests: `tests/server/messages-handler.test.ts`, `tests/lib/api-client.test.ts`,
  `tests/create/encrypt-and-post.test.ts`, `tests/reader/fetch-and-open.test.ts`,
  `tests/reader/LandingScreen.test.tsx`, `tests/reader/ReaderScreen.test.tsx`,
  `tests/integration/aad-binding.test.ts`, `tests/server/hash-ip.test.ts` (new), and the e2e
  flows (`open-flow`, `links-flow`, `contacts-flow`).

**Gate:** `pnpm --filter @aesmsg/web test` (Vitest browser mode).

---

## Phase 4 — `apps/mobile` (mirror shared-crypto + API changes)

### 4a. `src/api/client.ts` — mirror 3b.
### 4b. `src/create/create-and-seal.ts` — mirror 3d.
### 4c. `src/reader/fetch-and-open.ts` — mirror 3e.
### 4d. `src/reader/LandingScreen.tsx`, `src/links/LinkDetailsScreen.tsx` — adjust
  recipientFingerprint usage (derive own / drop server dependency).
### 4e. Tests: `tests/api-client.test.ts`, `tests/create-and-seal.test.ts`,
  `tests/fetch-and-open.test.ts`, `tests/reader-machine.test.ts`.

**Gate:** `pnpm --filter @aesmsg/mobile test`.

---

## Phase 5 — docs/env + full verification

- `.env.example` + `.env.local.example`: add `RATE_LIMIT_IP_SALT` with a comment.
- Update the audit spec with an "Implemented" addendum (what shipped vs. residual).
- Full gates: `pnpm typecheck`, `pnpm lint`, `pnpm test` (+ pg/redis integration if env up).
- Adversarial multi-agent review of the diff (crypto-correctness, backward-compat/data-loss,
  blast-radius completeness, security-of-mitigation).

## Residuals after this pass (unchanged from spec §5)
Polling clock; coarse size bucket; coarse lifetime (`expires_at` must stay); `opens_count`
enforcement residual (no auth/capability tokens this pass — explicitly deferred); deletion
timing; no-forward-secrecy. `created_at` persists for pre-existing v1 rows until they expire.
`size` column kept (post-padding it only leaks the coarse bucket).
