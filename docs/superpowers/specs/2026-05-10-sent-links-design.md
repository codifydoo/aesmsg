# Slice 7 — Sent links management (`/links` + revoke)

**Date:** 2026-05-10
**Status:** Draft, awaiting approval
**Author:** Claude (brainstorming session with @dsantic)
**Builds on:** Slices 1–6

## 1. Context

Slices 5 and 6 closed the sender ↔ recipient loop. The MVP works end-to-end. The one obvious gap is on the sender's side: once a link is created, there's no in-app way to see it again, copy the URL again, or revoke it. The Slice 4 storage layer already exposes `LinkMetadataStore.revoke(id)`, but nothing in the UI calls it.

Slice 7 adds the **sender's link-management surface**: a `/links` page that lists every link the user has created on this device, lets them re-copy the share URL, and lets them revoke or locally-forget any entry. After this slice, the sender can fully manage their own outbox.

This slice is intentionally **single-device**: the local browser is the source of truth for "which links did I send". Cross-device sync requires either an account or device-pairing — both are Phase 2+ concerns. The Slice 4 schema already records `recipient_fp` but not `sender_fp`; we leave that alone (sender-side identity isn't part of the server's threat model in Phase 1).

## 2. Goals

- Add a `/links` route to `apps/web` driven by the `secure_links_aesmsg` mockup.
- Add a local IndexedDB store (`sent_links`) that captures one tracking record per link created via `/create`, holding only metadata the sender already chose (id, recipient fingerprint, expiry, max-opens, optional label, createdAt).
- Add `POST /api/messages/list` — bulk metadata fetch keyed by an array of ids, so the list page can refresh status in one request without fanning out N GETs against the per-IP rate limit.
- Add `POST /api/messages/:id/revoke` — calls `LinkMetadataStore.revoke(id)`, returns 200 idempotently. No ownership check (anyone with the id can revoke — Phase 1 design choice; documented).
- Wire the sender flow (`<CreateScreen/>`) to save a tracking record locally on successful POST.
- Per-row actions on the list: **Copy** (re-copy share URL with 30s clipboard auto-clear), **Revoke** (confirmation modal → server call → status flips to expired), **Delete** (local-only — removes the row from this device's IndexedDB; server state untouched).

## 3. Non-goals

- **No cross-device sync.** Recipients' opens count is server state and reflects globally; the sender's *own list of which links they created* is local.
- **No ownership token / auth on revoke.** Anyone with the link id can call `POST /:id/revoke`. Risk: malicious revoker DoSes a link they have access to. Acceptable in Phase 1 — same threat surface as a malicious recipient ignoring the message. Phase 2+ can add a `revoke_token` returned at create-time, stored locally, required at revoke-time.
- **No plaintext preview in the list.** The sender deliberately doesn't keep a copy of the message; the list shows fingerprint + status + counters only. This matches the existing client-side "no plaintext persistence" rule from Slice 6.
- **No search / sort / pagination.** Phase 1 lists will be small (tens of items). Add when justified.
- **No multi-select bulk operations.** Single-row actions only.
- **No "send to" labels / contact resolution.** The fingerprint is what we have; contacts is a separate slice.
- **No editing a tracking record after creation.** `label` is added at create-time only (initially: not surfaced — see §4.1 — but the schema is forward-compatible).
- **No `delete-from-server` action.** Revoke purges ciphertext on next sweep; the metadata row is kept for the opaque "no longer available" semantics. There is no "fully erase the row" API in Phase 1.

## 4. UX

### 4.1 Compose-time hook

When `<CreateScreen/>` transitions to the `result` state (after a successful `encryptAndPost`), it calls a new `recordSentLink(record)` function that writes the tracking record to IndexedDB. The user sees no change — the result screen is unchanged. The record holds:

```ts
{
  id: string,                       // 16-char URL-safe link id
  recipientFingerprint: Fingerprint,
  createdAt: string,                // ISO-8601, set at write time
  expiresAt: string,                // ISO-8601, copied from the form
  maxOpens: number,                 // copied from the form
  label: null,                      // reserved for a future "name this link" field
}
```

`label` is forward-compatible scaffolding; Slice 7 always writes `null`. The schema field exists so adding a label feature later doesn't require an IndexedDB migration.

### 4.2 The `/links` page

Driven by `all_design_screens/secure_links_aesmsg/code.html`. Identity gate identical to `/create` (loading / no_identity / locked → existing surfaces from Slice 3).

Once unlocked, the page:

1. Reads all tracking records from the local `sent_links` store.
2. POSTs the array of ids to `/api/messages/list`, gets back the current status of each.
3. Joins the local records with the live status, renders a table.

The row layout, per the mockup:

| Column | Source |
|---|---|
| Recipient fingerprint | local record (truncated 4-group form) |
| Created | local record `createdAt` (relative — "2 hours ago") |
| Status | live response — chip color: emerald "Available" (active + can still open), tertiary "Opened" (active + opensCount > 0), error "Expired" (terminal or past expiry), error "Revoked" (terminal-revoked), grey "Gone" (server returned `not_found`) |
| Views | `${opensCount}/${maxOpens === -1 ? "∞" : maxOpens}` |
| Expires | live response `expiresAt` if active, dash if terminal |
| Actions | Copy / Revoke / Delete icon buttons |

Filter chips above the table: **All / Active / Expired**. Active filters in-memory on the already-fetched rows — no server round-trip per chip click.

If the local store is empty, render an empty-state card: "You haven't sent any secure messages from this device yet. [Create one]" linking to `/create`.

### 4.3 Per-row actions

- **Copy**: writes `${origin}/l/${id}` to the clipboard, shows the 30-second auto-clear indicator pattern from Slice 6's `<DecryptedScreen/>` (same `navigator.clipboard.readText` guard against clobbering).
- **Revoke**: opens a confirmation modal — "Revoke this link? Anyone holding it will see 'no longer available' on their next attempt." Confirm → POST `/api/messages/:id/revoke`. On 200, the local row updates to status="expired" without a re-fetch. On 4xx/5xx, an inline error toast.
- **Delete**: removes the record from the local IndexedDB store. No confirmation modal — it's local-only and the user can re-create if needed. The server is untouched. Disabled if status is `active` (force the user to revoke first if it's still alive); enabled for terminal statuses (Expired / Revoked / Gone).

