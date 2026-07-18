import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

// Liveness smoke route used by the deploy platform / load balancer. It must not touch the stores,
// consume opens, or leak any metadata — a bare 200 { status: "ok" } proving the process is up.
describe("aesmsg API — health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health returns 200 with status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
