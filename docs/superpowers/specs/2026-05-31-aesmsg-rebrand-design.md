# aesmsg rebrand — design spec

- **Date:** 2026-05-31
- **Status:** Draft for review
- **Author:** brainstorming session (Claude + Davor)
- **Branch:** `claude/hardcore-aryabhata-97a508`

## 1. Goal

Rename the product and codebase from its current split identity
("SecureSend" in the web/mobile app shells, "SecureMsg" in design docs,
`@securesend/*` in package scope) to a single brand: **`aesmsg`** (all lowercase).

The rename is **full depth**: display name, npm scope, package names, behavioral
identifiers (URL scheme, bundle IDs, env vars, storage namespaces, dev DB
credentials), design artifacts, the crypto public-key wire prefix, and the
GitHub repository name.

This is feasible as a clean break because the project is pre-launch (Phase 0/1):
nothing is published to an app store, no production users hold existing links or
keys, and the only "stored" ciphertext in the repo is the crypto interop test
fixture.

## 2. Locked decisions

| Decision | Value |
|---|---|
| Product / wordmark | `aesmsg` (all lowercase) |
| Rename depth | Full, including the crypto public-key prefix |
| npm scope | `@securesend/*` → `@aesmsg/*` |
| Crypto pubkey prefix | `ssk1:` → `amk1:` ("aesmsg key, v1") |
| URL scheme | `securesend://` → `aesmsg://` |
| Bundle IDs (iOS+Android) | `com.securesend.app` → `com.aesmsg.app` |
| Env var prefix | `SECURESEND_*` → `AESMSG_*` |
| Dev DB credentials | `securesend` → `aesmsg` |
| GitHub repo | `codifydoo/securesend` → `codifydoo/aesmsg` |
| Logo direction | "the sealed a" (delivered separately as AI prompts) |

## 3. CRITICAL correction — there is no HPKE domain-separation brand tag

An earlier draft of this discussion claimed an HPKE `info` tag `"securesend/v1"`
existed and was bound into the AEAD key schedule. **That was incorrect.**
Verified in `packages/crypto/src/hpke.ts`: every seal/open uses the @hpke/core
context with **no `info` parameter** —
`createSenderContext({ recipientPublicKey })` and
`createRecipientContext({ recipientKey, enc })`. The HPKE `info` is therefore
empty, and no brand string participates in the key schedule.

**Consequence:** the only crypto-brand surface is the public-key *string*
serialization prefix (`ssk1:`). This is NOT part of any AEAD-authenticated bytes.

## 4. Why the crypto-prefix change is safe (no ciphertext change, no vector regen)

Confirmed by reading the crypto source:

1. **Ciphertext blob** (`wire.ts encodeCiphertextBlob`) =
   `[WIRE_VERSION 0x01][SUITE 0x01][enc 32B][aead output]`. The `ssk1:` ASCII
   prefix never appears in it.
2. **AAD** (`aad.ts encodeAad`) hashes the **raw 32-byte X25519 key**, explicitly
   "NOT the canonical ssk1-prefixed encoding" (see comment at `aad.ts:66`). So the
   prefix is not authenticated.
3. **Interop fixture** (`tests/fixtures/interop/vector.json`) stores everything as
   raw hex (`ikm_hex`, `recipient_pubkey_raw_hex`, `aad_encoded_hex`,
   `ciphertext_blob_hex`). No `ssk1:` string in any byte field — only the prose
   `_comment`. The interop test reconstructs the recipient from IKM, so the
   pubkey string is only used to derive the AAD recipient-hash, which hashes raw
   bytes.

Therefore renaming `PUBKEY_PREFIX "ssk1:" → "amk1:"` changes **zero ciphertext
bytes** and requires **no interop-vector regeneration and no Python/pyhpke run**.
The change is confined to:
- the prefix constant + the decode error string in `wire.ts`,
- test assertions that check the literal `ssk1:`,
- comment/doc/fixture *prose* references.

**Verification gate — RESOLVED:** confirmed that `fingerprint.ts` derives the
fingerprint from `decodePubkey(pk).canonical` (the decoded `[version][suite][raw
32B]` bytes), **not** the `ssk1:` ASCII prefix. So the prefix rename leaves every
fingerprint byte-identical, and dedup/verification state is unaffected.
`fingerprint.test.ts` (which pins expected values) remains the automatic backstop.

