import { timingSafeEqual } from "node:crypto";
import type { StorageStats } from "@aesmsg/server-store";
import type { FastifyInstance } from "fastify";
import type { MetricsRegistry } from "../metrics/registry";

export interface MetricsRouteOptions {
  registry: MetricsRegistry;
  /** The bearer token that gates the scrape (AESMSG_METRICS_TOKEN). Unset ⇒ endpoint is disabled. */
  token: string | undefined;
  /** Aggregate storage stats, evaluated per scrape. Zero-knowledge: COUNT + SUM only. */
  stats: () => Promise<StorageStats>;
}

// Constant-time bearer comparison so a timing side-channel can't probe the token byte-by-byte. A
// length mismatch short-circuits (timingSafeEqual throws on unequal lengths) but is itself a safe
// signal — the token length is not a meaningful secret.
function tokenMatches(configured: string, presented: string): boolean {
  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extractBearer(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match?.[1] ?? null;
}

/**
 * ACCESS CONTROL (PG-17 / PG-18 / R25). /metrics exposes only AGGREGATE operational data (request /
 * error / rate-limit counters + volume gauges — never an id, IP, ciphertext, or recipient), but even
 * aggregate volume is operational detail we don't hand to anonymous callers. Two layers:
 *
 *   1. Bearer token from AESMSG_METRICS_TOKEN (this gate). If the env var is UNSET the route responds
 *      404 — indistinguishable from "no such route", so we don't even advertise that a metrics surface
 *      exists. If set, a scrape must present `Authorization: Bearer <token>` (constant-time compared)
 *      or get 401.
 *   2. Deployment: the operator should ALSO keep /metrics off the public nginx vhost (scrape it over
 *      the internal network / same-host only). Documented in docs/ops-runbook.md.
 */
export function registerMetricsRoutes(app: FastifyInstance, options: MetricsRouteOptions): void {
  app.get("/metrics", async (request, reply) => {
    // No token configured → behave exactly like an unregistered route (opaque 404), so the metrics
    // surface is not discoverable and cannot leak volume to an anonymous scrape.
    if (!options.token) {
      reply.status(404).send({ error: "not_found" });
      return;
    }

    const presented = extractBearer(request.headers.authorization);
    if (presented === null || !tokenMatches(options.token, presented)) {
      reply.status(401).send({ error: "unauthorized" });
      return;
    }

    // Storage gauges are scrape-scoped: clear then re-set so a store outage OMITS them (rather than
    // reporting a stale volume) while the counters — including the memory-fallback gauge and the 5xx
    // dependency-error counter the operator needs during that very outage — are always rendered.
    options.registry.clearMetric("aesmsg_active_links");
    options.registry.clearMetric("aesmsg_ciphertext_bytes");
    try {
      const { activeLinks, ciphertextBytes } = await options.stats();
      options.registry.set("aesmsg_active_links", activeLinks);
      options.registry.set("aesmsg_ciphertext_bytes", ciphertextBytes);
    } catch {
      // Intentionally swallowed (no IP/URL logging, ZK posture): omit the two gauges for this scrape.
    }

    reply
      .status(200)
      .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .send(options.registry.render());
  });
}
