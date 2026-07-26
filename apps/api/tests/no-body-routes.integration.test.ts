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

  // expo/fetch's Android native layer cannot send a bodyless POST: OkHttp requires a non-null body,
  // so it substitutes `byteArrayOf(0)` — a single NUL byte, NOT an empty array (expo
  // android/.../fetch/NativeRequest.kt). iOS sends no body at all. Treating that lone NUL as a real
  // body 400s every open/revoke issued by the Android app, which the mobile reader surfaces as the
  // "not a valid secure message" terminal. The byte carries no data and no open-consumption proof,
  // so it is accepted as "no body" — the guard against a MEANINGFUL body (BE-2 / R3) is unchanged.
  const androidEmptyBody = Buffer.from([0]);

  it("POST /open with the single NUL byte expo/fetch sends on Android reaches the handler", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/messages/${id}/open`,
      payload: androidEmptyBody,
    });
    expect(res.statusCode).toBe(410);
  });

  it("POST /revoke with the single NUL byte expo/fetch sends on Android still works", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/messages/${id}/revoke`,
      payload: androidEmptyBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, status: "revoked" });
  });

  it("POST /open still rejects a body that merely STARTS with a NUL byte", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/messages/${id}/open`,
      payload: Buffer.from([0, 0x7b, 0x7d]), // "\0{}"
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bad_request" });
  });
});
