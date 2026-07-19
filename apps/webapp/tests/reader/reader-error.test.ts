import { describe, expect, it } from "vitest";
import { ApiError, MalformedResponseError, NetworkError, TimeoutError } from "@/src/api/client";
import { classifyReaderError, type ReaderOutcome } from "@/src/reader/reader-error";

// Build a stand-in crypto error by name only — reader-error.ts matches structurally and must not
// import @aesmsg/crypto.
function namedError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

describe("classifyReaderError", () => {
  it("maps a DecryptionError (wrong key) to 'failed'", () => {
    expect(classifyReaderError(namedError("DecryptionError"))).toBe<ReaderOutcome>("failed");
  });

  it("maps a BadPassphraseError to 'failed'", () => {
    expect(classifyReaderError(namedError("BadPassphraseError"))).toBe<ReaderOutcome>("failed");
  });

  it("maps an InvalidFormatError (malformed envelope) to 'invalid' — the intentional divergence", () => {
    expect(classifyReaderError(namedError("InvalidFormatError"))).toBe<ReaderOutcome>("invalid");
  });

  it("maps ApiError(400) to 'invalid'", () => {
    expect(classifyReaderError(new ApiError(400))).toBe<ReaderOutcome>("invalid");
  });

  it("maps ApiError(429) and ApiError(500) to 'network'", () => {
    expect(classifyReaderError(new ApiError(429))).toBe<ReaderOutcome>("network");
    expect(classifyReaderError(new ApiError(500))).toBe<ReaderOutcome>("network");
  });

  it("maps transport failures (NetworkError/TimeoutError) to 'network'", () => {
    expect(classifyReaderError(new NetworkError())).toBe<ReaderOutcome>("network");
    expect(classifyReaderError(new TimeoutError())).toBe<ReaderOutcome>("network");
  });

  // A MalformedResponseError is thrown ONLY after a 2xx (validateOpenMessageResponse runs on the
  // parsed 200 body), so the view-once open was already consumed. It must be the NON-retryable
  // "invalid" terminal — never retryable "network", whose copy promises no open was burned and whose
  // Retry would burn a second open.
  it("maps a malformed 200 body (MalformedResponseError, open already consumed) to 'invalid'", () => {
    expect(classifyReaderError(new MalformedResponseError("x"))).toBe<ReaderOutcome>("invalid");
  });

  it("maps a plain object / non-Error throwable to 'network'", () => {
    expect(classifyReaderError({})).toBe<ReaderOutcome>("network");
    expect(classifyReaderError("nope")).toBe<ReaderOutcome>("network");
  });

  // INVARIANT: 410 and 404 are INDISTINGUISHABLE — both the single opaque "gone". Revoked, expired,
  // and max-opens-exhausted must never be tellable apart.
  it("collapses 410 and 404 to the SAME 'gone' outcome (no distinguishability)", () => {
    const fromGone = classifyReaderError(new ApiError(410));
    const fromNotFound = classifyReaderError(new ApiError(404));
    expect(fromGone).toBe<ReaderOutcome>("gone");
    expect(fromNotFound).toBe<ReaderOutcome>("gone");
    expect(fromGone).toBe(fromNotFound);
  });

  it("NEVER produces an 'already-opened' outcome", () => {
    const outcomes: ReaderOutcome[] = [
      classifyReaderError(new ApiError(410)),
      classifyReaderError(new ApiError(404)),
      classifyReaderError(new ApiError(400)),
      classifyReaderError(new ApiError(500)),
      classifyReaderError(namedError("DecryptionError")),
      classifyReaderError(new NetworkError()),
    ];
    for (const outcome of outcomes) {
      expect(outcome).not.toBe("already-opened");
    }
  });
});
