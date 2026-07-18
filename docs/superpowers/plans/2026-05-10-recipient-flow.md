# Slice 6 — Recipient flow (`/l/:id` + `GET /api/messages/:id` + `POST /api/messages/:id/open`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the aesmsg loop — a recipient who clicks a `/l/:id` link lands on a safe preview, unlocks identity, explicitly opens the message, and reads the decrypted plaintext locally. Two-stage GET/POST keeps link-preview crawlers from burning opens; HPKE auth-tag mismatch routes the wrong-key case to a single opaque "Decryption Failed" screen.

**Architecture:** Single `/l/:id` route renders a state machine that walks `loading → landing → opening → decrypted | failed | gone`. Two new handler factories (`createGetMessageHandler`, `createOpenMessageHandler`) live alongside Slice 5's `createMessagesHandler` and reuse the same DI pattern (Memory stores in tests, Pg+Redis in prod via `getStores()`). Client orchestrator `fetch-and-open.ts` POSTs to `/open`, base64-decodes the response, calls `crypto.open()` with the link id as AAD, returns plaintext.

**Tech Stack:** Next.js 16 (App Router with `[id]` dynamic segments + `params: Promise<...>` signature), React 19, TypeScript strict, Vitest 3 browser mode (Playwright Chromium), `@aesmsg/crypto` (HPKE open), `@aesmsg/server-store` (Memory + Pg + Redis stores).

**Spec:** [`docs/superpowers/specs/2026-05-10-recipient-flow-design.md`](../specs/2026-05-10-recipient-flow-design.md)

---

## File map

```
apps/web/
├─ app/
│  ├─ l/
│  │  └─ [id]/
│  │     └─ page.tsx                       (Task 11 — Server Component shell)
│  └─ api/
│     └─ messages/
│        └─ [id]/
│           ├─ route.ts                    (Task 11 — GET wiring)
│           └─ open/
│              └─ route.ts                 (Task 11 — POST wiring)
└─ src/
   ├─ create/
   │  └─ ResultScreen.tsx                  (Task 11 — remove "Slice 6 coming" callout)
   ├─ reader/
   │  ├─ LandingScreen.tsx                 (Task 6)
   │  ├─ DecryptedScreen.tsx               (Task 7)
   │  ├─ DecryptionFailedScreen.tsx        (Task 8)
   │  ├─ LinkUnavailableScreen.tsx         (Task 9)
   │  ├─ ReaderScreen.tsx                  (Task 10)
   │  └─ fetch-and-open.ts                 (Task 5)
   ├─ lib/
   │  ├─ base64.ts                         (Task 1 — extend with base64ToBytes)
   │  └─ api-client.ts                     (Task 2 — extend with getMessage + openMessage)
   └─ server/
      └─ messages-handler.ts               (Tasks 3, 4 — extend with two new factories)

apps/web/tests/
├─ lib/
│  ├─ base64.test.ts                       (Task 1 — extend)
│  └─ api-client.test.ts                   (Task 2 — extend)
├─ server/
│  └─ messages-handler.test.ts             (Tasks 3, 4 — extend)
├─ reader/
│  ├─ fetch-and-open.test.ts               (Task 5)
│  ├─ LandingScreen.test.tsx               (Task 6)
│  ├─ DecryptedScreen.test.tsx             (Task 7)
│  ├─ DecryptionFailedScreen.test.tsx      (Task 8)
│  ├─ LinkUnavailableScreen.test.tsx       (Task 9)
│  └─ ReaderScreen.test.tsx                (Task 10)
└─ open-flow.e2e.test.tsx                  (Task 12)
```

---

## Task 1: Extend `base64.ts` with `base64ToBytes`

**Files:**
- Modify: `apps/web/src/lib/base64.ts`
- Modify: `apps/web/tests/lib/base64.test.ts`

- [ ] **Step 1: Append failing tests for `base64ToBytes`**

Append to `apps/web/tests/lib/base64.test.ts`:

```ts
import { base64ToBytes, bytesToBase64 } from "@/src/lib/base64.js";

describe("base64ToBytes", () => {
  it("decodes well-known fixtures", () => {
    expect(Array.from(base64ToBytes(""))).toEqual([]);
    expect(Array.from(base64ToBytes("Zm9v"))).toEqual([102, 111, 111]); // "foo"
    expect(Array.from(base64ToBytes("Zm9vYmFy"))).toEqual([102, 111, 111, 98, 97, 114]); // "foobar"
  });

  it("round-trips arbitrary bytes via bytesToBase64", () => {
    const original = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 32]);
    const encoded = bytesToBase64(original);
    const decoded = base64ToBytes(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("throws on invalid base64", () => {
    expect(() => base64ToBytes("***not-base64***")).toThrow();
  });
});
```

The existing `base64.test.ts` already imports from `@/src/lib/base64.js` so the import line is a duplicate — collapse into a single import if Biome flags it during lint:fix. The existing `bytesToBase64` describe blocks stay untouched.

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/lib/base64.test.ts`
Expected: FAIL — `base64ToBytes is not a function`.

- [ ] **Step 3: Add `base64ToBytes` to `apps/web/src/lib/base64.ts`**

Append to the file:

```ts
export function base64ToBytes(s: string): Uint8Array {
  const binary = atob(s); // throws "InvalidCharacterError" on invalid base64
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/lib/base64.test.ts`
Expected: PASS — all `bytesToBase64`, `bytesToBase64Url`, and `base64ToBytes` cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/base64.ts apps/web/tests/lib/base64.test.ts
git commit -m "feat(web): add base64ToBytes for ciphertext download"
```

---

## Task 2: Extend `api-client.ts` with `getMessage` + `openMessage`

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/tests/lib/api-client.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/lib/api-client.test.ts`:

```ts
import { getMessage, openMessage } from "@/src/lib/api-client.js";

describe("getMessage", () => {
  it("GETs the metadata endpoint with cache: no-store and parses { status, recipientFingerprint, expiresAt, maxOpens, opensCount }", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "active",
          recipientFingerprint: "a".repeat(64),
          expiresAt: "2026-05-11T12:00:00.000Z",
          maxOpens: 1,
          opensCount: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await getMessage("abcdefghijkl0123");

    expect(result.status).toBe("active");
    expect(result.maxOpens).toBe(1);
    expect(result.opensCount).toBe(0);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/messages/abcdefghijkl0123",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("throws ApiError carrying status + code on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
    );
    await expect(getMessage("abcdefghijkl0123")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });
});

