/**
 * Terminal-row retention window (BE-7 / R18).
 *
 * A link's ciphertext is purged the moment it goes terminal (revoke / last-open / expiry), but its
 * METADATA row is deliberately KEPT for a while so that an open/get can still return "gone" (410 /
 * 404) instead of "never existed" (404) — the difference matters for honest recipients hitting a
 * just-expired link. Kept FOREVER, though, those rows accumulate without bound and let a leaked DB
 * reconstruct full historical volume/timing metadata (the very thing the metadata-leakage audit set
 * out to avoid). So the sweep prunes terminal rows once they are older than this window.
 *
 * Configurable via `AESMSG_TERMINAL_ROW_RETENTION_MS`; defaults to 30 days. A non-numeric or
 * negative value falls back to the default.
 */
export const DEFAULT_TERMINAL_ROW_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function terminalRetentionMs(): number {
  const raw = process.env.AESMSG_TERMINAL_ROW_RETENTION_MS;
  if (raw === undefined || raw === "") return DEFAULT_TERMINAL_ROW_RETENTION_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TERMINAL_ROW_RETENTION_MS;
}
