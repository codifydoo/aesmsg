import { createHmac } from "node:crypto";

// Rate-limit keys must not embed raw client IPs: under the audit's "entire backend store is
// public" threat model, a scraped Redis would map raw IPs -> create/open events by time. We key
// the limiter on HMAC-SHA256(salt, ip) instead.
//
// This is operational hygiene, not an at-rest anonymity guarantee — but an UNKEYED hash over the
// ~4.3B IPv4 space is trivially precomputable, so in production we FAIL CLOSED: the process
// refuses to hash without a real secret. Dev/test may run without a salt.
const MIN_SALT_BYTES = 32;

/**
 * Pure core: HMAC-SHA256(salt, ip) as hex. When `production` is true, throws if the salt is
 * shorter than 32 bytes (fail closed). Env-free so it is deterministically testable — `hashIp`
 * below is the thin env-reading wrapper used in production.
 */
export function hashIpWith(ip: string, salt: string, production: boolean): string {
  if (production && Buffer.byteLength(salt, "utf8") < MIN_SALT_BYTES) {
    throw new Error(
      "RATE_LIMIT_IP_SALT must be set to at least 32 bytes in production (refusing to hash client IPs with a weak/empty salt)",
    );
  }
  return createHmac("sha256", salt).update(ip).digest("hex");
}

/**
 * Boot-time guard (BE-3). `hashIpWith` fails closed on every request when the prod salt is
 * missing/short — without a startup check the server boots green, health passes, then EVERY real
 * request throws and (pre-error-handler) leaked the internal salt message in a 500. This lets
 * `index.ts` validate the salt once at boot and exit non-zero with a clear message instead. Returns
 * an error string when misconfigured for the given environment, or `null` when OK. Pure +
 * env-injected so it stays deterministically testable; the per-request fail-closed check remains as
 * defense in depth.
 */
export function saltConfigError(salt: string | undefined, production: boolean): string | null {
  if (!production) return null;
  if (!salt || Buffer.byteLength(salt, "utf8") < MIN_SALT_BYTES) {
    return `RATE_LIMIT_IP_SALT must be set to at least ${MIN_SALT_BYTES} bytes in production (refusing to hash client IPs with a weak/empty salt)`;
  }
  return null;
}

/**
 * Production entry point: reads the salt + environment and delegates to `hashIpWith`. In
 * production an unset/short `RATE_LIMIT_IP_SALT` throws; in dev/test an empty salt is permitted.
 */
export function hashIp(ip: string): string {
  return hashIpWith(
    ip,
    process.env.RATE_LIMIT_IP_SALT ?? "",
    process.env.NODE_ENV === "production",
  );
}