**However** `fingerprint.ts` carries a *separate*, user-visible brand relic:
`FINGERPRINT_PREFIX = "SM-"` (SecureMsg). Fingerprints render to users as
`SM-XXXX-XXXX-…` in the verification / my-identity UI. This is a display brand
token and is rebranded as part of this work → **`AM-`** (aesmsg). It is safe to
change (the comparison uses the full string consistently and there is no stored
data pre-launch); `fingerprint.test.ts` and any UI snapshot fixtures asserting
`SM-` update accordingly. **Confirm the `AM-` value during spec review.**

## 5. Rename inventory (by category)

~295 files contain `securesend`/`securemsg` (case-insensitive, excl.
`node_modules`/`.git`). Grouped by risk and concern:

### A. npm scope `@securesend/*` → `@aesmsg/*`
- `package.json` `name` fields (8): root `securesend`→`aesmsg`; `@securesend/{crypto,ui,key-store,design-tokens,server-store}`→`@aesmsg/…`; `@securesend/mobile`→`@aesmsg/mobile`; `apps/web` `"web"`→`"@aesmsg/web"` (new, for consistency).
- All import specifiers in `*.ts`/`*.tsx` (~179): crypto (120), ui (37), server-store (9), key-store (9), design-tokens (3), mobile (1).
- Root `package.json` scripts referencing `@securesend/server-store` (`migrate`, `test:integration`).
- `apps/web/package.json` workspace deps (lines 15–19).

### B. Product display name "SecureSend"/"SecureMsg" → "aesmsg"
- `apps/web/app/layout.tsx:22` `title` (and check the description copy).
- `apps/mobile/app.config.ts:18` `name`.
- READMEs (root, `apps/mobile`, `packages/crypto`), `docs/deploy.md`, `CLAUDE.md`, design briefs, plan/spec doc prose.

### C. Behavioral identifiers (pre-launch — safe to change)
- **Mobile `app.config.ts`:** `SECURESEND_HOST`→`AESMSG_HOST` (+ default `app.securesend.example`→`app.aesmsg.example`); `SECURESEND_API_BASE_URL`→`AESMSG_API_BASE_URL`; `slug`/`scheme` `securesend`→`aesmsg`; iOS `bundleIdentifier` + Android `package` `com.securesend.app`→`com.aesmsg.app`; `extra.securesendApiBaseUrl`→`aesmsgApiBaseUrl` (and its consumer in mobile src).
- **Mobile deep-link parsing:** `apps/mobile/src/navigation/parse-link-id.ts` (`securesend://`) + tests `parse-link-id.test.ts`, `parse-pasted-link.test.ts`.
- **Env example:** `apps/web/.env.local.example` (`SECURESEND_*`).

### D. Storage namespaces (client-side; pre-launch — safe)
- **Web IndexedDB:** `apps/web/src/lib/sent-links-store.ts` `securesend-sent-links`; `apps/web/src/lib/contacts-store.ts` `securesend-contacts` (+ a `securesend-contacts-verify` name — confirm via grep).
- **Mobile on-device keys/paths:** `securesend.device-secret` (`identity/device-secret.ts`), `securesend.wrapped-identity` (`identity/secure-store.ts`), `securesend.data-key` (`storage/data-key.ts`), `securesend.notification-prefs` (`notifications/prefs.ts`), `securesend.app-lock-timeout` (settings; also referenced in `apps/web/tests/settings-flow.e2e.test.tsx`), and the `securesend/` blob directory in `storage/file-blob-store.ts` (e.g. `securesend/contacts.enc`). Update each constant + its test.
- **Web server stores:** `apps/web/src/server/stores.ts` `globalThis.__securesend_stores` (a memoization global var name; lines 20, 40, 41, 43) → `__aesmsg_stores`.

### E. Dev database / infra
- `docker-compose.yml`: `POSTGRES_DB/USER/PASSWORD: securesend`, healthcheck `pg_isready -U securesend -d securesend`, volume `securesend-pgdata` → `aesmsg`. (Requires `pnpm db:reset` locally to drop the old volume + re-migrate; dev-only, no real data.)
- Root `package.json`: `test:integration` + `web:prod` embed `postgres://securesend:securesend@localhost:55432/securesend` → `aesmsg`.
- Test DB URL/name prefixes: `apps/web/tests/server/store-backend.test.ts` (`securesend:securesend`), `packages/server-store/tests/{migrate,pg}.test.ts` (`securesend_mig_`, `securesend_pg_`, `securesend_mig_err_`).

