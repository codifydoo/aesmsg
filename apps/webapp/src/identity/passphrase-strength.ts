// Pure, dependency-free passphrase-strength guidance for the onboarding set-passphrase screen.
// The wrap passphrase defends a low-entropy human secret under DEFAULT_WRAP_KDF_PARAMS, and there
// is NO recovery — so the UI nudges toward a strong passphrase without gatekeeping. This is
// guidance, not a security oracle: `acceptable` only enforces the minimum length the mockup shows.
// No third-party strength library, to keep the CSP surface and bundle clean.

export type PassphraseScore = 0 | 1 | 2 | 3 | 4;

export interface PassphraseAssessment {
  /** 0 (empty/weak) … 4 (strong). Drives the strength meter. */
  readonly score: PassphraseScore;
  /** Human label for the score. */
  readonly label: string;
  /** Actionable suggestions to raise the score. Empty when already strong. */
  readonly tips: string[];
  /** True once the passphrase meets the minimum (≥ 12 chars). Gates the submit button. */
  readonly acceptable: boolean;
}

/** Minimum length matching the mockup's "At least 12 characters" placeholder. */
export const MIN_PASSPHRASE_LENGTH = 12;

const SCORE_LABELS: Record<PassphraseScore, string> = {
  0: "Too weak",
  1: "Weak",
  2: "Fair",
  3: "Strong",
  4: "Very strong",
};

// A small, deterministic set of obviously weak strings we always score at the floor.
const COMMON_WEAK = new Set([
  "password",
  "passphrase",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein",
  "iloveyou",
  "admin",
  "welcome",
]);

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiopasdfghjklzxcvbnm"];

function hasRun(pw: string): boolean {
  const lower = pw.toLowerCase();
  for (const seq of SEQUENCES) {
    for (let i = 0; i + 4 <= seq.length; i++) {
      const chunk = seq.slice(i, i + 4);
      if (lower.includes(chunk)) return true;
    }
  }
  return false;
}

export function assessPassphrase(pw: string): PassphraseAssessment {
  const length = pw.length;
  const acceptable = length >= MIN_PASSPHRASE_LENGTH;

  if (length === 0) {
    return {
      score: 0,
      label: SCORE_LABELS[0],
      tips: [
        `Use at least ${MIN_PASSPHRASE_LENGTH} characters — a memorable passphrase works well.`,
      ],
      acceptable: false,
    };
  }

  const classes =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);

  const tips: string[] = [];
  let score = 0;

  // Length buckets — the dominant factor for a wrap passphrase. 20+ chars earns the most, so a
  // long-but-low-variety passphrase (e.g. a word list) still reaches the top band on length alone.
  if (length >= 20) score += 3;
  else if (length >= 16) score += 2;
  else if (length >= MIN_PASSPHRASE_LENGTH) score += 1;

  // Character-class variety.
  if (classes >= 3) score += 2;
  else if (classes >= 2) score += 1;

  // Penalties for obvious patterns.
  if (COMMON_WEAK.has(pw.toLowerCase())) score = 0;
  if (hasRun(pw)) score = Math.max(0, score - 1);

  // Guidance.
  if (length < MIN_PASSPHRASE_LENGTH) {
    tips.push(`Add ${MIN_PASSPHRASE_LENGTH - length} more character(s) — aim for 12 or more.`);
  } else if (length < 16) {
    tips.push("Longer is stronger — 16+ characters resists guessing far better.");
  }
  if (classes < 3) {
    tips.push("Mix in upper/lower case, a number, or a symbol.");
  }
  if (hasRun(pw)) {
    tips.push('Avoid keyboard runs or sequences like "abcd" or "1234".');
  }
  if (COMMON_WEAK.has(pw.toLowerCase())) {
    tips.push("That is a commonly used password — pick something unique.");
  }

  const clamped = Math.max(0, Math.min(4, score)) as PassphraseScore;
  return { score: clamped, label: SCORE_LABELS[clamped], tips, acceptable };
}
