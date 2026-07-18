# aesmsg ops runbook

Operational floor for the message API (`apps/api`) and its store (`@aesmsg/server-store`):
the **aggregate metrics surface**, what to alert on, and how to **purge a reported link id**.

This adds the **admin/abuse/moderation surface** and **monitoring/observability** the
service previously lacked.

> **Zero-knowledge stays intact.** Everything here is aggregate or id-scoped-by-the-operator.
> The metrics surface exposes only counts and byte totals — never a link id, IP, ciphertext,
> recipient, or anything that correlates a link to a user. The purge tool acts on exactly one id
> the operator supplies from an abuse report; the server still cannot read any plaintext.

---

## 1. Metrics surface (`GET /metrics`)

`apps/api` exposes a single Prometheus-text endpoint served by the API process itself
(in-process counters — no extra dependency, no separate exporter).

### Access control

`GET /metrics` is **gated by a bearer token** from `AESMSG_METRICS_TOKEN`:

| Condition | Response |
|---|---|
| `AESMSG_METRICS_TOKEN` **unset** | `404 { "error": "not_found" }` — the endpoint behaves as if it does not exist, so the ops surface is never advertised to anonymous callers. |
| Token set, request has no / wrong `Authorization: Bearer <token>` | `401` |
| Token set, correct bearer | `200`, `text/plain; version=0.0.4` Prometheus body |

The comparison is constant-time. Generate a token with `openssl rand -hex 32`.

**Defense in depth (do this too):** even though the body is aggregate-only, keep `/metrics` off
the public vhost. In the same-host nginx that fronts the API, scrape it over the internal
network / localhost only (e.g. restrict `location = /metrics` to the Prometheus host, or scrape
`http://127.0.0.1:<port>/metrics` directly and never proxy the path publicly). The bearer token
is the primary gate; the network restriction is the backstop.

### Scraping it

```bash
curl -sS -H "Authorization: Bearer $AESMSG_METRICS_TOKEN" https://<internal-api-host>/metrics
```

### What it exports (AGGREGATE ONLY)

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `aesmsg_http_requests_total` | counter | `route`, `status_class` | Every request, by **route template** (`/api/messages/:id/open`, never a raw URL/id) and status class (`2xx`/`4xx`/`5xx`). Unmatched routes are labelled `route="unmatched"`. |
| `aesmsg_rate_limited_total` | counter | `route` | Requests rejected `429` by the per-IP limiter — the **abuse/flood** signal. |
| `aesmsg_messages_created_total` | counter | — | Secure links created (`POST /api/messages` → `201`). |
| `aesmsg_messages_opened_total` | counter | — | Opens served (`POST /api/messages/:id/open` → `200`). |
| `aesmsg_messages_revoked_total` | counter | — | Revoke requests accepted (`→ 200`). Revoke is opaque, so this counts accepted requests, not confirmed deletions. |
| `aesmsg_dependency_errors_total` | counter | `route` | `5xx` responses. In this API every `5xx` is a **store/dependency (Postgres/Redis) failure** — feeds the dependency-outage alert. |
| `aesmsg_store_memory_fallback` | gauge | — | **`1` = the API is running on in-memory stores** (see below); `0` = Postgres+Redis. |
| `aesmsg_active_links` | gauge | — | Aggregate `COUNT` of links still active (volume). Omitted from a scrape if the store is unreachable at scrape time. |
| `aesmsg_ciphertext_bytes` | gauge | — | Aggregate `SUM` of stored ciphertext bytes (volume). Omitted if the store is unreachable. |

There are **no** id, IP, recipient, or ciphertext labels anywhere — enforced by the registry's
label allow-list and by labelling requests with the route **template** (never `request.url`).
A test asserts the raw link id / client IP never appear in the exposition.

### `aesmsg_store_memory_fallback` — the in-memory-fallback signal

The critical footgun: a prod deploy that silently runs on
**in-memory stores** (because `DATABASE_URL`/`REDIS_URL` is unset) boots green and then loses
**every link** on the next restart/redeploy, split-braining across replicas. The API already
**fails closed at boot** in `NODE_ENV=production` when those vars are missing
(`assertProductionConfig`), but this gauge is the **runtime** proof: if the process is ever serving
on memory stores, `aesmsg_store_memory_fallback` is `1`. Alert on `== 1` in production.

---

## 2. Alerting (operator configures this on Sproobo — OUT OF SCOPE here)

