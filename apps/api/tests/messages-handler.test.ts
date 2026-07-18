import type { CiphertextStore } from "@aesmsg/server-store/memory";
import {
  MemoryCiphertextStore,
  MemoryLinkMetadataStore,
  MemoryRateLimitStore,
} from "@aesmsg/server-store/memory";
import { describe, expect, it, vi } from "vitest";
import {
  createGetMessageHandler,
  createListMessagesHandler,
  createMessagesHandler,
  createOpenMessageHandler,
  createRevokeMessageHandler,
} from "../src/handlers/messages-handler";
import { bytesToBase64 } from "../src/lib/base64";
import { CLIENT_IP_HEADER } from "../src/lib/client-ip";
import { REVOCATION_TOKEN_HEADER } from "../src/lib/revocation-token";

const FROZEN_NOW = new Date("2026-05-09T12:00:00.000Z");
const PUBLIC_LINK_ORIGIN = "https://aesmsg.com";
const DAY_MS = 24 * 60 * 60 * 1000;

// These handlers call hashIp(), which reads process.env. Under Vitest browser mode process.env is
// the build-time `{}` literal, so NODE_ENV !== "production" and the salt is "" — exactly the
// non-production path hashIp permits, so no env stubbing is needed here.

function makeHandler() {
  // Share ONE ciphertext store between the link store and the handler deps — exactly how production
  // wires them (stores.ts) so the atomic createWithCiphertext (which the link store runs against its
  // own ciphertext reference) and the handler's deps.ciphertexts see the same blobs.
  const ciphertexts = new MemoryCiphertextStore();
  return createMessagesHandler({
    links: new MemoryLinkMetadataStore(ciphertexts),
    ciphertexts,
    rateLimit: new MemoryRateLimitStore(),
    now: () => FROZEN_NOW,
    publicLinkOrigin: PUBLIC_LINK_ORIGIN,
  });
}

// v2 create body: no recipientFingerprint, no createdAtMs (metadata-leakage mitigation).
function validBody() {
  return {
    id: "abcdefghijkl0123",
    ciphertext: bytesToBase64(new Uint8Array(64)), // 64 bytes — above the 32 minimum
    expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000).toISOString(),
    maxOpens: 1,
  };
}

function makeReq(
  body: unknown,
  headers: Record<string, string> = {},
  url = "https://example.com/api/messages",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("createMessagesHandler — happy path", () => {
  it("stores ciphertext + metadata and returns 201 with { id, url }", async () => {
    const ciphertexts = new MemoryCiphertextStore();
    const links = new MemoryLinkMetadataStore(ciphertexts);
    const rateLimit = new MemoryRateLimitStore();
    const handler = createMessagesHandler({
      links,
      ciphertexts,
      rateLimit,
      now: () => FROZEN_NOW,
      publicLinkOrigin: "https://aesmsg.com",
    });

    const body = validBody();
    const res = await handler(makeReq(body, {}, "https://api.aesmsg.com/api/messages"));

    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; url: string; revocationToken: string };
    expect(json.id).toBe(body.id);
    expect(json.url).toBe(`https://aesmsg.com/l/${body.id}`);
    // BE-1 / R2: a secret revocation token is returned exactly once at create.
    expect(typeof json.revocationToken).toBe("string");
    expect(json.revocationToken.length).toBeGreaterThanOrEqual(16);

    const stored = await links.get(body.id as never);
    expect(stored?.maxOpens).toBe(1);
    // v2: no creation timestamp persisted server-side.
    expect(stored?.createdAt).toBeNull();

    const blob = await ciphertexts.get(body.id as never);
    expect(blob).not.toBeNull();
    expect(blob?.byteLength).toBe(64);
  });

  it("builds the link from the configured publicLinkOrigin, not the request URL", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq(validBody(), {}, "https://api.aesmsg.com/api/messages"));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { url: string };
    expect(json.url.startsWith("https://aesmsg.com/l/")).toBe(true);
  });
});

