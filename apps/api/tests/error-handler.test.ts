import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

// BE-3: an unexpected throw inside a handler must NOT leak internal messages/stack. We force the
// hash-ip fail-closed throw (production + no salt) to reach Fastify's error handler and assert the
// response body is the opaque { error: "internal_error" } with status 500 — never the internal
// "RATE_LIMIT_IP_SALT must be set…" config detail that the default handler would have echoed.
describe("aesmsg API — opaque error handler", () => {
  let app: FastifyInstance;
  let prevNodeEnv: string | undefined;
  let prevSalt: string | undefined;

  beforeAll(async () => {
    prevNodeEnv = process.env.NODE_ENV;
    prevSalt = process.env.RATE_LIMIT_IP_SALT;
    // hashIp() reads these at call time; production + missing salt makes hashIpWith throw.
    process.env.NODE_ENV = "production";
    delete process.env.RATE_LIMIT_IP_SALT;
    // logger:false keeps the error handler's app.log.error(error) silent during the test.
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevSalt === undefined) delete process.env.RATE_LIMIT_IP_SALT;
    else process.env.RATE_LIMIT_IP_SALT = prevSalt;
  });

  it("returns an opaque 500 body with no internal message when a handler throws", async () => {
    // Valid 16-char id passes id validation, so the handler proceeds to hashIp() and throws.
    const res = await app.inject({ method: "GET", url: "/api/messages/abcdefghijkl0123" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal_error" });
    // The internal salt/config detail must never appear in the wire body.
    expect(res.body).not.toContain("RATE_LIMIT_IP_SALT");
    expect(res.body).not.toContain("Error");
  });

  it("health stays up (store-free, no hashIp) even under the misconfiguration", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