The metrics surface above is the data. Wiring a scraper + alert rules is the **operator's
Sproobo configuration** and is intentionally not built into this repo. Recommended alerts:

| Alert | Condition | Why |
|---|---|---|
| **Silent memory fallback (R1)** | `aesmsg_store_memory_fallback == 1` (prod) | Serving on in-memory stores → imminent total data loss. Page immediately. |
| **Dependency outage (BE-4 / R16)** | `rate(aesmsg_dependency_errors_total[5m]) > 0` sustained | Postgres/Redis is failing; the limiter fails closed and writes `5xx`. |
| **Abuse / flood** | `rate(aesmsg_rate_limited_total[5m])` spike | Someone is hammering the unauthenticated create/open API. |
| **Scrape down** | target `up == 0` | The API process or `/metrics` is unreachable. |

Point a Prometheus (or any Prometheus-compatible scraper) at `/metrics` with the bearer token,
and route these to the on-call channel.

---

## 3. Purge a reported link id (abuse / CSAM / legal)

The store is zero-knowledge: the server never sees plaintext, so moderation is inherently limited
to **removing a specific reported id**. When an abuse report / legal order names a link, the
operator purges exactly that id.

### The id

A reported link looks like `https://aesmsg.com/l/<id>` — the 16-char `<id>` after `/l/` is what you
pass to the tool.

### Command

Run from the repo root with the **production `DATABASE_URL`** in scope:

```bash
DATABASE_URL=postgres://…  pnpm --filter @aesmsg/server-store purge <link-id>
```

Example:

```
$ DATABASE_URL=postgres://… pnpm --filter @aesmsg/server-store purge abc123def4567890
link abc123def4567890: PURGED. row was active — now marked revoked (terminal); ciphertext deleted.
```

### What it does

- Reuses the same transactional path as revoke: it **purges the ciphertext blob** and marks the
  link row **terminal** (`status = revoked`, `terminal_at = now()`) in one transaction — but
  **without** requiring the user's revocation token (this is the operator override).
- The row is kept (terminal) so opens stay opaque (`410`) with no metadata leak; the retention
  sweep later prunes the empty terminal row.
- **Idempotent.** Safe to re-run:
  - unknown id → `no row found — nothing to purge`
  - already purged → `row was already terminal … no ciphertext remained (already purged)`
- It requires `DATABASE_URL` and **fails closed** without it (it will not touch a phantom
  in-memory store).

### Verify

Re-running the command is the simplest verification — a purged id reports
`row was already terminal … no ciphertext remained`. From the client side, opening the reported
link now returns the opaque `410` (`This secure link is no longer available.`).

> The tool prints the id back to **your** terminal (it is an interactive operator command, not a
> server log). It writes nothing to the metrics surface and logs no secret.

---

## 4. Retention ceiling (`AESMSG_MAX_RETENTION_MS`)

The API caps how long any created link may live. A create whose lifetime (`expiresAt − now`)
exceeds the ceiling is **rejected** with the opaque `400 { "error": "bad_request" }` (it is not
clamped — the expiry is bound into the message's HPKE AAD, so silently changing it would break
decryption; the client resends a ceiling-compliant expiry it also sealed with).

| Setting | Behaviour |
|---|---|
| `AESMSG_MAX_RETENTION_MS` **unset / invalid** | Falls back to the safe default of **365 days** (soft config — never blocks boot). The effective value is logged once at boot: `aesmsg API retention ceiling: … ms`. |
| `AESMSG_MAX_RETENTION_MS=<ms>` | Uses that many milliseconds. A ~1 hour clock-skew grace is added before rejecting. |

This ceiling is what stops the zero-knowledge backend from becoming a permanent blob host: there
is no "never expires" option, so every link eventually expires and its ciphertext is purged.

> **It applies to everyone (SEC-6).** The API is unauthenticated and cannot tell Pro from free, so
> the ceiling — like the ciphertext-size cap and the rate limits — is enforced uniformly. Pro
> entitlements are a **client-side** convenience for v1 and grant no server-side exemption. Keep
> `AESMSG_MAX_RETENTION_MS` **≥** the client's longest offered lifetime (365 days), or the client's
> "1 year (maximum)" / Pro custom-expiry option would start getting rejected — change both together.

## Related

- Data-subject / erasure requests (the id-purge above in a DSR context): [`data-subject-requests.md`](data-subject-requests.md)
- Deploy + env vars: [`deploy.md`](deploy.md)