describe("openMessage", () => {
  it("POSTs to /open and parses { ciphertext, recipientFingerprint, opensCount, maxOpens, status }", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ciphertext: "Zm9v",
          recipientFingerprint: "b".repeat(64),
          opensCount: 1,
          maxOpens: 1,
          status: "expired",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await openMessage("abcdefghijkl0123");

    expect(result.ciphertext).toBe("Zm9v");
    expect(result.status).toBe("expired");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/messages/abcdefghijkl0123/open",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ApiError on 410 no_longer_available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "no_longer_available" }), { status: 410 }),
    );
    await expect(openMessage("abcdefghijkl0123")).rejects.toMatchObject({
      status: 410,
      code: "no_longer_available",
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/lib/api-client.test.ts`
Expected: FAIL — `getMessage is not a function`.

- [ ] **Step 3: Append the new exports to `apps/web/src/lib/api-client.ts`**

Append after the existing `postMessage` definition:

```ts
export interface MessageMetadata {
  status: "active" | "revoked" | "expired";
  recipientFingerprint: string;
  expiresAt: string;
  maxOpens: number;
  opensCount: number;
}

export interface OpenMessageResponse {
  ciphertext: string;
  recipientFingerprint: string;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}

export async function getMessage(id: string): Promise<MessageMetadata> {
  const res = await fetch(`/api/messages/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const err = new Error(`API error: ${res.status}`) as ApiError;
    err.status = res.status;
    err.code = body.error ?? "unknown";
    throw err;
  }
  return (await res.json()) as MessageMetadata;
}

export async function openMessage(id: string): Promise<OpenMessageResponse> {
  const res = await fetch(`/api/messages/${encodeURIComponent(id)}/open`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const err = new Error(`API error: ${res.status}`) as ApiError;
    err.status = res.status;
    err.code = body.error ?? "unknown";
    throw err;
  }
  return (await res.json()) as OpenMessageResponse;
}
```

(Three almost-identical `if (!res.ok)` error-handling blocks now exist between `postMessage`, `getMessage`, and `openMessage`. YAGNI says wait for the 4th call before extracting a helper — these three small duplicates cost less than the abstraction.)

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/lib/api-client.test.ts`
Expected: PASS — `postMessage` + `getMessage` + `openMessage` all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/tests/lib/api-client.test.ts
git commit -m "feat(web): add getMessage + openMessage api-client wrappers"
```

---

## Task 3: GET handler — `createGetMessageHandler`

**Files:**
- Modify: `apps/web/src/server/messages-handler.ts`
- Modify: `apps/web/tests/server/messages-handler.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/server/messages-handler.test.ts`:

```ts
import { createGetMessageHandler } from "@/src/server/messages-handler.js";

function makeGetHandler() {
  return createGetMessageHandler({
    links: new MemoryLinkMetadataStore(),
    rateLimit: new MemoryRateLimitStore(),
    now: () => FROZEN_NOW,
  });
}

function makeGetReq(id: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://example.com/api/messages/${id}`, {
    method: "GET",
    headers,
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("createGetMessageHandler", () => {
  it("returns 200 metadata for an active link", async () => {
    const links = new MemoryLinkMetadataStore();
    const rateLimit = new MemoryRateLimitStore();
    const handler = createGetMessageHandler({ links, rateLimit, now: () => FROZEN_NOW });

    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: 1,
      recipientFingerprint: "a".repeat(64),
    });

    const res = await handler(makeGetReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      recipientFingerprint: string;
      expiresAt: string;
      maxOpens: number;
      opensCount: number;
    };
    expect(body.status).toBe("active");
    expect(body.recipientFingerprint).toBe("a".repeat(64));
    expect(body.maxOpens).toBe(1);
    expect(body.opensCount).toBe(0);
  });

  it("returns 400 on bad id format", async () => {
    const handler = makeGetHandler();
    const res = await handler(makeGetReq("too-short"), makeContext("too-short"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns 404 (opaque) when no row exists", async () => {
    const handler = makeGetHandler();
    const res = await handler(
      makeGetReq("abcdefghijkl0123"),
      makeContext("abcdefghijkl0123"),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("returns 404 (opaque) for a revoked link", async () => {
    const links = new MemoryLinkMetadataStore();
    const handler = createGetMessageHandler({
      links,
      rateLimit: new MemoryRateLimitStore(),
      now: () => FROZEN_NOW,
    });
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: -1,
      recipientFingerprint: "a".repeat(64),
    });
    await links.revoke("abcdefghijkl0123" as never);
    const res = await handler(
      makeGetReq("abcdefghijkl0123"),
      makeContext("abcdefghijkl0123"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 (opaque) for a past-expiry link", async () => {
    const links = new MemoryLinkMetadataStore();
    const handler = createGetMessageHandler({
      links,
      rateLimit: new MemoryRateLimitStore(),
      now: () => FROZEN_NOW,
    });
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() - 1000),
      maxOpens: -1,
      recipientFingerprint: "a".repeat(64),
    });
    const res = await handler(
      makeGetReq("abcdefghijkl0123"),
      makeContext("abcdefghijkl0123"),
    );
    expect(res.status).toBe(404);
  });

  it("rate-limits at 60 requests / minute / IP — the 61st returns 429", async () => {
    const links = new MemoryLinkMetadataStore();
    const handler = createGetMessageHandler({
      links,
      rateLimit: new MemoryRateLimitStore(),
      now: () => FROZEN_NOW,
    });
    // 60 GETs to the same IP for a non-existent id (404) — still counted by rate limit.
    for (let i = 0; i < 60; i++) {
      const id = `${"a".repeat(15)}${i.toString(36).slice(0, 1)}`;
      await handler(
        makeGetReq(id, { "x-forwarded-for": "9.9.9.9" }),
        makeContext(id),
      );
    }
    const overflow = await handler(
      makeGetReq("overflowdef45678", { "x-forwarded-for": "9.9.9.9" }),
      makeContext("overflowdef45678"),
    );
    expect(overflow.status).toBe(429);
    expect(await overflow.json()).toEqual({ error: "rate_limited" });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/server/messages-handler.test.ts`
Expected: FAIL — `createGetMessageHandler is not exported`.

- [ ] **Step 3: Add the constants + factory to `apps/web/src/server/messages-handler.ts`**

Add the new constant near the top (alongside the existing `RATE_LIMIT_*` constants):

```ts
const GET_RATE_LIMIT_MAX = 60;
```

Append the new factory at the end of the file (after `createMessagesHandler`):

```ts
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
    if (!LINK_ID_REGEX.test(id)) return jsonError(400, "bad_request");

    const ip = getClientIp(request);
    const count = await deps.rateLimit.incrementAndGet(
      `messages:get:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > GET_RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    const row = await deps.links.get(id as LinkId);
    if (!row) return jsonError(404, "not_found");
    if (row.status !== "active") return jsonError(404, "not_found");
    if (row.expiresAt.getTime() <= deps.now().getTime()) return jsonError(404, "not_found");

    return new Response(
      JSON.stringify({
        status: row.status,
        recipientFingerprint: row.recipientFingerprint,
        expiresAt: row.expiresAt.toISOString(),
        maxOpens: row.maxOpens,
        opensCount: row.opensCount,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/server/messages-handler.test.ts`
Expected: PASS — Slice 5's tests + new `createGetMessageHandler` cases all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/messages-handler.ts apps/web/tests/server/messages-handler.test.ts
git commit -m "feat(web): GET /api/messages/:id metadata handler (preview-safe)"
```

---

## Task 4: POST `/open` handler — `createOpenMessageHandler`

**Files:**
- Modify: `apps/web/src/server/messages-handler.ts`
- Modify: `apps/web/tests/server/messages-handler.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `apps/web/tests/server/messages-handler.test.ts`:

```ts
import { createOpenMessageHandler } from "@/src/server/messages-handler.js";

function makeOpenHandler(
  links: MemoryLinkMetadataStore,
  ciphertexts: MemoryCiphertextStore,
  rateLimit: MemoryRateLimitStore = new MemoryRateLimitStore(),
) {
  return createOpenMessageHandler({ links, ciphertexts, rateLimit });
}

function makePostReq(id: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://example.com/api/messages/${id}/open`, {
    method: "POST",
    headers,
  });
}

describe("createOpenMessageHandler", () => {
  it("returns 200 with base64 ciphertext + metadata recap on first open", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    const handler = makeOpenHandler(links, ciphertexts);

    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: 1,
      recipientFingerprint: "a".repeat(64),
    });
    await ciphertexts.put("abcdefghijkl0123" as never, new Uint8Array([1, 2, 3, 4, 5]));

    const res = await handler(
      makePostReq("abcdefghijkl0123"),
      makeContext("abcdefghijkl0123"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ciphertext: string;
      recipientFingerprint: string;
      opensCount: number;
      maxOpens: number;
      status: string;
    };
    expect(body.recipientFingerprint).toBe("a".repeat(64));
    expect(body.opensCount).toBe(1);
    expect(body.maxOpens).toBe(1);
    expect(body.status).toBe("expired"); // hit max → flipped on this open
    // ciphertext base64 decodes to the bytes we put
    const binary = atob(body.ciphertext);
    expect(Array.from(binary).map((c) => c.charCodeAt(0))).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns 400 on bad id format", async () => {
    const handler = makeOpenHandler(new MemoryLinkMetadataStore(), new MemoryCiphertextStore());
    const res = await handler(makePostReq("too-short"), makeContext("too-short"));
    expect(res.status).toBe(400);
  });

  it("returns 410 when incrementOpens returns null (revoked link)", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: -1,
      recipientFingerprint: "a".repeat(64),
    });
    await links.revoke("abcdefghijkl0123" as never);
    const handler = makeOpenHandler(links, ciphertexts);
    const res = await handler(
      makePostReq("abcdefghijkl0123"),
      makeContext("abcdefghijkl0123"),
    );
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "no_longer_available" });
  });

  it("returns 410 (synthetic) when incrementOpens succeeds but ciphertext is missing", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: -1,
      recipientFingerprint: "a".repeat(64),
    });
    // No ciphertext put — simulates the storage drift race documented in spec §12.
    const handler = makeOpenHandler(links, ciphertexts);
    const res = await handler(
      makePostReq("abcdefghijkl0123"),
      makeContext("abcdefghijkl0123"),
    );
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "no_longer_available" });
  });

  it("burns single-use links — first open 200, second open 410", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: 1,
      recipientFingerprint: "a".repeat(64),
    });
    await ciphertexts.put("abcdefghijkl0123" as never, new Uint8Array([42]));
    const handler = makeOpenHandler(links, ciphertexts);

    const first = await handler(
      makePostReq("abcdefghijkl0123"),
      makeContext("abcdefghijkl0123"),
    );
    expect(first.status).toBe(200);

    const second = await handler(
      makePostReq("abcdefghijkl0123"),
      makeContext("abcdefghijkl0123"),
    );
    expect(second.status).toBe(410);
  });

  it("rate-limits at 30 requests / minute / IP — the 31st returns 429", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    const rateLimit = new MemoryRateLimitStore();
    const handler = makeOpenHandler(links, ciphertexts, rateLimit);
    for (let i = 0; i < 30; i++) {
      const id = `${"a".repeat(15)}${i.toString(36).slice(0, 1)}`;
      // Doesn't matter that links don't exist (handler returns 410), the rate-limit counter still ticks.
      await handler(
        makePostReq(id, { "x-forwarded-for": "8.8.8.8" }),
        makeContext(id),
      );
    }
    const overflow = await handler(
      makePostReq("overflow123def45", { "x-forwarded-for": "8.8.8.8" }),
      makeContext("overflow123def45"),
    );
    expect(overflow.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/server/messages-handler.test.ts`
Expected: FAIL — `createOpenMessageHandler is not exported`.

- [ ] **Step 3: Add the factory to `apps/web/src/server/messages-handler.ts`**

Add the import at the top of the file (alongside the existing `LINK_ID_REGEX` import):

```ts
import { bytesToBase64 } from "@/src/lib/base64.js";
```

Append the new factory at the end:

```ts
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
    if (!LINK_ID_REGEX.test(id)) return jsonError(400, "bad_request");

    const ip = getClientIp(request);
    const count = await deps.rateLimit.incrementAndGet(
      `messages:open:${ip}`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (count > RATE_LIMIT_MAX) return jsonError(429, "rate_limited");

    const linkId = id as LinkId;
    const row = await deps.links.incrementOpens(linkId);
    if (!row) return jsonError(410, "no_longer_available");

    const blob = await deps.ciphertexts.get(linkId);
    if (!blob) return jsonError(410, "no_longer_available"); // synthetic — see spec §6.2 + §12

    return new Response(
      JSON.stringify({
        ciphertext: bytesToBase64(blob),
        recipientFingerprint: row.recipientFingerprint,
        opensCount: row.opensCount,
        maxOpens: row.maxOpens,
        status: row.status,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/server/messages-handler.test.ts`
Expected: PASS — all three handler factories' tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/messages-handler.ts apps/web/tests/server/messages-handler.test.ts
git commit -m "feat(web): POST /api/messages/:id/open handler with atomic incrementOpens"
```

---

## Task 5: Client orchestrator — `fetch-and-open.ts`

**Files:**
- Create: `apps/web/src/reader/fetch-and-open.ts`
- Create: `apps/web/tests/reader/fetch-and-open.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/reader/fetch-and-open.test.ts`:

```ts
import {
  type Ciphertext,
  exportPublicKey,
  generateIdentity,
  importPublicKey,
  seal,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAndOpen } from "@/src/reader/fetch-and-open.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function makeSealedCiphertext(plaintext: string, recipientPublicKeyString: string, id: string) {
  const recipient = await importPublicKey(recipientPublicKeyString);
  const aad = new TextEncoder().encode(id);
  const ct = await seal(new TextEncoder().encode(plaintext), recipient, aad);
  // Convert Ciphertext (opaque) → Uint8Array → base64
  const bytes = ct as unknown as Uint8Array;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i] as number);
  return btoa(binary);
}

describe("fetchAndOpen", () => {
  it("decrypts a ciphertext sealed for the recipient with id-as-AAD", async () => {
    const recipientIdentity = await generateIdentity();
    const recipientPubkey = exportPublicKey(recipientIdentity);
    const id = "abcdefghijkl0123";
    const ciphertextBase64 = await makeSealedCiphertext("hello secret world", recipientPubkey, id);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ciphertext: ciphertextBase64,
          recipientFingerprint: "abc",
          opensCount: 1,
          maxOpens: 1,
          status: "expired",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    // Wrap + unwrap the recipient identity to mirror the loaded-from-key-store boundary.
    const wrapped = await wrapPrivateKey(recipientIdentity, "test-passphrase-12");
    const recovered = await unwrapPrivateKey(wrapped, "test-passphrase-12");

    const result = await fetchAndOpen({ id, identity: recovered });
    expect(result.plaintext).toBe("hello secret world");
    expect(result.recipientFingerprint).toBe("abc");
    expect(result.opensCount).toBe(1);
    expect(result.maxOpens).toBe(1);
    expect(result.status).toBe("expired");
  });

  it("throws when the ciphertext was sealed for a different recipient", async () => {
    const recipientA = await generateIdentity();
    const recipientB = await generateIdentity();
    const id = "abcdefghijkl0123";
    const ciphertextBase64 = await makeSealedCiphertext(
      "for A only",
      exportPublicKey(recipientA),
      id,
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ciphertext: ciphertextBase64,
          recipientFingerprint: "abc",
          opensCount: 1,
          maxOpens: -1,
          status: "active",
        }),
        { status: 200 },
      ),
    );

    await expect(fetchAndOpen({ id, identity: recipientB })).rejects.toThrow();
  });

  it("throws when the AAD (link id) does not match the seal", async () => {
    const recipient = await generateIdentity();
    const ciphertextBase64 = await makeSealedCiphertext(
      "sealed-with-X",
      exportPublicKey(recipient),
      "Xaaaaaaaaaaaaaa1",
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ciphertext: ciphertextBase64,
          recipientFingerprint: "abc",
          opensCount: 1,
          maxOpens: -1,
          status: "active",
        }),
        { status: 200 },
      ),
    );

    // Different id passed → different AAD → HPKE rejects.
    await expect(
      fetchAndOpen({ id: "Yaaaaaaaaaaaaaa1", identity: recipient }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/reader/fetch-and-open.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/web/src/reader/fetch-and-open.ts`**

```ts
import { type Ciphertext, type IdentityKeypair, open } from "@aesmsg/crypto";
import { openMessage } from "@/src/lib/api-client.js";
import { base64ToBytes } from "@/src/lib/base64.js";

export interface FetchAndOpenInput {
  id: string;
  identity: IdentityKeypair;
}

export interface FetchAndOpenOutput {
  plaintext: string;
  recipientFingerprint: string;
  opensCount: number;
  maxOpens: number;
  status: "active" | "revoked" | "expired";
}

export async function fetchAndOpen(input: FetchAndOpenInput): Promise<FetchAndOpenOutput> {
  const response = await openMessage(input.id);
  const ciphertext = base64ToBytes(response.ciphertext);
  const aad = new TextEncoder().encode(input.id);
  const plaintextBytes = await open(
    ciphertext as unknown as Ciphertext,
    input.identity,
    aad,
  );
  return {
    plaintext: new TextDecoder().decode(plaintextBytes),
    recipientFingerprint: response.recipientFingerprint,
    opensCount: response.opensCount,
    maxOpens: response.maxOpens,
    status: response.status,
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/reader/fetch-and-open.test.ts`
Expected: PASS — all three cases green (round-trip + wrong-recipient + wrong-AAD throws).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/reader/fetch-and-open.ts apps/web/tests/reader/fetch-and-open.test.ts
git commit -m "feat(web): client fetchAndOpen orchestrator (POST /open + HPKE open)"
```

---

## Task 6: `LandingScreen` component

**Files:**
- Create: `apps/web/src/reader/LandingScreen.tsx`
- Create: `apps/web/tests/reader/LandingScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/reader/LandingScreen.test.tsx`:

```tsx
import type { Fingerprint } from "@aesmsg/crypto";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LandingScreen } from "@/src/reader/LandingScreen.js";

const matchingFp = "SM-ABAB-CDCD-EFEF-1212-3434-5656-7878-9A9A" as Fingerprint;
const otherFp = "SM-1111-2222-3333-4444-5555-6666-7777-8888" as Fingerprint;

describe("LandingScreen", () => {
  const baseProps = {
    recipientFingerprint: matchingFp,
    myFingerprint: matchingFp,
    expiresAt: new Date("2026-05-11T12:00:00.000Z"),
    maxOpens: 1 as const,
    opensCount: 0,
    onOpen: vi.fn(),
  };

  it("renders the secure-link headline + recipient fingerprint", () => {
    render(<LandingScreen {...baseProps} />);
    expect(screen.getByRole("heading", { name: /Secure Message Found/i })).toBeInTheDocument();
    expect(
      screen.getByText("ABAB CDCD EFEF 1212 3434 5656 7878 9A9A"),
    ).toBeInTheDocument();
  });

  it("renders 'Burn on read' for maxOpens=1", () => {
    render(<LandingScreen {...baseProps} />);
    expect(screen.getByText(/Burn on read/i)).toBeInTheDocument();
  });

  it("renders 'Unlimited' for maxOpens=-1", () => {
    render(<LandingScreen {...baseProps} maxOpens={-1} />);
    expect(screen.getByText(/Unlimited/i)).toBeInTheDocument();
  });

  it("does NOT render fingerprint mismatch warning when fingerprints match", () => {
    render(<LandingScreen {...baseProps} />);
    expect(screen.queryByText(/sealed for a different identity/i)).not.toBeInTheDocument();
  });

  it("renders fingerprint mismatch warning when fingerprints differ", () => {
    render(<LandingScreen {...baseProps} myFingerprint={otherFp} />);
    expect(screen.getByText(/sealed for a different identity/i)).toBeInTheDocument();
  });

  it("calls onOpen when 'Open Message' button is clicked", async () => {
    const onOpen = vi.fn();
    render(<LandingScreen {...baseProps} onOpen={onOpen} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Open Message/i }));
    });
    expect(onOpen).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/reader/LandingScreen.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `apps/web/src/reader/LandingScreen.tsx`**

```tsx
"use client";

import { type Fingerprint, truncateFingerprint } from "@aesmsg/crypto";
import { Button, Surface } from "@aesmsg/ui";

const FAR_FUTURE = new Date("9999-12-31T23:59:59.000Z");

export interface LandingScreenProps {
  recipientFingerprint: Fingerprint;
  myFingerprint: Fingerprint;
  expiresAt: Date;
  maxOpens: number;
  opensCount: number;
  onOpen: () => void;
}

function expiryRecap(expiresAt: Date): string {
  if (expiresAt.getTime() === FAR_FUTURE.getTime()) return "Never expires";
  return `Expires ${expiresAt.toLocaleString()}`;
}

function maxOpensRecap(maxOpens: number, opensCount: number): string {
  if (maxOpens === -1) return "Unlimited views";
  if (maxOpens === 1) return "1 view (Burn on read)";
  const remaining = maxOpens - opensCount;
  return `${remaining} of ${maxOpens} views remaining`;
}

export function LandingScreen({
  recipientFingerprint,
  myFingerprint,
  expiresAt,
  maxOpens,
  opensCount,
  onOpen,
}: LandingScreenProps) {
  const fingerprintMismatch = recipientFingerprint !== myFingerprint;

  return (
    <Surface className="px-md md:px-xl py-xl min-h-screen">
      <main className="max-w-[640px] mx-auto w-full space-y-xl">
        <header className="space-y-sm text-center">
          <h1 className="font-h1 text-h1 text-on-surface">Secure Message Found</h1>
          <p className="font-body-md text-on-surface-variant max-w-md mx-auto">
            This link contains an end-to-end encrypted message. To maintain privacy, decryption
            occurs locally on your hardware.
          </p>
        </header>

        <section className="space-y-md bg-surface-container-low border border-outline-variant/20 rounded-lg p-lg">
          <div className="flex justify-between font-body-md">
            <span className="text-on-surface-variant">Sealed For</span>
            <span className="font-mono-code text-on-surface">
              {truncateFingerprint(recipientFingerprint, 8)}
            </span>
          </div>
          <div className="flex justify-between font-body-md">
            <span className="text-on-surface-variant">Expiry</span>
            <span className="text-on-surface">{expiryRecap(expiresAt)}</span>
          </div>
          <div className="flex justify-between font-body-md">
            <span className="text-on-surface-variant">Views</span>
            <span className="text-on-surface">{maxOpensRecap(maxOpens, opensCount)}</span>
          </div>
        </section>

        {fingerprintMismatch && (
          <aside
            role="alert"
            className="bg-tertiary-container/30 border border-tertiary/40 rounded-lg p-md"
          >
            <p className="font-body-md text-on-surface">
              This message was sealed for a different identity (
              <span className="font-mono-code">{truncateFingerprint(recipientFingerprint, 4)}</span>
              ). Yours is{" "}
              <span className="font-mono-code">{truncateFingerprint(myFingerprint, 4)}</span>.
              Decryption will fail.
            </p>
          </aside>
        )}

        <Button onClick={onOpen} className="w-full">
          Open Message
        </Button>
      </main>
    </Surface>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/reader/LandingScreen.test.tsx`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/reader/LandingScreen.tsx apps/web/tests/reader/LandingScreen.test.tsx
git commit -m "feat(web): LandingScreen with fingerprint-mismatch warning"
```

---

## Task 7: `DecryptedScreen` component (with clipboard auto-clear)

**Files:**
- Create: `apps/web/src/reader/DecryptedScreen.tsx`
- Create: `apps/web/tests/reader/DecryptedScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/reader/DecryptedScreen.test.tsx`:

```tsx
import type { Fingerprint } from "@aesmsg/crypto";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecryptedScreen } from "@/src/reader/DecryptedScreen.js";

const fp = "SM-ABAB-CDCD-EFEF-1212-3434-5656-7878-9A9A" as Fingerprint;

describe("DecryptedScreen", () => {
  const baseProps = {
    plaintext: "hello secret world",
    recipientFingerprint: fp,
    expiresAt: new Date("2026-05-11T12:00:00.000Z"),
    maxOpens: 1,
    opensCount: 1,
    status: "expired" as const,
    onDone: vi.fn(),
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the plaintext", () => {
    render(<DecryptedScreen {...baseProps} />);
    expect(screen.getByText("hello secret world")).toBeInTheDocument();
  });

  it("renders 'consumed' callout when this open burned the link", () => {
    render(<DecryptedScreen {...baseProps} />);
    expect(screen.getByText(/This link has been consumed/i)).toBeInTheDocument();
  });

  it("does NOT render 'consumed' callout when more opens remain", () => {
    render(
      <DecryptedScreen
        {...baseProps}
        maxOpens={5}
        opensCount={1}
        status="active"
      />,
    );
    expect(screen.queryByText(/This link has been consumed/i)).not.toBeInTheDocument();
  });

  it("copies plaintext to clipboard and clears after 60s", async () => {
    vi.useFakeTimers();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const readText = vi
      .spyOn(navigator.clipboard, "readText")
      .mockResolvedValue("hello secret world");

    render(<DecryptedScreen {...baseProps} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Copy/i }));
    });
    expect(writeText).toHaveBeenCalledWith("hello secret world");

    // Advance the 60s timeout. Use runAllTimersAsync to flush both timer + microtasks.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });

    expect(readText).toHaveBeenCalled();
    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("does NOT clobber the clipboard if the user copied something else after", async () => {
    vi.useFakeTimers();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "readText").mockResolvedValue("other stuff");

    render(<DecryptedScreen {...baseProps} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Copy/i }));
    });
    expect(writeText).toHaveBeenCalledWith("hello secret world");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });

    // writeText was called once (the initial copy) — never with "" because readText returned different content
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("calls onDone when Done button clicked", async () => {
    const onDone = vi.fn();
    render(<DecryptedScreen {...baseProps} onDone={onDone} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Done/i }));
    });
    expect(onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/reader/DecryptedScreen.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `apps/web/src/reader/DecryptedScreen.tsx`**

```tsx
"use client";

import { type Fingerprint, truncateFingerprint } from "@aesmsg/crypto";
import { Button, Surface } from "@aesmsg/ui";
import { useEffect, useState } from "react";

const COPY_CLEAR_MS = 60_000;
const FAR_FUTURE = new Date("9999-12-31T23:59:59.000Z");

export interface DecryptedScreenProps {
  plaintext: string;
  recipientFingerprint: Fingerprint;
  expiresAt: Date;
  maxOpens: number;
  opensCount: number;
  status: "active" | "revoked" | "expired";
  onDone: () => void;
}

function expiryRecap(expiresAt: Date): string {
  if (expiresAt.getTime() === FAR_FUTURE.getTime()) return "Never (Manual Revoke)";
  return expiresAt.toLocaleString();
}

function maxOpensRecap(maxOpens: number, opensCount: number): string {
  if (maxOpens === -1) return `Unlimited (${opensCount} so far)`;
  return `${opensCount} of ${maxOpens} views`;
}

export function DecryptedScreen({
  plaintext,
  recipientFingerprint,
  expiresAt,
  maxOpens,
  opensCount,
  status,
  onDone,
}: DecryptedScreenProps) {
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Drive the countdown indicator when copy is active.
  useEffect(() => {
    if (secondsRemaining === null) return;
    if (secondsRemaining <= 0) {
      setSecondsRemaining(null);
      return;
    }
    const tick = setTimeout(() => setSecondsRemaining(secondsRemaining - 1), 1000);
    return () => clearTimeout(tick);
  }, [secondsRemaining]);

  const onCopy = async () => {
    await navigator.clipboard.writeText(plaintext);
    setCopied(true);
    setSecondsRemaining(60);
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === plaintext) {
          await navigator.clipboard.writeText("");
        }
      } catch {
        // readText may be permission-gated; we silently no-op rather than risk clobbering.
      }
      setCopied(false);
    }, COPY_CLEAR_MS);
  };

  const consumed = status === "expired" && maxOpens !== -1 && opensCount >= maxOpens;

  return (
    <Surface className="px-md md:px-xl py-xl min-h-screen">
      <main className="max-w-[640px] mx-auto w-full space-y-xl">
        <header className="space-y-sm text-center">
          <h1 className="font-h2 text-h2 font-semibold text-primary">Message Decrypted</h1>
        </header>

        <section className="bg-surface-container-low border border-outline-variant/20 rounded-lg p-lg">
          <pre className="font-mono-code text-body-md text-on-surface whitespace-pre-wrap break-words">
            {plaintext}
          </pre>
        </section>

        {consumed && (
          <aside
            role="status"
            className="bg-tertiary-container/30 border border-tertiary/40 rounded-lg p-md"
          >
            <p className="font-body-md text-on-surface">
              This link has been consumed. Closing this tab discards the message.
            </p>
          </aside>
        )}

        <section className="space-y-md">
          <div className="flex justify-between font-body-md">
            <span className="text-on-surface-variant">Sealed For</span>
            <span className="font-mono-code text-on-surface">
              {truncateFingerprint(recipientFingerprint, 8)}
            </span>
          </div>
          <div className="flex justify-between font-body-md">
            <span className="text-on-surface-variant">Expiry</span>
            <span className="text-on-surface">{expiryRecap(expiresAt)}</span>
          </div>
          <div className="flex justify-between font-body-md">
            <span className="text-on-surface-variant">Views</span>
            <span className="text-on-surface">{maxOpensRecap(maxOpens, opensCount)}</span>
          </div>
        </section>

        <div className="space-y-sm">
          <Button onClick={onCopy} variant="secondary" className="w-full">
            {copied ? "Copied" : "Copy"}
          </Button>
          {secondsRemaining !== null && (
            <p className="text-center text-label-sm text-on-surface-variant">
              Clipboard will auto-clear in {secondsRemaining}s
            </p>
          )}
          <Button onClick={onDone} className="w-full">
            Done
          </Button>
        </div>
      </main>
    </Surface>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/reader/DecryptedScreen.test.tsx`
Expected: PASS — all 6 cases green including the two clipboard-auto-clear paths.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/reader/DecryptedScreen.tsx apps/web/tests/reader/DecryptedScreen.test.tsx
git commit -m "feat(web): DecryptedScreen with 60s clipboard auto-clear"
```

---

## Task 8: `DecryptionFailedScreen` component

**Files:**
- Create: `apps/web/src/reader/DecryptionFailedScreen.tsx`
- Create: `apps/web/tests/reader/DecryptionFailedScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/reader/DecryptionFailedScreen.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DecryptionFailedScreen } from "@/src/reader/DecryptionFailedScreen.js";

