import type { MetricsRegistry } from "./registry";

export interface HttpEvent {
  /**
   * The matched route TEMPLATE (e.g. "/api/messages/:id/open"), NEVER the raw request URL. The raw
   * URL contains the link id; the template does not. Callers MUST pass the template — for an
   * unmatched request (404) pass "unmatched", never the URL. This is the single most important
   * zero-knowledge guard in the metrics path.
   */
  route: string;
  method: string;
  status: number;
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

/**
 * Records one finished request into the metrics registry (PG-17 / PG-18 / R25). AGGREGATE only: the
 * only labels emitted are the route template and the status class — no id, IP, ciphertext, or
 * recipient. Kept as a pure function (registry + primitives in) so it is unit-testable without
 * Fastify; the onResponse hook in server.ts adapts request/reply into an HttpEvent.
 */
export function recordHttp(registry: MetricsRegistry, event: HttpEvent): void {
  const { route, method, status } = event;

  registry.increment("aesmsg_http_requests_total", { route, status_class: statusClass(status) });

  // 429s are the abuse/rate-limit signal.
  if (status === 429) {
    registry.increment("aesmsg_rate_limited_total", { route });
  }

  // Every 5xx in this API is a store/dependency (pg/redis) failure — the create catch returns 500 on
  // a store error, and an uncaught redis/pg throw is turned into a 500 by the opaque error handler.
  // So counting 5xx by route IS the dependency-error counter, without reaching into the handler.
  if (status >= 500) {
    registry.increment("aesmsg_dependency_errors_total", { route });
  }

  // Business events, derived from route + method + status (no handler instrumentation needed).
  if (method === "POST" && route === "/api/messages" && status === 201) {
    registry.increment("aesmsg_messages_created_total");
  } else if (method === "POST" && route === "/api/messages/:id/open" && status === 200) {
    registry.increment("aesmsg_messages_opened_total");
  } else if (method === "POST" && route === "/api/messages/:id/revoke" && status === 200) {
    registry.increment("aesmsg_messages_revoked_total");
  }
}
