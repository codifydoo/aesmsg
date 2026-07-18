// In-process, dependency-free metrics registry for the ops surface (PG-17 / PG-18 / R25).
//
// ZERO-KNOWLEDGE INVARIANT: every series here is AGGREGATE ONLY. The registry accepts a fixed set of
// metric names and, for each, a fixed set of label NAMES; the only label VALUES ever passed in are
// low-cardinality constants (a route TEMPLATE like "/api/messages/:id", a status class like "2xx").
// Nothing that identifies a link, an IP, a recipient, or ciphertext is ever a metric or a label —
// callers must never pass a raw URL, id, or IP as a label value. `render()` emits Prometheus text
// exposition format for a gated /metrics scrape (see routes/metrics.ts).

type MetricType = "counter" | "gauge";

interface MetricDef {
  readonly type: MetricType;
  readonly help: string;
  /** Ordered label names this metric accepts. An empty list = a single unlabelled series. */
  readonly labelNames: readonly string[];
}

// The complete, allow-listed metric catalogue. A name not defined here cannot be recorded or emitted.
const METRIC_DEFS = {
  aesmsg_http_requests_total: {
    type: "counter",
    help: "Total HTTP requests handled, by route TEMPLATE (never the raw URL, so no link id leaks) and status class.",
    labelNames: ["route", "status_class"],
  },
  aesmsg_rate_limited_total: {
    type: "counter",
    help: "Requests rejected with 429 by the per-IP rate limiter, by route template.",
    labelNames: ["route"],
  },
  aesmsg_messages_created_total: {
    type: "counter",
    help: "Secure links created (POST /api/messages -> 201).",
    labelNames: [],
  },
  aesmsg_messages_opened_total: {
    type: "counter",
    help: "Secure link opens served (POST /api/messages/:id/open -> 200).",
    labelNames: [],
  },
  aesmsg_messages_revoked_total: {
    type: "counter",
    help: "Revoke requests accepted (POST /api/messages/:id/revoke -> 200). Revoke is opaque, so this counts accepted requests, not confirmed deletions.",
    labelNames: [],
  },
  aesmsg_dependency_errors_total: {
    type: "counter",
    help: "Server-side 5xx responses, which in this API always mean a store/dependency (Postgres/Redis) failure. Feeds the dependency-outage alert.",
    labelNames: ["route"],
  },
  aesmsg_store_memory_fallback: {
    type: "gauge",
    help: "1 when the API is running on in-memory stores (R1: silent data-loss on restart), 0 on Postgres+Redis. Alert if this is 1 in production.",
    labelNames: [],
  },
  aesmsg_active_links: {
    type: "gauge",
    help: "Aggregate COUNT of links still active. Volume only — no id, recipient, or ciphertext.",
    labelNames: [],
  },
  aesmsg_ciphertext_bytes: {
    type: "gauge",
    help: "Aggregate SUM of stored ciphertext bytes. Volume only — never ciphertext content.",
    labelNames: [],
  },
} as const satisfies Record<string, MetricDef>;

export type MetricName = keyof typeof METRIC_DEFS;

type Labels = Record<string, string>;

interface Series {
  labels: Labels;
  value: number;
}

// Prometheus label-value escaping: backslash, double-quote, and newline.
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function serializeLabels(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  const inner = keys.map((k) => `${k}="${escapeLabelValue(labels[k] ?? "")}"`).join(",");
  return `{${inner}}`;
}

export class MetricsRegistry {
  // name -> (serialized-labels -> series)
  private readonly series = new Map<MetricName, Map<string, Series>>();

  constructor() {
    this.reset();
  }

  /** Clears all series and re-seeds the always-present zero-valued series (for tests + boot). */
  reset(): void {
    this.series.clear();
    for (const name of Object.keys(METRIC_DEFS) as MetricName[]) {
      this.series.set(name, new Map());
    }
    // Seed unlabelled counters + the fallback gauge at 0 so they always appear in a scrape (standard
    // Prometheus practice — a metric that never incremented should still report 0, not be absent).
    this.setUnlabelledZero("aesmsg_messages_created_total");
    this.setUnlabelledZero("aesmsg_messages_opened_total");
    this.setUnlabelledZero("aesmsg_messages_revoked_total");
    this.set("aesmsg_store_memory_fallback", 0);
  }

  private setUnlabelledZero(name: MetricName): void {
    this.series.get(name)?.set("", { labels: {}, value: 0 });
  }

  private validateLabels(name: MetricName, labels: Labels): void {
    const allowed: readonly string[] = METRIC_DEFS[name].labelNames;
    for (const key of Object.keys(labels)) {
      if (!allowed.includes(key)) {
        throw new Error(`MetricsRegistry: metric ${name} does not accept label "${key}"`);
      }
    }
  }

  /** Increments a counter series by `by` (default 1). */
  increment(name: MetricName, labels: Labels = {}, by = 1): void {
    if (METRIC_DEFS[name].type !== "counter") {
      throw new Error(`MetricsRegistry: ${name} is not a counter`);
    }
    this.validateLabels(name, labels);
    const bucket = this.series.get(name);
    if (!bucket) return;
    const key = serializeLabels(labels);
    const existing = bucket.get(key);
    if (existing) existing.value += by;
    else bucket.set(key, { labels, value: by });
  }

  /** Sets a gauge series to an absolute value. */
  set(name: MetricName, value: number, labels: Labels = {}): void {
    if (METRIC_DEFS[name].type !== "gauge") {
      throw new Error(`MetricsRegistry: ${name} is not a gauge`);
    }
    this.validateLabels(name, labels);
    const bucket = this.series.get(name);
    if (!bucket) return;
    bucket.set(serializeLabels(labels), { labels, value });
  }

  /** Reads a single series value (for tests). Returns undefined if the series was never recorded. */
  get(name: MetricName, labels: Labels = {}): number | undefined {
    return this.series.get(name)?.get(serializeLabels(labels))?.value;
  }

  /**
   * Drops every series for a metric so it is omitted from the next render until re-set. Used for the
   * scrape-scoped storage gauges (active_links / ciphertext_bytes): they are cleared then re-set on
   * each scrape, so a store outage omits them entirely rather than leaving a stale value behind.
   */
  clearMetric(name: MetricName): void {
    this.series.get(name)?.clear();
  }

  /** Renders the whole registry in Prometheus text exposition format. */
  render(): string {
    const lines: string[] = [];
    for (const name of Object.keys(METRIC_DEFS) as MetricName[]) {
      const def = METRIC_DEFS[name];
      const bucket = this.series.get(name);
      if (!bucket || bucket.size === 0) continue;
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} ${def.type}`);
      const sorted = Array.from(bucket.entries()).sort(([a], [b]) => a.localeCompare(b));
      for (const [labelStr, s] of sorted) {
        lines.push(`${name}${labelStr} ${s.value}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }
}

// Process-wide singleton used by the running server (server.ts hook, stores.ts fallback gauge, the
// /metrics route). Tests that need isolation construct their own MetricsRegistry instead.
export const metrics = new MetricsRegistry();
