# Slice 7 — Sent links management (`/links` + revoke) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sender a `/links` page that lists every link they've created on this device, lets them re-copy the share URL, revoke server-side, or delete locally — driven by a local IndexedDB tracking store, a bulk metadata fetch endpoint, and an idempotent revoke endpoint.

**Architecture:** Local IndexedDB store (`sent_links`) records minimal metadata at `<CreateScreen/>` success time. New `/links` page reads local records, joins with live status from `POST /api/messages/list`, renders the mockup-driven table. Per-row Revoke calls `POST /api/messages/:id/revoke` which forwards to `LinkMetadataStore.revoke()`. Same handler/route split + Memory-store-tested DI pattern from Slices 5 + 6.

**Tech Stack:** Next.js 16 (App Router, Client Component page using `useIdentity()`), React 19, TypeScript strict, Vitest 3 browser mode, IndexedDB (raw, no library), `@aesmsg/server-store/memory` for handler tests.

**Spec:** [`docs/superpowers/specs/2026-05-10-sent-links-design.md`](../specs/2026-05-10-sent-links-design.md)

---

## File map

```
apps/web/
├─ app/
│  ├─ links/
│  │  └─ page.tsx                                     (Task 11)
│  └─ api/
│     └─ messages/
│        ├─ list/
│        │  └─ route.ts                               (Task 11)
│        └─ [id]/
│           └─ revoke/
│              └─ route.ts                            (Task 11)
└─ src/
   ├─ create/
   │  └─ CreateScreen.tsx                             (Task 9 — modify)
   ├─ links/
   │  ├─ EmptyState.tsx                               (Task 7)
   │  ├─ FilterChips.tsx                              (Task 6)
   │  ├─ LinkRow.tsx                                  (Task 5)
   │  ├─ LinksScreen.tsx                              (Task 10)
   │  ├─ LinksTable.tsx                               (Task 8)
   │  ├─ RevokeConfirmModal.tsx                       (Task 7)
   │  ├─ refresh-and-list.ts                          (Task 10)
   │  └─ types.ts                                     (Task 5)
   ├─ lib/
   │  ├─ api-client.ts                                (Task 4 — extend)
   │  └─ sent-links-store.ts                          (Task 1)
   └─ server/
      └─ messages-handler.ts                          (Tasks 2, 3 — extend)

apps/web/tests/
├─ lib/
│  ├─ api-client.test.ts                              (Task 4 — extend)
│  └─ sent-links-store.test.ts                        (Task 1)
├─ server/
│  └─ messages-handler.test.ts                        (Tasks 2, 3 — extend)
├─ links/
│  ├─ EmptyState.test.tsx                             (Task 7)
│  ├─ FilterChips.test.tsx                            (Task 6)
│  ├─ LinkRow.test.tsx                                (Task 5)
│  ├─ LinksScreen.test.tsx                            (Task 10)
│  ├─ LinksTable.test.tsx                             (Task 8)
│  └─ RevokeConfirmModal.test.tsx                     (Task 7)
├─ create/
│  └─ CreateScreen.test.tsx                           (Task 9 — extend)
├─ setup.ts                                           (Task 1 — extend)
└─ links-flow.e2e.test.tsx                            (Task 12)
```

---

## Task 1: Local IndexedDB sent-links store

**Files:**
- Create: `apps/web/src/lib/sent-links-store.ts`
- Create: `apps/web/tests/lib/sent-links-store.test.ts`
- Modify: `apps/web/tests/setup.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/lib/sent-links-store.test.ts`:

```ts
import type { Fingerprint } from "@aesmsg/crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  __deleteSentLinksDbForTests,
  deleteSentLink,
  listSentLinks,
  recordSentLink,
} from "@/src/lib/sent-links-store.js";

afterEach(async () => {
  await __deleteSentLinksDbForTests();
});

const fp = "SM-ABAB-CDCD-EFEF-1212-3434-5656-7878-9A9A" as Fingerprint;

describe("sent-links-store", () => {
  it("recordSentLink + listSentLinks round-trips a record with schemaVersion=1", async () => {
    await recordSentLink({
      id: "abcdefghijkl0123",
      recipientFingerprint: fp,
      createdAt: "2026-05-10T08:00:00.000Z",
      expiresAt: "2026-05-11T08:00:00.000Z",
      maxOpens: 1,
      label: null,
    });
    const records = await listSentLinks();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "abcdefghijkl0123",
      recipientFingerprint: fp,
      maxOpens: 1,
      label: null,
      schemaVersion: 1,
    });
  });

  it("listSentLinks returns records newest-first by createdAt", async () => {
    await recordSentLink({
      id: "older0001234567",
      recipientFingerprint: fp,
      createdAt: "2026-05-10T08:00:00.000Z",
      expiresAt: "2026-05-11T08:00:00.000Z",
      maxOpens: 1,
      label: null,
    });
    await recordSentLink({
      id: "newer0001234567",
      recipientFingerprint: fp,
      createdAt: "2026-05-10T09:00:00.000Z",
      expiresAt: "2026-05-11T09:00:00.000Z",
      maxOpens: 1,
      label: null,
    });
    const records = await listSentLinks();
    expect(records.map((r) => r.id)).toEqual(["newer0001234567", "older0001234567"]);
  });

  it("deleteSentLink removes one record by id and leaves siblings", async () => {
    await recordSentLink({
      id: "kept000123456789",
      recipientFingerprint: fp,
      createdAt: "2026-05-10T08:00:00.000Z",
      expiresAt: "2026-05-11T08:00:00.000Z",
      maxOpens: 1,
      label: null,
    });
    await recordSentLink({
      id: "gone000123456789",
      recipientFingerprint: fp,
      createdAt: "2026-05-10T09:00:00.000Z",
      expiresAt: "2026-05-11T09:00:00.000Z",
      maxOpens: 1,
      label: null,
    });
    await deleteSentLink("gone000123456789");
    const remaining = await listSentLinks();
    expect(remaining.map((r) => r.id)).toEqual(["kept000123456789"]);
  });

  it("deleteSentLink on unknown id is a no-op (no throw)", async () => {
    await expect(deleteSentLink("never00012345678")).resolves.toBeUndefined();
  });

  it("listSentLinks on empty db returns []", async () => {
    const records = await listSentLinks();
    expect(records).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/lib/sent-links-store.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/web/src/lib/sent-links-store.ts`**

```ts
import type { Fingerprint } from "@aesmsg/crypto";

const DB_NAME = "aesmsg-sent-links";
const DB_VERSION = 1;
const STORE_NAME = "sent_links";

export interface SentLinkRecord {
  id: string;
  recipientFingerprint: Fingerprint;
  createdAt: string;
  expiresAt: string;
  maxOpens: number;
  label: string | null;
  schemaVersion: 1;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  if (!dbPromise) dbPromise = openDb();
  const db = await dbPromise;
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    Promise.resolve(fn(store)).then(
      (value) => {
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
      },
      reject,
    );
  });
}

export async function recordSentLink(
  record: Omit<SentLinkRecord, "schemaVersion">,
): Promise<void> {
  const full: SentLinkRecord = { ...record, schemaVersion: 1 };
  await withStore("readwrite", (store) => {
    store.put(full);
  });
}

export async function listSentLinks(): Promise<SentLinkRecord[]> {
  return withStore("readonly", (store) => {
    return new Promise<SentLinkRecord[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as SentLinkRecord[]).slice();
        records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        resolve(records);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function deleteSentLink(id: string): Promise<void> {
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}

export async function __deleteSentLinksDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("deleteDatabase blocked"));
  });
}
```