describe("DecryptionFailedScreen", () => {
  const baseProps = {
    onTryAgain: vi.fn(),
    onManageIdentity: vi.fn(),
    onWipeIdentity: vi.fn(),
  };

  it("renders the headline + explanation", () => {
    render(<DecryptionFailedScreen {...baseProps} />);
    expect(screen.getByRole("heading", { name: /Decryption Failed/i })).toBeInTheDocument();
    expect(
      screen.getByText(/could not be decrypted with your current identity/i),
    ).toBeInTheDocument();
  });

  it("calls onTryAgain when Try Again clicked", async () => {
    const onTryAgain = vi.fn();
    render(<DecryptionFailedScreen {...baseProps} onTryAgain={onTryAgain} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Try Again/i }));
    });
    expect(onTryAgain).toHaveBeenCalled();
  });

  it("calls onManageIdentity when Manage Identity clicked", async () => {
    const onManageIdentity = vi.fn();
    render(<DecryptionFailedScreen {...baseProps} onManageIdentity={onManageIdentity} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Manage Identity/i }));
    });
    expect(onManageIdentity).toHaveBeenCalled();
  });

  it("calls onWipeIdentity when Wipe Identity clicked", async () => {
    const onWipeIdentity = vi.fn();
    render(<DecryptionFailedScreen {...baseProps} onWipeIdentity={onWipeIdentity} />);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Wipe Identity/i }));
    });
    expect(onWipeIdentity).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/reader/DecryptionFailedScreen.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `apps/web/src/reader/DecryptionFailedScreen.tsx`**

