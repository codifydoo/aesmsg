import { describe, expect, it, vi } from "vitest";
import { assertProductionConfig } from "../src/boot-config";

// Exercises the ACTUAL exit wiring index.ts runs at boot (assertProductionConfig(process.env,
// process.exit)) without spawning a process: env + exit/log are injected. boot-guards.test.ts pins
// the pure predicates; this pins that a violation truly reaches exit(1) and reports the right var.
const STRONG_SALT = "x".repeat(32);

describe("assertProductionConfig — boot fail-closed wiring", () => {
  it("does not exit when production is fully configured (both stores + a strong salt)", () => {
    const exit = vi.fn();
    const log = vi.fn();
    assertProductionConfig(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://x",
        REDIS_URL: "redis://y",
        RATE_LIMIT_IP_SALT: STRONG_SALT,
      },
      exit,
      log,
    );
    expect(exit).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("does not exit outside production even with nothing set (dev boots on memory stores)", () => {
    const exit = vi.fn();
    assertProductionConfig({}, exit, () => {});
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits(1) and reports DATABASE_URL when it is missing in production", () => {
    const exit = vi.fn();
    const log = vi.fn();
    assertProductionConfig(
      { NODE_ENV: "production", REDIS_URL: "redis://y", RATE_LIMIT_IP_SALT: STRONG_SALT },
      exit,
      log,
    );
    expect(exit).toHaveBeenCalledWith(1);
    const stderr = log.mock.calls.map((c) => c[0]).join("\n");
    expect(stderr).toContain("DATABASE_URL");
  });

  it("exits(1) and reports RATE_LIMIT_IP_SALT when the salt is too short in production", () => {
    const exit = vi.fn();
    const log = vi.fn();
    assertProductionConfig(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://x",
        REDIS_URL: "redis://y",
        RATE_LIMIT_IP_SALT: "short",
      },
      exit,
      log,
    );
    expect(exit).toHaveBeenCalledWith(1);
    const stderr = log.mock.calls.map((c) => c[0]).join("\n");
    expect(stderr).toContain("RATE_LIMIT_IP_SALT");
  });

  it("stops at the store guard (exactly one exit) when BOTH stores and salt are misconfigured", () => {
    const exit = vi.fn();
    const log = vi.fn();
    // Store guard runs first and returns after exit(1), mirroring production where process.exit is
    // terminal — a non-terminating spy must not fall through and also evaluate the salt guard.
    assertProductionConfig({ NODE_ENV: "production" }, exit, log);
    expect(exit).toHaveBeenCalledTimes(1);
    const stderr = log.mock.calls.map((c) => c[0]).join("\n");
    expect(stderr).toContain("DATABASE_URL");
    expect(stderr).not.toContain("RATE_LIMIT_IP_SALT");
  });
});