- [ ] **Step 4: Hook the new DB into `tests/setup.ts`**

Modify `apps/web/tests/setup.ts` to also clear the sent-links DB between tests:

```ts
import "@testing-library/jest-dom/vitest";
import { __deleteDbForTests } from "@aesmsg/key-store";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { __deleteSentLinksDbForTests } from "@/src/lib/sent-links-store.js";

afterEach(async () => {
  cleanup();
  await __deleteDbForTests();
  await __deleteSentLinksDbForTests();
});
```

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/lib/sent-links-store.test.ts`
Expected: PASS — all 5 cases green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sent-links-store.ts apps/web/tests/lib/sent-links-store.test.ts apps/web/tests/setup.ts
git commit -m "feat(web): IndexedDB sent_links store + setup-file teardown"
```

---

## Task 2: `createListMessagesHandler` (bulk metadata fetch)

**Files:**
- Modify: `apps/web/src/server/messages-handler.ts`
- Modify: `apps/web/tests/server/messages-handler.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/server/messages-handler.test.ts`:

```ts
import { createListMessagesHandler } from "@/src/server/messages-handler.js";

function makeListHandler() {
  return createListMessagesHandler({
    links: new MemoryLinkMetadataStore(),
    rateLimit: new MemoryRateLimitStore(),
    now: () => FROZEN_NOW,
  });
}

function makeListReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/messages/list", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("createListMessagesHandler", () => {
  it("returns 200 with active + gone entries for a mixed batch", async () => {
    const links = new MemoryLinkMetadataStore();
    const handler = createListMessagesHandler({
      links,
      rateLimit: new MemoryRateLimitStore(),
      now: () => FROZEN_NOW,
    });

    await links.create({
      id: "activeabcd012345" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: 5,
      recipientFingerprint: "a".repeat(64),
    });
    await links.create({
      id: "revokedabcd01234" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: 1,
      recipientFingerprint: "b".repeat(64),
    });
    await links.revoke("revokedabcd01234" as never);

    const res = await handler(
      makeListReq({
        ids: ["activeabcd012345", "revokedabcd01234", "missingabcd01234"],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    const byId = Object.fromEntries(body.results.map((r) => [r.id, r]));
    expect(byId["activeabcd012345"]).toMatchObject({
      id: "activeabcd012345",
      status: "active",
      recipientFingerprint: "a".repeat(64),
      maxOpens: 5,
      opensCount: 0,
    });
    expect(byId["revokedabcd01234"]).toEqual({ id: "revokedabcd01234", status: "gone" });
    expect(byId["missingabcd01234"]).toEqual({ id: "missingabcd01234", status: "gone" });
  });

  it("returns 400 on empty array", async () => {
    const handler = makeListHandler();
    const res = await handler(makeListReq({ ids: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns 400 when ids exceeds 100", async () => {
    const handler = makeListHandler();
    const ids = Array.from({ length: 101 }, (_, i) =>
      `${"a".repeat(15)}${i.toString(36).slice(0, 1)}`,
    );
    const res = await handler(makeListReq({ ids }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when any id is malformed", async () => {
    const handler = makeListHandler();
    const res = await handler(
      makeListReq({ ids: ["valid12345abcdef", "too-short"] }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON body", async () => {
    const handler = makeListHandler();
    const req = new Request("https://example.com/api/messages/list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it("rate-limits at 60 requests / minute / IP — the 61st returns 429", async () => {
    const handler = makeListHandler();
    for (let i = 0; i < 60; i++) {
      await handler(
        makeListReq({ ids: ["abcdefghijkl0123"] }, { "x-forwarded-for": "7.7.7.7" }),
      );
    }
    const overflow = await handler(
      makeListReq({ ids: ["abcdefghijkl0123"] }, { "x-forwarded-for": "7.7.7.7" }),
    );
    expect(overflow.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/server/messages-handler.test.ts`
Expected: FAIL — `createListMessagesHandler is not exported`.

- [ ] **Step 3: Add the factory to `apps/web/src/server/messages-handler.ts`**

Append at the end of the file:

```ts
const LIST_MAX_IDS = 100;
const LIST_RATE_LIMIT_MAX = 60;

interface ListRequestBody {
  ids: string[];
}

function parseListBody(raw: string): ListRequestBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const ids = (parsed as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return null;
  if (ids.length === 0 || ids.length > LIST_MAX_IDS) return null;
  for (const id of ids) {
    if (typeof id !== "string" || !LINK_ID_REGEX.test(id)) return null;
  }
  return { ids: ids as string[] };
}

export function createListMessagesHandler(deps: GetMessageHandlerDeps) {
  return async function POST(request: Request): Promise<Response> {
    const raw = await request.text();
    const body = parseListBody(raw);
    if (!body) return jsonError(400, "bad_request");

    const ip = getClientIp(request);
    const count = await deps.rateLimit.incrementAndGet(
      `messages:list:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > LIST_RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    const now = deps.now();
    const results = await Promise.all(
      body.ids.map(async (id) => {
        const row = await deps.links.get(id as LinkId);
        if (!row || row.status !== "active" || row.expiresAt.getTime() <= now.getTime()) {
          return { id, status: "gone" as const };
        }
        return {
          id,
          status: row.status,
          recipientFingerprint: row.recipientFingerprint,
          expiresAt: row.expiresAt.toISOString(),
          maxOpens: row.maxOpens,
          opensCount: row.opensCount,
        };
      }),
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/server/messages-handler.test.ts`
Expected: PASS — list cases green alongside existing handlers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/messages-handler.ts apps/web/tests/server/messages-handler.test.ts
git commit -m "feat(web): POST /api/messages/list bulk metadata handler"
```

---

## Task 3: `createRevokeMessageHandler` (idempotent revoke)

**Files:**
- Modify: `apps/web/src/server/messages-handler.ts`
- Modify: `apps/web/tests/server/messages-handler.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/server/messages-handler.test.ts`:

```ts
import { createRevokeMessageHandler } from "@/src/server/messages-handler.js";

function makeRevokeHandler(
  links: MemoryLinkMetadataStore,
  rateLimit: MemoryRateLimitStore = new MemoryRateLimitStore(),
) {
  return createRevokeMessageHandler({ links, rateLimit });
}

function makeRevokeReq(id: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://example.com/api/messages/${id}/revoke`, {
    method: "POST",
    headers,
  });
}

