// Per-decrypt biometric gate (FE-1 / R5). The product promises a "biometric guard on every open";
// the "Require unlock before decrypting" setting turns that guard on. This module is the PURE,
// DI-friendly core of that guard: the decision (skip / prompt / unavailable) and the "authenticate
// THEN decrypt, never the reverse" ordering.
//
// It is deliberately free of React, expo, and open-coordinator so the security-critical invariants
// can be unit-tested in plain Node:
//   • plaintext is derived ONLY after a successful biometric auth, and
//   • the gate NEVER issues a consuming POST /open — it guards the LOCAL decrypt of an already-held
//     ciphertext, so a failed or retried gate costs zero additional opens.
//
// ReaderFlow wires the real seams into these functions: `authenticate` →
// performBiometricConfirmation (expo-local-authentication), `onAuthenticated` → decryptOpenResponse
// (local, network-free), and the `capable` flag → checkBiometricCapability.

export type DecryptGateDecision = "skip" | "prompt" | "unavailable";

export interface DecryptGateDecisionInput {
  /** The persisted "Require unlock before decrypting" preference. */
  requireUnlock: boolean;
  /** Whether this device can currently run a biometric prompt (probed live, never assumed). */
  capable: boolean;
}

/**
 * Decide what the reader must do with a freshly-opened (held) message before revealing plaintext:
 *   • "skip"        — the setting is OFF: decrypt directly (identity-level unlock still applied).
 *   • "prompt"      — the setting is ON and the device can prompt: require a biometric auth first.
 *   • "unavailable" — the setting is ON but the device cannot prompt: DO NOT silently bypass a guard
 *                     the user turned on — surface honest copy and a safe exit instead.
 * Pure: no native calls, no side effects.
 */
export function decideDecryptGate(input: DecryptGateDecisionInput): DecryptGateDecision {
  if (!input.requireUnlock) return "skip";
  return input.capable ? "prompt" : "unavailable";
}

export interface RunDecryptGateDeps {
  /** Runs the OS biometric prompt. Resolves on success; THROWS on cancel / failure. */
  authenticate: () => Promise<void>;
  /**
   * The LOCAL decrypt of the already-held ciphertext (consumes NO open). Invoked ONLY after
   * `authenticate` resolves — this ordering is the whole point of the gate.
   */
  onAuthenticated: () => Promise<void> | void;
}

/**
 * Enforce the gate: authenticate, and ONLY on success run the local decrypt. If `authenticate`
 * rejects (cancel / failure) the rejection PROPAGATES and `onAuthenticated` is never reached — no
 * plaintext is derived. This path issues NO POST /open: the open was already consumed exactly once
 * (its ciphertext held by open-coordinator), so a failed or retried gate costs zero additional
 * opens. ReaderFlow surfaces the propagated rejection as a retry-able error and keeps the reader
 * gated (the recipient can try the biometric prompt again with no further open cost).
 */
export async function runDecryptGate(deps: RunDecryptGateDeps): Promise<void> {
  await deps.authenticate();
  await deps.onAuthenticated();
}