The **Delete-only-when-terminal** constraint is a small UX guardrail to avoid the user accidentally erasing their tracking record for a still-live link they might want to revoke later.

## 5. Local IndexedDB store

New schema, separate from `@aesmsg/key-store`'s identity DB to keep concerns isolated:

- DB name: `aesmsg-sent-links`
- DB version: 1
- Object store: `sent_links` keyPath: `id`
- Schema version field on each record: `schemaVersion: 1`

Implementation lives in `apps/web/src/lib/sent-links-store.ts`. Public API:

```ts
export interface SentLinkRecord {
  id: string;
  recipientFingerprint: Fingerprint;
  createdAt: string;
  expiresAt: string;
  maxOpens: number;
  label: string | null;
  schemaVersion: 1;
}

export async function recordSentLink(record: Omit<SentLinkRecord, "schemaVersion">): Promise<void>;
export async function listSentLinks(): Promise<SentLinkRecord[]>;
export async function deleteSentLink(id: string): Promise<void>;
export async function __deleteDbForTests(): Promise<void>;
```

`__deleteDbForTests` matches the existing key-store helper for `tests/setup.ts` — the test setup needs to clear both DBs between cases.

## 6. API additions

### 6.1 `POST /api/messages/list`

Bulk metadata fetch. Single rate-limit unit per request.

Request:
```json
{ "ids": ["abcdefghijkl0123", "ghijklmnop123456", "..."] }
```

Constraints: 1 ≤ `ids.length` ≤ 100. All ids must match `LINK_ID_REGEX`.

Response 200:
```json
{
  "results": [
    {
      "id": "abcdefghijkl0123",
      "status": "active",
      "recipientFingerprint": "<64 hex>",
      "expiresAt": "2026-05-11T12:00:00.000Z",
      "maxOpens": 1,
      "opensCount": 0
    },
    {
      "id": "ghijklmnop123456",
      "status": "gone"
    }
  ]
}
```

For each id, the handler runs the same logic as `GET /api/messages/:id` — if the row is missing, revoked, expired, or past-due, return `{ id, status: "gone" }`. Otherwise return the full metadata. Same opaque-conflation rule as Slice 6.

