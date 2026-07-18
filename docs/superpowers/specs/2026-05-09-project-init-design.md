# Project initialization — design spec

**Date:** 2026-05-09
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)

## 1. Context

The `aesmsg` repo currently contains design artifacts only — 21 screen mockups in `all_design_screens/`, a PRD, an extended product brief, a screen-list document, and a design-system spec (`DESIGN.md`). There is no code, build system, or git history yet.

This spec covers the work of **initializing the project**: laying down the monorepo structure, tooling, and package boundaries that Phase 1 implementation will build on. It does **not** plan or implement Phase 1 itself — that follows in a later spec.

The product (aesmsg / aesmsg) is a zero-knowledge encryption layer that sits on top of existing communication channels. See `CLAUDE.md` and `all_design_screens/project_prd_design_brief_aesmsg.md` for product context.

## 2. Goals

- Establish a monorepo skeleton that can host the web app today and absorb mobile + shared packages later.
- Commit to a stack that survives Phase 1 → 3 without rework.
- Set up tooling (package manager, TS config, lint/format, license, README) so contributors land on a consistent baseline.
- Lay package boundaries that isolate the trust-critical code (crypto, storage adapter) from UI code.
- Make the deferred decisions (mobile stack, deployment automation, CI) explicit, not implicit.

## 3. Non-goals

- No Phase 1 application code beyond a Next.js placeholder route.
- No real backend logic, authentication, or storage implementation — only the adapter interface.
- No mobile app code, biometric flows, or enterprise admin features (Phase 2/3).
- No CI pipeline, no Sproobo deploy automation — both deferred until a vertical slice exists.
- No migration of the design HTML mockups into React components yet — that is per-screen Phase 1 work.

## 4. Repository layout

```
aesmsg/
├─ apps/
│  ├─ web/                       Next.js (latest stable), TS strict — Phase 1 frontend + API routes
│  └─ mobile/
│     └─ DECISION-DEFERRED.md    Mobile stack (RN / KMM / native) revisited at Phase 2
├─ packages/
│  ├─ crypto/                    Encryption primitives, no DOM/network deps
│  ├─ ui/                        Shared React components, migrated incrementally from all_design_screens
│  └─ design-tokens/             DESIGN.md tokens as a TS module — single source for Tailwind & RN
├─ all_design_screens/           Untouched — design source of truth
├─ docs/
│  └─ superpowers/specs/         Design specs (this file lives here)
├─ .editorconfig
├─ .gitignore
├─ .nvmrc                        Pin Node version
├─ biome.json                    Lint + format config
├─ package.json                  pnpm workspace root, scripts only
├─ pnpm-workspace.yaml
├─ tsconfig.base.json            Shared strict TS settings (extended by each package)
├─ LICENSE                       Apache 2.0
├─ README.md
└─ CLAUDE.md                     (existing — minor update to reflect new layout)
```

## 5. Stack decisions

