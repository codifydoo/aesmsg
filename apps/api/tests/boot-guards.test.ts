import { describe, expect, it } from "vitest";
import { saltConfigError } from "../src/lib/hash-ip";
import { missingProductionStoreVars, shouldUseDbStores } from "../src/stores/store-backend";

// Boot-time fail-closed guards (ARCH-1 / BE-3). These are pure, env-injected functions so the exit
// logic in index.ts can be validated deterministically without spawning a process.

describe("missingProductionStoreVars — ARCH-1 store fail-closed", () => {
  it("returns [] outside production even when both URLs are missing (dev boots on memory stores)", () => {
    expect(missingProductionStoreVars({})).toEqual([]);
    expect(missingProductionStoreVars({ NODE_ENV: "development" })).toEqual([]);
    expect(missingProductionStoreVars({ NODE_ENV: "test" })).toEqual([]);
  });

  it("returns [] in production when both DATABASE_URL and REDIS_URL are set", () => {
    expect(
      missingProductionStoreVars({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://x",
        REDIS_URL: "redis://y",
      }),
    ).toEqual([]);
  });

  it("names DATABASE_URL when only it is missing in production", () => {
    expect(missingProductionStoreVars({ NODE_ENV: "production", REDIS_URL: "redis://y" })).toEqual([
      "DATABASE_URL",
    ]);
  });

  it("names REDIS_URL when only it is missing in production", () => {
    expect(
      missingProductionStoreVars({ NODE_ENV: "production", DATABASE_URL: "postgres://x" }),
    ).toEqual(["REDIS_URL"]);
  });

  it("names both when both are missing in production", () => {
    expect(missingProductionStoreVars({ NODE_ENV: "production" })).toEqual([
      "DATABASE_URL",
      "REDIS_URL",
    ]);
  });

  it("treats an empty-string URL as missing in production", () => {
    expect(
      missingProductionStoreVars({ NODE_ENV: "production", DATABASE_URL: "", REDIS_URL: "" }),
    ).toEqual(["DATABASE_URL", "REDIS_URL"]);
  });
});

describe("shouldUseDbStores — memory-store fallback semantics (unchanged)", () => {
  it("uses memory stores (false) when either URL is absent, regardless of NODE_ENV", () => {
    expect(shouldUseDbStores({})).toBe(false);
    expect(shouldUseDbStores({ DATABASE_URL: "postgres://x" })).toBe(false);
    expect(shouldUseDbStores({ REDIS_URL: "redis://y" })).toBe(false);
  });

  it("uses DB stores (true) only when both URLs are present", () => {
    expect(shouldUseDbStores({ DATABASE_URL: "postgres://x", REDIS_URL: "redis://y" })).toBe(true);
  });
});

describe("saltConfigError — BE-3 salt fail-closed", () => {
  const strong = "x".repeat(32);

  it("returns null outside production even with no salt (dev/test permitted)", () => {
    expect(saltConfigError(undefined, false)).toBeNull();
    expect(saltConfigError("", false)).toBeNull();
    expect(saltConfigError("short", false)).toBeNull();
  });

  it("errors in production when the salt is missing", () => {
    const err = saltConfigError(undefined, true);
    expect(err).toContain("RATE_LIMIT_IP_SALT");
    expect(err).toContain("32 bytes");
  });

  it("errors in production when the salt is shorter than 32 bytes", () => {
    expect(saltConfigError("x".repeat(31), true)).toContain("RATE_LIMIT_IP_SALT");
    expect(saltConfigError("", true)).toContain("RATE_LIMIT_IP_SALT");
  });

  it("returns null in production when the salt is exactly 32 bytes or longer", () => {
    expect(saltConfigError(strong, true)).toBeNull();
    expect(saltConfigError("x".repeat(64), true)).toBeNull();
  });
});
