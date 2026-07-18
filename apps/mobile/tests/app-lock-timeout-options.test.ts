import { describe, expect, it } from "vitest";
import { APP_LOCK_TIMEOUT_OPTIONS, appLockTimeoutLabel } from "@/src/settings/settings-format";

describe("APP_LOCK_TIMEOUT_OPTIONS", () => {
  it("covers all five timeout values in order", () => {
    expect(APP_LOCK_TIMEOUT_OPTIONS.map((o) => o.value)).toEqual([
      "never",
      "1m",
      "5m",
      "15m",
      "1h",
    ]);
  });

  it("gives every option a non-empty label and description", () => {
    for (const o of APP_LOCK_TIMEOUT_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.description.length).toBeGreaterThan(0);
    }
  });
});

describe("appLockTimeoutLabel", () => {
  it("maps a value to its label", () => {
    expect(appLockTimeoutLabel("never")).toBe("Never");
    expect(appLockTimeoutLabel("5m")).toBe("5 minutes");
    expect(appLockTimeoutLabel("1h")).toBe("1 hour");
  });
});
