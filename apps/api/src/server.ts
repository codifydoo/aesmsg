import cors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { resolveMaxRetentionMs } from "./handlers/messages-handler";
import { resolveTrustProxy } from "./lib/trust-proxy";
import { recordHttp } from "./metrics/http-metrics";
import { metrics as defaultMetrics, type MetricsRegistry } from "./metrics/registry";
import { registerHealthRoutes } from "./routes/health";
import { registerMessageRoutes } from "./routes/messages";
import { registerMetricsRoutes } from "./routes/metrics";
import { getStores } from "./stores/stores";

export interface BuildServerOptions {
  publicLinkOrigin?: string;
  // The single browser origin allowed to call this API cross-origin (the messaging web client at
  // app.aesmsg.com). Defaults to the scoped AESMSG_WEBAPP_ORIGIN env resolution
  // ("https://app.aesmsg.com" if unset); accepts an explicit value for tests. Soft config with a
  // sensible default — NOT a boot gate (deliberately absent from assertProductionConfig). See the
  // CORS registration below for the single-origin allowlist semantics.
  webappOrigin?: string;
  // Global retention ceiling in ms (roadmap 2.5). Defaults to the scoped AESMSG_MAX_RETENTION_MS env
  // resolution (365 days if unset/invalid). Accepts an explicit value for tests.
  maxRetentionMs?: number;
  logger?: boolean;
  // How much of the X-Forwarded-For chain to trust when deriving `request.ip`. Defaults to the
  // scoped `AESMSG_TRUST_PROXY` env resolution (see lib/trust-proxy.ts); accepts an explicit value
  // for tests. `false` = ignore XFF and use the socket address.
  trustProxy?: boolean | number | string;
  // Metrics registry (PG-17 / PG-18 / R25). Defaults to the process-wide singleton so the store
  // selection's fallback gauge (set in stores.ts) shows up on a scrape; tests can inject a fresh one.
  metrics?: MetricsRegistry;
  // Bearer token gating GET /metrics. Defaults to AESMSG_METRICS_TOKEN; unset ⇒ /metrics returns 404.
  metricsToken?: string;
}

