import { describe, expect, it } from "vitest";
import type { Contact, TrustStatus } from "@/src/contacts/contacts-data";

// contacts-data is now type-only (the runtime sample seed was removed when the real encrypted
// contacts store landed). These assertions pin the presentational view-model the screens render
// against, so a drift in the Contact shape is caught without a renderer.

describe("Contact view-model", () => {
  it("accepts a minimal contact (id + name + fingerprint + status)", () => {
    const c: Contact = {
      id: "x",
      name: "Alice",
      fingerprint: "A1B2 C3D4",
      status: "verified",
    };
    expect(c.name).toBe("Alice");
  });

  it("accepts the optional detail/verify fields", () => {
    const c: Contact = {
      id: "x",
      name: "Alice",
      fingerprint: "A1B2 C3D4",
      fullFingerprint: "A1B2 C3D4 E5F6 7890",
      status: "changed",
      lastUsed: "3d",
      keyCreated: "Sep 12, 2025",
    };
    expect(c.fullFingerprint).toContain("E5F6");
  });

  it("TrustStatus is the three design states", () => {
    const all: TrustStatus[] = ["verified", "unverified", "changed"];
    expect(all).toHaveLength(3);
  });
});
