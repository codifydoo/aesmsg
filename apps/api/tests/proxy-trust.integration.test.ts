import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

// End-to-end (Fastify inject) checks for BE-2 / R3: the client identity the rate limiter keys on is
// Fastify's resolved `request.ip`, and proxy trust is scoped. No Postgres/Redis (in-memory stores),
// no socket. `inject()` sets the socket remoteAddress to 127.0.0.1, so with trust OFF every request
// resolves to the same client IP regardless of the X-Forwarded-For it carries.

// A missing link still hits the rate limiter (checked before the row lookup) and returns 404 while
// under budget, 429 once over — so we can probe the limiter without seeding any data.
const MISSING_ID = "doesnotexist0001"; // 16 chars, matches /^[A-Za-z0-9_-]{16}$/

describe("BE-2 — scoped proxy trust + client IP", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("forged X-Forwarded-For cannot fork the rate-limit identity when trust is off", async () => {
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com", trustProxy: false });
    await app.ready();

    // GET budget is 60/min/IP. Fire 61 GETs, each with a DIFFERENT forged XFF. With trust off the
    // client IP is the constant socket address, so all 61 share one bucket and the 61st is limited.
    let last: Awaited<ReturnType<typeof app.inject>> | undefined;
    for (let i = 0; i < 61; i++) {
      last = await app.inject({
        method: "GET",
        url: `/api/messages/${MISSING_ID}`,
        headers: { "x-forwarded-for": `203.0.113.${i}` },
      });
    }
    expect(last?.statusCode).toBe(429);
    expect(last?.json()).toEqual({ error: "rate_limited" });
  });

  it("honors X-Forwarded-For only when the operator opts into proxy trust", async () => {
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com", trustProxy: true });
    await app.ready();

    // With trust ON, request.ip becomes the leftmost XFF value, so 70 distinct forged XFFs are 70
    // distinct identities — none exceeds the 60/min budget (all resolve to a not-found 404).
    const statuses: number[] = [];
    for (let i = 0; i < 70; i++) {
      const res = await app.inject({
        method: "GET",
        url: `/api/messages/${MISSING_ID}`,
        headers: { "x-forwarded-for": `198.51.100.${i}` },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.every((s) => s === 404)).toBe(true);
  });

  it("strips a client-supplied internal client-IP header so it can't spoof the identity", async () => {
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com", trustProxy: false });
    await app.ready();

    // A client tries to forge the adapter's internal trusted header directly. The adapter strips any
    // inbound copy and re-stamps request.ip, so rotating it grants no fresh budget — the 61st limits.
    let last: Awaited<ReturnType<typeof app.inject>> | undefined;
    for (let i = 0; i < 61; i++) {
      last = await app.inject({
        method: "GET",
        url: `/api/messages/${MISSING_ID}`,
        headers: { "x-aesmsg-client-ip": `192.0.2.${i}` },
      });
    }
    expect(last?.statusCode).toBe(429);
  });
});
