import { describe, expect, it } from "vitest";
import type { Contact } from "@/src/contacts/contacts-data";
import {
  contactRecipient,
  isChangedContactRecipient,
  looksLikePublicKey,
  type Recipient,
  recipientLabel,
  recipientPublicKeyString,
  seedComposeRecipient,
} from "@/src/create/recipient";

const contact: Contact = {
  id: "elena",
  name: "Elena Rodriguez",
  fingerprint: "A1B2 C3D4",
  status: "verified",
};

const PK = "MCowBQYDK2VuAyEA1234567890abcdef";

describe("recipientLabel", () => {
  it("returns a placeholder when nothing is picked", () => {
    expect(recipientLabel(null)).toBe("Select recipient");
  });
  it("returns the contact name for a contact recipient", () => {
    expect(recipientLabel({ kind: "contact", contact })).toBe("Elena Rodriguez");
  });
  it("labels a pasted key recipient", () => {
    expect(recipientLabel({ kind: "pasted", publicKeyString: "abc" })).toBe("Pasted public key");
  });
});

describe("recipientPublicKeyString", () => {
  it("is null for no recipient", () => {
    expect(recipientPublicKeyString(null)).toBeNull();
  });

  it("returns the contact's stored public key (contacts now carry real key material)", () => {
    const r: Recipient = {
      kind: "contact",
      contact,
      publicKeyString: "  MCowBQYDK2VuAyEA1234567890abcdef  ",
    };
    expect(recipientPublicKeyString(r)).toBe("MCowBQYDK2VuAyEA1234567890abcdef");
  });

  it("is null for a contact recipient with only whitespace key (defensive)", () => {
    const r: Recipient = { kind: "contact", contact, publicKeyString: "   " };
    expect(recipientPublicKeyString(r)).toBeNull();
  });

  it("returns the trimmed key for a pasted recipient", () => {
    const r: Recipient = { kind: "pasted", publicKeyString: "  KEYDATA1234567890  " };
    expect(recipientPublicKeyString(r)).toBe("KEYDATA1234567890");
  });

  it("is null for a pasted recipient with only whitespace", () => {
    expect(recipientPublicKeyString({ kind: "pasted", publicKeyString: "   " })).toBeNull();
  });
});

describe("looksLikePublicKey", () => {
  it("rejects short / empty input", () => {
    expect(looksLikePublicKey("")).toBe(false);
    expect(looksLikePublicKey("short")).toBe(false);
  });

  it("rejects obvious junk with disallowed punctuation", () => {
    expect(looksLikePublicKey("not a key!! <script>@@@")).toBe(false);
  });

  it("accepts base64 / base64url-looking key text", () => {
    expect(looksLikePublicKey("MCowBQYDK2VuAyEA1234567890abcdef==")).toBe(true);
    expect(looksLikePublicKey("abcdEFGH-_1234567890abcd")).toBe(true);
  });

  it("accepts PEM-ish text with markers", () => {
    expect(looksLikePublicKey("-----BEGIN PUBLIC KEY----- AAAA1234 -----END-----")).toBe(true);
  });
});

describe("contactRecipient", () => {
  it("pairs a contact view-model with its real public key (same shape the picker produces)", () => {
    const r = contactRecipient(contact, PK);
    expect(r).toEqual({ kind: "contact", contact, publicKeyString: PK });
    // Must feed the existing seal contract unchanged.
    expect(recipientPublicKeyString(r)).toBe(PK);
    expect(recipientLabel(r)).toBe("Elena Rodriguez");
  });
});

describe("isChangedContactRecipient", () => {
  it("is true only for a contact whose key changed", () => {
    expect(isChangedContactRecipient(contactRecipient({ ...contact, status: "changed" }, PK))).toBe(
      true,
    );
  });
  it("is false for a verified or unverified contact", () => {
    expect(isChangedContactRecipient(contactRecipient(contact, PK))).toBe(false);
    expect(
      isChangedContactRecipient(contactRecipient({ ...contact, status: "unverified" }, PK)),
    ).toBe(false);
  });
  it("is false for a pasted key", () => {
    expect(isChangedContactRecipient({ kind: "pasted", publicKeyString: PK })).toBe(false);
  });

  it("a changed contact carries the REAL previous fingerprint the compose warning renders", () => {
    // A key-changed contact (post-updateContactKey: verified=false, non-empty rotation history) is
    // adapted with a real `previousFingerprint`; the compose Key-Changed warning reads exactly that
    // field, so the flag and the displayed prior fingerprint come from the same real state.
    const changed = contactRecipient(
      { ...contact, status: "changed", fingerprint: "F7C1 22D9", previousFingerprint: "8A2B 4F1C" },
      PK,
    );
    expect(isChangedContactRecipient(changed)).toBe(true);
    expect(changed.contact.previousFingerprint).toBe("8A2B 4F1C");
    expect(changed.contact.previousFingerprint).not.toBe(changed.contact.fingerprint);
  });
});

describe("seedComposeRecipient", () => {
  it("seeds nothing when no recipient is pre-selected", () => {
    expect(seedComposeRecipient(undefined)).toEqual({ recipient: null, keyChanged: undefined });
  });

  it("adopts a verified contact directly as the active recipient", () => {
    const r = contactRecipient(contact, PK);
    expect(seedComposeRecipient(r)).toEqual({ recipient: r, keyChanged: undefined });
  });

  it("adopts a pasted key directly", () => {
    const r: Recipient = { kind: "pasted", publicKeyString: PK };
    expect(seedComposeRecipient(r)).toEqual({ recipient: r, keyChanged: undefined });
  });

  it("holds a changed-key contact behind the key-changed warning instead of adopting it", () => {
    const r = contactRecipient({ ...contact, status: "changed" }, PK);
    // recipient stays null (not sealed to) until the user clears the MitM warning.
    expect(seedComposeRecipient(r)).toEqual({ recipient: null, keyChanged: r });
  });
});
