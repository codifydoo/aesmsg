# Slice 6 — Recipient flow (`/l/:id` + `GET /api/messages/:id` + `POST /api/messages/:id/open`)

**Date:** 2026-05-10
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** [project init spec](2026-05-09-project-init-design.md), [Slice 1 crypto-core](2026-05-09-crypto-core-design.md), [Slice 2 key-store](2026-05-09-key-store-design.md), [Slice 3 identity bootstrap](2026-05-09-identity-bootstrap-design.md), [Slice 4 backend storage](2026-05-09-backend-storage-design.md), [Slice 5 sender flow](2026-05-09-sender-flow-design.md)

## 1. Context

Slice 5 shipped the sender flow — a creator can compose, encrypt, and POST a ciphertext + metadata, receiving a `/l/<id>` URL to share. Today, that URL 404s. Slice 6 closes the loop: a recipient who clicks the link lands on a safe preview page, unlocks their identity if needed, explicitly opens the message, and reads the decrypted plaintext.

After this slice, aesmsg has a working end-to-end vertical for the canonical journey it was designed around. From a product standpoint, Slice 6 is what makes the service *real* — every prior slice was machinery.

The slice carries the highest UX subtlety in Phase 1 because the recipient-side workflow is where the trust model is most visible and most easily violated:

- **Public link previews must not consume opens.** Slack / WhatsApp / iMessage auto-fetch URLs to render previews. A naïve `GET /l/:id` that calls `incrementOpens` would burn through a max-opens budget before the recipient ever sees the page.
- **Expired / revoked links must not leak metadata.** "This secure link is no longer available." — same opaque message for revoked, expired, max-opens-reached, and never-existed. Otherwise an attacker who finds a tampered URL can probe the system.
- **Wrong private key = no decryption.** No "did you mean another identity?" affordance, no recovery, no retry-with-different-key. The decryption simply fails with a single error screen.
- **Decrypted plaintext is the user's responsibility past that point** — but the client mitigates by auto-clearing the clipboard 60 seconds after a copy.

## 2. Goals

- Add a `/l/:id` route to `apps/web` matching the four recipient mockups end-to-end (`secure_link_aesmsg`, `secure_reader_aesmsg`, `link_expired_aesmsg`, `decryption_failed_aesmsg`).
- Add `GET /api/messages/:id` returning metadata only — no `incrementOpens`, no ciphertext bytes — so previews are safe.
- Add `POST /api/messages/:id/open` that calls `LinkMetadataStore.incrementOpens` atomically and returns base64 ciphertext on success, 410 Gone on null (revoked / expired / past max-opens).
- Decrypt entirely on the client. Plaintext never round-trips through the network or the API route.
- Ship a 60-second clipboard auto-clear after the user copies the plaintext, with an inline "Clipboard will auto-clear in 60s" indicator.
- Remove the "Slice 6 coming" callout the previous slice baked into `ResultScreen.tsx`.

## 3. Non-goals

- **No `/links` "my secure links" list page.** That's a later slice.
- **No security-alert / key-changed flow.** That requires a contacts directory which is out of scope for Phase 1.
- **No identity rotation.** A recipient with a different fingerprint than the link's `recipientFingerprint` sees a warning but can still attempt decryption (which will fail). Phase 1 has no key rotation; the warning is future-proofing.
- **No background blur on tab visibility change.** The mockup doesn't include it; the Phase 1 web threat model is "shoulder surfing past the open tab", not "background-snapshot exfiltration". Mobile gets blur in Phase 2.
- **No screenshot blocking.** Browsers don't expose this API; honest disclosure that we can't is built into the design (no false promise).
- **No retry-with-different-passphrase.** If decryption fails, the screen offers "Try Again" (which re-runs decryption against the same loaded identity) and "Wipe Identity" (the existing Slice 3 flow). It does NOT offer "try different identity" because Phase 1 has only one.
- **No QR scanning.** Mobile / QR is Phase 2.

## 4. UX

The `/l/:id` route renders a state machine that walks through five terminal/intermediate states. State transitions are entirely client-side except for the initial server-side metadata fetch.

### 4.1 Initial fetch + identity gate

