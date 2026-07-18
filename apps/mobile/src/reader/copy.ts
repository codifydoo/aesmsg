// Opaque, metadata-free reader copy. Dependency-free on purpose (NO react / react-native import)
// so the exact approved strings can be asserted in Node vitest without pulling in RN.
//
// SECURITY INVARIANT: these strings are surfaced on the failure / gone screens, which must leak
// NO server-derived metadata — no fingerprint, no message id, no status, no open counts, no
// expiry. They are constants, never interpolated with anything from the API.

// Single opaque message for revoked / expired / max-opens-reached / never-existed. The exact
// wording is fixed by CLAUDE.md — never reveal which of those a link is. EXACT string.
export const LINK_UNAVAILABLE_COPY = "This secure link is no longer available.";

// Failed-decrypt body. States there is no recovery; carries no server-derived metadata. Wrong
// key / wrong identity is unrecoverable on this device — no fallback, no "are you sure".
export const DECRYPTION_FAILED_COPY =
  "This message could not be decrypted with your identity. It was sealed for a different key. " +
  "There is no recovery.";

// Per-decrypt biometric gate (FE-1 / R5). These are the GUARD's own strings — not opaque-terminal
// copy — but kept here with the other reader copy so they stay dependency-free and Node-assertable.
// They interpolate nothing from the API, so the no-metadata-leak invariant is preserved.

// Native OS-prompt message shown when the "Require unlock before decrypting" setting is on.
export const DECRYPT_GATE_PROMPT = "Unlock to decrypt on this device";

// Honest copy when the setting is on but the device can no longer run a biometric prompt (e.g. the
// biometric was removed after the identity was unlocked). We do NOT silently bypass the guard.
export const DECRYPT_GATE_UNAVAILABLE_HINT =
  "Biometric unlock is required to open this message, but it isn't available right now. Set up " +
  "Face ID, Touch ID, or a fingerprint in your device settings, then reopen the link.";
