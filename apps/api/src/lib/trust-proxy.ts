// Fastify's `trustProxy` controls how `request.ip` is derived from the socket address and any
// `X-Forwarded-For` chain (via `proxy-addr`). This service's ONLY abuse control is a per-IP rate
// limiter keyed on HMAC(ip), so an over-broad trust setting — the old `trustProxy: true` trusted
// EVERY hop — lets any client forge `X-Forwarded-For` and rotate its rate-limit identity at will,
// bypassing the limiter (BE-2 / R3). We therefore make proxy trust OPT-IN and scope it to the real
// deployment topology via the `AESMSG_TRUST_PROXY` env var.
//
// Accepted values (mirror Fastify / proxy-addr semantics):
//   unset / "" / "false"    -> false  (default: use the raw socket address; ignore X-Forwarded-For)
//   "true"                  -> true   (trust EVERY hop — never use in production)
//   a positive integer "n"  -> trust n hops inward from the socket (behind one nginx: "1")
//   an IP / CIDR list       -> passed straight to proxy-addr (e.g. "10.0.0.0/8,127.0.0.1")
//
// Production runs as a container behind a single same-host nginx (one trusted hop), so the operator
// MUST set `AESMSG_TRUST_PROXY=1`: then `request.ip` is the address nginx recorded and a client's
// forged leftmost `X-Forwarded-For` cannot change it. With the default (false), `request.ip` is the
// socket address — behind nginx that is nginx itself, which over-limits (fail-safe) rather than
// under-limits, but is only correct for direct exposure / local dev.
export function resolveTrustProxy(raw: string | undefined): boolean | number | string {
  const value = raw?.trim();
  if (!value || value.toLowerCase() === "false") return false;
  if (value.toLowerCase() === "true") return true;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  return value; // IP / CIDR trust list — handed to proxy-addr verbatim
}
