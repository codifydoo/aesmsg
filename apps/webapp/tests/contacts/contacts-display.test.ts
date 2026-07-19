import { exportPublicKey, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import {
  contactRecordToContact,
  deriveTrustStatus,
  shortFingerprint,
} from "@/src/contacts/contacts-display";
import type { ContactRecord } from "@/src/contacts/contacts-store";

async function record(overrides: Partial<ContactRecord> = {}): Promise<ContactRecord> {
  const pk = exportPublicKey(await generateIdentity());
  const fp = await fingerprint(pk);
  return {
    id: "id-1",
    label: "Alice",
    publicKey: pk,
    fingerprint: fp,
    verified: false,
    previousFingerprints: [],
    createdAt: "2025-09-12T10:00:00.000Z",
    updatedAt: "2025-09-12T10:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

describe("deriveTrustStatus", () => {
  it("verified:true → 'verified' regardless of rotation history", async () => {
    const r = await record({ verified: true, previousFingerprints: ["AM-old" as never] });
    expect(deriveTrustStatus(r)).toBe("verified");
  });

  it("!verified + non-empty history → 'changed'", async () => {
    const r = await record({ verified: false, previousFingerprints: ["AM-old" as never] });
    expect(deriveTrustStatus(r)).toBe("changed");
  });

  it("!verified + no history → 'unverified'", async () => {
    const r = await record({ verified: false, previousFingerprints: [] });
    expect(deriveTrustStatus(r)).toBe("unverified");
  });
});

describe("contactRecordToContact", () => {
  it("exposes short + full fingerprint and omits previousFingerprint unless changed", async () => {
    const r = await record();
    const view = contactRecordToContact(r);
    expect(view.name).toBe("Alice");
    expect(view.fingerprint).toBe(shortFingerprint(r.fingerprint));
    expect(view.fullFingerprint).toBe(r.fingerprint);
    expect(view.status).toBe("unverified");
    expect("previousFingerprint" in view).toBe(false);
    expect(view.keyCreated).toMatch(/2025/);
  });

  it("surfaces the REAL prior fingerprint (short) only for a changed contact", async () => {
    const prevFp = (await fingerprint(exportPublicKey(await generateIdentity()))) as never;
    const r = await record({ verified: false, previousFingerprints: [prevFp] });
    const view = contactRecordToContact(r);
    expect(view.status).toBe("changed");
    expect(view.previousFingerprint).toBe(shortFingerprint(prevFp));
  });
});
