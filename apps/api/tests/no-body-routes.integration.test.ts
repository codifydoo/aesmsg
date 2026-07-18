import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

// End-to-end (Fastify inject) checks that /open and /revoke reject request bodies (BE-2 / R3): the
// handler's empty-body guard returns a clean 400, and the per-route bodyLimit rejects an oversized
// body at the Fastify edge (413) before buffering the global 38 MiB.
describe("BE-2 — no-body routes reject bodies", () => {
  let app: FastifyInstance;
  const id = "nobody0abcdef123"; // 16 chars, matches /^[A-Za-z0-9_-]{16}$/

  beforeAll(async () => {
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /open with a small body returns 400 bad_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/messages/${id}/open`,
      headers: { "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bad_request" });
  });

  it("POST /revoke with a small body returns 400 bad_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/messages/${id}/revoke`,
      headers: { "content-type": "application/json" },
      payload: '{"token":"nope"}',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bad_request" });
  });

  it("POST /open with an oversized body is rejected at the edge (per-route bodyLimit)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/messages/${id}/open`,
      headers: { "content-type": "application/json" },
      payload: "x".repeat(4096), // > the 1 KiB per-route bodyLimit
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: "bad_request" });
  });

  it("POST /revoke WITHOUT a body still works (idempotent 200)", async () => {
    const res = await app.inject({ method: "POST", url: `/api/messages/${id}/revoke` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, status: "revoked" });
  });

  it("POST /open WITHOUT a body reaches the handler (410 for a missing link)", async () => {
    const res = await app.inject({ method: "POST", url: `/api/messages/${id}/open` });
    expect(res.statusCode).toBe(410);
  });
});