```tsx
"use client";

import { Button, Surface } from "@aesmsg/ui";

export interface DecryptionFailedScreenProps {
  onTryAgain: () => void;
  onManageIdentity: () => void;
  onWipeIdentity: () => void;
}

export function DecryptionFailedScreen({
  onTryAgain,
  onManageIdentity,
  onWipeIdentity,
}: DecryptionFailedScreenProps) {
  return (
    <Surface className="px-md md:px-xl py-xl min-h-screen">
      <main className="max-w-[640px] mx-auto w-full space-y-xl">
        <header className="space-y-sm text-center">
          <h1 className="font-h1 text-h1 text-on-surface">Decryption Failed</h1>
          <p className="font-body-md text-on-surface-variant max-w-md mx-auto">
            This message could not be decrypted with your current identity. The most likely reason
            is that it was sealed for a different recipient.
          </p>
        </header>

        <div className="space-y-sm">
          <Button onClick={onTryAgain} className="w-full">
            Try Again
          </Button>
          <Button onClick={onManageIdentity} variant="secondary" className="w-full">
            Manage Identity
          </Button>
          <Button onClick={onWipeIdentity} variant="danger" className="w-full">
            Wipe Identity
          </Button>
        </div>

        <p className="text-center text-label-sm text-on-surface-variant">
          If you believe this was sealed for you, contact the sender to verify the recipient
          fingerprint.
        </p>
      </main>
    </Surface>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/reader/DecryptionFailedScreen.test.tsx`
