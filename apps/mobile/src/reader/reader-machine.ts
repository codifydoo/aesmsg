import type { MessageMetadata, OpenMessageResponse } from "@/src/api/client";
import { ApiError } from "@/src/api/client";
import type { FetchAndOpenOutput } from "@/src/reader/fetch-and-open";

// Pure reader state machine for the recipient flow on a deep-linked /l/:id. Mirrors the web
// ReaderScreen states: loading -> landing -> opening -> decrypted | failed | gone. Kept free of
// React so the transition logic (which open-errors mean "gone" vs "failed") can be unit-tested in
// Node without an RN renderer. ReaderFlow.tsx owns the useState + effects and delegates the
// open-error branch + screen selection here so runtime behavior stays byte-identical.
//
// SECURITY INVARIANT: a "gone" outcome (link revoked/expired/max-opens) and a "failed" outcome
// (wrong key, no recovery) both surface opaque, metadata-free screens. The classification below
// only ever inspects an HTTP status (410) — never anything that could leak which a link is.

export type ReaderState =
  | { kind: "loading" }
  | { kind: "gone" }
  // Opaque transport-failure terminal (no open consumed, retryable). Carries the metadata +
  // fingerprint so a retry can re-attempt the open without re-fetching metadata. Both optional —
  // a metadata-phase failure has neither yet.
  | { kind: "network"; metadata?: MessageMetadata; myFingerprint?: string }
  // Structural "not a aesmsg link" terminal (server 400). No metadata is ever available here.
  | { kind: "invalid" }
  | { kind: "landing"; metadata: MessageMetadata; myFingerprint: string }
  // In-flight open (POST + local decrypt). Carries NO payload: it only shows the opaque decrypting
  // surface, and the open result is HELD in open-coordinator (survives an unmount), not in state.
  | { kind: "opening" }
  // Per-decrypt biometric gate (FE-1 / R5). Reached AFTER a successful open (the ciphertext is
  // already held), only when the "Require unlock before decrypting" setting is on. It guards the
  // LOCAL decrypt and NEVER re-issues an /open, so the biometric prompt backgrounding the app is
  // safe — a resume re-enters this gate from the held ciphertext. `unavailable` flips it to honest
  // "can't prompt on this device" copy so a guard the user turned on is never silently bypassed.
  // The held `response` is the OPAQUE ciphertext + open metadata (inert without the private key).
  | { kind: "gated"; response: OpenMessageResponse; unavailable?: boolean }
  | { kind: "decrypted"; output: FetchAndOpenOutput }
  // Wrong-key terminal (no recovery). Carries NO metadata: the DecryptionFailed screen surfaces
  // nothing server-derived and — per FE-2 — has NO retry, so it never needs to re-open.
  | { kind: "failed" };

// The opaque screens an open attempt can resolve to (besides "decrypted"). 410 from the open
// endpoint means the link is gone (revoked / expired / max-opens consumed); anything else — a
// decryption failure, a network error, any other HTTP status — is a non-leaky "failed".
export type OpenFailureKind = "gone" | "failed";

// Classify a thrown open error into the next opaque screen. ApiError with status 410 -> "gone";
// every other error (other ApiError statuses, DecryptionError, network errors) -> "failed".
export function classifyOpenError(err: unknown): OpenFailureKind {
  if (err instanceof ApiError && err.status === 410) return "gone";
  return "failed";
}

// The reader screens the flow can render, derived purely from the current state. ReaderFlow maps
// these to components; this keeps the state -> screen mapping verifiable in isolation.
export type ReaderScreenName =
  | "decrypting"
  | "gone"
  | "network"
  | "invalid"
  | "landing"
  | "gated"
  | "failed"
  | "reader";

// loading + opening both show the same "decrypting" surface, so the state machine never reveals
// whether work is the initial metadata fetch or an in-flight open.
export function selectScreen(state: ReaderState): ReaderScreenName {
  switch (state.kind) {
    case "loading":
    case "opening":
      return "decrypting";
    case "gone":
      return "gone";
    case "network":
      return "network";
    case "invalid":
      return "invalid";
    case "landing":
      return "landing";
    case "gated":
      return "gated";
    case "failed":
      return "failed";
    case "decrypted":
      return "reader";
  }
}
