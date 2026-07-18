import { decodePayload, encodePayload } from "@aesmsg/crypto";
import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, bytesToBase64Url } from "@/src/lib/base64";

describe("mobile base64", () => {
  it("round-trips arbitrary bytes incl. 0x00 / 0xff", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64, 0, 0x01]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("decodes what the web app's btoa encoding produces", () => {
    // "hi" → "aGk="
    expect(Array.from(base64ToBytes("aGk="))).toEqual([0x68, 0x69]);
  });

  it("carries a payload envelope through base64 (shape the reader relies on)", () => {
    const envelope = encodePayload({
      text: "mobile round trip",
      attachments: [
        { filename: "f.bin", mimetype: "application/octet-stream", bytes: new Uint8Array([9, 9]) },
      ],
    });
    const decoded = decodePayload(base64ToBytes(bytesToBase64(envelope)));
    expect(decoded.text).toBe("mobile round trip");
    expect(decoded.attachments[0]?.filename).toBe("f.bin");
    expect(Array.from(decoded.attachments[0]?.bytes ?? [])).toEqual([9, 9]);
  });
});

describe("bytesToBase64Url", () => {
  it("encodes 12 bytes to 16 url-safe chars with no padding", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const out = bytesToBase64Url(bytes);
    expect(out).toMatch(/^[A-Za-z0-9_-]{16}$/); // no +, /, or =
    expect(out).not.toMatch(/[+/=]/);
  });
});