`/l/:id` is a **Client Component** (matches Slice 5's `/create` pattern — needs `useIdentity()` hook for the gate, and the metadata fetch happens client-side via `fetch()`). On mount, the component reads the URL's `:id` parameter, validates it against `LINK_ID_REGEX`, and triggers the metadata fetch with `cache: "no-store"`. While the fetch is in flight, render a brief loading state.

Identity gate (matches Slice 5):

- `loading` — spinner.
- `no_identity` — "You need an identity to open secure messages. Go to Identity Management." with a link to `/keys`.
- `locked` — render the existing `<UnlockScreen/>` from Slice 3 (reuse, do not duplicate).
- `unlocked` — proceed to the metadata fetch + landing screen.

The identity gate runs **in parallel** with the metadata fetch. Both have to complete before the user sees the landing screen. If the metadata fetch returns a terminal status, the user sees the "Link No Longer Available" surface even before unlocking — the system isn't going to ask them to authenticate just to see "this is gone".

### 4.2 Landing — `secure_link_aesmsg`

Driven by `all_design_screens/secure_link_aesmsg/code.html`. Shows:

- "Secure Message Found" headline.
- "This link contains an end-to-end encrypted message. To maintain privacy, decryption occurs locally on your hardware."
- Recipient fingerprint from the metadata (in JetBrains Mono, formatted as 8 hex groups via `truncateFingerprint(fp, 8)`).
- Expiry recap ("Expires in X hours" if `expiresAt` < year 9999, otherwise "Never expires").
- Max-views recap ("Burn on read" / "5 views remaining" / "Unlimited").
- **Fingerprint mismatch warning** (if `metadata.recipientFingerprint ≠ user.identity.fingerprint`): an amber callout above the CTA reading "This message was sealed for a different identity (`SHOR TFP`). Yours is `YOUR TFP`. Decryption will fail." The CTA is still enabled — the user can attempt; HPKE will reject with an authenticated-tag mismatch.
- "Open Message" primary CTA. On click → POST to `/api/messages/:id/open`, decrypt locally, transition to decrypted state.

### 4.3 Opening — intermediate state

Brief spinner with "Decrypting locally — your private key never leaves this device." Visible for 100–500 ms (one HPKE open + one network round-trip).

### 4.4 Decrypted — `secure_reader_aesmsg`

Driven by `all_design_screens/secure_reader_aesmsg/code.html`. Shows:

- "Message Decrypted" headline.
- The plaintext rendered verbatim in a JetBrains Mono block (per the design rule: monospace for sensitive content).
- Recap of recipient fingerprint, expiry, max-views (same triplet as landing).
- **Copy** button — copies plaintext to clipboard via `navigator.clipboard.writeText`. Below the button, an indicator: "Clipboard will auto-clear in 60s" with a countdown, and a 60-second `setTimeout` that calls `navigator.clipboard.writeText("")` to wipe (best-effort — see §9 risks).
- **Done** secondary action — clears the plaintext from React state and navigates to `/`. The plaintext is gone from this tab the moment Done is clicked.
- **Consumed callout** — when the open response indicates this opens-count tipped the link into terminal status (`opensCount + 1 >= maxOpens && maxOpens !== -1`), an additional callout reads "This link has been consumed. Closing this tab discards the message." This warns the user that reload will not work.

The plaintext lives **only** in React component state. There is no persistence. Tab close / page reload / Done all drop it.

### 4.5 Decryption failed — `decryption_failed_aesmsg`

Driven by `all_design_screens/decryption_failed_aesmsg/code.html`. Reached when `open()` throws — wrong private key, tampered ciphertext, or AAD mismatch. Shows:

- "Decryption Failed" headline.
- "This message could not be decrypted with your current identity. The most likely reason is that it was sealed for a different recipient."
- Three actions:
  - **Try Again** — re-runs the same `fetch-and-open` orchestrator. Only useful for transient network errors; will fail identically for a real key mismatch. Useful UX for the false-positive case.
  - **Manage Identity** — links to `/keys`.
  - **Wipe Identity** — the existing Slice 3 wipe modal (last-resort if user thinks their identity is corrupted).
- A small note: "If you believe this was sealed for you, contact the sender to verify the recipient fingerprint."

### 4.6 Link no longer available — `link_expired_aesmsg`

Driven by `all_design_screens/link_expired_aesmsg/code.html`. Reached when:

- `GET /api/messages/:id` returns 404 (no row OR terminal status — the response is opaque).
- `POST /api/messages/:id/open` returns 410 (race condition: between metadata fetch and open POST, the link expired or hit max-opens).

Shows:

- "Link No Longer Available" headline.
- "This secure link has expired, reached its view limit, or was revoked by the sender."
- A return-home link.

Same content for all four causes (revoked, expired, past max-opens, never existed) per the spec invariant.

## 5. Two-stage GET — preview safety

This is the load-bearing invariant of the slice. Two endpoints, two responsibilities:

| Endpoint | Side effect | Returns |
|---|---|---|
| `GET /api/messages/:id` | None | Metadata only — no ciphertext, no `incrementOpens` call |
| `POST /api/messages/:id/open` | `incrementOpens(id)` (atomic) | Ciphertext + recipient fingerprint, OR 410 if `incrementOpens` returned `null` |

Slack / WhatsApp / iMessage / search-engine crawlers / accidentally-pasted URLs all hit `GET /l/:id` which Server-Component-renders the landing page using only `GET /api/messages/:id`. The link's `opens_count` is untouched. Only an explicit user click on "Open Message" triggers the POST.

The verb choice (POST for `/open`) signals state mutation in HTTP semantics. We could shoehorn this into a GET with an idempotency key, but POST is honest and matches Fetch best-practices for state-changing operations.

## 6. API contract

### 6.1 `GET /api/messages/:id`

```http
GET /api/messages/abcdefghijkl0123
```

Response 200:
```json
{
  "status": "active",
  "recipientFingerprint": "<64 hex chars>",
  "expiresAt": "2026-05-11T12:00:00.000Z",
  "maxOpens": 1,
  "opensCount": 0
}
```

Errors:

| Status | `error` code | When |
|---|---|---|
| 400 | `bad_request` | `:id` does not match `LINK_ID_REGEX` |
| 404 | `not_found` | `links.get(id)` returns `null`, OR returns a row whose `status !== "active"`, OR returns a row whose `expiresAt <= now`. Same response for all four causes. |
| 429 | `rate_limited` | Per-IP fixed window, **60 requests / minute / IP**. Looser than POST because previews are read-only and crawlers will hit. |

The opaqueness of 404 is intentional and matches §1's "expired / revoked links must not leak metadata" invariant. A probe cannot distinguish "this link was real and has been revoked" from "this id was never minted".

`status` is included in the 200 response for completeness, but in practice it's always `"active"` — non-active rows fall into the 404 branch. The field is left in the contract because Slice 6 is the first consumer and a future audit screen would want it.

### 6.2 `POST /api/messages/:id/open`

```http
POST /api/messages/abcdefghijkl0123/open
```

(No request body required. The server identifies the link from the path parameter; the recipient identifies themselves implicitly by being able to decrypt the response with their private key.)

Response 200:
```json
{
  "ciphertext": "<base64 string>",
  "recipientFingerprint": "<64 hex chars>",
  "opensCount": 1,
  "maxOpens": 1,
  "status": "expired"
}
```

Errors:

| Status | `error` code | When |
|---|---|---|
| 400 | `bad_request` | `:id` does not match `LINK_ID_REGEX` |
| 410 | `no_longer_available` | `incrementOpens(id)` returned `null` — link is revoked, expired, or already past max-opens. Same code for all three. |
| 429 | `rate_limited` | Per-IP fixed window, **30 requests / minute / IP**. Same as POST `/api/messages` from Slice 5. |

The handler runs `incrementOpens` first (atomically bumps counter, flips status to expired if hitting cap, returns updated row or null), then fetches the ciphertext via `CiphertextStore.get(id)`. If `incrementOpens` returns null → 410 immediately. If it returns a row but `ciphertexts.get(id)` returns null (storage drift — see §12 for the race condition that can produce this), the handler maps it to 410 (synthetic) so the recipient sees "Link No Longer Available" rather than "Internal Error".

`recipientFingerprint` is echoed in the response so the client can double-check it matches the user's identity before attempting decryption. The `opensCount`, `maxOpens`, and `status` triplet drives the consumed-callout in `<DecryptedScreen/>` (§4.4) — the client checks `status === "expired"` after the open and shows the warning if so.

## 7. Architecture

### 7.1 File layout

```
apps/web/
├─ app/
│  ├─ l/
│  │  └─ [id]/
│  │     └─ page.tsx                       (new — Client Component shell, renders <ReaderScreen/>)
│  └─ api/
│     └─ messages/
│        └─ [id]/
│           ├─ route.ts                    (new — GET handler, metadata only)
│           └─ open/
│              └─ route.ts                 (new — POST handler, incrementOpens + ciphertext)
└─ src/
   ├─ reader/
   │  ├─ ReaderScreen.tsx                  (new — top-level state machine)
   │  ├─ LandingScreen.tsx                 (new — secure_link mockup)
   │  ├─ DecryptedScreen.tsx               (new — secure_reader mockup)
   │  ├─ DecryptionFailedScreen.tsx       (new — decryption_failed mockup)
   │  ├─ LinkUnavailableScreen.tsx        (new — link_expired mockup)
   │  └─ fetch-and-open.ts                 (new — POST /open + HPKE open + base64 decode)
   ├─ lib/
   │  ├─ base64.ts                         (extend — add base64ToBytes)
   │  └─ api-client.ts                     (extend — add getMessage + openMessage)
   └─ server/
      └─ messages-handler.ts               (extend — add createGetMessageHandler + createOpenMessageHandler factories)
```

### 7.2 Handler factories — same DI pattern as Slice 5

```ts
// src/server/messages-handler.ts (additions)
export interface GetMessageHandlerDeps {
  links: LinkMetadataStore;
  rateLimit: RateLimitStore;
  now: () => Date;
}

export function createGetMessageHandler(deps: GetMessageHandlerDeps) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id } = await context.params;
    // 1. Validate id format → 400
    // 2. Rate limit on `messages:get:<ip>`, window=60s, cap=60
    // 3. links.get(id)
    // 4. If null OR status!==active OR expiresAt<=now → 404 not_found
    // 5. Return 200 { status, recipientFingerprint, expiresAt, maxOpens, opensCount }
  };
}

export interface OpenMessageHandlerDeps {
  links: LinkMetadataStore;
  ciphertexts: CiphertextStore;
  rateLimit: RateLimitStore;
}

export function createOpenMessageHandler(deps: OpenMessageHandlerDeps) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id } = await context.params;
    // 1. Validate id format → 400
    // 2. Rate limit on `messages:open:<ip>`, window=60s, cap=30
    // 3. links.incrementOpens(id) atomically
    // 4. If null → 410 no_longer_available
    // 5. ciphertexts.get(id) — if null → 500 internal_error
    // 6. Return 200 { ciphertext: bytesToBase64(blob), recipientFingerprint: row.recipientFingerprint }
  };
}
```

Both reuse `getStores()` from Slice 5 (Memory in dev, Pg+Redis in prod).

The `context.params` is a `Promise` in Next.js 16's App Router for route handlers — must be `await`ed. Pages also pass params as `Promise` in Next 16. The `apps/web/AGENTS.md` warning about Next 16 breaking changes applies; the params-as-Promise change is one of them.

### 7.3 Client orchestrator — `fetch-and-open.ts`

```ts
import { open, type IdentityKeypair } from "@aesmsg/crypto";
import { openMessage } from "@/src/lib/api-client.js";
import { base64ToBytes } from "@/src/lib/base64.js";

export interface FetchAndOpenInput {
  id: string;
  identity: IdentityKeypair;
}

export interface FetchAndOpenOutput {
  plaintext: string;
  recipientFingerprint: string;
}

export async function fetchAndOpen(input: FetchAndOpenInput): Promise<FetchAndOpenOutput> {
  const response = await openMessage(input.id);
  const ciphertext = base64ToBytes(response.ciphertext);
  const aad = new TextEncoder().encode(input.id);
  const plaintext = await open(ciphertext as unknown as Ciphertext, input.identity, aad);
  return {
    plaintext: new TextDecoder().decode(plaintext),
    recipientFingerprint: response.recipientFingerprint,
  };
}
```

### 7.4 Rate limit key namespacing

Slice 5 uses `messages:<ip>` for POST `/api/messages`. Slice 6 uses two separate namespaces — `messages:get:<ip>` and `messages:open:<ip>` — so each endpoint counts independently. Sharing a single namespace would conflate read and write traffic and trip the limit prematurely.

## 8. Decryption + AAD

The AAD passed to `open()` is the link ID encoded as bytes — same as Slice 5's `seal()` call. Client-generated link ID + ID-as-AAD means:

- Wrong link ID → AAD mismatch → HPKE rejects (auth-tag mismatch).
- Wrong recipient (decrypting with the wrong private key) → HPKE rejects.
- Tampered ciphertext → HPKE rejects.

All three rejections surface as the same exception from `open()` and route to the "Decryption Failed" screen. We do not attempt to distinguish them — distinguishing would require attempting decryption multiple times and would leak side-channel signal.

## 9. Plaintext mitigations

### 9.1 Clipboard auto-clear

After `navigator.clipboard.writeText(plaintext)`:

```ts
const COPY_CLEAR_MS = 60_000;

setTimeout(async () => {
  try {
    const current = await navigator.clipboard.readText();
    if (current === plaintext) {
      await navigator.clipboard.writeText("");
    }
  } catch {
    // readText requires permission and may throw. If we can't read,
    // we don't risk overwriting whatever the user copied since.
    // The risk is the message lingers in the clipboard — accepted, documented.
  }
}, COPY_CLEAR_MS);
```

The conditional `readText` check avoids overwriting unrelated content the user copied during the 60-second window. If the read permission fails (some browsers gate `readText` behind a permission prompt), the timeout silently no-ops rather than blindly clobber.

The countdown indicator on the screen runs from 60 → 0 in 1-second decrements via a separate `setInterval` cleared on unmount.

### 9.2 No persistence

Plaintext lives only in `useState` inside `<DecryptedScreen/>`. Reload, navigate-away, or "Done" all drop it. The component does not write to `localStorage`, `sessionStorage`, IndexedDB, or any other persistent store.

## 10. Tests

### 10.1 Handler unit tests

Extend `apps/web/tests/server/messages-handler.test.ts`:

- `createGetMessageHandler` — happy path returns 200 with expected fields; 400 on bad id; 404 for missing row; 404 for revoked row (terminal status); 404 for past-expiry row; 429 on the 61st request to the same IP within 60s.
- `createOpenMessageHandler` — happy path returns 200 with base64 ciphertext + fingerprint; the 200 response includes an updated `opensCount` and `status` so the client can drive the §4.4 consumed callout; 410 when `incrementOpens` returns null (revoked / past-expiry / past max-opens — three sub-cases); 400 on bad id; 429 on the 31st request to the same IP within 60s; per-IP independence.

### 10.2 Client orchestrator unit tests

`apps/web/tests/reader/fetch-and-open.test.ts`:

- Round-trip: in-test, generate a recipient identity → seal a known plaintext to it with `id` as AAD → mock `fetch` to return the ciphertext → call `fetchAndOpen` → assert plaintext matches.
- Wrong identity: seal to recipient A → fetch with recipient B's identity → assert `fetchAndOpen` throws.
- Wrong id: seal with id "X" as AAD → fetch with id "Y" → assert throws.

### 10.3 Component tests

- `LandingScreen.test.tsx` — renders fingerprint formatted, expiry recap, max-views recap, fingerprint-mismatch warning when applicable, "Open Message" callback fires.
- `DecryptedScreen.test.tsx` — renders plaintext, copy → `navigator.clipboard.writeText` is called, countdown indicator shows 60 → 59 → … (using fake timers), Done callback fires.
- `DecryptionFailedScreen.test.tsx` — renders all three actions, callbacks fire.
- `LinkUnavailableScreen.test.tsx` — renders the opaque message + return-home link.

### 10.4 ReaderScreen state machine tests

- compose → opening → decrypted (happy path with mocked fetch returning a real-sealed ciphertext).
- compose → opening → decryption-failed (mocked fetch returns ciphertext sealed to a different recipient).
- compose → opening → link-unavailable (mocked POST returns 410).
- initial metadata 404 → link-unavailable directly (no Open Message button shown).

### 10.5 Browser e2e

`apps/web/tests/open-flow.e2e.test.tsx`:

- Bootstrap an identity in IndexedDB. Seed a metadata row + ciphertext into the in-memory stores by calling `createMessagesHandler` directly with the same Memory store instances used by the GET/open handlers. Render `<ReaderScreen id={id}/>` with `<IdentityProvider>`. Assert: landing renders, click Open, plaintext renders, click Copy, `clipboard.writeText` called, advance fake timers 60s, assert clipboard cleared.

### 10.6 Coverage

Reuse the existing `apps/web` 80% gate. Slice 6's new code lands inside it.

## 11. Definition of done

- `pnpm typecheck` clean across all workspaces.
- `pnpm lint` clean.
- `pnpm test` green without env vars (Memory-mode stores + browser-mode UI tests).
- `pnpm dev` smoke: bootstrap identity at `/keys`, copy public key, navigate to `/create`, paste key + type message, encrypt → result screen with `/l/<id>` URL → click that URL → land on `secure_link` page → click "Open Message" → `secure_reader` page renders the original plaintext. Reload `/l/<id>` (max-opens=1 case): "Link No Longer Available" page renders.
- The "Slice 6 coming" callout in `apps/web/src/create/ResultScreen.tsx` is removed.
- `apps/web/AGENTS.md` gets a short addition under the existing "API routes" section explaining the dynamic-segment route convention (`[id]`) and the `params: Promise<...>` signature.

## 12. Risks and mitigations

- **`navigator.clipboard.readText` permission prompts.** On first call some browsers ask for permission. Mitigation: the auto-clear silently no-ops if the read fails — the message lingers in the clipboard but we don't surprise the user with a permission dialog they didn't initiate. Documented behavior, accepted tradeoff.
- **Server Component fetch caching.** Next.js 16 caches `fetch()` calls in Server Components by default. The metadata fetch must use `cache: "no-store"` so the landing page reflects the live `opensCount`. This is the kind of Next-16-breaking-change `apps/web/AGENTS.md` warns about.
  - Mitigation: the `/l/:id` page is a **Client Component** (not a Server Component) because it needs `useIdentity()`. The fetch happens client-side, no Server Component cache to worry about.
- **Race between metadata fetch and open POST.** The metadata GET says "active, 0/1 opens", the user clicks Open, but in the window between the two requests another tab has burned the only open. The POST returns 410. UX impact: the user sees "Link No Longer Available" instead of decrypted content. Acceptable — the alternative (locking on the GET) would burn opens on every preview.
- **Tampered ciphertext indistinguishable from wrong-key.** Both surface as `open()` throwing. We don't try to distinguish. Documented in §8.
- **Self-burning POST + page reload race.** Max-opens=1 link, user clicks Open, succeeds, screen renders plaintext, user reloads the page. The metadata GET now returns 404 (terminal status). UX: "Link No Longer Available". This is correct behavior — they opened it, it's gone — but might surprise a user who expects to keep reading. Mitigation: the `<DecryptedScreen/>` shows "This link has been consumed. Closing this tab discards the message." in the recap area when `opensCount + 1 >= maxOpens`.
- **Direct CiphertextStore.get(id) after incrementOpens — non-atomic.** Slice 4's `incrementOpens` and `ciphertexts.get` are two separate calls; between them, an `expirePastDue` sweep could delete the ciphertext row (since the row is now in 'expired' status from the open). Result: 200 → 500 surprise. Probability is real but small (sweep cadence is per-request opportunistic in Slice 5 onwards, and we only flip to 'expired' on hitting max — for max=1 the sweep would have to run between our two calls). Mitigation: handler maps `ciphertexts.get(id) === null` after a successful `incrementOpens` to a synthetic 410 instead of 500 — same UX as "no longer available", which is honest. Codified in §6.2.

## 13. Out-of-scope, summarized

Security-alert / key-changed flow (Phase 1 has no contacts directory), `/links` list page (later slice), identity rotation (Phase 2+), background blur on visibility change (Phase 2 mobile), screenshot blocking (browser-impossible, no false promise), QR scan (Phase 2 mobile), retry-with-different-passphrase / multi-identity selector (Phase 1 has one identity), Sproobo provisioning (operator concern).
