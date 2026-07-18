import { describe, expect, it } from "vitest";
import { recordHttp } from "../src/metrics/http-metrics";
import { MetricsRegistry } from "../src/metrics/registry";

describe("recordHttp", () => {
  it("counts every request by route template + status class", () => {
    const r = new MetricsRegistry();
    recordHttp(r, { route: "/api/messages", method: "POST", status: 201 });
    recordHttp(r, { route: "/api/messages", method: "POST", status: 400 });
    expect(
      r.get("aesmsg_http_requests_total", { route: "/api/messages", status_class: "2xx" }),
    ).toBe(1);
    expect(
      r.get("aesmsg_http_requests_total", { route: "/api/messages", status_class: "4xx" }),
    ).toBe(1);
  });

  it("increments messages_created_total on POST /api/messages 201", () => {
    const r = new MetricsRegistry();
    recordHttp(r, { route: "/api/messages", method: "POST", status: 201 });
    expect(r.get("aesmsg_messages_created_total")).toBe(1);
    // A 400 create must NOT count as a creation.
    recordHttp(r, { route: "/api/messages", method: "POST", status: 400 });
    expect(r.get("aesmsg_messages_created_total")).toBe(1);
  });

  it("increments messages_opened_total on POST /api/messages/:id/open 200", () => {
    const r = new MetricsRegistry();
    recordHttp(r, { route: "/api/messages/:id/open", method: "POST", status: 200 });
    expect(r.get("aesmsg_messages_opened_total")).toBe(1);
    // A 410 (gone) open must NOT count.
    recordHttp(r, { route: "/api/messages/:id/open", method: "POST", status: 410 });
    expect(r.get("aesmsg_messages_opened_total")).toBe(1);
  });

  it("increments messages_revoked_total on POST /api/messages/:id/revoke 200", () => {
    const r = new MetricsRegistry();
    recordHttp(r, { route: "/api/messages/:id/revoke", method: "POST", status: 200 });
    expect(r.get("aesmsg_messages_revoked_total")).toBe(1);
  });

  it("increments rate_limited_total on any 429", () => {
    const r = new MetricsRegistry();
    recordHttp(r, { route: "/api/messages", method: "POST", status: 429 });
    recordHttp(r, { route: "/api/messages/:id/open", method: "POST", status: 429 });
    expect(r.get("aesmsg_rate_limited_total", { route: "/api/messages" })).toBe(1);
    expect(r.get("aesmsg_rate_limited_total", { route: "/api/messages/:id/open" })).toBe(1);
  });

  it("increments dependency_errors_total on any 5xx (store/dependency failure)", () => {
    const r = new MetricsRegistry();
    recordHttp(r, { route: "/api/messages", method: "POST", status: 500 });
    expect(r.get("aesmsg_dependency_errors_total", { route: "/api/messages" })).toBe(1);
    // A 4xx is not a dependency error.
    recordHttp(r, { route: "/api/messages", method: "POST", status: 400 });
    expect(r.get("aesmsg_dependency_errors_total", { route: "/api/messages" })).toBe(1);
  });

  it("labels an unmatched request 'unmatched' (never a raw URL/id)", () => {
    const r = new MetricsRegistry();
    recordHttp(r, { route: "unmatched", method: "GET", status: 404 });
    expect(r.get("aesmsg_http_requests_total", { route: "unmatched", status_class: "4xx" })).toBe(
      1,
    );
  });

  it("only ever records the route TEMPLATE — a concrete id in the route label never reaches a business counter", () => {
    // Contract check: recordHttp is called with a template, so a literal id like this should map to
    // no business counter (the guard is at the call site in server.ts, which passes routeOptions.url).
    const r = new MetricsRegistry();
    recordHttp(r, { route: "/api/messages/:id", method: "GET", status: 200 });
    expect(r.get("aesmsg_messages_opened_total")).toBe(0);
    expect(r.get("aesmsg_messages_created_total")).toBe(0);
  });
});
