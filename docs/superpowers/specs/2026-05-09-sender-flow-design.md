# Slice 5 — Sender flow (`/create` + `POST /api/messages`)

**Date:** 2026-05-09
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** [project init spec](2026-05-09-project-init-design.md), [Slice 1 crypto-core](2026-05-09-crypto-core-design.md), [Slice 2 key-store](2026-05-09-key-store-design.md), [Slice 3 identity bootstrap](2026-05-09-identity-bootstrap-design.md), [Slice 4 backend storage](2026-05-09-backend-storage-design.md)

## 1. Context

Slices 1–4 shipped the cryptographic foundation, the client-side identity surface, and the server-side storage layer. Slice 5 lands the **first user-visible vertical slice**: an unlocked user can compose a message, seal it locally with the recipient's public key, and receive a shareable link backed by real ciphertext storage.

This is the slice where the product becomes real. After it ships, two pieces of plumbing exist that are not yet wired together end-to-end (the recipient flow / `/l/:id` opens in Slice 6), but the sender side works completely against real Postgres + Redis when configured, and against the Memory backends from `@aesmsg/server-store` in tests with zero infrastructure.

Slice 5 is the full vertical: UI, API route, validation, rate limit, and storage integration all in one. Sub-slicing was considered (server-first, then UI) but rejected because the layers are tightly coupled and a single coherent flow is easier to design + test in one TDD loop, matching how Slices 2 and 3 shipped.

## 2. Goals

- Add a `/create` route to `apps/web` matching the `create_secure_message_aesmsg` and `secure_link_created_aesmsg` mockups end-to-end.
- Add a `POST /api/messages` handler that validates input, applies a fixed-window IP-based rate limit, generates a server-side link ID, and persists ciphertext + metadata via `@aesmsg/server-store`.
- Encrypt entirely on the client. Plaintext never touches the network or the API route. The server receives only base64-encoded HPKE ciphertext + minimal metadata.
- Ship a handler split (`messages-handler.ts` is dependency-injectable, `route.ts` wires production deps + re-exports `POST`) so unit tests run against Memory stores in milliseconds without spinning up a database.
- Match the existing identity gate: `/create` redirects to `/keys` if the user has no unlocked identity, mirroring the pattern Slice 3 established for the `IdentityProvider`.

## 3. Non-goals

