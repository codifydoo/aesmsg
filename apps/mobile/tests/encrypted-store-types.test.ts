import { describe, expect, it } from "vitest";
import { DecryptionError } from "@/src/storage/encrypted-store.types";

describe("DecryptionError", () => {
  it("is an Error subclass with a stable name and the given message", () => {
    const err = new DecryptionError('blob for key "contacts" failed to decrypt');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DecryptionError);
    expect(err.name).toBe("DecryptionError");
    expect(err.message).toBe('blob for key "contacts" failed to decrypt');
  });

  it("is catchable as a DecryptionError after being thrown", () => {
    try {
      throw new DecryptionError("tampered");
    } catch (e) {
      expect(e instanceof DecryptionError).toBe(true);
    }
  });
});
