import { describe, expect, it } from "vitest";
import { shouldPrimeNotifications } from "@/src/notifications/prime-decision";

describe("shouldPrimeNotifications", () => {
  it("primes when permission is undetermined and we have not asked before", () => {
    expect(shouldPrimeNotifications({ permission: "undetermined", alreadyPrimed: false })).toBe(
      true,
    );
  });

  it("does not prime once we have already primed", () => {
    expect(shouldPrimeNotifications({ permission: "undetermined", alreadyPrimed: true })).toBe(
      false,
    );
  });

  it("does not prime when permission is already granted", () => {
    expect(shouldPrimeNotifications({ permission: "granted", alreadyPrimed: false })).toBe(false);
  });

  it("does not prime when permission was denied (respect the user's choice)", () => {
    expect(shouldPrimeNotifications({ permission: "denied", alreadyPrimed: false })).toBe(false);
  });
});
