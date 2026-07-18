export type ExpiryChoice = "10m" | "1h" | "24h" | "7d" | "1y";
export type MaxOpensChoice = 1 | 5 | 10 | -1;

/**
 * Longest link lifetime the client offers (365 days). There is NO "never"/"forever" option: an
 * unbounded link would make the zero-knowledge backend a permanent blob host. This is a REAL
 * timestamp the client both sends to the API and seals into the HPKE AAD, so the recipient can
 * rebuild the AAD and decrypt.
 *
 * MUST track the server's AESMSG_MAX_RETENTION_MS default (DEFAULT_MAX_RETENTION_MS in
 * apps/api/src/handlers/messages-handler.ts). The server REJECTS (400) — it cannot clamp, because
 * expiry is AAD-bound — any create whose lifetime exceeds its ceiling (+ a small clock-skew grace).
 * Lowering the server env below this value would make this longest option start getting rejected, so
 * change the two together.
 */
export const MAX_LINK_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

export const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string }[] = [
  { value: "10m", label: "10 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "1y", label: "1 year (maximum)" },
];

export const MAX_OPENS_OPTIONS: { value: MaxOpensChoice; label: string }[] = [
  { value: 1, label: "Once" },
  { value: 5, label: "5 times" },
  { value: 10, label: "10 times" },
  { value: -1, label: "Unlimited (until expiry)" },
];

export function expiryToDate(choice: ExpiryChoice, now: Date): Date {
  switch (choice) {
    case "10m":
      return new Date(now.getTime() + 10 * 60 * 1000);
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1000);
    case "24h":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "1y":
      // A real bounded instant (now + 365d) — NOT a "never" sentinel. Sent to the API AND sealed
      // into the AAD from the same Date, so the two always match (see create-and-seal.ts).
      return new Date(now.getTime() + MAX_LINK_LIFETIME_MS);
  }
}