Expected: PASS — all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/reader/DecryptionFailedScreen.tsx apps/web/tests/reader/DecryptionFailedScreen.test.tsx
git commit -m "feat(web): DecryptionFailedScreen (try again / manage / wipe actions)"
```

---

## Task 9: `LinkUnavailableScreen` component

**Files:**
- Create: `apps/web/src/reader/LinkUnavailableScreen.tsx`
- Create: `apps/web/tests/reader/LinkUnavailableScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/reader/LinkUnavailableScreen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkUnavailableScreen } from "@/src/reader/LinkUnavailableScreen.js";

describe("LinkUnavailableScreen", () => {
  it("renders the opaque error headline + explanation", () => {
    render(<LinkUnavailableScreen />);
    expect(
      screen.getByRole("heading", { name: /Link No Longer Available/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/expired, reached its view limit, or was revoked/i),
    ).toBeInTheDocument();
  });

  it("renders a return-home link pointing at /", () => {
    render(<LinkUnavailableScreen />);
    const link = screen.getByRole("link", { name: /Return home/i });
    expect(link).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/reader/LinkUnavailableScreen.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `apps/web/src/reader/LinkUnavailableScreen.tsx`**

```tsx
"use client";

import { Surface } from "@aesmsg/ui";

export function LinkUnavailableScreen() {
  return (
    <Surface className="px-md md:px-xl py-xl min-h-screen">
      <main className="max-w-[640px] mx-auto w-full space-y-xl text-center">
        <h1 className="font-h1 text-h1 text-on-surface">Link No Longer Available</h1>
        <p className="font-body-lg text-on-surface-variant max-w-md mx-auto">
          This secure link has expired, reached its view limit, or was revoked by the sender.
        </p>
        <a
          href="/"
          className="inline-block px-md py-md bg-primary text-on-primary rounded-lg font-label-sm"
        >
          Return home
        </a>
      </main>
    </Surface>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/reader/LinkUnavailableScreen.test.tsx`
Expected: PASS — both cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/reader/LinkUnavailableScreen.tsx apps/web/tests/reader/LinkUnavailableScreen.test.tsx
git commit -m "feat(web): LinkUnavailableScreen (opaque, no metadata leak)"
```

---

## Task 10: `ReaderScreen` state machine

**Files:**
- Create: `apps/web/src/reader/ReaderScreen.tsx`
- Create: `apps/web/tests/reader/ReaderScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/reader/ReaderScreen.test.tsx`:

```tsx
import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  importPublicKey,
  seal,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { saveIdentity } from "@aesmsg/key-store";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "@/src/lib/base64.js";
import { IdentityProvider } from "@/src/lib/identity-context.js";
import { ReaderScreen } from "@/src/reader/ReaderScreen.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function bootstrapIdentity(passphrase = "twelve chars-passphrase") {
  const identity = await generateIdentity();
  const wrapped = await wrapPrivateKey(identity, passphrase);
  await saveIdentity({
    identityId: "primary",
    publicKeyString: exportPublicKey(identity),
    wrapped,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  });
  return identity;
}

async function makeSealedCiphertextBase64(plaintext: string, recipientPubkey: string, id: string) {
  const recipient = await importPublicKey(recipientPubkey);
  const aad = new TextEncoder().encode(id);
  const ct = await seal(new TextEncoder().encode(plaintext), recipient, aad);
  return bytesToBase64(ct as unknown as Uint8Array);
}

function mockMetadata(metadata: object, status = 200) {
  return new Response(JSON.stringify(metadata), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockOpen(payload: object, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ReaderScreen", () => {
  it("walks loading → landing → opening → decrypted", async () => {
    const identity = await bootstrapIdentity();
    const id = "abcdefghijkl0123";
    const fp = await fingerprint(exportPublicKey(identity));
    const ciphertextBase64 = await makeSealedCiphertextBase64("the message", exportPublicKey(identity), id);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/open")) {
        return mockOpen({
          ciphertext: ciphertextBase64,
          recipientFingerprint: fp,
          opensCount: 1,
          maxOpens: 1,
          status: "expired",
        });
      }
      return mockMetadata({
        status: "active",
        recipientFingerprint: fp,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        maxOpens: 1,
        opensCount: 0,
      });
    });

    render(
      <IdentityProvider>
        <ReaderScreen id={id} />
      </IdentityProvider>,
    );

    // Identity needs to be unlocked first; for the test we satisfy that by going through the
    // existing IdentityProvider unlock flow.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Unlock your identity/i })).toBeInTheDocument(),
    );
    await act(async () => {
      await userEvent.type(screen.getByLabelText("Passphrase"), "twelve chars-passphrase");
      await userEvent.click(screen.getByRole("button", { name: /Unlock/i }));
    });

    await waitFor(
      () =>
        expect(screen.getByRole("heading", { name: /Secure Message Found/i })).toBeInTheDocument(),
      { timeout: 5000 },
    );

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Open Message/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Message Decrypted/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("the message")).toBeInTheDocument();
  }, 30_000);

  it("renders LinkUnavailable when metadata returns 404", async () => {
    await bootstrapIdentity();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
    );

    render(
      <IdentityProvider>
        <ReaderScreen id="abcdefghijkl0123" />
      </IdentityProvider>,
    );
    await act(async () => {
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /Unlock your identity/i })).toBeInTheDocument(),
      );
      await userEvent.type(screen.getByLabelText("Passphrase"), "twelve chars-passphrase");
      await userEvent.click(screen.getByRole("button", { name: /Unlock/i }));
    });

    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", { name: /Link No Longer Available/i }),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
  }, 30_000);

  it("renders DecryptionFailed when ciphertext was sealed for a different recipient", async () => {
    const myIdentity = await bootstrapIdentity();
    const otherRecipient = await generateIdentity();
    const id = "abcdefghijkl0123";
    const myFp = await fingerprint(exportPublicKey(myIdentity));
    const ciphertextBase64 = await makeSealedCiphertextBase64(
      "for someone else",
      exportPublicKey(otherRecipient),
      id,
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/open")) {
        return mockOpen({
          ciphertext: ciphertextBase64,
          recipientFingerprint: myFp,
          opensCount: 1,
          maxOpens: -1,
          status: "active",
        });
      }
      return mockMetadata({
        status: "active",
        recipientFingerprint: myFp,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        maxOpens: -1,
        opensCount: 0,
      });
    });

    render(
      <IdentityProvider>
        <ReaderScreen id={id} />
      </IdentityProvider>,
    );

    await act(async () => {
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /Unlock your identity/i })).toBeInTheDocument(),
      );
      await userEvent.type(screen.getByLabelText("Passphrase"), "twelve chars-passphrase");
      await userEvent.click(screen.getByRole("button", { name: /Unlock/i }));
    });

    await waitFor(
      () =>
        expect(screen.getByRole("heading", { name: /Secure Message Found/i })).toBeInTheDocument(),
      { timeout: 5000 },
    );

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Open Message/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Decryption Failed/i })).toBeInTheDocument(),
    );
  }, 30_000);
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm --filter web exec vitest run tests/reader/ReaderScreen.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `apps/web/src/reader/ReaderScreen.tsx`**

