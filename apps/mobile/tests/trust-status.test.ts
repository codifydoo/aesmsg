import { describe, expect, it } from "vitest";
import type { Contact, TrustStatus } from "@/src/contacts/contacts-data";
import { trustIndicator } from "@/src/contacts/trust-status";

// trustIndicator backs the contacts list row's trailing trust indicator. Per the node-env /
// no-React-renderer convention the status→presentation mapping (and its COLOR SEMANTICS) is tested
// here, not by rendering a row.

// Local fixture — one contact per trust state, enough to exercise every branch.
const FIXTURE_CONTACTS: Contact[] = [
  { id: "a", name: "Alice", fingerprint: "A1B2 C3D4", status: "verified" },
  { id: "b", name: "Bob", fingerprint: "B2C3 D4E5", status: "unverified" },
  { id: "c", name: "Carol", fingerprint: "C3D4 E5F6", status: "changed" },
];

describe("trustIndicator", () => {
  it("renders verified as an emerald filled glyph (green = verified | safe)", () => {
    const i = trustIndicator("verified");
    expect(i.kind).toBe("glyph");
    expect(i.tone).toBe("green");
    expect(i.icon).toBe("verified");
    expect(i.fill).toBe(true);
    expect(i.label).toBe("");
  });

  it("renders unverified as an amber outline chip", () => {
    const i = trustIndicator("unverified");
    expect(i.kind).toBe("chip");
    expect(i.tone).toBe("amber");
    expect(i.label).toBe("Unverified");
    expect(i.fill).toBe(false);
  });

  it("renders a changed key as an amber chip — NOT red (ambient state, not destructive)", () => {
    const i = trustIndicator("changed");
    expect(i.kind).toBe("chip");
    expect(i.tone).toBe("amber");
    expect(i.label).toBe("Key changed");
  });

  it("never uses an error/red tone for any trust state (red is destructive-only)", () => {
    const statuses: TrustStatus[] = ["verified", "unverified", "changed"];
    for (const s of statuses) {
      expect(trustIndicator(s).tone).not.toBe("error");
    }
  });

  it("is total over all three trust states (every status returns a valid tone)", () => {
    for (const c of FIXTURE_CONTACTS) {
      expect(() => trustIndicator(c.status)).not.toThrow();
      expect(["green", "amber"]).toContain(trustIndicator(c.status).tone);
    }
  });
});