### F. Crypto pubkey prefix `ssk1:` → `amk1:` (see §4)
Files containing `ssk1`: `packages/crypto/src/wire.ts` (const + error string), `packages/crypto/src/aad.ts` (comment), `packages/crypto/tests/{wire,identity,negative,fingerprint,test-only}.test.ts`, `packages/key-store/tests/{identities,errors}.test.ts`, `apps/web/tests/identity-context.test.tsx`, `packages/ui/tests/QrCodePreview.test.tsx`, `packages/crypto/README.md`, `packages/crypto/tests/fixtures/interop/{generate.py,vector.json,README.md}` (prose only), and `docs/` specs/plans.

### F2. User-visible fingerprint prefix `SM-` → `AM-` (see §4)
- `packages/crypto/src/fingerprint.ts` `FINGERPRINT_PREFIX = "SM-"` → `"AM-"`.
- Update assertions/fixtures expecting `SM-` (e.g. `packages/crypto/tests/fingerprint.test.ts`, any UI components/tests rendering fingerprints). Grep `"SM-"` and `SM-` across `packages` + `apps` to find display sites.

### G. Design artifacts (`all_design_screens/`)
- Folder/file names `*_securemsg*` → `*_aesmsg*` (e.g. `landing_page_securemsg/`, `mobile_home_securemsg/`, `project_prd_design_brief_securemsg.md`, `securemsg_proposed_screen_list.md`) + internal references. `secure_message_design_system/` dir name: optional rename.

### H. Repo / git
- `gh repo rename aesmsg -R codifydoo/securesend`, then `git remote set-url origin git@github.com:codifydoo/aesmsg.git`. Update doc references to the old repo path. (GitHub auto-redirects the old URL.)

## 6. Out of scope (unless explicitly requested)
- `.claude/workflows/securemsg-mobile-screens*.js` skill **filenames** (renaming may break skill invocation) — update internal copy only.
- Historical dated plan/spec **filenames** under `docs/superpowers/` — update their brand prose, keep the filenames.
- Cross-session memory files — updated at the very end of execution.

## 7. Execution strategy

Subagent-driven (per standing preference), partitioned to avoid file conflicts:

1. **Scope sweep (one coordinated unit, not parallel):** `@securesend/*`→`@aesmsg/*`
   across all `package.json` names + every import specifier + root scripts, then
   `pnpm install` to refresh the lockfile. This is cross-cutting and must be one
   atomic pass.
2. **Display name + docs** (parallelizable): web/mobile shells, READMEs, CLAUDE.md, design briefs.
3. **Mobile identifiers + storage namespaces** (one unit): `app.config.ts`, deep-link parsing, on-device key constants + their tests.
4. **Web storage + infra** (one unit): IndexedDB names, `stores.ts`, docker-compose, root DB-URL scripts, server-store test prefixes.
5. **Design artifacts** (one unit): folder/file renames + references.
6. **Crypto prefix** (isolated, last code change before verify): `ssk1:`→`amk1:` + error string + assertions + fixture prose. Run crypto tests immediately.
7. **Repo rename** (final): `gh` rename + remote update + doc references.

## 8. Verification gate (all must pass before "done")
From repo root:
- `pnpm install` (lockfile reflects scope rename),
- `pnpm typecheck`,
- `pnpm lint` (Biome),
- `pnpm test` (was 402 tests) — **with explicit attention to** crypto `interop`, `cross-backend`, `negative`, and `fingerprint` suites.
- Final sweep: `grep -rilE "securesend|securemsg" . --exclude-dir=node_modules --exclude-dir=.git` returns only intentionally-frozen historical docs (target: zero in code/config).

## 9. Risks & mitigations
- **Fingerprint depends on prefix** (low likelihood): caught by `fingerprint.test.ts`; if it fails, stop and reconsider renaming the prefix.
- **Missed import specifier breaks build:** `pnpm typecheck` + `pnpm test` catch it; the final grep sweep is the backstop.
- **Local dev DB stale after cred rename:** documented `pnpm db:reset` step; dev-only.
- **Mobile native rebuild needed** for bundle-ID/scheme change: noted for the next device build; not blocking for the rename PR.