- **No recipient flow.** Generated links 404 until Slice 6 ships `/l/:id`. The result page documents this clearly with a "share this link — recipient flow coming in Slice 6" note. (This will be removed when Slice 6 lands.)
- **No file attachments.** Phase 1 is text-only per the PRD. The mockup's "File Attachments" section is rendered but disabled with a "Coming in Phase 2" badge — preserves visual fidelity per the design-authority rule.
- **No contacts directory.** The recipient's full public-key string is pasted into a textarea; lookup by alias / email / fingerprint is a later slice.
- **No QR scanning.** Mobile / QR is Phase 2.
- **No `/links` list page.** "My links" is a later slice (one of the design-screen folders is `my_secure_links_aesmsg`, but it's not Slice 5).
- **No Sproobo provisioning.** The slice consumes `DATABASE_URL` and `REDIS_URL`; production deploys configure those, dev uses Docker per Slice 4's README.
- **No POST authentication.** Phase 1's threat model assumes anyone with internet access can POST. Abuse is bounded by the rate limit and by the fact that you must already know the recipient's public key (which is never leaked by the server). Token auth is a Phase 3 concern.

## 4. UX

Both states live on a single `/create` route, switched by component-level state. No URL change between compose and result — matches Linear / Stripe multi-step flows and avoids needing a `/links/:id` route in this slice.

### 4.1 Compose state

Driven by `all_design_screens/create_secure_message_aesmsg/code.html`. Fields, top-to-bottom:

| Field | Behavior |
|---|---|
| **Recipient (public key)** | Single-line input. Placeholder updated to `Paste recipient's public key…` (the mockup's "Enter recipient ID or email…" is aspirational copy for later contacts work). On paste/blur, validate via `importPublicKey` from `@aesmsg/crypto`; on success, derive the fingerprint with `fingerprint()` and show it directly under the input as `Fingerprint: ab12 cd34 …` in JetBrains Mono. On failure, surface an inline "That doesn't look like a valid public key." with the input border in `error` color. |
| **Message** | Textarea, ≥ 8 rows, monospace per mockup. No length cap on the client — the server caps at 256 KB ciphertext, which corresponds to ~256 KB plaintext (HPKE overhead is constant ~32–96 bytes). Show a soft counter once over 200 KB. |
| **File Attachments** | Section rendered exactly as mockup, but the dropzone is disabled and overlaid with a `Coming in Phase 2` badge using the existing `surface-container-low` + `outline-variant` tokens. Click is a no-op. |
| **Link Expiry** | `<select>` with options `10 minutes / 1 hour / 24 hours (default selected) / 7 days / Never (Manual Revoke)`. |
| **Max Views** | `<select>` with options `1 view (Burn on read) (default selected) / 5 views / 10 views / Unlimited`. Matches the mockup; supersedes the PRD's older `1/3/Unlimited` set. |
| **Encrypt & Create Link** | Primary CTA. Disabled until: recipient parses, message is non-empty. On click: enter `encrypting` state, run client orchestrator (§5.3), POST to API, transition to `result` on 201, transition to `error` on any failure. |

Identity gate: if `useIdentity().status !== "unlocked"`, the route renders the existing unlock or bootstrap surface from Slice 3 instead of the form. This re-uses the `IdentityProvider`'s gate behavior and is implemented identically to how `/keys` handles it today — no new abstraction.

### 4.2 Encrypting state

Brief intermediate UI: a centered spinner + the copy "Encrypting locally — your message never leaves this device until it's sealed." Sourced from the same calm-SaaS voice the design-system spec mandates. Typically visible for 100–500 ms (HPKE seal of small text is fast).

### 4.3 Result state

Driven by `all_design_screens/secure_link_created_aesmsg/code.html`. Shows:

- The shareable URL in a read-only input with a copy-to-clipboard button. Format: `<origin>/l/<id>` where `<origin>` is `window.location.origin`. The id is the 16-char URL-safe slug returned by the server.
- The recipient fingerprint recap (so the sender can confirm to the recipient out-of-band that they sent to the right key).
- Expiry + max-views recap.
- "Create another" CTA — resets state and returns to compose.
- A small `info` callout: "Recipient flow lands in Slice 6 — links open with 404 until then." (Removed when Slice 6 ships. Tracked as a known TODO in the post-merge follow-up.)

### 4.4 Error state

A retry-able error banner above the form when the POST fails. Distinguishes:

- **400** — show server's opaque error code as "Validation failed. Please check your inputs." and stay on compose.
- **429** — "Too many requests. Try again in a minute."
- **500 / network** — "Something went wrong. Try again."

No leak of server internals.

## 5. Architecture

### 5.1 File layout

```
apps/web/
├─ app/
│  ├─ create/
│  │  └─ page.tsx                          (new — Server Component shell, renders <CreateScreen/>)
│  └─ api/
│     └─ messages/
│        └─ route.ts                       (new — wires real deps + re-exports POST)
└─ src/
   ├─ create/
   │  ├─ CreateScreen.tsx                  (new — state machine: compose → encrypting → result | error)
   │  ├─ ComposeForm.tsx                   (new — pure form, all fields per §4.1)
   │  ├─ ResultScreen.tsx                  (new — success per §4.3)
   │  └─ encrypt-and-post.ts               (new — client orchestrator: id-gen + seal + POST)
   ├─ lib/
   │  ├─ api-client.ts                     (new — typed fetch wrappers + a `MessagesApi` namespace)
   │  ├─ link-id.ts                        (new — browser id generator via Web Crypto + LINK_ID_REGEX)
   │  └─ base64.ts                         (new — bytes ↔ base64 / base64url helpers, browser)
   └─ server/
      ├─ stores.ts                         (new — getStores() factory; singletons for Pg/Redis, swappable for tests)
      ├─ link-id.ts                        (new — Node id generator via node:crypto + same LINK_ID_REGEX export)
      └─ messages-handler.ts               (new — createMessagesHandler(deps) → (req: Request) => Promise<Response>)
```

### 5.2 Server: handler / route split

```ts
// src/server/messages-handler.ts
export interface MessagesHandlerDeps {
  links: LinkMetadataStore;
  ciphertexts: CiphertextStore;
  rateLimit: RateLimitStore;
  now: () => Date;
}

export function createMessagesHandler(deps: MessagesHandlerDeps) {
  return async function POST(request: Request): Promise<Response> {
    // 1. Parse + validate JSON body (including client-supplied `id`)
    // 2. Rate limit on `messages:<ip>` window=60s, cap=30
    // 3. base64-decode ciphertext to Uint8Array
    // 4. links.create({ id: body.id, ... }) — 23505 → 409 id_conflict
    // 5. ciphertexts.put(body.id, blob)
    // 6. Return { id: body.id, url: <origin>/l/<id> }
  };
}
```

`route.ts` is the wiring layer — three lines:

```ts
import { createMessagesHandler } from "@/server/messages-handler";
import { getStores } from "@/server/stores";

export const POST = createMessagesHandler({
  ...getStores(),
  now: () => new Date(),
});
```

`getStores()` reads `DATABASE_URL` + `REDIS_URL` and returns Pg + Redis store singletons. In `NODE_ENV === "test"` (or when `AESMSG_USE_MEMORY_STORES=1`), it returns Memory stores instead — keeps the dev loop fast and CI happy without env vars.

Tests for the handler import `createMessagesHandler` directly with Memory stores + a deterministic `generateLinkId` + a fixed `now` — no Next.js runtime, no real database, no clock flake.

### 5.3 Client: encryption orchestrator

The HPKE AAD policy locked in during Slice 1 brainstorming binds ciphertext to **link ID**, not recipient fingerprint. Fingerprint-as-AAD would let a malicious server swap any ciphertext sealed for the same recipient into your link record and the decryption would still succeed. Link-ID-as-AAD makes that attack fail closed: the wrong record-to-ID pairing produces an HPKE auth-tag mismatch and `open()` throws.

To use link ID as AAD without a server round-trip before encryption, **the client generates the link ID** before sealing. The server validates the format and relies on the `links.id` `PRIMARY KEY` for uniqueness — a collision (cosmically unlikely with 96 bits of entropy) returns 409. Slice 6's recipient flow recomputes the AAD from the URL's `:id` segment and passes it to `open()`.

```ts
// src/create/encrypt-and-post.ts
export interface EncryptAndPostInput {
  recipientPublicKeyString: string;
  message: string;
  expiresAt: Date;
  maxOpens: number;
}

export interface EncryptAndPostOutput {
  id: string;
  url: string;
  recipientFingerprint: string;
}

export async function encryptAndPost(input: EncryptAndPostInput): Promise<EncryptAndPostOutput> {
  const recipient = await importPublicKey(input.recipientPublicKeyString);
  const recipientFingerprint = await fingerprint(recipient);

  const id = generateLinkId();                          // client-side, Web Crypto
  const aad = new TextEncoder().encode(id);             // AAD = link ID per Slice 1 policy

  const plaintext = new TextEncoder().encode(input.message);
  const ciphertext = await seal(plaintext, recipient, aad);

  await postMessage({
    id,
    recipientFingerprint,
    ciphertext: bytesToBase64(ciphertext),
    expiresAt: input.expiresAt.toISOString(),
    maxOpens: input.maxOpens,
  });

  const url = `${window.location.origin}/l/${id}`;
  return { id, url, recipientFingerprint };
}
```

Client-side `generateLinkId` lives in `src/lib/link-id.ts` (browser) and uses `crypto.getRandomValues(new Uint8Array(12))` + base64url encoding — same 16-char output format as the server-side helper, just a different RNG. Both formats round-trip identically.

## 6. API contract

### 6.1 Request

```http
POST /api/messages
Content-Type: application/json

{
  "id": "abc123def456gh78",
  "recipientFingerprint": "<64 hex chars>",
  "ciphertext": "<base64 string>",
  "expiresAt": "2026-05-10T12:00:00.000Z",
  "maxOpens": 1
}
```

`id` is client-generated (16-char URL-safe base64url, 96 bits of entropy) so the client can use it as the HPKE AAD before sealing — see §5.3.

### 6.2 Response — 201 Created

```json
{
  "id": "abc123def456gh78",
  "url": "https://app.example.com/l/abc123def456gh78"
}
```

The server echoes the id back as a confirmation and constructs `url` from the request's origin (`request.headers.get("origin")` falling back to `request.url` parsed origin) + `/l/<id>`. No env-var-driven base URL — the request itself tells us. The client could derive the same URL locally; echoing it lets the server be the canonical formatter.

### 6.3 Errors

All error bodies are opaque: `{ "error": "<code>" }` with HTTP status. No per-field details — the user fixes inputs by inspection, not by reading server hints.

| Status | `error` code | When |
|---|---|---|
| 400 | `bad_request` | JSON parse failure, schema mismatch, or any §7 validation rule failure |
| 409 | `id_conflict` | The client-supplied `id` already exists. Cosmically unlikely (96 bits of entropy); client retries with a freshly generated id and a re-seal. |
| 429 | `rate_limited` | Per-IP window count exceeded |
| 500 | `internal_error` | Storage layer threw; logged server-side, opaque to client |

The handler **never** echoes input back. It returns a single `error` code and lets the client distinguish via HTTP status.

## 7. Validation

All checks run before any storage call. Fail fast.

| Field | Rule |
|---|---|
| Body | Valid JSON, ≤ 512 KB total request size |
| `id` | String, regex `/^[A-Za-z0-9_-]{16}$/` |
| `recipientFingerprint` | String, regex `/^[0-9a-f]{64}$/` |
| `ciphertext` | String, valid base64 (`/^[A-Za-z0-9+/]*={0,2}$/`), decoded length in `[32, 262144]` bytes (32 B = HPKE minimum overhead, 256 KB = our cap) |
| `expiresAt` | Parses as ISO-8601 datetime, `> now`, `≤ 9999-12-31T23:59:59Z` |
| `maxOpens` | Integer, `> 0` or `=== -1` |

Uniqueness of `id` is enforced by the `links.id PRIMARY KEY` constraint; the handler maps Postgres unique-violation (SQLSTATE `23505`) to a 409 response.

The 32-byte minimum on ciphertext rejects accidentally empty / tiny payloads — a real HPKE seal of even an empty plaintext is at least one X25519 public key (32 bytes) plus AEAD tag (16 bytes).

## 8. Rate limiting

Per-request flow:

```ts
const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? request.headers.get("x-real-ip")
        ?? "unknown";
const count = await deps.rateLimit.incrementAndGet(`messages:${ip}`, 60);
if (count > 30) return jsonError(429, "rate_limited");
```

Phase 1 default: **30 messages per minute per IP**. Tunable later via env var if abuse surfaces. Sliding-window precision is unnecessary at this rate — fixed-window from `RateLimitStore.incrementAndGet` is sufficient.

The `unknown` fallback is intentional — behind a typical proxy chain we get a real IP; in unusual deployments with no `x-forwarded-for` we still rate-limit, just collectively. That's acceptable for Phase 1.

## 9. "Never (Manual Revoke)" expiry

Stored as `9999-12-31T23:59:59Z`. The Slice 4 schema's `expires_at NOT NULL` constraint stays untouched, `expirePastDue` naturally never matches such rows (any `now()` is < year 9999), and `incrementOpens`'s `WHERE expires_at > now()` always holds. Manual `revoke()` becomes the only way the link terminates, exactly as the option's UX label promises.

This is a small lie compared to a `nullable expires_at` column — chosen because changing the storage spec four days after shipping it adds churn without net benefit. If the schema is reworked for a different reason later, this can flip to nullable.

## 10. Link ID generation

96 bits of entropy → 16 URL-safe base64url chars. Collision probability over 1 B links: ~6 × 10⁻¹². Generated **client-side** so the id can serve as HPKE AAD before sealing (per §5.3); the server validates format + relies on the `PRIMARY KEY` for uniqueness.

Two implementations, identical output format:

```ts
// src/lib/link-id.ts (browser — used by the encryption orchestrator)
export function generateLinkId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return bytesToBase64Url(bytes);
}

// src/server/link-id.ts (Node — used in handler tests for deterministic ids,
// and as the source of truth for the validation regex)
import { randomBytes } from "node:crypto";

export const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;

export function generateLinkId(): string {
  return randomBytes(12).toString("base64url");
}
```

Tests verify both implementations produce strings matching `LINK_ID_REGEX` and have no collisions over 1000 generations.

## 11. Tests

### 11.1 Unit (Node, Vitest)

- `link-id.test.ts` — format regex, uniqueness over 1000 iterations, both browser and Node implementations.
- `messages-handler.test.ts` — every validation case (one rejection per `error` code path including 409 on duplicate id), rate-limit transition (30 OK, 31st rejected), happy path round-trips through Memory stores and returns `{ id, url }`. Uses `createMessagesHandler` directly with `MemoryLinkMetadataStore`, `MemoryCiphertextStore`, `MemoryRateLimitStore`, fixed `now`. The client-supplied `id` makes deterministic-id injection trivial — tests just send a chosen string in the body. No Next.js runtime, no real database. ~30 ms per test.
- `encrypt-and-post.test.ts` — mocks `fetch` globally, asserts the orchestrator: (a) imports the pubkey, (b) computes the fingerprint, (c) calls `seal` with fingerprint as AAD, (d) POSTs the right body shape, (e) returns the parsed response.

### 11.2 Browser e2e (Vitest browser, Playwright Chromium)

- `create-flow.e2e.test.tsx` — full happy path. Setup: bootstrap an in-test identity via `@aesmsg/key-store`, generate a recipient identity in the same test for the pubkey paste. Walk: navigate to `/create`, paste pubkey, type message, set 1-hour expiry + 1 view, click Encrypt. Assert: result screen renders, URL shape is `<origin>/l/<16 chars>`, copy-to-clipboard works. The fetch is intercepted with `vi.spyOn(global, "fetch")` returning a fake `{ id, url }` response — no real backend needed.

- `create-flow-validation.e2e.test.tsx` — paste-an-invalid-pubkey path: assert the inline error appears, fingerprint helper does **not** render, Encrypt button stays disabled.

### 11.3 No new server-store integration tests

Slice 4's `pg.test.ts` already covers store contracts. The handler tests use Memory stores; the wired `route.ts` is exercised manually via the dev server (or via Slice 6's e2e once the recipient flow lands).

### 11.4 Coverage

Reuse existing per-package gates: `apps/web` ≥ 80 % lines (already configured). Slice 5's new code lands inside that gate. No new threshold needed.

## 12. Definition of done

- `pnpm typecheck` clean across all workspaces.
- `pnpm lint` clean.
- `pnpm test` green without env vars (Memory-mode stores serve tests).
- `pnpm dev`, navigate to `/create` after bootstrapping an identity, paste a self-generated public key, encrypt a short message, observe the result screen with a real link. (Manual smoke — auto-tested by the browser e2e.)
- `POST /api/messages` against a real Postgres + Redis (set `DATABASE_URL` + `REDIS_URL`, `AESMSG_USE_MEMORY_STORES` unset) round-trips a ciphertext to the database and back. Verified via `pnpm --filter @aesmsg/server-store test` with env vars set (no new test, but the store contracts are exercised).
- `apps/web/AGENTS.md` (or `apps/web/README.md`) gets a short "API routes" section explaining the handler/route split + how to inject Memory stores in handler tests.
- The result screen's "Recipient flow coming in Slice 6" callout is in place and tracked as a TODO to remove when Slice 6 ships.

## 13. Risks and mitigations

- **256 KB ciphertext cap is too small / too large.** It's a guess. Phase 1 is text — typical messages are < 4 KB. 256 KB leaves headroom for paste-an-env-file workflows. If users hit it, raise to 1 MB. If abuse surfaces, drop to 32 KB. Mitigation: env-var override (`AESMSG_MAX_CIPHERTEXT_BYTES`) — wired but with the documented default.
- **Rate limit too aggressive / lax.** 30/min/IP is a guess. Real numbers come from production. Mitigation: same env-var pattern (`AESMSG_RATELIMIT_MESSAGES_PER_MINUTE`).
- **Client-generated link IDs trust browser RNG.** All modern browsers' `crypto.getRandomValues` is CSPRNG-backed. 96 bits is well above the realistic collision threshold; the `PRIMARY KEY` + 409 retry path catches the universe-ending edge case.
- **`getStores()` singleton outliving HMR in dev.** Next.js 16 dev mode reloads modules; stale Pg pools could leak across reloads. Mitigation: store the singleton on `globalThis` keyed by URL, the standard Next.js dev-mode workaround.
- **The "links open in 404 until Slice 6" UX gap.** Mitigated by the explicit callout on the result screen and by Slice 6 being the next planned slice. Not great, but honest.

## 14. Out-of-scope, summarized

Recipient flow / `/l/:id` (Slice 6), file attachments (Phase 2), contacts directory (later), `/links` list page (later), QR scanning (Phase 2 mobile), POST authentication (Phase 3), Sproobo provisioning (operator concern), env-var rate-limit / size tuning (default-only in Slice 5), abuse heuristics beyond rate limit (later).
