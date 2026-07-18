// reader-error -> @/src/api/client (for ApiError) -> expo-constants, which (SDK 56) statically
// imports react-native; its Flow syntax cannot be parsed under Node vitest, so it MUST be mocked.
// @aesmsg/crypto is deliberately NOT imported — reader-error detects a DecryptionError
// structurally (Error.name) so the module loads in plain Node with no crypto/RN dependency.
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/src/api/client";
import {
  classifyReaderError,
  type ReaderErrorOutcome,
  type ReaderPhase,
  screenForReaderError,
} from "@/src/reader/reader-error";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "" } } },
}));

// A DecryptionError-shaped throwable, matched structurally (never imported) so the classifier
// stays crypto-free. Mirrors @aesmsg/crypto's DecryptionError (errors.ts: name="DecryptionError").
function decryptionError(name = "DecryptionError"): Error {
  const e = new Error("decryption failed");
  e.name = name;
  return e;
}

describe("classifyReaderError — SECURITY: opaque buckets, never leaks which a link is", () => {
  // ── Gone: 410 (open) / 404 (metadata) collapse to a single opaque outcome ──────────────
  // The server deliberately returns 404 (GET) / 410 (open POST) for revoked, expired, AND
  // max-opens-consumed alike. Routing any of these to a distinct screen would leak which one a
  // link is, so they all map to the single non-leaky "gone" outcome.
  it("maps a 410 on open to 'gone' (revoked / expired / max-opens consumed — opaque)", () => {
    expect(classifyReaderError(new ApiError(410), "open")).toBe("gone");
  });

  it("maps a 410 on metadata to 'gone'", () => {
    expect(classifyReaderError(new ApiError(410), "metadata")).toBe("gone");
  });

  it("maps a 404 on metadata to 'gone' (server collapses never-existed / revoked / expired)", () => {
    expect(classifyReaderError(new ApiError(404), "metadata")).toBe("gone");
  });

  it("maps a 404 on open to 'gone'", () => {
    expect(classifyReaderError(new ApiError(404), "open")).toBe("gone");
  });

  // ── Invalid payload: 400 bad_request = malformed link, not a aesmsg link ─────────────
  it("maps a 400 on metadata to 'invalid' (the link id is structurally not a aesmsg link)", () => {
    expect(classifyReaderError(new ApiError(400), "metadata")).toBe("invalid");
  });

  it("maps a 400 on open to 'invalid'", () => {
    expect(classifyReaderError(new ApiError(400), "open")).toBe("invalid");
  });

  // ── Network: a transport failure or transient server status — no open was consumed ──────
  it("maps a plain network Error (no HTTP status reached) to 'network'", () => {
    expect(classifyReaderError(new Error("Failed to fetch"), "open")).toBe("network");
    expect(classifyReaderError(new TypeError("Network request failed"), "metadata")).toBe(
      "network",
    );
  });

  it("maps a 429 rate-limit to 'network' (transient, retryable, no open consumed)", () => {
    expect(classifyReaderError(new ApiError(429), "metadata")).toBe("network");
    expect(classifyReaderError(new ApiError(429), "open")).toBe("network");
  });

  it("maps a 500 server error to 'network' (transient, retryable)", () => {
    expect(classifyReaderError(new ApiError(500), "open")).toBe("network");
  });

  it("maps non-Error throwables (string / null / undefined) to 'network' (treat as transport)", () => {
    expect(classifyReaderError("boom", "open")).toBe("network");
    expect(classifyReaderError(null, "metadata")).toBe("network");
    expect(classifyReaderError(undefined, "open")).toBe("network");
  });

  // ── Failed: wrong key. Only reachable on the open phase (after a 200, local decrypt fails) ─
  it("maps a DecryptionError on open to 'failed' (wrong private key — no recovery)", () => {
    expect(classifyReaderError(decryptionError(), "open")).toBe("failed");
  });

  it("maps a BadPassphraseError-shaped DecryptionError on open to 'failed'", () => {
    // BadPassphraseError extends DecryptionError; its name differs but it is still a decrypt
    // failure. The classifier matches the DecryptionError family by name suffix, so both route
    // to the no-recovery screen.
    expect(classifyReaderError(decryptionError("BadPassphraseError"), "open")).toBe("failed");
  });

  it("treats an ApiError-like plain object (NOT instanceof ApiError) as 'network' (no trusted status)", () => {
    // Only a real ApiError carries a server-confirmed status; a structurally-similar object must
    // not be trusted to read its status, so it degrades to the safe transport bucket.
    const fake = { name: "ApiError", status: 410 };
    expect(classifyReaderError(fake, "open")).toBe("network");
  });

  it("never returns 'already-opened' for any live error — that distinction does not exist yet", () => {
    // SECURITY: the server cannot (and must not) tell us a link is 'opened out' vs 'expired' vs
    // 'revoked' — all are 410/404. So no live error may resolve to the AlreadyOpened screen; it
    // would leak. The outcome union still includes 'already-opened' for the presentational screen,
    // but the classifier provably never produces it.
    const outcomes: ReaderErrorOutcome[] = (
      [
        new ApiError(400),
        new ApiError(404),
        new ApiError(410),
        new ApiError(429),
        new ApiError(500),
        new Error("x"),
        decryptionError(),
        "boom",
        null,
      ] as const
    ).flatMap((err) =>
      (["metadata", "open"] as const).map((phase) => classifyReaderError(err, phase)),
    );
    expect(outcomes).not.toContain("already-opened");
  });
});

describe("screenForReaderError — outcome -> terminal screen", () => {
  const cases: Array<[ReaderErrorOutcome, string]> = [
    ["gone", "gone"],
    ["invalid", "invalid"],
    ["network", "network"],
    ["failed", "failed"],
    ["already-opened", "already-opened"],
  ];
  for (const [outcome, screen] of cases) {
    it(`maps '${outcome}' -> '${screen}'`, () => {
      expect(screenForReaderError(outcome)).toBe(screen);
    });
  }
});

describe("phases", () => {
  it("accepts both reader phases", () => {
    const phases: ReaderPhase[] = ["metadata", "open"];
    for (const p of phases) {
      expect(typeof classifyReaderError(new Error("x"), p)).toBe("string");
    }
  });
});
