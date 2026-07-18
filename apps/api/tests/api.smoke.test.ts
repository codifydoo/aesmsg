import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REVOCATION_TOKEN_HEADER } from "../src/lib/revocation-token";
import { buildServer } from "../src/server";

// Uses Fastify's in-process inject() — no socket, no Postgres/Redis (no DATABASE_URL/REDIS_URL set,
// so getStores() returns the in-memory stores). One end-to-end create → list → get → open → revoke.
describe("aesmsg API — smoke", () => {
  let app: FastifyInstance;
  // Captured from the create 201 body — required to authenticate the revoke (BE-1 / R2).
  let revocationToken: string;

  beforeAll(async () => {
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const id = "smoke01abcdef234"; // 16 chars, matches /^[A-Za-z0-9_-]{16}$/
  const ciphertext = Buffer.alloc(64, 7).toString("base64"); // >= 32-byte minimum

  it("POST /api/messages creates a link and returns the web-origin URL + a revocation token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: {
        id,
        ciphertext,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        maxOpens: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id, url: `https://aesmsg.com/l/${id}` });
    revocationToken = res.json().revocationToken;
    expect(typeof revocationToken).toBe("string");
    expect(revocationToken.length).toBeGreaterThanOrEqual(16);
  });

  it("POST /api/messages/list returns the active row", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/messages/list",
      payload: { ids: [id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0]).toMatchObject({ id, status: "active" });
  });

  it("GET /api/messages/:id returns safe metadata only", async () => {
    const res = await app.inject({ method: "GET", url: `/api/messages/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("active");
    expect(body).not.toHaveProperty("ciphertext");
  });

  it("POST /api/messages/:id/open returns the ciphertext", async () => {
    const res = await app.inject({ method: "POST", url: `/api/messages/${id}/open` });
    expect(res.statusCode).toBe(200);
    expect(res.json().ciphertext).toBe(ciphertext);
  });

  it("GET /api/messages/:id rejects a malformed id with 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/messages/too-short" });
    expect(res.statusCode).toBe(400);
  });

  it("POST /revoke WITHOUT the token is an opaque 200 no-op (link stays live)", async () => {
    // A third party who only saw the id cannot revoke: no token → silent no-op, but an
    // indistinguishable 200. The link must still be openable afterward.
    const res = await app.inject({ method: "POST", url: `/api/messages/${id}/revoke` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, status: "revoked" });

    // Still live: GET returns active metadata (the un-tokened revoke did nothing).
    const check = await app.inject({ method: "GET", url: `/api/messages/${id}` });
    expect(check.statusCode).toBe(200);
    expect(check.json().status).toBe("active");
  });

  it("POST /revoke WITH the correct token revokes the link (200) and it goes gone", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/messages/${id}/revoke`,
      headers: { [REVOCATION_TOKEN_HEADER]: revocationToken },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, status: "revoked" });

    // Now genuinely gone — GET is opaque 404 and a subsequent open is 410.
    const check = await app.inject({ method: "GET", url: `/api/messages/${id}` });
    expect(check.statusCode).toBe(404);
    const open = await app.inject({ method: "POST", url: `/api/messages/${id}/open` });
    expect(open.statusCode).toBe(410);
  });
});