```tsx
"use client";

import { type Fingerprint, fingerprint } from "@aesmsg/crypto";
import { Surface } from "@aesmsg/ui";
import { useEffect, useState } from "react";
import { useIdentity } from "@/src/hooks/use-identity.js";
import { SetPassphraseScreen } from "@/src/keys/SetPassphraseScreen.js";
import { UnlockScreen } from "@/src/keys/UnlockScreen.js";
import { WipeConfirmModal } from "@/src/keys/WipeConfirmModal.js";
import { type ApiError, getMessage, type MessageMetadata } from "@/src/lib/api-client.js";
import { fetchAndOpen, type FetchAndOpenOutput } from "./fetch-and-open.js";
import { DecryptedScreen } from "./DecryptedScreen.js";
import { DecryptionFailedScreen } from "./DecryptionFailedScreen.js";
import { LandingScreen } from "./LandingScreen.js";
import { LinkUnavailableScreen } from "./LinkUnavailableScreen.js";

export interface ReaderScreenProps {
  id: string;
}

type ReaderState =
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "landing"; metadata: MessageMetadata; myFingerprint: Fingerprint }
  | { kind: "opening"; metadata: MessageMetadata; myFingerprint: Fingerprint }
  | {
      kind: "decrypted";
      output: FetchAndOpenOutput;
      metadata: MessageMetadata;
    }
  | { kind: "failed"; metadata: MessageMetadata; myFingerprint: Fingerprint };

export function ReaderScreen({ id }: ReaderScreenProps) {
  const { state: identityState, actions } = useIdentity();
  const [readerState, setReaderState] = useState<ReaderState>({ kind: "loading" });
  const [wipeOpen, setWipeOpen] = useState(false);

  // Fetch metadata once we have an unlocked identity.
  useEffect(() => {
    if (identityState.status !== "unlocked") return;
    if (readerState.kind !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const metadata = await getMessage(id);
        const myFp = await fingerprint(identityState.storedIdentity.publicKeyString);
        if (!cancelled) setReaderState({ kind: "landing", metadata, myFingerprint: myFp });
      } catch (err) {
        const apiErr = err as ApiError;
        if (!cancelled && apiErr.status === 404) {
          setReaderState({ kind: "gone" });
        } else if (!cancelled) {
          setReaderState({ kind: "gone" }); // Network errors fall through to opaque "gone"
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityState, id, readerState.kind]);

  // Identity gate (mirrors /create + /keys patterns)
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
      <UnlockScreen
        onUnlock={(pw) => actions.unlock(pw)}
        onWipe={() => setWipeOpen(true)}
      />
    );
  }

  // identityState.status === "unlocked" from here

  const tryOpen = async (metadata: MessageMetadata, myFingerprint: Fingerprint) => {
    setReaderState({ kind: "opening", metadata, myFingerprint });
    try {
      const output = await fetchAndOpen({ id, identity: identityState.identity });
      setReaderState({ kind: "decrypted", output, metadata });
    } catch (err) {
      const apiErr = err as Partial<ApiError>;
      if (apiErr && apiErr.status === 410) {
        setReaderState({ kind: "gone" });
      } else {
        setReaderState({ kind: "failed", metadata, myFingerprint });
      }
    }
  };

  let body: JSX.Element;
  switch (readerState.kind) {
    case "loading":
      body = (
        <main className="min-h-screen bg-background text-on-surface flex items-center justify-center">
          <p className="font-body-md text-on-surface-variant">Loading message…</p>
        </main>
      );
      break;
    case "gone":
      body = <LinkUnavailableScreen />;
      break;
    case "landing":
      body = (
        <LandingScreen
          recipientFingerprint={readerState.metadata.recipientFingerprint as Fingerprint}
          myFingerprint={readerState.myFingerprint}
          expiresAt={new Date(readerState.metadata.expiresAt)}
          maxOpens={readerState.metadata.maxOpens}
          opensCount={readerState.metadata.opensCount}
          onOpen={() => tryOpen(readerState.metadata, readerState.myFingerprint)}
        />
      );
      break;
    case "opening":
      body = (
        <Surface className="min-h-screen flex items-center justify-center">
          <p className="font-body-md text-on-surface-variant text-center max-w-sm">
            Decrypting locally — your private key never leaves this device.
          </p>
        </Surface>
      );
      break;
    case "decrypted":
      body = (
        <DecryptedScreen
          plaintext={readerState.output.plaintext}
          recipientFingerprint={readerState.output.recipientFingerprint as Fingerprint}
          expiresAt={new Date(readerState.metadata.expiresAt)}
          maxOpens={readerState.output.maxOpens}
          opensCount={readerState.output.opensCount}
          status={readerState.output.status}
          onDone={() => {
            window.location.href = "/";
          }}
        />
      );
      break;
    case "failed":
      body = (
        <DecryptionFailedScreen
          onTryAgain={() => tryOpen(readerState.metadata, readerState.myFingerprint)}
          onManageIdentity={() => {
            window.location.href = "/keys";
          }}
          onWipeIdentity={() => setWipeOpen(true)}
        />
      );
      break;
  }

  return (
    <>
      {body}
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

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter web exec vitest run tests/reader/ReaderScreen.test.tsx`
Expected: PASS — all three state-machine paths green (happy / gone / failed).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/reader/ReaderScreen.tsx apps/web/tests/reader/ReaderScreen.test.tsx
git commit -m "feat(web): ReaderScreen state machine (loading → landing → opening → decrypted | failed | gone)"
```

---

## Task 11: Route + page wiring + remove Slice 6 callout

**Files:**
- Create: `apps/web/app/l/[id]/page.tsx`
- Create: `apps/web/app/api/messages/[id]/route.ts`
- Create: `apps/web/app/api/messages/[id]/open/route.ts`
- Modify: `apps/web/src/create/ResultScreen.tsx`

No new tests — these are wiring + a callout removal.

- [ ] **Step 1: Create directories**

Run:
```bash
mkdir -p apps/web/app/l/\[id\] apps/web/app/api/messages/\[id\]/open
```

- [ ] **Step 2: Create the page Server Component shell**

Create `apps/web/app/l/[id]/page.tsx`:

```tsx
import { ReaderScreen } from "@/src/reader/ReaderScreen.js";

