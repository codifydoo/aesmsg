import { describe, expect, it } from "vitest";
import {
  BadPassphraseError,
  DecryptionError,
  InvalidFormatError,
  NotImplementedError,
} from "../src/errors.js";

describe("error classes", () => {
  it("DecryptionError is an Error with the right name", () => {
    const err = new DecryptionError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DecryptionError);
    expect(err.name).toBe("DecryptionError");
    expect(err.message).toBe("Decryption failed");
  });

  it("DecryptionError accepts a custom message but defaults to a static one", () => {
    expect(new DecryptionError().message).toBe("Decryption failed");
    expect(new DecryptionError("override").message).toBe("override");
  });

  it("InvalidFormatError is an Error with the right name and a non-empty message", () => {
    const err = new InvalidFormatError("bad prefix");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidFormatError);
    expect(err.name).toBe("InvalidFormatError");
    expect(err.message).toBe("bad prefix");
  });

  it("NotImplementedError is an Error with the right name and references the symbol", () => {
    const err = new NotImplementedError("wrapPrivateKey");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NotImplementedError);
    expect(err.name).toBe("NotImplementedError");
    expect(err.message).toContain("wrapPrivateKey");
    expect(err.message).toContain("Slice 2");
  });

  it("the three error classes are distinct", () => {
    expect(new DecryptionError()).not.toBeInstanceOf(InvalidFormatError);
    expect(new InvalidFormatError("x")).not.toBeInstanceOf(DecryptionError);
    expect(new NotImplementedError("x")).not.toBeInstanceOf(DecryptionError);
  });

  it("BadPassphraseError is a subclass of DecryptionError with its own name", () => {
    const err = new BadPassphraseError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DecryptionError);
    expect(err).toBeInstanceOf(BadPassphraseError);
    expect(err.name).toBe("BadPassphraseError");
    expect(err.message).toBe("Wrong passphrase");
  });
});
