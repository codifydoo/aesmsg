// Pure logic for design screen 41 (Export Encrypted Backup): the passphrase strength meter (a
// 4-segment bar), the requirement checklist, and — critically — the ENTROPY GATE that blocks export
// below a documented floor (SEC-3).
//
// Extracted (node-env testable, per the no-React-renderer convention) so ExportBackupScreen.tsx stays
// presentational.
//
// WHY THE FLOOR MATTERS (SEC-3 / R19): the exported `.aesmsg` file is the raw private key wrapped
// under this human passphrase (heavy DEFAULT_WRAP_KDF_PARAMS argon2id, see export-backup.ts). It is
// the one artifact that can leave the device, and there is no forward secrecy — breaking it
// retroactively decrypts every archived ciphertext. Argon2id raises the per-guess cost, but a
// low-entropy passphrase (e.g. `password12345`) is still offline-brute-forceable. So a length check
// alone is not enough: we estimate real strength (a compact zxcvbn-lite heuristic — no heavy dep) and
// refuse export below MIN_EXPORT_ENTROPY_BITS.

export interface PassphraseRequirement {
  /** Stable key for list rendering. */
  key: string;
  /** Human label shown in the checklist (matches the design copy). */
  label: string;
  /** Whether the current passphrase satisfies this requirement. */
  met: boolean;
}

export interface PassphraseStrength {
  /** 0–4: how many of the 4 segment bars are lit (derived from the entropy estimate). */
  score: number;
  /** Estimated bits of guessing entropy (heuristic; the value gated for export). */
  entropyBits: number;
  /** Short human label for the meter ("" when empty, else Very weak → Very strong). */
  label: string;
  /** The checklist rows, in display order. */
  requirements: PassphraseRequirement[];
  /** True only when every requirement is met AND confirm matches — gates the Export button. */
  canExport: boolean;
  /** True when both fields are non-empty and differ (so the screen can show a mismatch hint). */
  mismatch: boolean;
}

/** Minimum passphrase length surfaced in the design's "12+ characters" requirement. */
export const MIN_PASSPHRASE_LENGTH = 12;

/**
 * Entropy floor (in bits) required to export a backup. 60 bits is a defensible lower bound for a
 * passphrase that is only ever attacked offline behind a heavy argon2id KDF (64 MiB / t=3): it
 * rejects common-word / sequential passphrases while still allowing memorable multi-word or mixed
 * 12+ char passphrases. Documented + enforced here so the gate is a single source of truth.
 */
export const MIN_EXPORT_ENTROPY_BITS = 60;

// A compact block-list of the most common weak passphrases / keyboard runs / obvious words. This is
// NOT a full dictionary — it is the zxcvbn-lite "cheap wins": a passphrase built around one of these
// tokens collapses toward ~1 guess regardless of its length, so we discount their coverage sharply.
const COMMON_TOKENS: readonly string[] = [
  "password",
  "passw0rd",
  "qwerty",
  "qwertyuiop",
  "asdfgh",
  "zxcvbn",
  "letmein",
  "welcome",
  "admin",
  "iloveyou",
  "monkey",
  "dragon",
  "abc123",
  "master",
  "login",
  "sunshine",
  "princess",
  "trustno1",
  "football",
  "baseball",
  "superman",
  "starwars",
  "whatever",
  "secret",
  "changeme",
  "aesmsg",
];

/** Size of the character pool implied by the classes present — the base for bits-per-character. */
function charPoolSize(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32; // symbols / space / everything else, approximated
  return Math.max(pool, 1);
}

/** True when `b` continues a trivial run from `a` (same char, or adjacent code point in either dir). */
function continuesRun(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) === 1;
}

/**
 * Effective (non-trivial) character count. A character that merely repeats or continues a
 * sequence/keyboard run from the previous one contributes almost nothing (0.3), and each occurrence
 * of a common token collapses to ~1.5 chars — so `password12345` counts as a handful of real choices,
 * not 13. Case is folded first so `AaAa…` and case-only variants of a common word are still caught.
 */