// Slightly above the create handler's own 37 MiB MAX_BODY_BYTES check, so an oversized upload is
// rejected by the handler with its 400 "bad_request" rather than by Fastify with a 413.
const MAX_BODY_BYTES = 38 * 1024 * 1024;

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  // Origin of the shareable /l/:id link returned at create. Defaults to the www host, NOT the bare
  // apex: Apple and Google both fetch the app-association files without following redirects, and the
  // apex 308s to www, so an apex-minted link can never be verified as a universal/app link. Keep this
  // in sync with apps/webapp's SECURE_LINK_ORIGIN (its legacy fallback reproduces this default) and
  // apps/mobile's AESMSG_HOST.
  const publicLinkOrigin =
    options.publicLinkOrigin ?? process.env.AESMSG_PUBLIC_LINK_ORIGIN ?? "https://www.aesmsg.com";
  // Single browser origin allowed to call this API cross-origin (mirrors the publicLinkOrigin
  // env-with-sensible-default pattern exactly). Soft config: a missing value never blocks boot.
  const webappOrigin =
    options.webappOrigin ?? process.env.AESMSG_WEBAPP_ORIGIN ?? "https://app.aesmsg.com";

  // Two deliberate security postures are encoded here:
  //
  // disableRequestLogging: zero-knowledge posture. Fastify's default per-request logs include the
  // client IP (req.remoteAddress, resolved via trustProxy) and the request URL (which contains the
  // link ID). Emitting that to logs would reintroduce the raw-IP↔link-event correlation that
  // hash-ip.ts deliberately HMACs away in Redis. We disable automatic request logging;
  // `app.log.error()`/`app.log.info()` for intentional, IP-free lines still work.
  //
  // CORS: this API registers @fastify/cors as a SINGLE-ORIGIN ALLOWLIST for the browser web client
  // (app.aesmsg.com, resolved via webappOrigin above). It is NOT default origin reflection: the
  // predicate reflects Access-Control-Allow-Origin ONLY for exactly `webappOrigin`; every other
  // browser origin gets NO Access-Control-Allow-Origin (deny-all remains the posture for all but the
  // one allowed origin). Requests with no Origin header (native app, curl, server-to-server) are NOT
  // rejected and get no Access-Control-Allow-Origin either — CORS headers are only meaningful to
  // browsers, and mobile fetch is not CORS-bound. One header IS added universally, though: because the
  // `origin` option below is a FUNCTION (a non-static origin), @fastify/cors stamps `Vary: Origin` on
  // EVERY response, including no-Origin ones, per the HTTP-cache spec
  // (https://fetch.spec.whatwg.org/#cors-protocol-and-http-caches). That is correct cache-key hygiene,
  // not a behavior change — it carries no id/IP and reflects no origin — so it is benign under the
  // zero-knowledge posture. See registration just below the Fastify() instance.
  //
  // trustProxy: SCOPED (BE-2 / R3). Was `true`, which trusted every hop and let any client forge
  // X-Forwarded-For to rotate the per-IP rate-limit key. It now defaults to `false` (use the socket
  // address) and is opt-in via AESMSG_TRUST_PROXY; production behind the same-host nginx sets it to
  // `1` (one trusted hop). Handlers key the limiter on `request.ip` (via fastify-adapter), so a
  // forged XFF cannot change a client's identity unless the operator explicitly configured trust.
  const trustProxy = options.trustProxy ?? resolveTrustProxy(process.env.AESMSG_TRUST_PROXY);
  // Global retention ceiling (roadmap 2.5, SEC-6/PG-6/PG-8). Soft config with a safe 365-day default,
  // so a missing/invalid value never blocks boot; it is logged below like other config.
  const maxRetentionMs =
    options.maxRetentionMs ?? resolveMaxRetentionMs(process.env.AESMSG_MAX_RETENTION_MS);
  const metrics = options.metrics ?? defaultMetrics;
  const metricsToken = options.metricsToken ?? process.env.AESMSG_METRICS_TOKEN;
  const app = Fastify({
    bodyLimit: MAX_BODY_BYTES,
    trustProxy,
    logger: options.logger ?? false,
    disableRequestLogging: true,
  });

  // AGGREGATE-ONLY request metrics (PG-17 / PG-18 / R25). onResponse fires for EVERY finished
  // response — matched routes, the opaque 404 handler, and the opaque error handler — so it captures
  // 2xx/4xx/5xx uniformly. It reads `request.routeOptions.url`, the route TEMPLATE (id-free), and
  // NEVER `request.url`/`request.raw.url` (which contain the link id). An unmatched request has no
  // template, so it is labelled "unmatched" — again never the raw URL. This preserves the
  // disableRequestLogging zero-knowledge posture: it records counts, not identities, and logs nothing.
  app.addHook("onResponse", (request, reply, done) => {
    recordHttp(metrics, {
      route: request.routeOptions?.url ?? "unmatched",
      method: request.method,
      status: reply.statusCode,
    });
    done();
  });

  // Pass every request body through untouched as a raw string. The handlers do their own JSON
  // parsing, size limits, and base64 validation — we must not let Fastify pre-parse or reject.
  // Removing the built-in parsers first is required: Fastify's default application/json parser
  // takes precedence over a "*" wildcard, so without this the handlers would receive an already
  // parsed object (and request.text() would see "[object Object]" → 400).
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  // Opaque error handler (BE-3). The route handlers already return their own explicit 4xx/5xx
  // Response bodies ({ error: "bad_request" | "rate_limited" | "internal_error" | … }); anything that
  // reaches HERE is an UNEXPECTED throw (e.g. hash-ip fail-closed if the salt is ever bad at runtime,
  // or a store blowing up). Fastify's default handler would echo `error.message` — which for the
  // salt case is the internal "RATE_LIMIT_IP_SALT must be set…" config detail — so we replace it with
  // an opaque body and never surface the message or stack. We log the error server-side only (the
  // root logger, IP-/URL-free); this is error logging, not the per-request access logging that
  // `disableRequestLogging` intentionally suppresses. 4xx errors Fastify raises before a handler runs
  // (e.g. a body over the Fastify bodyLimit) keep their status but get an opaque `bad_request` code.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    app.log.error(error);
    const status = error.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      reply.status(status).send({ error: "bad_request" });
      return;
    }
    reply.status(500).send({ error: "internal_error" });
  });

  // Opaque 404 for unknown routes. Fastify's default not-found body is
  // `{"message":"Route GET:/nope not found","error":"Not Found","statusCode":404}`, which both
  // fingerprints the framework and echoes the requested path back to the caller. We replace it with a
  // minimal, path-free `{ error: "not_found" }` that mirrors the opaque error handler above. Like
  // that handler this emits no per-request/URL logging, preserving the disableRequestLogging posture.
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: "not_found" });
  });

  // Config summary at boot (only emitted when logger is enabled — production/index.ts). Records the
  // retention ceiling so operators can confirm the effective value of AESMSG_MAX_RETENTION_MS. No
  // secrets, ids, or IPs — safe under the zero-knowledge / disableRequestLogging posture.
  app.log.info(
    `aesmsg API retention ceiling: ${maxRetentionMs} ms (~${Math.round(
      maxRetentionMs / (24 * 60 * 60 * 1000),
    )} days) [AESMSG_MAX_RETENTION_MS]`,
  );

  // Single-origin CORS allowlist for the browser web client (D3). Registered BEFORE the routes so its
  // onRequest hook + preflight OPTIONS handler are in place for every message endpoint. The predicate
  // reflects Access-Control-Allow-Origin ONLY when the request Origin equals `webappOrigin`; a
  // non-matching origin resolves to `false`, so no ACAO is written (browser-denied) — the HTTP request
  // itself is never rejected, keeping non-browser callers unaffected. A request with no Origin header
  // (native app, curl) hits the `!origin` branch: CORS headers are meaningless without an Origin, so it
  // is not rejected and, because there is nothing to reflect, no ACAO header is emitted either. One
  // caveat: a function `origin` counts as a non-static origin option, so @fastify/cors additionally
  // stamps `Vary: Origin` on that response (and every other) for correct HTTP-cache keying — no ACAO,
  // just the Vary hint. That is expected, id/IP-free, and asserted in the no-Origin CORS test group.
  app.register(cors, {
    origin(origin, cb) {
      if (!origin) {
        cb(null, true);
        return;
      }
      cb(null, origin === webappOrigin);
    },
  });

  registerHealthRoutes(app);
  registerMessageRoutes(app, publicLinkOrigin, maxRetentionMs);
  // Gated aggregate metrics (PG-17 / PG-18 / R25). The stats provider reads only a COUNT of active
  // links + a SUM of ciphertext bytes from the store (never per-row). getStores() is the same cached
  // singleton the message routes use.
  registerMetricsRoutes(app, {
    registry: metrics,
    token: metricsToken,
    stats: () => getStores().links.aggregateStats(),
  });
  return app;
}
