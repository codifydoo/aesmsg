import type { StorageStats } from "@aesmsg/server-store";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { MetricsRegistry } from "../src/metrics/registry";
import { registerMetricsRoutes } from "../src/routes/metrics";

const OK_STATS: () => Promise<StorageStats> = async () => ({
  activeLinks: 4,
  ciphertextBytes: 2048,
});

function buildApp(opts: {
  token: string | undefined;
  registry?: MetricsRegistry;
  stats?: () => Promise<StorageStats>;
}): FastifyInstance {
  const app = Fastify();
  registerMetricsRoutes(app, {
    registry: opts.registry ?? new MetricsRegistry(),
    token: opts.token,
    stats: opts.stats ?? OK_STATS,
  });
  return app;
}

describe("GET /metrics — access control", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it("returns an opaque 404 when no token is configured (surface not advertised)", async () => {
    app = buildApp({ token: undefined });
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("returns 401 when the bearer token is missing", async () => {
    app = buildApp({ token: "s3cret-token" });
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 on a wrong bearer token", async () => {
    app = buildApp({ token: "s3cret-token" });
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 Prometheus text on the correct bearer token", async () => {
    const registry = new MetricsRegistry();
    registry.increment("aesmsg_http_requests_total", {
      route: "/api/messages",
      status_class: "2xx",
    });
    app = buildApp({ token: "s3cret-token", registry });
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer s3cret-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("aesmsg_http_requests_total");
    // Storage gauges populated from stats().
    expect(res.body).toContain("aesmsg_active_links 4");
    expect(res.body).toContain("aesmsg_ciphertext_bytes 2048");
  });
});

describe("GET /metrics — store-outage tolerance", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it("still returns 200 with counters when stats() throws, omitting the storage gauges", async () => {
    const registry = new MetricsRegistry();
    registry.set("aesmsg_store_memory_fallback", 1);
    app = buildApp({
      token: "tok",
      registry,
      stats: async () => {
        throw new Error("pg down");
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer tok" },
    });
    expect(res.statusCode).toBe(200);
    // The fallback gauge (the operator's outage signal) is present…
    expect(res.body).toContain("aesmsg_store_memory_fallback 1");
    // …but the storage gauges are omitted rather than showing a stale value.
    expect(res.body).not.toContain("aesmsg_active_links");
    expect(res.body).not.toContain("aesmsg_ciphertext_bytes");
  });
});