function effectiveLength(pw: string): number {
  if (pw.length === 0) return 0;
  const lower = pw.toLowerCase();

  let eff = 0;
  for (let i = 0; i < lower.length; i++) {
    if (i > 0 && continuesRun(lower[i - 1] as string, lower[i] as string)) {
      eff += 0.3;
    } else {
      eff += 1;
    }
  }

  // Collapse every common-token occurrence to ~1.5 effective chars regardless of its length.
  for (const token of COMMON_TOKENS) {
    let idx = lower.indexOf(token);
    while (idx !== -1) {
      eff -= Math.max(0, token.length - 1.5);
      idx = lower.indexOf(token, idx + token.length);
    }
  }

  return Math.max(0, eff);
}

/**
 * Estimate the guessing entropy (bits) of a passphrase: effective (non-trivial) length × bits per
 * character from the class pool. Heuristic, intentionally conservative for weak inputs — it is a
 * gate, not a security proof. Empty -> 0.
 */
export function estimatePassphraseBits(passphrase: string): number {
  const pw = passphrase ?? "";
  if (pw.length === 0) return 0;
  const bitsPerChar = Math.log2(charPoolSize(pw));
  const bits = effectiveLength(pw) * bitsPerChar;
  // One decimal place keeps the meter/label stable without leaking float noise into tests.
  return Math.round(bits * 10) / 10;
}

/**
 * Score 0–4 for the 4-segment strength bar, derived from the entropy estimate so the meter and the
 * export gate agree. Empty -> 0. Below the export floor lights at most 2 segments (amber-ish "weak");
 * a passphrase at/above the floor lights 3–4. Boundaries documented so the UI copy stays honest.
 */
export function scorePassphrase(passphrase: string): number {
  const pw = passphrase ?? "";
  if (pw.length === 0) return 0;
  const bits = estimatePassphraseBits(pw);
  if (bits < 36) return 1;
  if (bits < MIN_EXPORT_ENTROPY_BITS) return 2; // 36..<60 — still below the export floor
  if (bits < 90) return 3;
  return 4;
}

/** Human meter label from the score. "" for an empty field so the screen shows no label yet. */
function strengthLabel(pw: string, score: number): string {
  if (pw.length === 0) return "";
  if (score <= 1) return "Very weak";
  if (score === 2) return "Weak";
  if (score === 3) return "Strong";
  return "Very strong";
}

/**
 * Full strength model for the Export Backup screen. Gates `canExport` on THREE requirements:
 *   1. length ≥ MIN_PASSPHRASE_LENGTH,
 *   2. estimated entropy ≥ MIN_EXPORT_ENTROPY_BITS (the SEC-3 floor — blocks `password12345` etc.),
 *   3. not a known-reused passphrase,
 * plus a matching confirmation. `reusedPassphrases` lets the screen flag a passphrase used elsewhere
 * (matched against a local set); when omitted the reuse check passes for any non-empty input.
 * Membership is case-sensitive and exact — advisory UX only.
 */
export function evaluatePassphrase(
  passphrase: string,
  confirm: string,
  reusedPassphrases?: ReadonlySet<string>,
): PassphraseStrength {
  const pw = passphrase ?? "";
  const cf = confirm ?? "";

  const entropyBits = estimatePassphraseBits(pw);
  const longEnough = pw.length >= MIN_PASSPHRASE_LENGTH;
  const strongEnough = entropyBits >= MIN_EXPORT_ENTROPY_BITS;
  // Advisory: only meaningful once something is typed; an empty field is not "reused".
  const notReused = pw.length > 0 && !(reusedPassphrases?.has(pw) ?? false);

  const requirements: PassphraseRequirement[] = [
    { key: "length", label: `${MIN_PASSPHRASE_LENGTH}+ characters`, met: longEnough },
    { key: "strength", label: "Hard to guess (avoid common words)", met: strongEnough },
    { key: "reuse", label: "Not a reused passphrase", met: notReused },
  ];

  const allMet = requirements.every((r) => r.met);
  const matches = pw.length > 0 && pw === cf;
  const mismatch = pw.length > 0 && cf.length > 0 && pw !== cf;
  const score = scorePassphrase(pw);

  return {
    score,
    entropyBits,
    label: strengthLabel(pw, score),
    requirements,
    canExport: allMet && matches,
    mismatch,
  };
}