export default async function LinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReaderScreen id={id} />;
}
```

(Server Component — no `"use client"`. The async + `params: Promise<...>` signature is the Next 16 convention. The page extracts `id` from params and forwards to `<ReaderScreen/>`, which handles its own client behavior.)

- [ ] **Step 3: Create the GET route**

Create `apps/web/app/api/messages/[id]/route.ts`:

```ts
import { createGetMessageHandler } from "@/src/server/messages-handler.js";
import { getStores } from "@/src/server/stores.js";

export const runtime = "nodejs";

export const GET = createGetMessageHandler({
  ...getStores(),
  now: () => new Date(),
});
```

Note: this route conflicts with Slice 5's `apps/web/app/api/messages/route.ts` only at first glance. They live at different paths (`/api/messages` vs `/api/messages/:id`) — Next.js routes them separately. No file collision.

- [ ] **Step 4: Create the POST `/open` route**

Create `apps/web/app/api/messages/[id]/open/route.ts`:

```ts
import { createOpenMessageHandler } from "@/src/server/messages-handler.js";
import { getStores } from "@/src/server/stores.js";

export const runtime = "nodejs";

export const POST = createOpenMessageHandler(getStores());
```

- [ ] **Step 5: Remove the "Slice 6 coming" callout from `ResultScreen.tsx`**

Open `apps/web/src/create/ResultScreen.tsx` and delete the `<aside>` block:

```tsx
        <aside className="bg-surface-container-low border border-outline-variant/20 rounded-lg px-md py-md">
          <p className="font-body-md text-on-surface-variant">
            Recipient flow lands in Slice 6 — clicking this link will 404 until then.
          </p>
        </aside>
