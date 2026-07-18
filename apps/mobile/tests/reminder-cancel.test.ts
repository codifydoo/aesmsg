import type { Fingerprint } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { reminderCancelTarget } from "@/src/links/reminder-cancel";
import type { SentLinkRecord } from "@/src/links/sent-links-store";

// Pure decision: which scheduled local reminder to cancel when a tracked link is killed early. Fully
// type-only against SentLinkRecord (no store runtime), so it is node-testable in isolation.

function record(over: Partial<SentLinkRecord>): SentLinkRecord {
  return {
    id: "id0000000000000",
    recipientFingerprint: "AM-AAAA-1111" as Fingerprint,
    createdAt: "2026-05-31T10:00:00.000Z",
    expiresAt: "2026-05-31T13:00:00.000Z",
    maxOpens: 3,
    label: null,
    schemaVersion: 1,
    ...over,
  };
}

describe("reminderCancelTarget", () => {
  it("returns the reminder id when the record carries one", () => {
    expect(reminderCancelTarget(record({ reminderNotificationId: "notif-abc" }))).toBe("notif-abc");
  });

  it("returns null for a legacy record with no reminder id field", () => {
    expect(reminderCancelTarget(record({}))).toBeNull();
  });

  it("returns null when the reminder id is explicitly null", () => {
    expect(reminderCancelTarget(record({ reminderNotificationId: null }))).toBeNull();
  });

  it("returns null for a missing record (nothing to cancel)", () => {
    expect(reminderCancelTarget(null)).toBeNull();
  });
});
