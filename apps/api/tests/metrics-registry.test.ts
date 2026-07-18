import { describe, expect, it } from "vitest";
import { MetricsRegistry } from "../src/metrics/registry";

describe("MetricsRegistry", () => {
  it("seeds unlabelled counters and the fallback gauge at 0", () => {
    const r = new MetricsRegistry();
    expect(r.get("aesmsg_messages_created_total")).toBe(0);
    expect(r.get("aesmsg_messages_opened_total")).toBe(0);
    expect(r.get("aesmsg_messages_revoked_total")).toBe(0);
    expect(r.get("aesmsg_store_memory_fallback")).toBe(0);
  });

  it("accumulates counter increments per label set", () => {
    const r = new MetricsRegistry();
    r.increment("aesmsg_http_requests_total", { route: "/api/messages", status_class: "2xx" });
    r.increment("aesmsg_http_requests_total", { route: "/api/messages", status_class: "2xx" });
    r.increment("aesmsg_http_requests_total", { route: "/api/messages", status_class: "4xx" });
    expect(
      r.get("aesmsg_http_requests_total", { route: "/api/messages", status_class: "2xx" }),
    ).toBe(2);
    expect(
      r.get("aesmsg_http_requests_total", { route: "/api/messages", status_class: "4xx" }),
    ).toBe(1);
  });

  it("sets gauges to absolute values (overwrite, not accumulate)", () => {
    const r = new MetricsRegistry();
    r.set("aesmsg_active_links", 5);
    r.set("aesmsg_active_links", 3);
    expect(r.get("aesmsg_active_links")).toBe(3);
  });

  it("clearMetric drops a metric's series so it is omitted from render", () => {
    const r = new MetricsRegistry();
    r.set("aesmsg_ciphertext_bytes", 100);
    expect(r.render()).toContain("aesmsg_ciphertext_bytes 100");
    r.clearMetric("aesmsg_ciphertext_bytes");
    expect(r.render()).not.toContain("aesmsg_ciphertext_bytes 100");
    expect(r.render()).not.toContain("# TYPE aesmsg_ciphertext_bytes");
  });

  it("rejects a label name the metric does not declare (runtime allow-list guard)", () => {
    const r = new MetricsRegistry();
    // Runtime guard: even though the TS type is Record<string,string>, an undeclared label name
    // (which could smuggle high-cardinality/identifying data) is rejected at call time.
    expect(() => r.increment("aesmsg_messages_created_total", { id: "leak-me" })).toThrow(
      /does not accept label/,
    );
  });

  it("rejects mismatched counter/gauge operations", () => {
    const r = new MetricsRegistry();
    expect(() => r.set("aesmsg_messages_created_total", 1)).toThrow(/not a gauge/);
    expect(() => r.increment("aesmsg_active_links")).toThrow(/not a counter/);
  });

  it("renders Prometheus text with HELP/TYPE and sorted label series", () => {
    const r = new MetricsRegistry();
    r.increment("aesmsg_http_requests_total", { route: "/api/messages/:id", status_class: "2xx" });
    const out = r.render();
    expect(out).toContain("# HELP aesmsg_http_requests_total");
    expect(out).toContain("# TYPE aesmsg_http_requests_total counter");
    expect(out).toContain(
      'aesmsg_http_requests_total{route="/api/messages/:id",status_class="2xx"} 1',
    );
    // Every line is either a comment or `name<labels> value` — no stray content.
    for (const line of out.trim().split("\n")) {
      expect(line.startsWith("#") || /\s\d+(\.\d+)?$/.test(line)).toBe(true);
    }
  });

  it("escapes special characters in label values", () => {
    const r = new MetricsRegistry();
    // No real metric would ever carry these, but the escaper must be correct if one ever did.
    r.increment("aesmsg_http_requests_total", { route: 'a"b\\c', status_class: "2xx" });
    expect(r.render()).toContain('route="a\\"b\\\\c"');
  });
});