describe("createMessagesHandler — input validation", () => {
  it("returns 400 on malformed JSON body", async () => {
    const handler = makeHandler();
    const req = new Request("https://example.com/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns 400 when required fields are missing", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq({ id: "abcdefghijkl0123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on bad id format", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq({ ...validBody(), id: "too-short" }));
    expect(res.status).toBe(400);
  });

  it("ignores a stray recipientFingerprint in the body (field no longer read)", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq({ ...validBody(), recipientFingerprint: "anything-at-all" }));
    // Extra unknown properties are simply not read; the request still succeeds.
    expect(res.status).toBe(201);
  });

  it("returns 400 on invalid base64 ciphertext", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq({ ...validBody(), ciphertext: "***not-base64***" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ciphertext is below the 32-byte minimum", async () => {
    const handler = makeHandler();
    const res = await handler(
      makeReq({ ...validBody(), ciphertext: bytesToBase64(new Uint8Array(16)) }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts a multi-MB ciphertext (attachment envelope) under the cap", async () => {
    const handler = makeHandler();
    const big = new Uint8Array(2 * 1024 * 1024); // 2 MB — well within the 26 MB cap
    const res = await handler(makeReq({ ...validBody(), ciphertext: bytesToBase64(big) }));
    expect(res.status).toBe(201);
  });

  // Heavy fixtures (tens of MB base64-encoded): fast in isolation (~1.3s) but can exceed Vitest's
  // default 5000ms when `pnpm -r test` runs apps/api concurrently with apps/mobile under CPU
  // contention. A generous per-test timeout keeps the gate deterministic without changing assertions.
  it("accepts a ~26 MB ciphertext (Pro attachment ceiling)", { timeout: 20000 }, async () => {
    const handler = makeHandler();
    const atCap = new Uint8Array(26 * 1024 * 1024); // exactly at the new 26 MiB cap
    const res = await handler(makeReq({ ...validBody(), ciphertext: bytesToBase64(atCap) }));
    expect(res.status).toBe(201);
  });

  it("returns 400 when ciphertext exceeds the 26 MB cap", { timeout: 20000 }, async () => {
    const handler = makeHandler();
    const tooBig = new Uint8Array(26 * 1024 * 1024 + 1);
    const res = await handler(makeReq({ ...validBody(), ciphertext: bytesToBase64(tooBig) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ciphertext is clearly beyond the cap (28 MB)", {
    timeout: 20000,
  }, async () => {
    const handler = makeHandler();
    const wayTooBig = new Uint8Array(28 * 1024 * 1024);
    const res = await handler(makeReq({ ...validBody(), ciphertext: bytesToBase64(wayTooBig) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresAt is in the past", async () => {
    const handler = makeHandler();
    const past = new Date(FROZEN_NOW.getTime() - 1000).toISOString();
    const res = await handler(makeReq({ ...validBody(), expiresAt: past }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresAt is unparseable", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq({ ...validBody(), expiresAt: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  // Retention ceiling (roadmap 2.5, SEC-6/PG-6/PG-8). The old year-9999 "never" sentinel now exceeds
  // the 365-day ceiling and is REJECTED (400) rather than accepted — that is the intended change.
  it("rejects the old year-9999 'Never' sentinel (over the retention ceiling)", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq({ ...validBody(), expiresAt: "9999-12-31T23:59:59.000Z" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("rejects an expiry beyond the 365-day retention ceiling (now + 366d) with 400", async () => {
    const handler = makeHandler();
    const over = new Date(FROZEN_NOW.getTime() + 366 * DAY_MS).toISOString();
    const res = await handler(makeReq({ ...validBody(), expiresAt: over }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("accepts an expiry at the 365-day ceiling (within the clock-skew grace) with 201", async () => {
    const handler = makeHandler();
    const atCeiling = new Date(FROZEN_NOW.getTime() + 365 * DAY_MS).toISOString();
    const res = await handler(makeReq({ ...validBody(), expiresAt: atCeiling }));
    expect(res.status).toBe(201);
  });

  it("accepts a typical 30-day expiry with 201", async () => {
    const handler = makeHandler();
    const thirtyDays = new Date(FROZEN_NOW.getTime() + 30 * DAY_MS).toISOString();
    const res = await handler(makeReq({ ...validBody(), expiresAt: thirtyDays }));
    expect(res.status).toBe(201);
  });

  it("honors a smaller AESMSG_MAX_RETENTION_MS override — a formerly-OK 30-day expiry now 400", async () => {
    // A tighter ceiling (7 days) is injected via deps.maxRetentionMs (production resolves it from
    // AESMSG_MAX_RETENTION_MS). An expiry the default ceiling would accept (30 days) is now rejected.
    const ciphertexts = new MemoryCiphertextStore();
    const handler = createMessagesHandler({
      links: new MemoryLinkMetadataStore(ciphertexts),
      ciphertexts,
      rateLimit: new MemoryRateLimitStore(),
      now: () => FROZEN_NOW,
      publicLinkOrigin: PUBLIC_LINK_ORIGIN,
      maxRetentionMs: 7 * DAY_MS,
    });
    const thirtyDays = new Date(FROZEN_NOW.getTime() + 30 * DAY_MS).toISOString();
    const res = await handler(makeReq({ ...validBody(), expiresAt: thirtyDays }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });

    // …and an expiry within the override (1 day) is still accepted.
    const oneDay = new Date(FROZEN_NOW.getTime() + DAY_MS).toISOString();
    const okRes = await handler(makeReq({ ...validBody(), expiresAt: oneDay }));
    expect(okRes.status).toBe(201);
  });

  it("returns 400 when maxOpens is 0, negative ≠ -1, or non-integer", async () => {
    const handler = makeHandler();
    expect((await handler(makeReq({ ...validBody(), maxOpens: 0 }))).status).toBe(400);
    expect((await handler(makeReq({ ...validBody(), maxOpens: -2 }))).status).toBe(400);
    expect((await handler(makeReq({ ...validBody(), maxOpens: 1.5 }))).status).toBe(400);
  });

  it("accepts maxOpens === -1 (unlimited)", async () => {
    const handler = makeHandler();
    const res = await handler(makeReq({ ...validBody(), maxOpens: -1 }));
    expect(res.status).toBe(201);
  });

  it("returns 400 when body exceeds the 37 MB cap", async () => {
    const handler = makeHandler();
    const padded = { ...validBody(), padding: "x".repeat(38 * 1024 * 1024) } as unknown;
    const res = await handler(makeReq(padded));
    expect(res.status).toBe(400);
  });
});

describe("createMessagesHandler — rate limit", () => {
  it("allows 30 requests per IP per minute and rejects the 31st with 429", async () => {
    const handler = makeHandler();
    for (let i = 0; i < 30; i++) {
      const body = { ...validBody(), id: `${"a".repeat(15)}${i.toString(36).slice(0, 1)}` };
      const res = await handler(makeReq(body, { [CLIENT_IP_HEADER]: "1.2.3.4" }));
      expect(res.status, `request ${i + 1} expected 201, got ${res.status}`).toBe(201);
    }
    const overflow = await handler(
      makeReq({ ...validBody(), id: "overflowdef45678" }, { [CLIENT_IP_HEADER]: "1.2.3.4" }),
    );
    expect(overflow.status).toBe(429);
    expect(await overflow.json()).toEqual({ error: "rate_limited" });
  });

  it("rate-limits per IP independently", async () => {
    const handler = makeHandler();
    for (let i = 0; i < 30; i++) {
      await handler(
        makeReq(
          { ...validBody(), id: `${"b".repeat(15)}${i.toString(36).slice(0, 1)}` },
          { [CLIENT_IP_HEADER]: "1.1.1.1" },
        ),
      );
    }
    // Different IP should still succeed.
    const ok = await handler(
      makeReq({ ...validBody(), id: "freship789012345" }, { [CLIENT_IP_HEADER]: "2.2.2.2" }),
    );
    expect(ok.status).toBe(201);
  });

  it("ignores X-Forwarded-For entirely — a forged XFF cannot fork the limiter key", async () => {
    const handler = makeHandler();
    // 30 creates, each with a DIFFERENT forged X-Forwarded-For but no resolved client-IP header.
    for (let i = 0; i < 30; i++) {
      const body = { ...validBody(), id: `${"c".repeat(15)}${i.toString(36).slice(0, 1)}` };
      const res = await handler(makeReq(body, { "x-forwarded-for": `10.0.0.${i}` }));
      expect(res.status, `request ${i + 1} expected 201, got ${res.status}`).toBe(201);
    }
    // 31st, yet another distinct forged XFF: because handlers ignore XFF (only CLIENT_IP_HEADER is
    // trusted), all 31 share the "unknown" bucket, so this is limited rather than granted fresh budget.
    const overflow = await handler(
      makeReq({ ...validBody(), id: "forgedxff1234567" }, { "x-forwarded-for": "10.0.0.99" }),
    );
    expect(overflow.status).toBe(429);
  });

  it("rejects an over-limit create BEFORE reading the body (limit precedes body work)", async () => {
    const handler = makeHandler();
    const ipHeader = { [CLIENT_IP_HEADER]: "5.5.5.5" };
    // Exhaust the 30/min budget with valid creates.
    for (let i = 0; i < 30; i++) {
      const body = { ...validBody(), id: `${"d".repeat(15)}${i.toString(36).slice(0, 1)}` };
      expect((await handler(makeReq(body, ipHeader))).status).toBe(201);
    }
    // 31st: a request whose body read is a spy. A real attacker would ship ~37 MiB here; the limiter
    // must reject before the handler reads / JSON.parses / base64-decodes ANY of it, so text() — the
    // gateway to all that body work — must never be called.
    const textSpy = vi.fn(async () => JSON.stringify(validBody()));
    const overLimitReq = {
      headers: new Headers(ipHeader),
      text: textSpy,
    } as unknown as Request;
    const res = await handler(overLimitReq);
    expect(res.status).toBe(429);
    expect(textSpy).not.toHaveBeenCalled();
  });
});

describe("createMessagesHandler — duplicate id", () => {
  it("returns 409 id_conflict when the same id is POSTed twice", async () => {
    const ciphertexts = new MemoryCiphertextStore();
    const links = new MemoryLinkMetadataStore(ciphertexts);
    const rateLimit = new MemoryRateLimitStore();
    const handler = createMessagesHandler({
      links,
      ciphertexts,
      rateLimit,
      now: () => FROZEN_NOW,
      publicLinkOrigin: "https://aesmsg.com",
    });

    const body = validBody();
    const first = await handler(makeReq(body));
    expect(first.status).toBe(201);

    const second = await handler(makeReq(body));
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "id_conflict" });
  });
});

describe("createMessagesHandler — atomic create (BE-5 / R22)", () => {
  it("rolls the link row back entirely when the ciphertext write fails", async () => {
    const backing = new MemoryCiphertextStore();
    const failingCiphertexts: CiphertextStore = {
      put: async () => {
        throw new Error("ciphertext store down");
      },
      get: (id) => backing.get(id),
      delete: (id) => backing.delete(id),
      totalBytes: () => backing.totalBytes(),
    };
    // The create path now writes both rows atomically via links.createWithCiphertext, which uses THIS
    // ciphertext store; its failing put() rolls the whole create back — there is no separate
    // best-effort cleanup to reason about.
    const links = new MemoryLinkMetadataStore(failingCiphertexts);
    const handler = createMessagesHandler({
      links,
      ciphertexts: failingCiphertexts,
      rateLimit: new MemoryRateLimitStore(),
      now: () => FROZEN_NOW,
      publicLinkOrigin: PUBLIC_LINK_ORIGIN,
    });

    const body = validBody();
    const res = await handler(makeReq(body));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error" });

    // Atomic rollback: the metadata row does not persist at all — the id is not burned (no 409
    // forever) and there is no live-but-empty link.
    expect(await links.get(body.id as never)).toBeNull();

    // And a subsequent open of that id is 410 (no row), not a live-but-empty link that consumes an open.
    const openHandler = makeOpenHandler(links, backing);
    const openRes = await openHandler(makePostReq(body.id), makeContext(body.id));
    expect(openRes.status).toBe(410);
  });
});

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
  it("returns 200 minimal metadata for an active link (no fingerprint, no createdAt)", async () => {
    const links = new MemoryLinkMetadataStore();
    const rateLimit = new MemoryRateLimitStore();
    const handler = createGetMessageHandler({ links, rateLimit, now: () => FROZEN_NOW });

    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: 1,
    });

    const res = await handler(makeGetReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("active");
    expect(body.maxOpens).toBe(1);
    expect(body.opensCount).toBe(0);
    expect(body).not.toHaveProperty("recipientFingerprint");
    expect(body).not.toHaveProperty("createdAt");
  });

  it("returns 400 on bad id format", async () => {
    const handler = makeGetHandler();
    const res = await handler(makeGetReq("too-short"), makeContext("too-short"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns 404 (opaque) when no row exists", async () => {
    const handler = makeGetHandler();
    const res = await handler(makeGetReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
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
    });
    await links.revoke("abcdefghijkl0123" as never);
    const res = await handler(makeGetReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
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
    });
    const res = await handler(makeGetReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
    expect(res.status).toBe(404);
  });

  it("rate-limits at 60 requests / minute / IP — the 61st returns 429", async () => {
    const links = new MemoryLinkMetadataStore();
    const handler = createGetMessageHandler({
      links,
      rateLimit: new MemoryRateLimitStore(),
      now: () => FROZEN_NOW,
    });
    for (let i = 0; i < 60; i++) {
      const id = `${"a".repeat(15)}${i.toString(36).slice(0, 1)}`;
      await handler(makeGetReq(id, { [CLIENT_IP_HEADER]: "9.9.9.9" }), makeContext(id));
    }
    const overflow = await handler(
      makeGetReq("overflowdef45678", { [CLIENT_IP_HEADER]: "9.9.9.9" }),
      makeContext("overflowdef45678"),
    );
    expect(overflow.status).toBe(429);
    expect(await overflow.json()).toEqual({ error: "rate_limited" });
  });
});

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
  it("returns 200 with base64 ciphertext + metadata recap (createdAt null for v2)", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    const handler = makeOpenHandler(links, ciphertexts);

    const openExpiresAt = new Date(Date.now() + 3600_000);
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: openExpiresAt,
      maxOpens: 1,
    });
    await ciphertexts.put("abcdefghijkl0123" as never, new Uint8Array([1, 2, 3, 4, 5]));

    const res = await handler(makePostReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ciphertext: string;
      createdAt: string | null;
      expiresAt: string;
      opensCount: number;
      maxOpens: number;
      status: string;
    };
    // v2 link: createdAt is null and no recipient fingerprint is returned.
    expect(body.createdAt).toBeNull();
    expect(body).not.toHaveProperty("recipientFingerprint");
    expect(body.expiresAt).toBe(openExpiresAt.toISOString());
    expect(new Date(body.expiresAt).getTime()).not.toBeNaN();
    expect(body.opensCount).toBe(1);
    expect(body.maxOpens).toBe(1);
    expect(body.status).toBe("expired");
    const binary = atob(body.ciphertext);
    expect(Array.from(binary).map((c) => c.charCodeAt(0))).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns 400 on bad id format", async () => {
    const handler = makeOpenHandler(new MemoryLinkMetadataStore(), new MemoryCiphertextStore());
    const res = await handler(makePostReq("too-short"), makeContext("too-short"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a body is sent to /open and does NOT consume the open", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: 1,
    });
    await ciphertexts.put("abcdefghijkl0123" as never, new Uint8Array([1, 2, 3]));
    const handler = makeOpenHandler(links, ciphertexts);

    const req = new Request("https://example.com/api/messages/abcdefghijkl0123/open", {
      method: "POST",
      body: "{}",
    });
    const res = await handler(req, makeContext("abcdefghijkl0123"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });

    // The rejected request must not have burned the single-use open.
    const row = await links.get("abcdefghijkl0123" as never);
    expect(row?.opensCount).toBe(0);
    expect(row?.status).toBe("active");
  });

  it("returns 410 when incrementOpens returns null (revoked link)", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
    });
    await links.revoke("abcdefghijkl0123" as never);
    const handler = makeOpenHandler(links, ciphertexts);
    const res = await handler(makePostReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "no_longer_available" });
  });

  it("returns 410 (synthetic) when incrementOpens succeeds but ciphertext is missing", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
    });
    const handler = makeOpenHandler(links, ciphertexts);
    const res = await handler(makePostReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "no_longer_available" });
  });

  it("burns single-use links — first open 200, second open 410", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    await links.create({
      id: "abcdefghijkl0123" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: 1,
    });
    await ciphertexts.put("abcdefghijkl0123" as never, new Uint8Array([42]));
    const handler = makeOpenHandler(links, ciphertexts);

    const first = await handler(makePostReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
    expect(first.status).toBe(200);

    const second = await handler(makePostReq("abcdefghijkl0123"), makeContext("abcdefghijkl0123"));
    expect(second.status).toBe(410);
  });

  it("rate-limits at 30 requests / minute / IP — the 31st returns 429", async () => {
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    const rateLimit = new MemoryRateLimitStore();
    const handler = makeOpenHandler(links, ciphertexts, rateLimit);
    for (let i = 0; i < 30; i++) {
      const id = `${"a".repeat(15)}${i.toString(36).slice(0, 1)}`;
      await handler(makePostReq(id, { [CLIENT_IP_HEADER]: "8.8.8.8" }), makeContext(id));
    }
    const overflow = await handler(
      makePostReq("overflow123def45", { [CLIENT_IP_HEADER]: "8.8.8.8" }),
      makeContext("overflow123def45"),
    );
    expect(overflow.status).toBe(429);
  });

  it("returns a non-null createdAt for a legacy v1 link (createdAt present in the store)", async () => {
    // Simulate a legacy v1 row by seeding createdAt directly into the memory store's map. The open
    // path must surface it so the recipient can reconstruct the v1 AAD.
    const links = new MemoryLinkMetadataStore();
    const ciphertexts = new MemoryCiphertextStore();
    const id = "legacyv1abc12345";
    await links.create({
      id: id as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
    });
    const legacyCreatedAt = new Date("2026-01-01T00:00:00.000Z");
    // Reach into the row to backfill createdAt (only legacy rows have it).
    const row = await links.get(id as never);
    if (row) {
      (links as unknown as { rows: Map<string, { createdAt: Date | null }> }).rows.set(
        id as never,
        {
          ...row,
          createdAt: legacyCreatedAt,
        },
      );
    }
    await ciphertexts.put(id as never, new Uint8Array([7, 7, 7]));
    const handler = makeOpenHandler(links, ciphertexts);
    const res = await handler(makePostReq(id), makeContext(id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { createdAt: string | null };
    expect(body.createdAt).toBe(legacyCreatedAt.toISOString());
  });
});

// REGRESSION (BLOCKER 1): the delivering (last allowed) open PURGES the ciphertext inside
// incrementOpens — memory store deletes the blob, the Pg store's writable-CTE `purged` DELETEs it.
// The earlier tests wired a BARE MemoryLinkMetadataStore() (no ciphertext reference), so the purge
// was a no-op and this bug stayed masked. These tests share the SAME ciphertext store between the
// link store and the handler deps — exactly how production wires them (apps/api/src/stores/stores.ts)
// — so the purge-on-last-open fires and the handler must still deliver the blob it consumed.
describe("createOpenMessageHandler — WIRED store (purge-on-last-open), BLOCKER 1", () => {
  function wire() {
    // Link store SHARES the ciphertext store the handler reads from — production wiring.
    const ciphertexts = new MemoryCiphertextStore();
    const links = new MemoryLinkMetadataStore(ciphertexts);
    const handler = makeOpenHandler(links, ciphertexts);
    return { links, ciphertexts, handler };
  }

  it("maxOpens=1: FIRST open returns 200 WITH the ciphertext, SECOND is opaque 410", async () => {
    const { links, ciphertexts, handler } = wire();
    const id = "viewonce12345678";
    const blob = new Uint8Array([10, 20, 30, 40, 50]);
    // Atomic create (production path) writes the row + blob into the shared ciphertext store.
    await links.createWithCiphertext(
      { id: id as never, expiresAt: new Date(Date.now() + 3600_000), maxOpens: 1 },
      blob,
    );

    // First open is the DELIVERING open: it consumes the single allowed open AND purges the blob
    // inside incrementOpens. The recipient must still receive the ciphertext it just consumed.
    const first = await handler(makePostReq(id), makeContext(id));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { ciphertext: string; status: string };
    const binary = atob(firstBody.ciphertext);
    expect(Array.from(binary).map((c) => c.charCodeAt(0))).toEqual([10, 20, 30, 40, 50]);
    expect(firstBody.status).toBe("expired");

    // The blob really was purged on that last open (privacy promise holds).
    expect(await ciphertexts.get(id as never)).toBeNull();

    // Second open is opaque 410 — the view-once link is spent.
    const second = await handler(makePostReq(id), makeContext(id));
    expect(second.status).toBe(410);
    expect(await second.json()).toEqual({ error: "no_longer_available" });
  });

  it("maxOpens=2: opens #1 and #2 both deliver 200; #3 is 410; blob purged on the LAST open", async () => {
    const { links, ciphertexts, handler } = wire();
    const id = "twoopens12345678";
    const blob = new Uint8Array([1, 2, 3, 4]);
    await links.createWithCiphertext(
      { id: id as never, expiresAt: new Date(Date.now() + 3600_000), maxOpens: 2 },
      blob,
    );

    // Open #1 — not the last open, blob stays put.
    const open1 = await handler(makePostReq(id), makeContext(id));
    expect(open1.status).toBe(200);
    const body1 = (await open1.json()) as { ciphertext: string };
    expect(Array.from(atob(body1.ciphertext)).map((c) => c.charCodeAt(0))).toEqual([1, 2, 3, 4]);
    // Not exhausted yet: ciphertext still present.
    expect(await ciphertexts.get(id as never)).not.toBeNull();

    // Open #2 — the LAST allowed open: delivers the blob AND purges it.
    const open2 = await handler(makePostReq(id), makeContext(id));
    expect(open2.status).toBe(200);
    const body2 = (await open2.json()) as { ciphertext: string };
    expect(Array.from(atob(body2.ciphertext)).map((c) => c.charCodeAt(0))).toEqual([1, 2, 3, 4]);
    // Purge-on-last-open STILL holds: the blob is gone after the final delivering open.
    expect(await ciphertexts.get(id as never)).toBeNull();

    // Open #3 — exhausted, opaque 410.
    const open3 = await handler(makePostReq(id), makeContext(id));
    expect(open3.status).toBe(410);
    expect(await open3.json()).toEqual({ error: "no_longer_available" });
  });

  it("revoked link → opaque 410 (wired store)", async () => {
    const { links, handler } = wire();
    const id = "wiredrevoked1234";
    await links.createWithCiphertext(
      { id: id as never, expiresAt: new Date(Date.now() + 3600_000), maxOpens: 1 },
      new Uint8Array([9, 9, 9, 9]),
    );
    await links.revoke(id as never);
    const res = await handler(makePostReq(id), makeContext(id));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "no_longer_available" });
  });

  it("expired link → opaque 410 (wired store)", async () => {
    const { links, handler } = wire();
    const id = "wiredexpired1234";
    await links.createWithCiphertext(
      { id: id as never, expiresAt: new Date(Date.now() - 1000), maxOpens: -1 },
      new Uint8Array([8, 8, 8, 8]),
    );
    const res = await handler(makePostReq(id), makeContext(id));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "no_longer_available" });
  });

  it("missing/unknown id → opaque 410 (wired store)", async () => {
    const { handler } = wire();
    const res = await handler(makePostReq("wiredmissing1234"), makeContext("wiredmissing1234"));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "no_longer_available" });
  });
});

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
  it("returns 200 with active + gone entries (no fingerprint) for a mixed batch", async () => {
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
    });
    await links.create({
      id: "revokedabcd01234" as never,
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000),
      maxOpens: 1,
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
    expect(byId.activeabcd012345).toEqual({
      id: "activeabcd012345",
      status: "active",
      expiresAt: new Date(FROZEN_NOW.getTime() + 3600_000).toISOString(),
      maxOpens: 5,
      opensCount: 0,
    });
    expect(byId.activeabcd012345).not.toHaveProperty("recipientFingerprint");
    expect(byId.revokedabcd01234).toEqual({ id: "revokedabcd01234", status: "gone" });
    expect(byId.missingabcd01234).toEqual({ id: "missingabcd01234", status: "gone" });
  });

  it("returns 400 on empty array", async () => {
    const handler = makeListHandler();
    const res = await handler(makeListReq({ ids: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns 400 when ids exceeds 100", async () => {
    const handler = makeListHandler();
    const ids = Array.from(
      { length: 101 },
      (_, i) => `${"a".repeat(15)}${i.toString(36).slice(0, 1)}`,
    );
    const res = await handler(makeListReq({ ids }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when any id is malformed", async () => {
    const handler = makeListHandler();
    const res = await handler(makeListReq({ ids: ["valid12345abcdef", "too-short"] }));
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
      await handler(makeListReq({ ids: ["abcdefghijkl0123"] }, { [CLIENT_IP_HEADER]: "7.7.7.7" }));
    }
    const overflow = await handler(
      makeListReq({ ids: ["abcdefghijkl0123"] }, { [CLIENT_IP_HEADER]: "7.7.7.7" }),
    );
    expect(overflow.status).toBe(429);
  });
});

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
  // These cases create rows DIRECTLY via the store without a revocationTokenHash — i.e. LEGACY
  // (pre-BE-1) un-tokened rows. Revoke without a token still works for exactly those rows so
  // existing senders keep the ability to revoke; they age out via expiry. The authenticated
  // (tokened) semantics are covered in the "authenticated revocation" describe block below.
  it("flips an active LEGACY (un-tokened) link to revoked and returns 200", async () => {
    const links = new MemoryLinkMetadataStore();
    await links.create({
      id: "activeabcd012345" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
    });
    const handler = makeRevokeHandler(links);

    const res = await handler(makeRevokeReq("activeabcd012345"), makeContext("activeabcd012345"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "activeabcd012345", status: "revoked" });

    const after = await links.get("activeabcd012345" as never);
    expect(after?.status).toBe("revoked");
  });

  it("purges the ciphertext immediately when the store is wired to one", async () => {
    const ciphertexts = new MemoryCiphertextStore();
    const links = new MemoryLinkMetadataStore(ciphertexts);
    const id = "purgeabcd0123456";
    await links.create({
      id: id as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
    });
    await ciphertexts.put(id as never, new Uint8Array([1, 2, 3]));
    const handler = makeRevokeHandler(links);

    const res = await handler(makeRevokeReq(id), makeContext(id));
    expect(res.status).toBe(200);

    // Revocation is the privacy promise that the server stops storing the ciphertext — not just a
    // 410 on open. The blob must be gone from the ciphertext store right after revoke.
    expect(await ciphertexts.get(id as never)).toBeNull();
  });

  it("is idempotent — revoking an unknown id returns 200", async () => {
    const handler = makeRevokeHandler(new MemoryLinkMetadataStore());
    const res = await handler(makeRevokeReq("nopenopenope0123"), makeContext("nopenopenope0123"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "nopenopenope0123", status: "revoked" });
  });

  it("is idempotent — revoking an already-revoked id returns 200", async () => {
    const links = new MemoryLinkMetadataStore();
    await links.create({
      id: "revokedabcd01234" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
    });
    await links.revoke("revokedabcd01234" as never);
    const handler = makeRevokeHandler(links);
    const res = await handler(makeRevokeReq("revokedabcd01234"), makeContext("revokedabcd01234"));
    expect(res.status).toBe(200);
  });

  it("returns 400 on bad id format", async () => {
    const handler = makeRevokeHandler(new MemoryLinkMetadataStore());
    const res = await handler(makeRevokeReq("too-short"), makeContext("too-short"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a body is sent to /revoke and does NOT revoke the link", async () => {
    const links = new MemoryLinkMetadataStore();
    await links.create({
      id: "activeabcd012345" as never,
      expiresAt: new Date(Date.now() + 3600_000),
      maxOpens: -1,
    });
    const handler = makeRevokeHandler(links);

    const req = new Request("https://example.com/api/messages/activeabcd012345/revoke", {
      method: "POST",
      body: '{"token":"nope"}',
    });
    const res = await handler(req, makeContext("activeabcd012345"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });

    // A body-borne request must not trigger revocation — the forthcoming token rides a HEADER.
    const after = await links.get("activeabcd012345" as never);
    expect(after?.status).toBe("active");
  });

  it("rate-limits at 30 requests / minute / IP — the 31st returns 429", async () => {
    const links = new MemoryLinkMetadataStore();
    const rateLimit = new MemoryRateLimitStore();
    const handler = makeRevokeHandler(links, rateLimit);
    for (let i = 0; i < 30; i++) {
      const id = `${"a".repeat(15)}${i.toString(36).slice(0, 1)}`;
      await handler(makeRevokeReq(id, { [CLIENT_IP_HEADER]: "6.6.6.6" }), makeContext(id));
    }
    const overflow = await handler(
      makeRevokeReq("overflow123def45", { [CLIENT_IP_HEADER]: "6.6.6.6" }),
      makeContext("overflow123def45"),
    );
    expect(overflow.status).toBe(429);
  });
});

// End-to-end (create → revoke) semantics of BE-1 / R2. A row created through the create handler
// carries a stored revocation-token hash; revoke then requires the secret token in a header.
//
//   token present AND matches   → revoke + purge, 200
//   id unknown / already-terminal → 200 (idempotent, indistinguishable)
//   id exists but token missing / mismatched → 200 WITHOUT revoking (fully opaque no-op)
//
// Every branch returns an identical 200 { id, status: "revoked" } so a third party cannot tell the
// outcomes apart — and cannot revoke a link they only saw the id of.
describe("createRevokeMessageHandler — authenticated revocation (BE-1 / R2)", () => {
  function wire() {
    const ciphertexts = new MemoryCiphertextStore();
    const links = new MemoryLinkMetadataStore(ciphertexts);
    const rateLimit = new MemoryRateLimitStore();
    const create = createMessagesHandler({
      links,
      ciphertexts,
      rateLimit,
      now: () => FROZEN_NOW,
      publicLinkOrigin: PUBLIC_LINK_ORIGIN,
    });
    const revoke = createRevokeMessageHandler({ links, rateLimit });
    return { links, ciphertexts, create, revoke };
  }

  async function createOne(create: ReturnType<typeof createMessagesHandler>, id: string) {
    const res = await create(makeReq({ ...validBody(), id }));
    expect(res.status).toBe(201);
    const { revocationToken } = (await res.json()) as { revocationToken: string };
    return revocationToken;
  }

  it("revokes + purges when the correct token is presented in the header", async () => {
    const { links, ciphertexts, create, revoke } = wire();
    const id = "tokmatch12345678";
    const token = await createOne(create, id);
    // create stored the ciphertext blob (64 zero bytes).
    expect(await ciphertexts.get(id as never)).not.toBeNull();

    const res = await revoke(
      makeRevokeReq(id, { [REVOCATION_TOKEN_HEADER]: token }),
      makeContext(id),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, status: "revoked" });

    expect((await links.get(id as never))?.status).toBe("revoked");
    // Revocation purges the ciphertext — the privacy promise.
    expect(await ciphertexts.get(id as never)).toBeNull();
  });

  it("with the WRONG token: 200 but does NOT revoke and does NOT purge (opaque no-op)", async () => {
    const { links, ciphertexts, create, revoke } = wire();
    const id = "tokwrong12345678";
    await createOne(create, id);

    const res = await revoke(
      makeRevokeReq(id, { [REVOCATION_TOKEN_HEADER]: "not-the-real-token" }),
      makeContext(id),
    );
    // Indistinguishable 200 — a third party can't tell they failed.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, status: "revoked" });

    // …but the link stays active and the ciphertext is intact.
    expect((await links.get(id as never))?.status).toBe("active");
    expect(await ciphertexts.get(id as never)).not.toBeNull();
  });

  it("with NO token header: 200 but does NOT revoke a tokened row (opaque no-op)", async () => {
    const { links, ciphertexts, create, revoke } = wire();
    const id = "tokmissing123456";
    await createOne(create, id);

    const res = await revoke(makeRevokeReq(id), makeContext(id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, status: "revoked" });

    expect((await links.get(id as never))?.status).toBe("active");
    expect(await ciphertexts.get(id as never)).not.toBeNull();
  });

  it("unknown id returns 200 regardless of token (idempotent, indistinguishable)", async () => {
    const { revoke } = wire();
    const res = await revoke(
      makeRevokeReq("unknownid1234567", { [REVOCATION_TOKEN_HEADER]: "whatever" }),
      makeContext("unknownid1234567"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "unknownid1234567", status: "revoked" });
  });

  it("a second revoke with the correct token stays 200 (idempotent after the first)", async () => {
    const { links, create, revoke } = wire();
    const id = "tokidem123456789";
    const token = await createOne(create, id);

    const first = await revoke(
      makeRevokeReq(id, { [REVOCATION_TOKEN_HEADER]: token }),
      makeContext(id),
    );
    expect(first.status).toBe(200);
    const second = await revoke(
      makeRevokeReq(id, { [REVOCATION_TOKEN_HEADER]: token }),
      makeContext(id),
    );
    expect(second.status).toBe(200);
    expect((await links.get(id as never))?.status).toBe("revoked");
  });
});
