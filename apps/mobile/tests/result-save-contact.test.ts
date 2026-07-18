import { exportPublicKey, type Fingerprint, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { ContactRecord } from "@/src/contacts/contacts-store";
import { isUnknownRecipientFingerprint } from "@/src/create/result-save-contact";

let known: Fingerprint;
let rotatedAway: Fingerprint;
let unknown: Fingerprint;
let records: ContactRecord[];

beforeAll(async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const c = await generateIdentity();
  known = await fingerprint(exportPublicKey(a));
  rotatedAway = await fingerprint(exportPublicKey(b));
  unknown = await fingerprint(exportPublicKey(c));
  records = [
    {
      id: "rec-1",
      label: "Alice",
      publicKey: exportPublicKey(a),
      fingerprint: known,
      verified: false,
      previousFingerprints: [rotatedAway],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      schemaVersion: 1,
    },
  ];
});

describe("isUnknownRecipientFingerprint", () => {
  it("is false when the fingerprint matches a contact's CURRENT key", () => {
    expect(isUnknownRecipientFingerprint(known, records)).toBe(false);
  });

  it("is false when the fingerprint matches a contact's ROTATED-AWAY key", () => {
    expect(isUnknownRecipientFingerprint(rotatedAway, records)).toBe(false);
  });

  it("is true when the fingerprint matches no contact (current or previous)", () => {
    expect(isUnknownRecipientFingerprint(unknown, records)).toBe(true);
  });

  it("is true against an empty directory", () => {
    expect(isUnknownRecipientFingerprint(unknown, [])).toBe(true);
  });
});
