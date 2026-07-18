import { describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/index.js";
import {
  DecryptionError,
  decodePayload,
  encodePayload,
  exportPublicKey,
  generateIdentity,
  importPublicKey,
  open,
  seal,
} from "../src/index.js";

describe("seal/open with MessageBindingContext", () => {
  it("roundtrips when the same context is used on both sides", async () => {
    const recipient = await generateIdentity();
    const recipientPk = exportPublicKey(recipient);
    const recipientPub = await importPublicKey(recipientPk);

    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: recipientPk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };

    const plaintext = new TextEncoder().encode("hello bound world");
    const ct = await seal(plaintext, recipientPub, ctx);
    const out = await open(ct, recipient, ctx);
    expect(new TextDecoder().decode(out)).toBe("hello bound world");
  });

  it("seals an attachment envelope and recovers text + file bytes", async () => {
    const recipient = await generateIdentity();
    const recipientPk = exportPublicKey(recipient);
    const recipientPub = await importPublicKey(recipientPk);

    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: recipientPk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };

    const fileBytes = new Uint8Array([0, 1, 2, 255, 1, 1]);
    const envelope = encodePayload({
      text: "see attached",
      attachments: [
        { filename: "secret.bin", mimetype: "application/octet-stream", bytes: fileBytes },
      ],
    });

    const ct = await seal(envelope, recipientPub, ctx);
    const decoded = decodePayload(await open(ct, recipient, ctx));
    expect(decoded.text).toBe("see attached");
    expect(decoded.attachments[0]?.filename).toBe("secret.bin");
    expect(Array.from(decoded.attachments[0]?.bytes ?? [])).toEqual([0, 1, 2, 255, 1, 1]);
  });

  it("fails to open when a byte of the sealed attachment blob is tampered", async () => {
    const recipient = await generateIdentity();
    const recipientPk = exportPublicKey(recipient);
    const recipientPub = await importPublicKey(recipientPk);

    const ctx: MessageBindingContext = {
      linkId: "abcdefghij012345",
      recipientPublicKey: recipientPk,
      createdAtMs: 1_700_000_000_000,
      expiresAtMs: 1_700_086_400_000,
      maxOpens: 3,
    };

    const envelope = encodePayload({
      text: "",
      attachments: [
        {
          filename: "f",
          mimetype: "application/octet-stream",
          bytes: new Uint8Array([9, 9, 9, 9]),
        },
      ],
    });
    const ct = await seal(envelope, recipientPub, ctx);
    // Flip a byte near the end (inside the AEAD output covering the attachment bytes).
    const tampered = new Uint8Array(ct as unknown as Uint8Array);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0x01;
    await expect(open(tampered as unknown as typeof ct, recipient, ctx)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });
});