The `status: "gone"` literal is a synthetic UI-only value, not the server-store's `LinkStatus`. The `MessageMetadata` type used by the list response is widened to include it: `status: "active" | "revoked" | "expired" | "gone"`. The single-record GET endpoint from Slice 6 keeps its 404 shape (no schema change), but the bulk endpoint inlines the "gone" sentinel because returning a partial 404 within a 200-array would be confusing.

Errors: 400 (`bad_request`) for invalid id format / array bounds; 429 (`rate_limited`) per-IP at 60/min, namespace key `messages:list:<ip>` (separate from `messages:get:<ip>` so list traffic doesn't trip the single-GET budget and vice-versa). The bulk endpoint costs the same as a single GET — that's intentional, it's the whole point of the bulk shape.

### 6.2 `POST /api/messages/:id/revoke`

Idempotent revoke. No request body.

Response 200: `{ "id": "abcdefghijkl0123", "status": "revoked" }`

Errors: 400 (`bad_request`) for invalid id format; 429 (`rate_limited`) per-IP at 30/min, namespace key `messages:revoke:<ip>` (separate from `messages:open:<ip>`).

The handler calls `LinkMetadataStore.revoke(id)`. The store is idempotent: revoking a non-existent or already-revoked id is a no-op and returns void. The handler surfaces this as 200 — there's no "404 not found" branch, because that would leak whether the id ever existed (matches the §1 invariant). This means a malicious actor with random ids can't probe for which ones exist via revoke either.

The Slice 4 spec's `revoke` already does the right thing; no storage-layer changes needed.

## 7. Architecture

```
apps/web/
├─ app/
│  ├─ links/
│  │  └─ page.tsx                          (Server Component shell, gates via use-identity)
│  └─ api/
│     └─ messages/
│        ├─ list/
│        │  └─ route.ts                    (POST list handler wiring)
│        └─ [id]/
│           └─ revoke/
│              └─ route.ts                 (POST revoke wiring)
└─ src/
   ├─ links/
   │  ├─ LinksScreen.tsx                   (top-level: identity gate + state machine)
   │  ├─ LinksTable.tsx                    (the table, accepts joined rows)
   │  ├─ LinkRow.tsx                       (one row, owns its action menu)
   │  ├─ FilterChips.tsx                   (All / Active / Expired)
   │  ├─ EmptyState.tsx                    (zero local records)
   │  ├─ RevokeConfirmModal.tsx            (confirmation dialog)
   │  └─ refresh-and-list.ts               (orchestrator: read local → POST list → join)
   ├─ lib/
   │  ├─ sent-links-store.ts               (IndexedDB CRUD)
   │  └─ api-client.ts                     (extend with listMessages + revokeMessage)
   ├─ create/
   │  └─ CreateScreen.tsx                  (modify — call recordSentLink on success)
   └─ server/
      └─ messages-handler.ts               (extend with createListMessagesHandler + createRevokeMessageHandler)
```

Same handler/route split as Slices 5 + 6. Memory stores in tests, Pg+Redis in prod via `getStores()`.

## 8. Joined row shape

The list screen renders rows that are the join of the local tracking record with the live server state. Two helpful types:

```ts
// Wider status — adds the synthetic "gone" for rows the server no longer recognizes.
export type SentLinkLiveStatus = "active" | "revoked" | "expired" | "gone";

// What <LinksTable/> renders.
export interface SentLinkRow {
  id: string;
  recipientFingerprint: Fingerprint;
  createdAt: Date;
  expiresAt: Date | null;       // null for "gone" / "revoked" / "expired" responses
  maxOpens: number;
  opensCount: number;
  liveStatus: SentLinkLiveStatus;
}
```

Joining rule: take all fields from the local record, overlay any live-state fields the bulk response provided. For "gone" responses, keep local `id` + `recipientFingerprint` + `createdAt` + `maxOpens` and set `liveStatus: "gone"`, `expiresAt: null`, `opensCount: 0`.

## 9. Tests

### 9.1 Server (handler unit tests)

Extend `apps/web/tests/server/messages-handler.test.ts`:

- `createListMessagesHandler`: 200 on a mix of active + terminal + missing ids (returned correctly per id); 400 on empty array; 400 on `ids.length > 100`; 400 on any malformed id in the array; 429 on rate-limit overflow at 60/min.
- `createRevokeMessageHandler`: 200 on revoking an active link → subsequent `links.get(id)` returns `status: "revoked"`; 200 on revoking an unknown id (idempotent, no-op); 200 on revoking an already-revoked id; 400 on bad id format; 429 on overflow at 30/min.

### 9.2 Local store (IndexedDB unit tests)

`apps/web/tests/lib/sent-links-store.test.ts`:

- `recordSentLink` + `listSentLinks` round-trips a record.
- Multiple records: order of `listSentLinks` is well-defined (sort by `createdAt` desc — newest first).
- `deleteSentLink` removes the record; `listSentLinks` no longer returns it.
- `__deleteDbForTests` clears state between cases.

### 9.3 Components

- `LinkRow.test.tsx`: renders fingerprint truncated, status chip color matches `liveStatus`, Copy callback fires, Revoke callback fires (with id), Delete is disabled for active rows + enabled for terminal rows.
- `FilterChips.test.tsx`: renders the three chips, clicking each fires the callback with the matching key.
- `RevokeConfirmModal.test.tsx`: renders only when `open=true`, Confirm fires `onConfirm`, Cancel fires `onCancel`.

### 9.4 ReaderScreen-style state machine + e2e

`LinksScreen.test.tsx`:

- Empty local store → `<EmptyState/>` renders with link to `/create`.
- One local record + active server state → row renders Available, click Copy invokes clipboard, click Revoke + confirm → row flips to Revoked.
- Local record + server returns "gone" → row renders Gone, Delete enabled.

`apps/web/tests/links-flow.e2e.test.tsx`: bootstrap identity → create a message via `<CreateScreen/>` (mock fetch) → navigate to `<LinksScreen/>` → verify the new record appears → revoke it → verify the row reflects revoked state.

### 9.5 Coverage

Reuse the existing 80% gate.

## 10. Definition of done

- `pnpm typecheck` clean across all workspaces.
- `pnpm lint` clean.
- `pnpm test` green without env vars.
- `/links` page renders all locally tracked links with current status.
- Copy / Revoke / Delete per-row actions work as specified.
- `<CreateScreen/>` writes a tracking record on every successful encryption.
- Manual smoke (in `pnpm dev`): bootstrap identity, create three messages with different expiry/max-opens, navigate to `/links`, verify all three appear with correct status, copy one, revoke another, delete a third — verify the live state updates correctly.
- `apps/web/AGENTS.md` gets a short section under "API routes" pointing at the new bulk + revoke endpoints.

## 11. Risks

- **Per-IP rate-limit on `POST /api/messages/list` is 60/min/IP** (separate `messages:list:<ip>` namespace per §6.1). A user opening `/links` repeatedly in 10 different tabs could trip it. Mitigation: list page uses a single bulk request; navigating away + back caches in React state for the session. Real fix is per-tab caching, not in scope.
- **Local IndexedDB drift** if the user uses multiple devices. Slice 7 explicitly does NOT promise cross-device visibility. Documented.
- **Revoke is unauthenticated.** Documented in §3 non-goals. Phase 2+ can add `revoke_token`.
- **Empty-state vs gone-state.** A user who's revoked all their links sees a list of "Gone" rows, not the empty state. They can Delete each to clear local state, then the empty state renders. Acceptable for Phase 1; "Clear gone" bulk action can come later.
- **Wider `MessageMetadata` for bulk responses.** The single-record GET keeps its 404 shape; the bulk POST uses the inline `status: "gone"` literal. Two slightly different contracts for "this id is no longer real" might confuse readers. Mitigation: API client exposes them as two distinct named types (`MessageMetadata` for single-GET responses, `SentLinkLiveStatus` for bulk-row entries), and the JSDoc on the bulk handler points at this design choice.

## 12. Out-of-scope, summarized

Cross-device sync (Phase 2+), ownership/auth on revoke (Phase 2+), search / sort / pagination, multi-select bulk operations, contacts integration / sender labels resolution, plaintext preview persistence, "fully erase server row" delete, mobile-specific list mockup (`my_secure_links_aesmsg/` is the mobile design — Phase 2 mobile slice).