| Decision | Pick | Rationale |
|---|---|---|
| Package manager | **pnpm** | Best monorepo story, fast installs, content-addressed store, small lockfile |
| Workspace tool | **pnpm workspaces** (no Turbo / Nx yet) | One source of truth; orchestration tooling adds value only after build complexity grows |
| Language | **TypeScript strict** everywhere | Non-negotiable for a security product |
| Web framework | **Next.js latest stable** (explicitly not 15.x) | Matches PRD; latest avoids known 15.x RSC advisories |
| Lint + format | **Biome** | Single binary, fast, replaces ESLint+Prettier; revisit only if a Biome gap blocks the team |
| Crypto stack | **HPKE (RFC 9180)** via [`@hpke/core`](https://github.com/dajiaji/hpke-js): X25519-HKDF-SHA256 KEM + AES-256-GCM AEAD | Standards-based hybrid PKE; satisfies both "X25519 modern curve" and PRD's "AES-256-GCM" requirement; audited TS implementation; mobile-portable (RFC implementations exist in Swift/Kotlin/Rust) |
| Test runner | **Vitest** | Fast, TS-native, suits crypto KAT vectors |
| E2E | **Playwright** (deferred until first UI work) | Industry standard; not needed at scaffold time |
| Hosting + services | **Sproobo** (Postgres, Redis, object storage) | User decision; MCP tools available (`mcp__sproobo__*`) |
| License | **Apache 2.0** | Permissive + explicit patent grant; standard for security-OSS |
| Git hooks | **None initially** | Add via `setup-pre-commit` skill once first real code lands |

## 6. Package boundaries

Each package has one purpose, a small public API, and minimal dependencies. The trust-critical packages (`crypto`, storage adapter) have no UI dependencies and no DOM dependencies, so they are testable in isolation and portable to mobile.

### `packages/crypto`

**Purpose.** Encryption primitives. Never touches the DOM, network, storage, or React.

**Public API (sketch — final shape decided in implementation plan):**

```ts
// Identity
generateIdentity(): Promise<IdentityKeypair>
exportPublicKey(id: IdentityKeypair): PublicKeyString          // base64url, includes algorithm tag
importPublicKey(s: PublicKeyString): RecipientPublicKey
fingerprint(pk: PublicKeyString): Fingerprint                  // human-verifiable, e.g. 6×4-char groups

// Sealing (anonymous sender → recipient public key)
seal(plaintext: Uint8Array, recipient: RecipientPublicKey, aad?: Uint8Array): Promise<Ciphertext>
open(ciphertext: Ciphertext, id: IdentityKeypair, aad?: Uint8Array): Promise<Uint8Array>

// Local-at-rest key wrap (private-key storage in IndexedDB)
wrapPrivateKey(id: IdentityKeypair, passphrase: string): Promise<WrappedKey>
unwrapPrivateKey(wrapped: WrappedKey, passphrase: string): Promise<IdentityKeypair>
```

**Algorithm choices.**

- HPKE base mode with `DHKEM(X25519, HKDF-SHA256)` KEM + `AES-256-GCM` AEAD + `HKDF-SHA256` KDF. Implementation: `@hpke/core`.
- Local key wrap: Argon2id (via `argon2-browser` or hash-wasm) for passphrase derivation → AES-256-GCM for the wrap. Fallback to PBKDF2-SHA256 (600k iters) if Argon2 wasm cost becomes a problem; spec must keep both code paths behind one API.
- Fingerprint: SHA-256 of the public key, encoded as 6 groups of 4 lowercase base32 characters separated by spaces (24 chars total, ~120 bits — enough for manual verification).

**Tests.**

- Known-answer-test (KAT) vectors from RFC 9180 Appendix A test cases for the chosen suite (X25519-HKDF-SHA256 + AES-256-GCM) — confirms our wrapper passes plaintext/AAD through correctly and does not mutate ciphertext shape.
- Round-trip property tests (random plaintext → seal → open → equal).
- Wrong-key tests (sealing for one recipient, opening with another fails cleanly with no partial plaintext leakage).
- Tamper tests (any single-byte mutation of ciphertext or AAD causes `open` to throw, never returns plaintext).

### `packages/design-tokens`

**Purpose.** Single source for the values defined in `all_design_screens/secure_message_design_system/DESIGN.md` — colors, spacing, fonts, radii, elevation, motion.

**Exports.**

- TS objects per token category (`colors`, `spacing`, `radii`, `fonts`, `motion`).
- A Tailwind preset (`tailwind.preset.ts`) consumed by `apps/web/tailwind.config.ts`.
- No CSS variables generated yet — Tailwind preset is enough for Phase 1.

**Future-proofing.** When mobile arrives, the same TS objects can drive an RN `StyleSheet` adapter or KMM theme without forking values.

### `packages/ui`

**Purpose.** Shared React components migrated incrementally from `all_design_screens/<screen>/code.html`.

**Initial state.** Empty barrel export. The first component migrated in Phase 1 should be a layout primitive (e.g., `<Surface>` matching DESIGN.md's surface-container hierarchy) so we have one end-to-end vertical slice. Per-screen migration is Phase 1 work.

**Storybook / visual review tool.** Deferred. Add only when the catalogue grows past a handful of components.

### `apps/web`

**Phase 1 routes** (no implementation yet — this is the target the Phase 1 spec will plan against):

- Public:
  - `/` — landing
  - `/m/:id` — recipient landing page (safe preview, see §8)
- Authenticated:
  - `/dashboard`, `/create`, `/links`, `/links/:id`, `/contacts`, `/contacts/:id`, `/identity`, `/keys`, `/settings`

**Phase 1 API**:

- `POST   /api/messages` — create a sealed message; body is ciphertext + metadata (expiry, max opens, recipient pubkey fingerprint)
- `GET    /api/messages/:id` — return metadata only (status, expiry, opens-remaining); never the ciphertext
- `POST   /api/messages/:id/ciphertext` — return the ciphertext blob; consumes one open; rate-limited
- `DELETE /api/messages/:id` — manual revocation; purges ciphertext immediately

**Initial state at scaffold time.** A single placeholder page at `/` rendering "aesmsg — under construction", Tailwind wired to the design-tokens preset. No auth, no API routes, no DB calls. Anything more is Phase 1.

## 7. Storage adapter (interface only at scaffold time)

All vendor-specific storage details live behind interfaces in `apps/web/src/server/storage/`:

```ts
interface LinkMetadataStore {
  create(record: LinkMetadata): Promise<void>
  get(id: LinkId): Promise<LinkMetadata | null>
  incrementOpens(id: LinkId): Promise<LinkMetadata>     // atomic
  revoke(id: LinkId): Promise<void>
  expirePastDue(): Promise<number>                       // returns count purged
}

interface CiphertextStore {
  put(id: LinkId, blob: Uint8Array): Promise<void>
  get(id: LinkId): Promise<Uint8Array | null>
  delete(id: LinkId): Promise<void>
}

interface RateLimitStore {
  incrementAndGet(key: string, windowSeconds: number): Promise<number>
}
```

**Phase 1 backings (decided at planning time, not now):**

- `LinkMetadataStore` → Postgres on Sproobo
- `CiphertextStore` → Sproobo-provided object storage (TBD — verify with `mcp__sproobo__list_services` during planning). Fallback for first cut: Postgres `bytea` column, swap to object storage when known.
- `RateLimitStore` → Redis on Sproobo

**At scaffold time:** only the TS interfaces and a `MemoryStore` test double exist. Real adapters are Phase 1 implementation work.

> **Phase 1 update (Slice 4):** the canonical home for these interfaces and their Memory + Postgres + Redis implementations is now [`packages/server-store`](../../../packages/server-store). The signatures evolved slightly (e.g. `create` returns `LinkMetadata`, `incrementOpens` returns `LinkMetadata | null`) — see [Slice 4 spec](2026-05-09-backend-storage-design.md) §5 for the canonical API.

## 8. Public-link preview safety (architectural invariant)

Messaging apps (Slack, iMessage, WhatsApp, Telegram) fetch shared URLs to build previews. The `/m/:id` route must satisfy:

- A bare `GET /m/:id` returns a server-rendered HTML page with no ciphertext, no metadata that identifies the recipient, and no side effects.
- `GET /m/:id` does **not** consume an open, does **not** decrement the opens counter, does **not** emit any audit event beyond a generic anonymous "preview fetched" if needed for rate limiting.
- Actual ciphertext fetch happens via `POST /api/messages/:id/ciphertext` triggered by an explicit user action (button click) on the page.
- Open Graph + oEmbed metadata for `/m/:id` is generic ("Encrypted message — open with aesmsg"). No recipient name, no preview text, no thumbnail derived from content.

This invariant is called out here because it constrains the routing/handler structure; the Phase 1 spec must preserve it.

## 9. Identity / PKI (Phase 1 model — informs scaffold but not implemented yet)

- On first visit, user generates an X25519 identity locally via `packages/crypto`.
- Private key wrapped with passphrase-derived key, stored in IndexedDB. Never sent to the server.
- Public key + fingerprint shown to the user for manual sharing (URL, QR, contact card).
- Sender pastes recipient's public key when composing; UI surfaces fingerprint for verification.
- No directory, no automatic discovery, no rotation flow yet — those are Phase 2/3.
- Wrong key → decryption fails cleanly with no recovery; UI screen `decryption_failed_aesmsg/` is the user-facing surface.

## 10. Initial commit plan

What lands in the first commit:

- Workspace tooling: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.editorconfig`, `.nvmrc`, `.gitignore`, `LICENSE` (Apache 2.0), `README.md`
- `apps/web/`: Next.js skeleton (latest stable, app router, TS strict), Tailwind config consuming the design-tokens preset, single placeholder page at `/`
- `apps/mobile/DECISION-DEFERRED.md`
- `packages/crypto/`: package.json, README documenting the public API and algorithm choices, tsconfig, vitest config, `src/index.ts` exporting type stubs only (no implementation)
- `packages/design-tokens/`: package.json, tsconfig, all DESIGN.md tokens exported as TS objects, `tailwind.preset.ts`
- `packages/ui/`: package.json, tsconfig, empty barrel export, README explaining the migration approach
- `docs/superpowers/specs/2026-05-09-project-init-design.md` (this file)
- `CLAUDE.md` updated to reflect the new layout (replaces "design artifacts only" framing)

What does **not** land yet:

- Crypto implementation (Phase 1 plan)
- Pages, auth, API routes (Phase 1 plan)
- Storage adapter implementations (Phase 1 plan)
- CI configuration (deferred)
- Sproobo deploy / firewall / nginx config (deferred until first vertical slice)

## 11. Success criteria for the initialization

- `pnpm install` from repo root succeeds clean, no peer-dep warnings
- `pnpm -r typecheck` passes
- `pnpm -r lint` passes
- `pnpm --filter web dev` boots Next.js and serves the placeholder page
- `packages/crypto` exposes type stubs that match the documented public API
- All token values listed in `DESIGN.md` are reachable via `@aesmsg/design-tokens`
- Repo is a git repository with a clean initial commit
- A new contributor cloning the repo can reach all of the above with one `pnpm install`

## 12. Risks & open questions (resolved at planning time)

- **Sproobo object storage.** Unknown today whether Sproobo offers S3-compatible blob storage or only block/file storage. Resolution: call `mcp__sproobo__list_services` during Phase 1 planning. Fallback path documented in §7.
- **Argon2 wasm cost.** Argon2id browser bundles add ~50–100kb of wasm. Acceptable for a security app. Fallback to PBKDF2 documented in §6.
- **Public-link preview behaviour across apps.** Slack, iMessage, WhatsApp, and Telegram each behave differently for unfurls. Need a small research task in Phase 1 to confirm that the safe-landing-page approach works across all four; the invariant in §8 already constrains the design.
- **Mobile stack decision (Phase 2).** RN vs KMM vs native iOS+Android. Captured in `apps/mobile/DECISION-DEFERRED.md`. Re-examined when Phase 2 starts; the crypto package is portable in any direction.
- **CLAUDE.md update.** The current file is design-only-focused. After scaffold, it needs a section on "Working in the codebase" (commands, package boundaries) without losing the product-context lead.

## 13. Out of scope for this spec

Anything Phase 1 application logic, anything mobile, anything enterprise. Each gets its own spec.
