import { describe, expect, it } from "vitest";
import { resolveAutoLockMs } from "@/src/identity/auto-lock";

// The inactivity auto-lock timer reads its duration from the persisted appLockTimeout. resolveAutoLockMs
// is the pure mapping the identity provider uses to decide whether (and after how long) to arm the
// timer. "never" => null (no timer). This is separate from shouldLockOnAppState (background lock).

describe("resolveAutoLockMs", () => {
  it("returns null for 'never' (no inactivity timer)", () => {
    expect(resolveAutoLockMs("never")).toBeNull();
  });

  it("maps labelled windows to milliseconds", () => {
    expect(resolveAutoLockMs("1m")).toBe(60_000);
    expect(resolveAutoLockMs("5m")).toBe(5 * 60_000);
    expect(resolveAutoLockMs("15m")).toBe(15 * 60_000);
    expect(resolveAutoLockMs("1h")).toBe(60 * 60_000);
  });
});
