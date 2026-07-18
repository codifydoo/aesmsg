import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

// Unknown routes must return an opaque 404 body rather than Fastify's default
// `{"message":"Route GET:/nope not found","error":"Not Found","statusCode":404}`, which fingerprints
// the framework and echoes the requested path. setNotFoundHandler replaces it with { error: "not_found" }.
describe("aesmsg API — opaque not-found handler", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 404 { error: 'not_found' } for an unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/definitely/not/a/route" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("does not echo the requested path or Fastify's default not-found fields", async () => {
    const res = await app.inject({ method: "GET", url: "/secret-path-xyz" });
    expect(res.body).not.toContain("secret-path-xyz");
    expect(res.body).not.toContain("Route");
    expect(res.body).not.toContain("statusCode");
    expect(res.json()).not.toHaveProperty("message");
  });

  it("also returns the opaque 404 for an unknown method+path (POST)", async () => {
    const res = await app.inject({ method: "POST", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });
});