describe("createRevokeMessageHandler", () => {
  it("flips an active link to revoked and returns 200", async () => {
    const links = new MemoryLinkMetadataStore();
    await links.create({
      id: "activeabcd012345" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
      recipientFingerprint: "a".repeat(64),
    });
    const handler = makeRevokeHandler(links);

    const res = await handler(
      makeRevokeReq("activeabcd012345"),
      makeContext("activeabcd012345"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "activeabcd012345", status: "revoked" });

    const after = await links.get("activeabcd012345" as never);
    expect(after?.status).toBe("revoked");
  });

  it("is idempotent — revoking an unknown id returns 200", async () => {
    const handler = makeRevokeHandler(new MemoryLinkMetadataStore());
    const res = await handler(
      makeRevokeReq("nopenopenope0123"),
      makeContext("nopenopenope0123"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "nopenopenope0123", status: "revoked" });
  });

  it("is idempotent — revoking an already-revoked id returns 200", async () => {
    const links = new MemoryLinkMetadataStore();
    await links.create({
      id: "revokedabcd01234" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
      recipientFingerprint: "a".repeat(64),
    });
    await links.revoke("revokedabcd01234" as never);
    const handler = makeRevokeHandler(links);
    const res = await handler(
      makeRevokeReq("revokedabcd01234"),
      makeContext("revokedabcd01234"),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 on bad id format", async () => {
    const handler = makeRevokeHandler(new MemoryLinkMetadataStore());
    const res = await handler(makeRevokeReq("too-short"), makeContext("too-short"));
    expect(res.status).toBe(400);
  });

  it("rate-limits at 30 requests / minute / IP — the 31st returns 429", async () => {
    const links = new MemoryLinkMetadataStore();
    const rateLimit = new MemoryRateLimitStore();
    const handler = makeRevokeHandler(links, rateLimit);
    for (let i = 0; i < 30; i++) {
      const id = `${"a".repeat(15)}${i.toString(36).slice(0, 1)}`;
      await handler(makeRevokeReq(id, { "x-forwarded-for": "6.6.6.6" }), makeContext(id));
    }
    const overflow = await handler(
      makeRevokeReq("overflow123def45", { "x-forwarded-for": "6.6.6.6" }),
      makeContext("overflow123def45"),
    );
    expect(overflow.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/server/messages-handler.test.ts`
Expected: FAIL — `createRevokeMessageHandler is not exported`.

- [ ] **Step 3: Add the factory to `apps/web/src/server/messages-handler.ts`**

Append at the end of the file:

```ts
export interface RevokeMessageHandlerDeps {
  links: LinkMetadataStore;
  rateLimit: RateLimitStore;
}

export function createRevokeMessageHandler(deps: RevokeMessageHandlerDeps) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id } = await context.params;
    if (!LINK_ID_REGEX.test(id)) return jsonError(400, "bad_request");

    const ip = getClientIp(request);
    const count = await deps.rateLimit.incrementAndGet(
      `messages:revoke:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    await deps.links.revoke(id as LinkId);
    return new Response(JSON.stringify({ id, status: "revoked" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/server/messages-handler.test.ts`
Expected: PASS — revoke cases green alongside all prior handlers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/messages-handler.ts apps/web/tests/server/messages-handler.test.ts
git commit -m "feat(web): POST /api/messages/:id/revoke idempotent revoke handler"
```

---

## Task 4: API client — `listMessages` + `revokeMessage`

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/tests/lib/api-client.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/lib/api-client.test.ts`:

```ts
import { listMessages, revokeMessage } from "@/src/lib/api-client.js";

describe("listMessages", () => {
  it("POSTs the ids array and returns the parsed results", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "abcdefghijkl0123",
              status: "active",
              recipientFingerprint: "a".repeat(64),
              expiresAt: "2026-05-11T12:00:00.000Z",
              maxOpens: 1,
              opensCount: 0,
            },
            { id: "missingabcd01234", status: "gone" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await listMessages(["abcdefghijkl0123", "missingabcd01234"]);
    expect(result).toHaveLength(2);
    expect(result[0]?.status).toBe("active");
    expect(result[1]?.status).toBe("gone");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/messages/list",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      ids: ["abcdefghijkl0123", "missingabcd01234"],
    });
  });

  it("throws ApiError on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "bad_request" }), { status: 400 }),
    );
    await expect(listMessages(["abcdefghijkl0123"])).rejects.toMatchObject({
      status: 400,
      code: "bad_request",
    });
  });
});

describe("revokeMessage", () => {
  it("POSTs to /:id/revoke and returns the parsed body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "abcdefghijkl0123", status: "revoked" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await revokeMessage("abcdefghijkl0123");
    expect(result).toEqual({ id: "abcdefghijkl0123", status: "revoked" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/messages/abcdefghijkl0123/revoke",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ApiError on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    await expect(revokeMessage("abcdefghijkl0123")).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/lib/api-client.test.ts`
Expected: FAIL — `listMessages is not a function` / `revokeMessage is not a function`.

- [ ] **Step 3: Append to `apps/web/src/lib/api-client.ts`**

```ts
export type SentLinkLiveStatus = "active" | "revoked" | "expired" | "gone";

export interface ListResultEntry {
  id: string;
  status: SentLinkLiveStatus;
  recipientFingerprint?: string;
  expiresAt?: string;
  maxOpens?: number;
  opensCount?: number;
}

export interface RevokeResponse {
  id: string;
  status: "revoked";
}

export async function listMessages(ids: string[]): Promise<ListResultEntry[]> {
  const res = await fetch("/api/messages/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const err = new Error(`API error: ${res.status}`) as ApiError;
    err.status = res.status;
    err.code = body.error ?? "unknown";
    throw err;
  }
  const json = (await res.json()) as { results: ListResultEntry[] };
  return json.results;
}

export async function revokeMessage(id: string): Promise<RevokeResponse> {
  const res = await fetch(`/api/messages/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const err = new Error(`API error: ${res.status}`) as ApiError;
    err.status = res.status;
    err.code = body.error ?? "unknown";
    throw err;
  }
  return (await res.json()) as RevokeResponse;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/lib/api-client.test.ts`
Expected: PASS — `postMessage` + `getMessage` + `openMessage` + `listMessages` + `revokeMessage` all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/tests/lib/api-client.test.ts
git commit -m "feat(web): listMessages + revokeMessage api-client wrappers"
```

---

## Task 5: `LinkRow` component + `links/types.ts`

**Files:**
- Create: `apps/web/src/links/types.ts`
- Create: `apps/web/src/links/LinkRow.tsx`
- Create: `apps/web/tests/links/LinkRow.test.tsx`

- [ ] **Step 1: Define the joined-row types**

Create `apps/web/src/links/types.ts`:

```ts
import type { Fingerprint } from "@aesmsg/crypto";
import type { SentLinkLiveStatus } from "@/src/lib/api-client.js";

export interface SentLinkRow {
  id: string;
  recipientFingerprint: Fingerprint;
  createdAt: Date;
  expiresAt: Date | null;
  maxOpens: number;
  opensCount: number;
  liveStatus: SentLinkLiveStatus;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/tests/links/LinkRow.test.tsx`:

```tsx
import type { Fingerprint } from "@aesmsg/crypto";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LinkRow } from "@/src/links/LinkRow.js";
import type { SentLinkRow } from "@/src/links/types.js";

const fp = "SM-ABAB-CDCD-EFEF-1212-3434-5656-7878-9A9A" as Fingerprint;

function makeRow(overrides: Partial<SentLinkRow> = {}): SentLinkRow {
  return {
    id: "abcdefghijkl0123",
    recipientFingerprint: fp,
    createdAt: new Date("2026-05-10T08:00:00.000Z"),
    expiresAt: new Date("2026-05-11T08:00:00.000Z"),
    maxOpens: 1,
    opensCount: 0,
    liveStatus: "active",
    ...overrides,
  };
}

describe("LinkRow", () => {
  it("renders the recipient fingerprint truncated to 4 groups", () => {
    render(
      <LinkRow row={makeRow()} onCopy={vi.fn()} onRevoke={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("ABAB CDCD EFEF 1212")).toBeInTheDocument();
  });

  it("renders the 'Available' chip for active + opensCount=0", () => {
    render(
      <LinkRow row={makeRow()} onCopy={vi.fn()} onRevoke={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText(/Available/i)).toBeInTheDocument();
  });

  it("renders the 'Opened' chip for active + opensCount>=1", () => {
    render(
      <LinkRow
        row={makeRow({ opensCount: 1 })}
        onCopy={vi.fn()}
        onRevoke={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Opened/i)).toBeInTheDocument();
  });

  it("renders the 'Revoked' chip for liveStatus=revoked", () => {
    render(
      <LinkRow
        row={makeRow({ liveStatus: "revoked", expiresAt: null })}
        onCopy={vi.fn()}
        onRevoke={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Revoked/i)).toBeInTheDocument();
  });

  it("renders the 'Gone' chip for liveStatus=gone", () => {
    render(
      <LinkRow
        row={makeRow({ liveStatus: "gone", expiresAt: null })}
        onCopy={vi.fn()}
        onRevoke={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Gone/i)).toBeInTheDocument();
  });

  it("disables Delete on active rows", () => {
    render(
      <LinkRow row={makeRow()} onCopy={vi.fn()} onRevoke={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Delete/i })).toBeDisabled();
  });

  it("enables Delete on terminal rows (gone)", () => {
    render(
      <LinkRow
        row={makeRow({ liveStatus: "gone", expiresAt: null })}
        onCopy={vi.fn()}
        onRevoke={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Delete/i })).not.toBeDisabled();
  });

  it("calls onCopy(id) when Copy clicked", async () => {
    const onCopy = vi.fn();
    render(
      <LinkRow row={makeRow()} onCopy={onCopy} onRevoke={vi.fn()} onDelete={vi.fn()} />,
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Copy/i }));
    });
    expect(onCopy).toHaveBeenCalledWith("abcdefghijkl0123");
  });

  it("calls onRevoke(id) when Revoke clicked on an active row", async () => {
    const onRevoke = vi.fn();
    render(
      <LinkRow row={makeRow()} onCopy={vi.fn()} onRevoke={onRevoke} onDelete={vi.fn()} />,
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Revoke/i }));
    });
    expect(onRevoke).toHaveBeenCalledWith("abcdefghijkl0123");
  });

  it("calls onDelete(id) when Delete clicked on a terminal row", async () => {
    const onDelete = vi.fn();
    render(
      <LinkRow
        row={makeRow({ liveStatus: "gone", expiresAt: null })}
        onCopy={vi.fn()}
        onRevoke={vi.fn()}
        onDelete={onDelete}
      />,
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Delete/i }));
    });
    expect(onDelete).toHaveBeenCalledWith("abcdefghijkl0123");
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/links/LinkRow.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 4: Implement `apps/web/src/links/LinkRow.tsx`**

```tsx
"use client";

import { truncateFingerprint } from "@aesmsg/crypto";
import type { SentLinkRow } from "./types.js";

export interface LinkRowProps {
  row: SentLinkRow;
  onCopy: (id: string) => void;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
}

function chipClasses(status: SentLinkRow["liveStatus"], opensCount: number): string {
  if (status === "active" && opensCount === 0) {
    return "border-emerald-500/30 text-emerald-400 bg-emerald-500/5";
  }
  if (status === "active" && opensCount >= 1) {
    return "border-tertiary/30 text-tertiary bg-tertiary/5";
  }
  if (status === "revoked") {
    return "border-error/30 text-error bg-error/5";
  }
  if (status === "expired") {
    return "border-error/30 text-error bg-error/5";
  }
  return "border-outline-variant/30 text-on-surface-variant bg-surface-container-high";
}

function chipLabel(status: SentLinkRow["liveStatus"], opensCount: number): string {
  if (status === "active" && opensCount === 0) return "Available";
  if (status === "active" && opensCount >= 1) return "Opened";
  if (status === "revoked") return "Revoked";
  if (status === "expired") return "Expired";
  return "Gone";
}

function viewsRecap(maxOpens: number, opensCount: number): string {
  if (maxOpens === -1) return `${opensCount}/∞`;
  return `${opensCount}/${maxOpens}`;
}

function expiryRecap(expiresAt: Date | null): string {
  if (!expiresAt) return "—";
  const FAR_FUTURE = new Date("9999-12-31T23:59:59.000Z");
  if (expiresAt.getTime() === FAR_FUTURE.getTime()) return "Never";
  return expiresAt.toLocaleString();
}

export function LinkRow({ row, onCopy, onRevoke, onDelete }: LinkRowProps) {
  const isActive = row.liveStatus === "active";
  const deleteDisabled = isActive;
  const revokeDisabled = !isActive;

  return (
    <tr className="border-b border-outline-variant/10">
      <td className="py-md px-sm font-mono-code text-on-surface text-label-sm">
        {truncateFingerprint(row.recipientFingerprint, 4)}
      </td>
      <td className="py-md px-sm">
        <span
          className={`status-chip px-2 py-0.5 rounded-full border font-label-sm ${chipClasses(row.liveStatus, row.opensCount)}`}
        >
          {chipLabel(row.liveStatus, row.opensCount)}
        </span>
      </td>
      <td className="py-md px-sm text-on-surface font-body-md">
        {viewsRecap(row.maxOpens, row.opensCount)}
      </td>
      <td className="py-md px-sm text-on-surface-variant font-body-md">
        {expiryRecap(row.expiresAt)}
      </td>
      <td className="py-md px-sm">
        <div className="flex gap-sm justify-end">
          <button
            type="button"
            onClick={() => onCopy(row.id)}
            className="text-on-surface-variant hover:text-primary transition-colors active:scale-90 transform"
            aria-label="Copy"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => onRevoke(row.id)}
            disabled={revokeDisabled}
            className="text-on-surface-variant hover:text-tertiary transition-colors active:scale-90 transform disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Revoke"
          >
            Revoke
          </button>
          <button
            type="button"
            onClick={() => onDelete(row.id)}
            disabled={deleteDisabled}
            className="text-on-surface-variant hover:text-error transition-colors active:scale-90 transform disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Delete"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/links/LinkRow.test.tsx`
Expected: PASS — all 10 cases green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/links/types.ts apps/web/src/links/LinkRow.tsx apps/web/tests/links/LinkRow.test.tsx
git commit -m "feat(web): LinkRow with status chip + per-row Copy/Revoke/Delete actions"
```

---

## Task 6: `FilterChips` component

**Files:**
- Create: `apps/web/src/links/FilterChips.tsx`
- Create: `apps/web/tests/links/FilterChips.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/links/FilterChips.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type FilterKey, FilterChips } from "@/src/links/FilterChips.js";

describe("FilterChips", () => {
  it("renders all three chips with the active one highlighted", () => {
    render(<FilterChips active="active" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /All/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Active/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Expired/i })).toBeInTheDocument();
  });

  it("calls onChange with the matching key when a chip is clicked", async () => {
    const onChange = vi.fn();
    render(<FilterChips active="all" onChange={onChange} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Active/i }));
    });
    expect(onChange).toHaveBeenCalledWith("active" satisfies FilterKey);

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Expired/i }));
    });
    expect(onChange).toHaveBeenCalledWith("expired" satisfies FilterKey);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/links/FilterChips.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `apps/web/src/links/FilterChips.tsx`**

```tsx
"use client";

export type FilterKey = "all" | "active" | "expired";

export interface FilterChipsProps {
  active: FilterKey;
  onChange: (key: FilterKey) => void;
}

const CHIPS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
];

export function FilterChips({ active, onChange }: FilterChipsProps) {
  return (
    <div className="flex gap-sm">
      {CHIPS.map((chip) => {
        const isActive = chip.key === active;
        const className = isActive
          ? "px-md py-sm rounded-full bg-primary-container text-on-primary-container font-label-sm whitespace-nowrap"
          : "px-md py-sm rounded-full bg-surface-container-high text-on-surface-variant font-label-sm whitespace-nowrap";
        return (
          <button
            key={chip.key}
            type="button"
            className={className}
            onClick={() => onChange(chip.key)}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/links/FilterChips.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/links/FilterChips.tsx apps/web/tests/links/FilterChips.test.tsx
git commit -m "feat(web): FilterChips for /links (All/Active/Expired)"
```

---

## Task 7: `EmptyState` + `RevokeConfirmModal`

**Files:**
- Create: `apps/web/src/links/EmptyState.tsx`
- Create: `apps/web/src/links/RevokeConfirmModal.tsx`
- Create: `apps/web/tests/links/EmptyState.test.tsx`
- Create: `apps/web/tests/links/RevokeConfirmModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/links/EmptyState.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/src/links/EmptyState.js";

describe("EmptyState", () => {
  it("renders the empty-state copy and a link to /create", () => {
    render(<EmptyState />);
    expect(
      screen.getByText(/haven't sent any secure messages from this device/i),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Create one/i });
    expect(link).toHaveAttribute("href", "/create");
  });
});
```

Create `apps/web/tests/links/RevokeConfirmModal.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RevokeConfirmModal } from "@/src/links/RevokeConfirmModal.js";

describe("RevokeConfirmModal", () => {
  it("does not render when open=false", () => {
    render(<RevokeConfirmModal open={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(
      screen.queryByText(/Anyone holding it will see/i),
    ).not.toBeInTheDocument();
  });

  it("renders when open=true with explanation copy", () => {
    render(<RevokeConfirmModal open={true} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Anyone holding it will see/i)).toBeInTheDocument();
  });

  it("calls onCancel when Cancel clicked", async () => {
    const onCancel = vi.fn();
    render(<RevokeConfirmModal open={true} onCancel={onCancel} onConfirm={vi.fn()} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    });
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onConfirm when Revoke clicked", async () => {
    const onConfirm = vi.fn();
    render(<RevokeConfirmModal open={true} onCancel={vi.fn()} onConfirm={onConfirm} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^Revoke$/i }));
    });
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/links/EmptyState.test.tsx tests/links/RevokeConfirmModal.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `apps/web/src/links/EmptyState.tsx`**

```tsx
"use client";

import { Surface } from "@aesmsg/ui";

export function EmptyState() {
  return (
    <Surface className="px-md md:px-xl py-xl min-h-screen">
      <main className="max-w-[640px] mx-auto w-full text-center space-y-lg">
        <h1 className="font-h1 text-h1 text-on-surface">No links yet</h1>
        <p className="font-body-md text-on-surface-variant">
          You haven't sent any secure messages from this device yet.
        </p>
        <a
          href="/create"
          className="inline-block px-md py-md bg-primary text-on-primary rounded-lg font-label-sm"
        >
          Create one
        </a>
      </main>
    </Surface>
  );
}
```

- [ ] **Step 4: Implement `apps/web/src/links/RevokeConfirmModal.tsx`**

```tsx
"use client";

import { Button, Modal } from "@aesmsg/ui";

export interface RevokeConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RevokeConfirmModal({ open, onCancel, onConfirm }: RevokeConfirmModalProps) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onCancel} ariaLabel="Revoke link confirmation">
      <div className="space-y-lg p-lg">
        <h2 className="font-h2 text-h2 text-on-surface">Revoke this link?</h2>
        <p className="font-body-md text-on-surface-variant">
          Anyone holding it will see "no longer available" on their next attempt. The ciphertext
          is purged from the server.
        </p>
        <div className="flex gap-sm">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm}>
            Revoke
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

If the `@aesmsg/ui` Modal API differs from `{ open, onClose, ariaLabel }`, check `packages/ui/src/Modal.tsx` and adapt — the `WipeConfirmModal` from Slice 3 uses the same pattern and is the source of truth.

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/links/EmptyState.test.tsx tests/links/RevokeConfirmModal.test.tsx`
Expected: PASS — all 5 cases green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/links apps/web/tests/links
git commit -m "feat(web): EmptyState + RevokeConfirmModal for /links"
```

---

## Task 8: `LinksTable` component

**Files:**
- Create: `apps/web/src/links/LinksTable.tsx`
- Create: `apps/web/tests/links/LinksTable.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/links/LinksTable.test.tsx`:

```tsx
import type { Fingerprint } from "@aesmsg/crypto";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LinksTable } from "@/src/links/LinksTable.js";
import type { SentLinkRow } from "@/src/links/types.js";

const fp1 = "SM-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222" as Fingerprint;
const fp2 = "SM-3333-4444-5555-6666-7777-8888-9999-0000" as Fingerprint;

const rows: SentLinkRow[] = [
  {
    id: "abcdefghijkl0123",
    recipientFingerprint: fp1,
    createdAt: new Date("2026-05-10T08:00:00.000Z"),
    expiresAt: new Date("2026-05-11T08:00:00.000Z"),
    maxOpens: 1,
    opensCount: 0,
    liveStatus: "active",
  },
  {
    id: "ghijklmnop123456",
    recipientFingerprint: fp2,
    createdAt: new Date("2026-05-09T08:00:00.000Z"),
    expiresAt: null,
    maxOpens: 1,
    opensCount: 0,
    liveStatus: "gone",
  },
];

describe("LinksTable", () => {
  it("renders a row per item", () => {
    render(
      <LinksTable rows={rows} onCopy={vi.fn()} onRevoke={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("AAAA BBBB CCCC DDDD")).toBeInTheDocument();
    expect(screen.getByText("3333 4444 5555 6666")).toBeInTheDocument();
  });

  it("renders the table header with the column names from the mockup", () => {
    render(
      <LinksTable rows={rows} onCopy={vi.fn()} onRevoke={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByRole("columnheader", { name: /Recipient/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Status/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Views/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Expires/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/links/LinksTable.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/web/src/links/LinksTable.tsx`**

```tsx
"use client";

import { LinkRow } from "./LinkRow.js";
import type { SentLinkRow } from "./types.js";

export interface LinksTableProps {
  rows: SentLinkRow[];
  onCopy: (id: string) => void;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
}

export function LinksTable({ rows, onCopy, onRevoke, onDelete }: LinksTableProps) {
  return (
    <table className="w-full">
      <thead className="border-b border-outline-variant/20">
        <tr className="text-left">
          <th scope="col" className="py-sm px-sm font-label-sm text-on-surface-variant uppercase tracking-widest">
            Recipient
          </th>
          <th scope="col" className="py-sm px-sm font-label-sm text-on-surface-variant uppercase tracking-widest">
            Status
          </th>
          <th scope="col" className="py-sm px-sm font-label-sm text-on-surface-variant uppercase tracking-widest">
            Views
          </th>
          <th scope="col" className="py-sm px-sm font-label-sm text-on-surface-variant uppercase tracking-widest">
            Expires
          </th>
          <th scope="col" className="py-sm px-sm">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <LinkRow
            key={row.id}
            row={row}
            onCopy={onCopy}
            onRevoke={onRevoke}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/links/LinksTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/links/LinksTable.tsx apps/web/tests/links/LinksTable.test.tsx
git commit -m "feat(web): LinksTable composing LinkRow + column headers"
```

---

## Task 9: Wire `<CreateScreen/>` to record sent links

**Files:**
- Modify: `apps/web/src/create/CreateScreen.tsx`
- Modify: `apps/web/tests/create/CreateScreen.test.tsx`

- [ ] **Step 1: Append a failing test that verifies the tracking record gets written**

Append to `apps/web/tests/create/CreateScreen.test.tsx`:

```tsx
import { listSentLinks } from "@/src/lib/sent-links-store.js";

describe("CreateScreen — sent-link tracking", () => {
  it("writes a sent-link record on successful encryption", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "abcdefghijkl0123", url: "https://x/l/abcdefghijkl0123" }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );

    const recipient = await generateIdentity();
    const pk = exportPublicKey(recipient);

    render(<CreateScreen />);
    await act(async () => {
      await userEvent.type(screen.getByLabelText(/Recipient/i), pk);
      await userEvent.type(screen.getByLabelText(/Message/i), "hi");
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Secure Link Created/i })).toBeInTheDocument(),
    );

    const records = await listSentLinks();
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(records[0]?.maxOpens).toBe(1);
    expect(records[0]?.label).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/create/CreateScreen.test.tsx`
Expected: FAIL — `expected length 1, got 0` (no record written).

- [ ] **Step 3: Modify `apps/web/src/create/CreateScreen.tsx` to record the sent link**

In `apps/web/src/create/CreateScreen.tsx`:

Add the import near the existing imports:

```ts
import { recordSentLink } from "@/src/lib/sent-links-store.js";
```

Replace the body of `handleSubmit` so it writes a tracking record after `encryptAndPost` returns:

```ts
  const handleSubmit = async (values: ComposeFormSubmit) => {
    setState({ kind: "encrypting" });
    try {
      const output = await encryptAndPost({
        recipientPublicKeyString: values.recipientPublicKeyString,
        message: values.message,
        expiresAt: values.expiresAt,
        maxOpens: values.maxOpens,
      });
      await recordSentLink({
        id: output.id,
        recipientFingerprint: output.recipientFingerprint,
        createdAt: new Date().toISOString(),
        expiresAt: values.expiresAt.toISOString(),
        maxOpens: values.maxOpens,
        label: null,
      });
      setState({ kind: "result", output, expiresAt: values.expiresAt, maxOpens: values.maxOpens });
    } catch (err) {
      setState({ kind: "compose", error: errorMessageFor(err) });
    }
  };
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/create/CreateScreen.test.tsx`
Expected: PASS — including the new tracking-record case alongside the existing 3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/create/CreateScreen.tsx apps/web/tests/create/CreateScreen.test.tsx
git commit -m "feat(web): CreateScreen writes sent-link tracking record on success"
```

---

## Task 10: `LinksScreen` orchestrator + `refresh-and-list.ts`

**Files:**
- Create: `apps/web/src/links/refresh-and-list.ts`
- Create: `apps/web/src/links/LinksScreen.tsx`
- Create: `apps/web/tests/links/LinksScreen.test.tsx`

- [ ] **Step 1: Implement the join helper `refresh-and-list.ts`** (no separate unit test — covered by `LinksScreen.test.tsx`)

Create `apps/web/src/links/refresh-and-list.ts`:

```ts
import type { Fingerprint } from "@aesmsg/crypto";
import { listMessages } from "@/src/lib/api-client.js";
import { listSentLinks, type SentLinkRecord } from "@/src/lib/sent-links-store.js";
import type { SentLinkRow } from "./types.js";

export async function refreshAndList(): Promise<SentLinkRow[]> {
  const local: SentLinkRecord[] = await listSentLinks();
  if (local.length === 0) return [];
  const ids = local.map((r) => r.id);
  const live = await listMessages(ids);
  const liveById = new Map(live.map((entry) => [entry.id, entry]));

  return local.map((record) => {
    const entry = liveById.get(record.id);
    if (!entry || entry.status === "gone") {
      return {
        id: record.id,
        recipientFingerprint: record.recipientFingerprint,
        createdAt: new Date(record.createdAt),
        expiresAt: null,
        maxOpens: record.maxOpens,
        opensCount: 0,
        liveStatus: "gone",
      };
    }
    return {
      id: record.id,
      recipientFingerprint: (entry.recipientFingerprint ?? record.recipientFingerprint) as Fingerprint,
      createdAt: new Date(record.createdAt),
      expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
      maxOpens: entry.maxOpens ?? record.maxOpens,
      opensCount: entry.opensCount ?? 0,
      liveStatus: entry.status,
    };
  });
}
```

- [ ] **Step 2: Write the failing LinksScreen tests**

Create `apps/web/tests/links/LinksScreen.test.tsx`:

```tsx
import { exportPublicKey, generateIdentity, wrapPrivateKey } from "@aesmsg/crypto";
import { saveIdentity } from "@aesmsg/key-store";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityProvider } from "@/src/lib/identity-context.js";
import { recordSentLink } from "@/src/lib/sent-links-store.js";
import { LinksScreen } from "@/src/links/LinksScreen.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function bootstrap(passphrase = "twelve chars-passphrase") {
  const identity = await generateIdentity();
  const wrapped = await wrapPrivateKey(identity, passphrase);
  await saveIdentity({
    identityId: "primary",
    publicKeyString: exportPublicKey(identity),
    wrapped,
    createdAt: new Date().toISOString(),
    label: "test",
    schemaVersion: 1,
  });
}

async function unlock() {
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: /Unlock your identity/i })).toBeInTheDocument(),
  );
  await act(async () => {
    await userEvent.type(screen.getByLabelText("Passphrase"), "twelve chars-passphrase");
    await userEvent.click(screen.getByRole("button", { name: /Unlock/i }));
  });
}

describe("LinksScreen", () => {
  it("renders EmptyState when local store is empty", async () => {
    await bootstrap();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("should not have called fetch with empty list");
    });

    render(
      <IdentityProvider>
        <LinksScreen />
      </IdentityProvider>,
    );
    await unlock();

    await waitFor(() =>
      expect(
        screen.getByText(/haven't sent any secure messages from this device/i),
      ).toBeInTheDocument(),
    );
  }, 30_000);

  it("renders rows with live status when local + bulk fetch return data", async () => {
    await bootstrap();
    await recordSentLink({
      id: "abcdefghijkl0123",
      recipientFingerprint: "SM-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222" as never,
      createdAt: "2026-05-10T08:00:00.000Z",
      expiresAt: "2026-05-11T08:00:00.000Z",
      maxOpens: 1,
      label: null,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "abcdefghijkl0123",
              status: "active",
              recipientFingerprint: "SM-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222",
              expiresAt: "2026-05-11T08:00:00.000Z",
              maxOpens: 1,
              opensCount: 0,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <IdentityProvider>
        <LinksScreen />
      </IdentityProvider>,
    );
    await unlock();

    await waitFor(() =>
      expect(screen.getByText("AAAA BBBB CCCC DDDD")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Available/i)).toBeInTheDocument();
  }, 30_000);

  it("revokes a row through the confirmation modal and updates its status", async () => {
    await bootstrap();
    await recordSentLink({
      id: "abcdefghijkl0123",
      recipientFingerprint: "SM-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222" as never,
      createdAt: "2026-05-10T08:00:00.000Z",
      expiresAt: "2026-05-11T08:00:00.000Z",
      maxOpens: 1,
      label: null,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/revoke")) {
        return new Response(
          JSON.stringify({ id: "abcdefghijkl0123", status: "revoked" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          results: [
            {
              id: "abcdefghijkl0123",
              status: "active",
              recipientFingerprint: "SM-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222",
              expiresAt: "2026-05-11T08:00:00.000Z",
              maxOpens: 1,
              opensCount: 0,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    render(
      <IdentityProvider>
        <LinksScreen />
      </IdentityProvider>,
    );
    await unlock();

    await waitFor(() => expect(screen.getByText(/Available/i)).toBeInTheDocument());

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Revoke/i }));
    });
    await waitFor(() =>
      expect(screen.getByText(/Anyone holding it will see/i)).toBeInTheDocument(),
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^Revoke$/i }));
    });

    await waitFor(() => expect(screen.getByText(/Revoked/i)).toBeInTheDocument());
  }, 30_000);
});
```

- [ ] **Step 3: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/links/LinksScreen.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `apps/web/src/links/LinksScreen.tsx`**

```tsx
"use client";

import { Surface } from "@aesmsg/ui";
import { type ReactElement, useEffect, useState } from "react";
import { useIdentity } from "@/src/hooks/use-identity.js";
import { SetPassphraseScreen } from "@/src/keys/SetPassphraseScreen.js";
import { UnlockScreen } from "@/src/keys/UnlockScreen.js";
import { WipeConfirmModal } from "@/src/keys/WipeConfirmModal.js";
import { revokeMessage } from "@/src/lib/api-client.js";
import { deleteSentLink } from "@/src/lib/sent-links-store.js";
import { EmptyState } from "./EmptyState.js";
import { type FilterKey, FilterChips } from "./FilterChips.js";
import { LinksTable } from "./LinksTable.js";
import { refreshAndList } from "./refresh-and-list.js";
import { RevokeConfirmModal } from "./RevokeConfirmModal.js";
import type { SentLinkRow } from "./types.js";

const COPY_CLEAR_MS = 30_000;

type State =
  | { kind: "loading" }
  | { kind: "rows"; rows: SentLinkRow[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

function applyFilter(rows: SentLinkRow[], filter: FilterKey): SentLinkRow[] {
  if (filter === "all") return rows;
  if (filter === "active") return rows.filter((r) => r.liveStatus === "active");
  return rows.filter((r) => r.liveStatus !== "active");
}

export function LinksScreen(): ReactElement {
  const { state: identityState, actions } = useIdentity();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);

  const refresh = async () => {
    try {
      const rows = await refreshAndList();
      if (rows.length === 0) setState({ kind: "empty" });
      else setState({ kind: "rows", rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load links";
      setState({ kind: "error", message });
    }
  };

  useEffect(() => {
    if (identityState.status !== "unlocked") return;
    if (state.kind !== "loading") return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityState, state.kind]);

  if (identityState.status === "loading") {
    return (
      <main className="min-h-screen bg-background text-on-surface flex items-center justify-center">
        <p className="font-body-md text-on-surface-variant">Loading…</p>
      </main>
    );
  }
  if (identityState.status === "no_identity") {
    return <SetPassphraseScreen onSubmit={(pw) => actions.setupNew(pw)} />;
  }
  if (identityState.status === "locked") {
    return (
      <UnlockScreen onUnlock={(pw) => actions.unlock(pw)} onWipe={() => setWipeOpen(true)} />
    );
  }

  const onCopy = async (id: string) => {
    const url = `${window.location.origin}/l/${id}`;
    await navigator.clipboard.writeText(url);
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === url) await navigator.clipboard.writeText("");
      } catch {
        // permission-gated; silently no-op
      }
    }, COPY_CLEAR_MS);
  };

  const onRevokeRequest = (id: string) => {
    setRevokeTarget(id);
  };

  const onRevokeConfirm = async () => {
    if (!revokeTarget) return;
    const id = revokeTarget;
    setRevokeTarget(null);
    try {
      await revokeMessage(id);
      if (state.kind === "rows") {
        setState({
          kind: "rows",
          rows: state.rows.map((r) =>
            r.id === id ? { ...r, liveStatus: "revoked", expiresAt: null } : r,
          ),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Revoke failed";
      setState({ kind: "error", message });
    }
  };

  const onDelete = async (id: string) => {
    await deleteSentLink(id);
    if (state.kind === "rows") {
      const remaining = state.rows.filter((r) => r.id !== id);
      setState(remaining.length === 0 ? { kind: "empty" } : { kind: "rows", rows: remaining });
    }
  };

  let body: ReactElement;
  switch (state.kind) {
    case "loading":
      body = (
        <main className="min-h-screen bg-background text-on-surface flex items-center justify-center">
          <p className="font-body-md text-on-surface-variant">Loading links…</p>
        </main>
      );
      break;
    case "empty":
      body = <EmptyState />;
      break;
    case "error":
      body = (
        <Surface className="px-md md:px-xl py-xl min-h-screen">
          <main className="max-w-[640px] mx-auto w-full text-center space-y-md">
            <h1 className="font-h1 text-h1 text-on-surface">Couldn't load links</h1>
            <p className="font-body-md text-on-surface-variant">{state.message}</p>
          </main>
        </Surface>
      );
      break;
    case "rows":
      body = (
        <Surface className="px-md md:px-xl py-xl min-h-screen">
          <main className="max-w-[960px] mx-auto w-full space-y-lg">
            <header className="space-y-sm">
              <h1 className="font-h1 text-h1 text-on-surface">Secure Links</h1>
              <p className="font-body-md text-on-surface-variant">
                Manage links you've created on this device.
              </p>
            </header>
            <FilterChips active={filter} onChange={setFilter} />
            <LinksTable
              rows={applyFilter(state.rows, filter)}
              onCopy={onCopy}
              onRevoke={onRevokeRequest}
              onDelete={onDelete}
            />
          </main>
        </Surface>
      );
      break;
  }

  return (
    <>
      {body}
      <RevokeConfirmModal
        open={revokeTarget !== null}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={onRevokeConfirm}
      />
      <WipeConfirmModal
        open={wipeOpen}
        onCancel={() => setWipeOpen(false)}
        onConfirm={async () => {
          await actions.wipe();
          setWipeOpen(false);
        }}
      />
    </>
  );
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/links/LinksScreen.test.tsx`
Expected: PASS — all 3 state-machine paths green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/links/refresh-and-list.ts apps/web/src/links/LinksScreen.tsx apps/web/tests/links/LinksScreen.test.tsx
git commit -m "feat(web): LinksScreen orchestrator + refresh-and-list join"
```

---

## Task 11: Route + page wiring

**Files:**
- Create: `apps/web/app/links/page.tsx`
- Create: `apps/web/app/api/messages/list/route.ts`
- Create: `apps/web/app/api/messages/[id]/revoke/route.ts`

- [ ] **Step 1: Create directories**

Run:
```bash
mkdir -p apps/web/app/links apps/web/app/api/messages/list apps/web/app/api/messages/\[id\]/revoke
```

- [ ] **Step 2: Create the page Server Component shell**

Create `apps/web/app/links/page.tsx`:

```tsx
import { LinksScreen } from "@/src/links/LinksScreen.js";

export default function LinksPage() {
  return <LinksScreen />;
}
```

- [ ] **Step 3: Wire the bulk list route**

Create `apps/web/app/api/messages/list/route.ts`:

```ts
import { createListMessagesHandler } from "@/src/server/messages-handler.js";
import { getStores } from "@/src/server/stores.js";

export const runtime = "nodejs";

export const POST = createListMessagesHandler({
  ...getStores(),
  now: () => new Date(),
});
```

- [ ] **Step 4: Wire the revoke route**

Create `apps/web/app/api/messages/[id]/revoke/route.ts`:

```ts
import { createRevokeMessageHandler } from "@/src/server/messages-handler.js";
import { getStores } from "@/src/server/stores.js";

export const runtime = "nodejs";

export const POST = createRevokeMessageHandler(getStores());
```

(The factory accepts `{ links, rateLimit }`. `getStores()` returns `{ links, ciphertexts, rateLimit }` — TypeScript accepts the wider object as an argument because the required keys are present. This mirrors how Slice 5's `/api/messages/[id]/open/route.ts` is wired.)

- [ ] **Step 5: Verify typecheck + tests + lint**

Run:
- `pnpm --filter web typecheck`
- `pnpm --filter web exec vitest run`
- `pnpm lint`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/links apps/web/app/api/messages/list apps/web/app/api/messages/\[id\]/revoke
git commit -m "feat(web): wire /links page + POST /list + POST /:id/revoke routes"
```

---

## Task 12: Browser e2e — full sent-links flow

**Files:**
- Create: `apps/web/tests/links-flow.e2e.test.tsx`

- [ ] **Step 1: Write the e2e test**

Create `apps/web/tests/links-flow.e2e.test.tsx`:

```tsx
import { exportPublicKey, generateIdentity, wrapPrivateKey } from "@aesmsg/crypto";
import { saveIdentity } from "@aesmsg/key-store";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateScreen } from "@/src/create/CreateScreen.js";
import { IdentityProvider } from "@/src/lib/identity-context.js";
import { LinksScreen } from "@/src/links/LinksScreen.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/links end-to-end flow", () => {
  it("creates a link via CreateScreen → appears on LinksScreen → revokes successfully", async () => {
    const passphrase = "twelve chars-passphrase";
    const myIdentity = await generateIdentity();
    const wrapped = await wrapPrivateKey(myIdentity, passphrase);
    await saveIdentity({
      identityId: "primary",
      publicKeyString: exportPublicKey(myIdentity),
      wrapped,
      createdAt: new Date().toISOString(),
      label: "test",
      schemaVersion: 1,
    });

    let createdId: string | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      // Sender flow: POST /api/messages → returns id from the request body
      if (url.endsWith("/api/messages")) {
        const body = JSON.parse((init as RequestInit).body as string) as { id: string };
        createdId = body.id;
        return new Response(
          JSON.stringify({ id: body.id, url: `${window.location.origin}/l/${body.id}` }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      // Bulk list: return our one record as active
      if (url.endsWith("/api/messages/list")) {
        return new Response(
          JSON.stringify({
            results: createdId
              ? [
                  {
                    id: createdId,
                    status: "active",
                    recipientFingerprint: "SM-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222",
                    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
                    maxOpens: 1,
                    opensCount: 0,
                  },
                ]
              : [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // Revoke: 200 idempotent
      if (url.endsWith("/revoke")) {
        return new Response(
          JSON.stringify({ id: createdId, status: "revoked" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    // Step 1: render CreateScreen + walk through to a successful create.
    const recipient = await generateIdentity();
    const pk = exportPublicKey(recipient);

    const createView = render(
      <IdentityProvider>
        <CreateScreen />
      </IdentityProvider>,
    );

    await act(async () => {
      await userEvent.type(screen.getByLabelText(/Recipient/i), pk);
      await userEvent.type(screen.getByLabelText(/Message/i), "track me");
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Encrypt & Create Link/i })).not.toBeDisabled(),
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Encrypt & Create Link/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Secure Link Created/i })).toBeInTheDocument(),
    );

    createView.unmount();

    // Step 2: render LinksScreen — we expect the new record + active live state.
    render(
      <IdentityProvider>
        <LinksScreen />
      </IdentityProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Secure Links/i })).toBeInTheDocument(),
      { timeout: 5000 },
    );
    await waitFor(() => expect(screen.getByText(/Available/i)).toBeInTheDocument());

    // Step 3: revoke through the modal.
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Revoke/i }));
    });
    await waitFor(() =>
      expect(screen.getByText(/Anyone holding it will see/i)).toBeInTheDocument(),
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /^Revoke$/i }));
    });
    await waitFor(() => expect(screen.getByText(/Revoked/i)).toBeInTheDocument());
  }, 60_000);
});
```

- [ ] **Step 2: Run the e2e test — expect pass**

Run: `pnpm --filter web exec vitest run tests/links-flow.e2e.test.tsx`
Expected: PASS — full flow green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/links-flow.e2e.test.tsx
git commit -m "test(web): /links e2e — create → list → revoke"
```

---

## Task 13: Documentation + final verification

**Files:**
- Modify: `apps/web/AGENTS.md`

- [ ] **Step 1: Append a "Sent links" subsection to `apps/web/AGENTS.md`**

Append after the existing "Dynamic route segments" subsection:

```md
### Sent links (Slice 7)

The sender's `/links` page is single-device. The local IndexedDB store at `src/lib/sent-links-store.ts` (DB `aesmsg-sent-links`) holds tracking records keyed by link id. Records are written by `<CreateScreen/>` on every successful encryption — there's no other entry point. Records hold only sender-derivable metadata (id, recipient fingerprint, expiry, max-opens, createdAt); the plaintext is never stored.

Status displayed on the list is the join of the local record with a live `POST /api/messages/list` bulk fetch — "gone" rows mean the server returned `not_found` or terminal-status (revoked / expired / past-expiry). Revoke calls `POST /api/messages/:id/revoke` which is idempotent and unauthenticated in Phase 1 (anyone with the id can revoke; documented in the Slice 7 spec §3 non-goals).

Tests reset the sent-links DB in `tests/setup.ts` alongside the identity DB.
```

- [ ] **Step 2: Workspace-wide verification**

Run:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

Expected: all PASS.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run `pnpm dev`. In a browser:
1. Bootstrap identity at `/keys`.
2. Create three messages via `/create` with different settings (one with max_opens=1, one with max_opens=5, one with expiry=Never).
3. Visit `/links` — all three appear with "Available" status.
4. Click Copy on one — verify clipboard contains the link.
5. Click Revoke on another → confirm the modal — verify status flips to "Revoked".
6. Click Delete on the revoked one — verify it disappears from the list.
7. Filter chips: All / Active / Expired — verify filtering works.

- [ ] **Step 4: Commit**

```bash
git add apps/web/AGENTS.md
git commit -m "docs(web): document Slice 7 sent-links pattern"
```

---

## Wrap-up checklist (read after running Task 13)

- [ ] `pnpm typecheck` clean across every workspace.
- [ ] `pnpm lint` clean.
- [ ] `pnpm test` green without env vars.
- [ ] `/links` UI matches the `secure_links_aesmsg` mockup (table + filter chips + per-row Copy/Revoke/Delete + status chips).
- [ ] `<CreateScreen/>` writes a tracking record on every successful encryption.
- [ ] `POST /api/messages/list` bulk endpoint returns mixed active/gone results in one response.
- [ ] `POST /api/messages/:id/revoke` is idempotent, no-op for missing/revoked, no ownership check.
- [ ] Local IndexedDB cleanup hooked into `tests/setup.ts`.
- [ ] All commits use `feat(web)` / `test(web)` / `docs(web)` style.

After Slice 7, the sender's outbox loop is closed. Subsequent Phase 1 polish: revoke ownership tokens, contacts directory, mobile mockup variant. Phase 2: identity rotation, file attachments, security-alert flow.
