import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REVOCATION_TOKEN_HEADER } from "../src/lib/revocation-token";
import { buildServer } from "../src/server";

// Single-origin CORS allowlist (umbrella spec §7 / plan Task 1, D3). Uses Fastify's in-process
// inject() — no socket, no Postgres/Redis (in-memory stores). CORS is browser-enforced, so these
// assert the SERVER's header behavior: the allowlisted origin gets Access-Control-Allow-Origin
// reflected exactly; every other origin gets NO ACAO; and no-Origin (native app / curl) callers are
// not rejected and get no ACAO — the one difference from pre-CORS is a benign `Vary: Origin` header
// (@fastify/cors stamps it on every response for a non-static/function origin option, per the
// HTTP-cache spec), asserted in group (c).
const ALLOWED_ORIGIN = "https://app.aesmsg.com";
const OTHER_ORIGIN = "https://evil.example";

function validCreateBody(id: string) {
  return {
    id,
    ciphertext: Buffer.alloc(64, 7).toString("base64"), // >= 32-byte minimum
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    maxOpens: 3,
  };
}

describe("aesmsg API — CORS single-origin allowlist", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Pass the allowlisted origin explicitly (mirrors publicLinkOrigin in the smoke test) so the
    // test does not depend on process.env / the default.
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com", webappOrigin: ALLOWED_ORIGIN });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("(a) allowlisted origin — preflight + actual", () => {
    it("answers a preflight OPTIONS with the reflected origin + POST method + requested headers", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/messages",
        headers: {
          origin: ALLOWED_ORIGIN,
          "access-control-request-method": "POST",
          // The two request headers the browser web client actually sends: JSON content-type on
          // create/list and the secret revocation token on revoke.
          "access-control-request-headers": `content-type,${REVOCATION_TOKEN_HEADER}`,
        },
      });
      // @fastify/cors terminates a matched preflight with 204 (optionsSuccessStatus).
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
      expect(String(res.headers["access-control-allow-methods"])).toContain("POST");
      // allowedHeaders defaults to reflecting Access-Control-Request-Headers, so the revoke token
      // header is permitted.
      const allowHeaders = String(res.headers["access-control-allow-headers"]).toLowerCase();
      expect(allowHeaders).toContain(REVOCATION_TOKEN_HEADER);
      expect(allowHeaders).toContain("content-type");
    });

    it("allows a preflight OPTIONS for the revoke route including the revocation-token header", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/messages/corstest0abcdef1/revoke",
        headers: {
          origin: ALLOWED_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": REVOCATION_TOKEN_HEADER,
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
      expect(String(res.headers["access-control-allow-methods"])).toContain("POST");
      expect(String(res.headers["access-control-allow-headers"]).toLowerCase()).toContain(
        REVOCATION_TOKEN_HEADER,
      );
    });

    it("reflects the origin on an actual POST /api/messages (201)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/messages",
        headers: { origin: ALLOWED_ORIGIN },
        payload: validCreateBody("corscreate0abcd1"),
      });
      expect(res.statusCode).toBe(201);
      expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    });
  });

  describe("(b) other origin — denied (no ACAO)", () => {
    it("emits no Access-Control-Allow-Origin on a preflight OPTIONS", async () => {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/messages",
        headers: {
          origin: OTHER_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("executes an actual POST server-side but ships no ACAO (browser would block the read)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/messages",
        headers: { origin: OTHER_ORIGIN },
        payload: validCreateBody("corsevil00abcd12"),
      });
      // CORS is browser-enforced: the request still runs (201), it simply carries no ACAO, so a
      // browser at OTHER_ORIGIN cannot read the response cross-origin.
      expect(res.statusCode).toBe(201);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("(c) no Origin header — no ACAO, only a benign Vary: Origin", () => {
    it("creates a link with 201, no ACAO header, and a Vary: Origin cache hint", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/messages",
        payload: validCreateBody("corsnoorigin0ab1"),
      });
      expect(res.statusCode).toBe(201);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      // The function `origin` option is non-static, so @fastify/cors stamps `Vary: Origin` on EVERY
      // response — including this no-Origin one — for correct HTTP-cache keying. It reflects no origin
      // (no ACAO above) and carries no id/IP, so it is benign under the zero-knowledge posture.
      expect(String(res.headers.vary)).toContain("Origin");
    });

    it("serves GET /api/messages/:id with no ACAO header but the Vary: Origin hint (400 on a malformed id)", async () => {
      const res = await app.inject({ method: "GET", url: "/api/messages/too-short" });
      expect(res.statusCode).toBe(400);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      expect(String(res.headers.vary)).toContain("Origin");
    });
  });

  describe("(d) origin override honored", () => {
    it("reflects a custom webappOrigin and denies the previous default", async () => {
      const custom = "http://localhost:3001";
      const custApp = buildServer({
        publicLinkOrigin: "https://aesmsg.com",
        webappOrigin: custom,
      });
      await custApp.ready();
      try {
        const ok = await custApp.inject({
          method: "OPTIONS",
          url: "/api/messages",
          headers: { origin: custom, "access-control-request-method": "POST" },
        });
        expect(ok.statusCode).toBe(204);
        expect(ok.headers["access-control-allow-origin"]).toBe(custom);

        // The previous default origin is now NOT allowed.
        const denied = await custApp.inject({
          method: "OPTIONS",
          url: "/api/messages",
          headers: { origin: ALLOWED_ORIGIN, "access-control-request-method": "POST" },
        });
        expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
      } finally {
        await custApp.close();
      }
    });
  });
});
