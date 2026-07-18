import { InvalidFormatError } from "@aesmsg/crypto";
import { describe, expect, it, vi } from "vitest";

// contacts-store.ts imports getEncryptedStore → expo-file-system/legacy + expo-secure-store at
// module load time. Mock them so the test graph resolves under Node vitest (no native modules).
// Pattern mirrors contacts-store.test.ts and gate-error.test.ts.
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
  setItemAsync: vi.fn(async () => {}),
  getItemAsync: vi.fn(async () => null),
  deleteItemAsync: vi.fn(async () => {}),
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  deleteAsync: vi.fn(),
  readDirectoryAsync: vi.fn(async () => []),
}));

import {
  DuplicateFingerprintError,
  InvalidLabelError,
  RotatedAwayError,
  SameKeyError,
} from "@/src/contacts/contacts-store";
import { canAddContact, pasteContactError } from "@/src/contacts/paste-contact-error";

// Pure gate + error→copy mapping for the Paste-public-key screen (node-tested, no renderer).
const VALID_LOOKING_KEY = "amk1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("canAddContact", () => {
  it("requires a non-empty (trimmed) name", () => {
    expect(canAddContact(VALID_LOOKING_KEY, "")).toBe(false);
    expect(canAddContact(VALID_LOOKING_KEY, "   ")).toBe(false);
  });

  it("requires a key that at least looks like a public key", () => {
    expect(canAddContact("nope", "Alice")).toBe(false);
    expect(canAddContact(VALID_LOOKING_KEY, "Alice")).toBe(true);
  });
});

describe("pasteContactError", () => {
  it("maps InvalidFormatError to the malformed-key copy", () => {
    expect(pasteContactError(new InvalidFormatError("bad"))).toMatch(/valid aesmsg public key/i);
  });

  it("names the existing contact for a current duplicate", () => {
    const e = new DuplicateFingerprintError("dup", {
      existingId: "1",
      existingLabel: "Elena",
      reason: "current",
    });
    expect(pasteContactError(e)).toBe('This key is already saved as "Elena".');
  });

  it("frames a rotated-away (previous) duplicate as a rotation", () => {
    const e = new DuplicateFingerprintError("dup", {
      existingId: "1",
      existingLabel: "Marcus",
      reason: "previous",
    });
    expect(pasteContactError(e)).toBe('This key was rotated away by "Marcus".');
  });

  it("maps InvalidLabelError to the name prompt", () => {
    expect(pasteContactError(new InvalidLabelError("x"))).toMatch(/enter a name/i);
  });

  it("frames a re-key that matched the current key (SameKeyError) as a no-op", () => {
    expect(pasteContactError(new SameKeyError("same"))).toMatch(
      /already this contact's current key/i,
    );
  });

  it("frames a re-key to a previously abandoned key (RotatedAwayError)", () => {
    expect(pasteContactError(new RotatedAwayError("rotated"))).toMatch(
      /previously rotated away from this contact/i,
    );
  });

  it("falls back for unknown errors", () => {
    expect(pasteContactError(new Error("boom"))).toMatch(/couldn't add this contact/i);
  });
});
