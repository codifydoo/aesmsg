// Pure logic: derive the two chips shown on the Link Created screen (17) from the SAME seal inputs
// that created the link — the expiry Date and the max-opens number. Kept separate (node-env
// testable) so ResultScreen stays presentational and the formatting is unit-tested.
//
// These are display-only labels; they are NOT re-fed into any seal call. They read the already-
// committed expiresAt / maxOpens so the success screen faithfully echoes what was set.

/** Human "expires in …" label for a committed expiry Date, relative to `now`. */
export function expiryChipLabel(expiresAt: Date, now: Date = new Date()): string {
  // Every link now has a real bounded expiry (the longest is now + 365d — there is no "never"
  // sentinel), so this always renders a concrete countdown.
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return "Expired";

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `Expires in ${days}d ${hours}h` : `Expires in ${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `Expires in ${hours}h ${minutes}m` : `Expires in ${hours}h`;
  }
  return `Expires in ${Math.max(1, minutes)}m`;
}

/** Human max-opens label for the violet chip (e.g. "1 open", "5 opens", "Unlimited"). */
export function opensChipLabel(maxOpens: number): string {
  if (maxOpens < 0) return "Unlimited";
  return maxOpens === 1 ? "1 open" : `${maxOpens} opens`;
}

export interface ResultChipLabels {
  expiry: string;
  opens: string;
}

/** Both chip labels for the Link Created screen, from the committed seal inputs. */
export function resultChipLabels(
  expiresAt: Date,
  maxOpens: number,
  now: Date = new Date(),
): ResultChipLabels {
  return {
    expiry: expiryChipLabel(expiresAt, now),
    opens: opensChipLabel(maxOpens),
  };
}
