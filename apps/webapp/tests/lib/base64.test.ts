import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, bytesToBase64Url } from "@/src/lib/base64";

describe("base64", () => {
  it("round-trips arbitrary bytes through standard base64", () => {
    const cases: Uint8Array[] = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0, 255, 128, 1, 2, 3]),
      new Uint8Array([255, 254, 253, 252, 251]),
    ];
    for (const bytes of cases) {
      const round = base64ToBytes(bytesToBase64(bytes));
      expect([...round]).toEqual([...bytes]);
    }
  });

  it("round-trips a large buffer (exercises the chunked encoder)", () => {
    // Larger than the 32 KiB encode chunk; a deterministic fill avoids getRandomValues' 64 KiB cap.
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    const round = base64ToBytes(bytesToBase64(bytes));
    expect(round.length).toBe(bytes.length);
    expect([...round.subarray(0, 64)]).toEqual([...bytes.subarray(0, 64)]);
    expect([...round.subarray(round.length - 64)]).toEqual([...bytes.subarray(bytes.length - 64)]);
  });

  it("emits padded standard base64 the server can decode (only [A-Za-z0-9+/=])", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(97));
    const encoded = bytesToBase64(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
  });

  it("bytesToBase64Url emits no +, /, or = characters", () => {
    for (let i = 0; i < 50; i++) {
      const encoded = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(1 + i)));
      expect(encoded).not.toMatch(/[+/=]/);
    }
  });

  it("base64ToBytes decodes the url-safe variant too", () => {
    const bytes = new Uint8Array([251, 255, 191, 0, 63]);
    const url = bytesToBase64Url(bytes);
    expect([...base64ToBytes(url)]).toEqual([...bytes]);
  });
});