```

Also update the corresponding test in `apps/web/tests/create/ResultScreen.test.tsx` — delete the test case:

```tsx
  it("notes the recipient flow lands in Slice 6", () => {
    render(<ResultScreen {...baseProps} />);
    expect(screen.getByText(/Recipient flow lands in Slice 6/i)).toBeInTheDocument();
  });
```

- [ ] **Step 6: Verify typecheck + tests + lint**

Run:
- `pnpm --filter web typecheck`
- `pnpm --filter web exec vitest run`
- `pnpm lint`

Expected: all PASS. The test count went down by one (the removed Slice 6 callout test).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app apps/web/src/create/ResultScreen.tsx apps/web/tests/create/ResultScreen.test.tsx
git commit -m "feat(web): wire /l/[id] page + GET + POST /open routes; drop Slice 6 callout"
```

---

## Task 12: Browser e2e — full open flow

**Files:**
- Create: `apps/web/tests/open-flow.e2e.test.tsx`

- [ ] **Step 1: Write the e2e test**

Create `apps/web/tests/open-flow.e2e.test.tsx`:

```tsx
import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  importPublicKey,
  seal,
  wrapPrivateKey,
} from "@aesmsg/crypto";
import { saveIdentity } from "@aesmsg/key-store";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "@/src/lib/base64.js";
import { IdentityProvider } from "@/src/lib/identity-context.js";
import { ReaderScreen } from "@/src/reader/ReaderScreen.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/l/[id] end-to-end open flow", () => {
  it("bootstraps identity → unlocks → lands → opens → reveals plaintext", async () => {
    const passphrase = "twelve chars-passphrase";
    const identity = await generateIdentity();
    const wrapped = await wrapPrivateKey(identity, passphrase);
    await saveIdentity({
      identityId: "primary",
      publicKeyString: exportPublicKey(identity),
      wrapped,
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    });

    const id = "e2eflowid1234567";
    const fp = await fingerprint(exportPublicKey(identity));

    // Seal a message to ourselves with id-as-AAD.
    const recipient = await importPublicKey(exportPublicKey(identity));
    const aad = new TextEncoder().encode(id);
    const ct = await seal(new TextEncoder().encode("end to end success"), recipient, aad);
    const ciphertextBase64 = bytesToBase64(ct as unknown as Uint8Array);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/open")) {
        return new Response(
          JSON.stringify({
            ciphertext: ciphertextBase64,
            recipientFingerprint: fp,
            opensCount: 1,
            maxOpens: 1,
            status: "expired",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          status: "active",
          recipientFingerprint: fp,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          maxOpens: 1,
          opensCount: 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    render(
      <IdentityProvider>
        <ReaderScreen id={id} />
      </IdentityProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Unlock your identity/i })).toBeInTheDocument(),
    );
    await act(async () => {
      await userEvent.type(screen.getByLabelText("Passphrase"), passphrase);
      await userEvent.click(screen.getByRole("button", { name: /Unlock/i }));
    });

    await waitFor(
      () =>
        expect(screen.getByRole("heading", { name: /Secure Message Found/i })).toBeInTheDocument(),
      { timeout: 5000 },
    );

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Open Message/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Message Decrypted/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("end to end success")).toBeInTheDocument();
    expect(screen.getByText(/This link has been consumed/i)).toBeInTheDocument();
  }, 30_000);
});
```

- [ ] **Step 2: Run the e2e test — expect pass**

Run: `pnpm --filter web exec vitest run tests/open-flow.e2e.test.tsx`
Expected: PASS — full flow green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/open-flow.e2e.test.tsx
git commit -m "test(web): /l/[id] e2e — bootstrap → unlock → open → decrypt"
```

---

## Task 13: Documentation + final verification

**Files:**
- Modify: `apps/web/AGENTS.md`

- [ ] **Step 1: Append a "Dynamic route segments" subsection to `apps/web/AGENTS.md`**

Open `apps/web/AGENTS.md` and append after the existing "API routes" section:

```md
### Dynamic route segments

App Router dynamic segments use `[id]`-style folder names — e.g. `app/l/[id]/page.tsx`, `app/api/messages/[id]/route.ts`. In Next.js 16, the `params` prop and route-handler context are **`Promise<{ id: string }>`** (not the synchronous `{id: string}` from older versions). Always `await context.params` in handler factories and `await params` in async page components. The handler factories in `src/server/messages-handler.ts` already destructure this correctly — copy the pattern.
```

- [ ] **Step 2: Workspace-wide verification**

Run:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

Expected: all PASS. Server-store gated suites skip without env vars (no change). All Slice 6 + prior tests pass.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run `pnpm dev`. In a browser:

1. Visit `http://localhost:3000/keys`, bootstrap an identity (passphrase `twelve chars-passphrase`).
2. Copy the public key from the unlocked screen.
3. Visit `http://localhost:3000/create`, paste the public key into Recipient, type "test message", click **Encrypt & Create Link**.
4. Click the resulting `/l/<id>` URL in the new tab.
5. The landing page renders with the matching fingerprint and "Burn on read" recap.
6. Click **Open Message** → the secure reader renders with "test message" + the consumed callout.
7. Reload the URL → "Link No Longer Available" renders.

- [ ] **Step 4: Commit**

```bash
git add apps/web/AGENTS.md
git commit -m "docs(web): document dynamic-segment params: Promise<...> convention"
```

---

## Wrap-up checklist (read after running Task 13)

- [ ] `pnpm typecheck` clean across every workspace.
- [ ] `pnpm lint` clean.
- [ ] `pnpm test` green without env vars.
- [ ] `/l/<id>` UI matches all four mockups end-to-end (landing, decrypted, decryption-failed, link-unavailable).
- [ ] `GET /api/messages/:id` is preview-safe — never calls `incrementOpens`, returns opaque 404 for non-active / past-expiry / missing rows.
- [ ] `POST /api/messages/:id/open` is atomic — single `incrementOpens` call drives status flip + 410 on null.
- [ ] Storage drift between `incrementOpens` success and `ciphertexts.get` null is mapped to 410, not 500.
- [ ] Clipboard auto-clears 60s after copy (best-effort with `readText` guard).
- [ ] "Slice 6 coming" callout removed from `ResultScreen.tsx`.
- [ ] `apps/web/AGENTS.md` documents the `params: Promise<...>` Next 16 signature.
- [ ] All commits use `feat(web)` / `test(web)` / `docs(web)` conventional-commit style.

After Slice 6, the aesmsg MVP — sender + recipient — is complete on `main`. Subsequent slices (contacts directory, `/links` list page, mobile, deploy) are open Phase 2/3 work.
