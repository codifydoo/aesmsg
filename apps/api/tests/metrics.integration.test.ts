import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

// Full in-process server (Fastify inject, in-memory stores — no DATABASE_URL/REDIS_URL). Drives real
// create/open/revoke traffic through the routes, then scrapes the gated /metrics and asserts the
// output is AGGREGATE ONLY: it must contain route TEMPLATES and counts, and must NOT contain the link
// id, the client IP, or any raw request path.
describe("aesmsg API — /metrics integration", () => {
  let app: FastifyInstance;
  const TOKEN = "integration-metrics-token";
  // 16 chars matching /^[A-Za-z0-9_-]{16}$/ — the exact string we assert never appears in /metrics.
  const linkId = "metricslink00001";
  const ciphertext = Buffer.alloc(64, 7).toString("base64");

  async function scrape(): Promise<string> {
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    return res.body;
  }

  beforeAll(async () => {
    app = buildServer({ publicLinkOrigin: "https://aesmsg.com", metricsToken: TOKEN });
    await app.ready();

    // Real traffic across several routes + status classes.
    await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: {
        id: linkId,
        ciphertext,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        maxOpens: -1,
      },
    });
    await app.inject({ method: "POST", url: `/api/messages/${linkId}/open` });
    await app.inject({ method: "GET", url: "/api/messages/too-short" }); // 400
    await app.inject({ method: "GET", url: "/definitely-not-a-route" }); // 404 unmatched
  });

  afterAll(async () => {
    await app.close();
  });

  it("renders aggregate counters with route TEMPLATES and status classes", async () => {
    const body = await scrape();
    expect(body).toContain("# TYPE aesmsg_http_requests_total counter");
    expect(body).toContain('route="/api/messages"');
    expect(body).toContain('route="/api/messages/:id/open"');
    expect(body).toContain('status_class="2xx"');
    // The unmatched 404 is labelled "unmatched", never the raw path.
    expect(body).toContain('route="unmatched"');
    expect(body).not.toContain("/definitely-not-a-route");
  });

  it("records the business counters for the create + open that happened", async () => {
    const body = await scrape();
    expect(body).toMatch(/aesmsg_messages_created_total \d+/);
    expect(body).toMatch(/aesmsg_messages_opened_total \d+/);
    const created = Number(/aesmsg_messages_created_total (\d+)/.exec(body)?.[1]);
    const opened = Number(/aesmsg_messages_opened_total (\d+)/.exec(body)?.[1]);
    expect(created).toBeGreaterThanOrEqual(1);
    expect(opened).toBeGreaterThanOrEqual(1);
  });

  it("exposes the store-fallback gauge = 1 (in-memory mode, the R1 alert signal)", async () => {
    const body = await scrape();
    expect(body).toContain("# TYPE aesmsg_store_memory_fallback gauge");
    expect(body).toContain("aesmsg_store_memory_fallback 1");
  });

  it("exposes aggregate storage gauges (COUNT active links + SUM ciphertext bytes)", async () => {
    const body = await scrape();
    expect(body).toMatch(/aesmsg_active_links \d+/);
    expect(body).toMatch(/aesmsg_ciphertext_bytes \d+/);
  });

  it("leaks NO link id, NO client IP, and NO raw request path", async () => {
    const body = await scrape();
    // The link id we created must never appear anywhere in the exposition.
    expect(body).not.toContain(linkId);
    // No raw per-link path (only the :id template).
    expect(body).not.toContain(`/api/messages/${linkId}`);
    // No client IP (inject's default remote address) or forwarded-IP header name/value.
    expect(body).not.toContain("127.0.0.1");
    expect(body.toLowerCase()).not.toContain("x-forwarded-for");
    // No base64 ciphertext fragment.
    expect(body).not.toContain(ciphertext.slice(0, 16));
    // Defensive: nothing that looks like a dotted IPv4 literal appears in any series line.
    for (const line of body.split("\n")) {
      if (line.startsWith("#")) continue;
      expect(line).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    }
  });
});
