import { exportPublicKey, type Fingerprint, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  contactRecordToContact,
  deriveKeyCreatedLabel,
  deriveLastUsedLabel,
  deriveTrustStatus,
  fullFingerprintLines,
  shortFingerprint,
} from "@/src/contacts/contacts-display";
import type { ContactRecord } from "@/src/contacts/contacts-store";

let fp: Fingerprint;
let prevFp: Fingerprint;
let record: ContactRecord;

beforeAll(async () => {
  const id = await generateIdentity();
  const pk = exportPublicKey(id);
  fp = await fingerprint(pk);
  prevFp = await fingerprint(exportPublicKey(await generateIdentity()));
  record = {
    id: "rec-1",
    label: "Alice",
    publicKey: pk,
    fingerprint: fp,
    verified: false,
    previousFingerprints: [],
    createdAt: "2025-09-12T10:00:00.000Z",
    updatedAt: "2025-09-12T10:00:00.000Z",
    schemaVersion: 1,
  };
});

describe("deriveTrustStatus", () => {
  it("verified record -> 'verified'", () => {
    expect(deriveTrustStatus({ ...record, verified: true })).toBe("verified");
  });

  it("unverified, no rotation history -> 'unverified'", () => {
    expect(deriveTrustStatus({ ...record, verified: false, previousFingerprints: [] })).toBe(
      "unverified",
    );
  });

  it("unverified WITH rotation history -> 'changed' (key changed, re-verify)", () => {
    expect(
      deriveTrustStatus({
        ...record,
        verified: false,
        previousFingerprints: ["AM-0000-0000-0000-0000-0000-0000-0000-0000" as Fingerprint],
      }),
    ).toBe("changed");
  });

  it("verified takes precedence even with rotation history", () => {
    expect(
      deriveTrustStatus({
        ...record,
        verified: true,
        previousFingerprints: ["AM-0000-0000-0000-0000-0000-0000-0000-0000" as Fingerprint],
      }),
    ).toBe("verified");
  });
});

describe("deriveLastUsedLabel", () => {
  const now = new Date("2026-05-31T12:00:00.000Z").getTime();

  it("returns a placeholder when no updatedAt activity is recent (null lastUsed)", () => {
    expect(deriveLastUsedLabel(null, now)).toBe("Never used");
  });

  it("formats a recent ISO timestamp via relativeTime", () => {
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(deriveLastUsedLabel(threeDaysAgo, now)).toBe("3d");
  });

  it("clamps a future timestamp to 'Now'", () => {
    const future = new Date(now + 60_000).toISOString();
    expect(deriveLastUsedLabel(future, now)).toBe("Now");
  });
});

describe("deriveKeyCreatedLabel", () => {
  it("formats an ISO createdAt as an absolute date", () => {
    // toLocaleDateString in node defaults to en-US; assert the shape rather than an exact string.
    const label = deriveKeyCreatedLabel("2025-09-12T10:00:00.000Z");
    expect(label).toMatch(/2025/);
    expect(label).toMatch(/Sep|September|09|9/);
  });
});

describe("shortFingerprint", () => {
  it("returns the first two 4-char groups (8 hex) space-separated", () => {
    const short = shortFingerprint(fp);
    expect(short).toMatch(/^[0-9A-F]{4} [0-9A-F]{4}$/);
  });
});

describe("fullFingerprintLines", () => {
  it("lays the full fingerprint out as stacked 4-char groups (2 lines of 4 groups)", () => {
    const lines = fullFingerprintLines(fp);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/);
    }
  });
});

describe("contactRecordToContact", () => {
  const now = new Date("2026-05-31T12:00:00.000Z").getTime();

  it("maps a record onto the presentational Contact shape with derived display fields", () => {
    const c = contactRecordToContact(record, now);
    expect(c.id).toBe("rec-1");
    expect(c.name).toBe("Alice");
    expect(c.status).toBe("unverified");
    expect(c.fingerprint).toBe(shortFingerprint(fp));
    expect(c.fullFingerprint).toBe(fullFingerprintLines(fp).join(" "));
    expect(c.keyCreated).toBe(deriveKeyCreatedLabel(record.createdAt));
    expect(c.email).toBeUndefined(); // mobile mirrors web's label + publicKey model only (no email)
  });

  it("omits previousFingerprint for a contact whose key never changed", () => {
    const c = contactRecordToContact(record, now);
    expect(c.previousFingerprint).toBeUndefined();
  });

  it("surfaces the REAL most-recent prior fingerprint for a changed contact (compose warning input)", () => {
    // verified=false + non-empty rotation history ⇒ status "changed"; the warning must contrast the
    // current fingerprint against the actual key rotated away from, never a fabricated sample.
    const changed = contactRecordToContact(
      { ...record, verified: false, previousFingerprints: [prevFp] },
      now,
    );
    expect(changed.status).toBe("changed");
    expect(changed.previousFingerprint).toBe(shortFingerprint(prevFp));
    expect(changed.previousFingerprint).not.toBe(changed.fingerprint);
  });

  it("selects the LAST (most-recently rotated-away) fingerprint when there are several", () => {
    const oldest = "AM-0000-0000-0000-0000-0000-0000-0000-0000" as Fingerprint;
    const changed = contactRecordToContact(
      { ...record, verified: false, previousFingerprints: [oldest, prevFp] },
      now,
    );
    expect(changed.previousFingerprint).toBe(shortFingerprint(prevFp));
  });
});
