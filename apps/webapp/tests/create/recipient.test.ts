import { exportPublicKey, fingerprint, generateIdentity } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { validateRecipientKey } from "@/src/create/recipient";

describe("validateRecipientKey", () => {
  it("accepts a real amk1 public key and derives its AM- fingerprint", async () => {
    const id = await generateIdentity();
    const pk = exportPublicKey(id);
    const result = await validateRecipientKey(`  ${pk}  `); // whitespace is trimmed
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.publicKey).toBe(pk);
    expect(result.fingerprint).toBe(await fingerprint(pk));
    expect(result.fingerprint.startsWith("AM-")).toBe(true);
  });

  it("rejects an empty string with reason 'empty'", async () => {
    expect(await validateRecipientKey("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a malformed / non-amk1 key with reason 'invalid'", async () => {
    expect(await validateRecipientKey("not-a-key")).toEqual({ ok: false, reason: "invalid" });
    expect(await validateRecipientKey("amk1:garbage")).toEqual({ ok: false, reason: "invalid" });
  });
});
