import { describe, expect, it, vi } from "vitest";

// revoke-outcome imports ApiError from @/src/api/client, which reads expo-constants at module load;
// expo-constants (SDK 56) statically imports react-native (Flow), unparseable under Node vitest.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "https://send.test" } } },
}));

import { ApiError } from "@/src/api/client";
import { isAlreadyGone } from "@/src/links/revoke-outcome";

// Pure classification of a revoke attempt: an already-gone (404/410) response is SUCCESS from the
// sender's point of view; every other failure is a genuine error.

describe("isAlreadyGone", () => {
  it("is true for a 404 (not found)", () => {
    expect(isAlreadyGone(new ApiError(404))).toBe(true);
  });

  it("is true for a 410 (gone)", () => {
    expect(isAlreadyGone(new ApiError(410))).toBe(true);
  });

  it("is false for other ApiError statuses (offline-adjacent / server faults)", () => {
    expect(isAlreadyGone(new ApiError(500))).toBe(false);
    expect(isAlreadyGone(new ApiError(401))).toBe(false);
    expect(isAlreadyGone(new ApiError(409))).toBe(false);
  });

  it("is false for non-ApiError throwables (network error, generic Error, junk)", () => {
    expect(isAlreadyGone(new Error("network down"))).toBe(false);
    expect(isAlreadyGone({ status: 404 })).toBe(false); // duck-typed impostor is NOT an ApiError
    expect(isAlreadyGone(null)).toBe(false);
    expect(isAlreadyGone(undefined)).toBe(false);
  });
});
