import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/src/api/client";
import { classifyOpenError, type ReaderState, selectScreen } from "@/src/reader/reader-machine";

// reader-machine -> @/src/api/client (for ApiError) -> expo-constants, which (SDK 56) statically
// imports react-native; its Flow syntax cannot be parsed under Node vitest, so it MUST be mocked.
// @aesmsg/crypto is deliberately NOT imported here — reader-machine only type-imports
// FetchAndOpenOutput (erased at runtime), so the module loads in plain Node.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "" } } },
}));

describe("classifyOpenError", () => {
  it("maps an ApiError with status 410 to 'gone' (revoked / expired / max-opens consumed)", () => {
    expect(classifyOpenError(new ApiError(410))).toBe("gone");
  });

  it("maps other ApiError statuses to 'failed' (404 / 429 / 500 must never read as gone)", () => {
    expect(classifyOpenError(new ApiError(404))).toBe("failed");
    expect(classifyOpenError(new ApiError(429))).toBe("failed");
    expect(classifyOpenError(new ApiError(500))).toBe("failed");
  });

  it("maps a plain network Error (no status) to 'failed'", () => {
    expect(classifyOpenError(new Error("network"))).toBe("failed");
  });

  it("maps a DecryptionError-shaped error (wrong key, no recovery) to 'failed'", () => {
    // The reader never special-cases a decryption failure: any non-410 -> failed.
    const decryptionError = new Error("decryption failed");
    decryptionError.name = "DecryptionError";
    expect(classifyOpenError(decryptionError)).toBe("failed");
  });

  it("maps non-Error throwables (string / null / undefined) to 'failed'", () => {
    expect(classifyOpenError("boom")).toBe("failed");
    expect(classifyOpenError(null)).toBe("failed");
    expect(classifyOpenError(undefined)).toBe("failed");
  });

  it("treats an ApiError-like object that is NOT an instanceof ApiError as 'failed'", () => {
    // Only a true ApiError(410) is gone; a structurally-similar plain object must not slip through.
    const fake = { name: "ApiError", status: 410 };
    expect(classifyOpenError(fake)).toBe("failed");
  });
});

describe("selectScreen", () => {
  const metadata = {
    status: "active" as const,
    recipientFingerprint: "fp-abc",
    createdAt: "2026-05-10T12:00:00.000Z",
    expiresAt: "2026-05-11T12:00:00.000Z",
    maxOpens: 1,
    opensCount: 0,
  };

  it("renders the decrypting surface for both loading and opening (never reveals which)", () => {
    expect(selectScreen({ kind: "loading" })).toBe("decrypting");
    // `opening` carries no payload now — the in-flight open result is held in open-coordinator, not
    // in state — so it renders the same opaque decrypting surface as loading.
    expect(selectScreen({ kind: "opening" })).toBe("decrypting");
  });

  it("maps each terminal/intermediate state to its screen", () => {
    expect(selectScreen({ kind: "gone" })).toBe("gone");
    expect(selectScreen({ kind: "landing", metadata, myFingerprint: "fp-abc" })).toBe("landing");
    // `failed` (wrong key) carries no metadata — the terminal is opaque and has no retry.
    expect(selectScreen({ kind: "failed" })).toBe("failed");
    const decrypted: ReaderState = {
      kind: "decrypted",
      output: {
        text: "secret",
        attachments: [],
        recipientFingerprint: "fp-abc",
        opensCount: 1,
        maxOpens: 1,
        status: "active",
      },
    };
    expect(selectScreen(decrypted)).toBe("reader");
  });

  it("maps the new opaque terminal states to their screens (network / invalid)", () => {
    // Added states for the design's terminal screens. They are reached via classifyReaderError in
    // ReaderFlow (a finer companion to classifyOpenError), not via classifyOpenError, so the
    // gone-vs-failed predicate and its tests are unchanged.
    expect(selectScreen({ kind: "network" })).toBe("network");
    expect(selectScreen({ kind: "invalid" })).toBe("invalid");
  });
});
