import { exportPublicKey, generateIdentity } from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAcceptableScan } from "@/src/contacts/scanned-key";
import { decodeImageData } from "@/src/lib/qr-decode";
import { rasterizeValue } from "@/tests/helpers/rasterize";

// A representative mobile-shaped public key, captured from the real @aesmsg/crypto identity generator
// (exportPublicKey). Mobile encodes exactly this string into its QR (D1), so a round-trip through the
// web encode+decode proving it reproduces this fixture is the cross-surface interop assertion: a web
// QR of this value scans to itself, and a mobile QR of an amk1: key decodes the same way.
const MOBILE_FIXTURE = "amk1:AQFUWXYVGB1oAIlDTPXjHe4bJbetS2ZM5OqCV_9MFdDhdg";

describe("QR round-trip (encode → rasterize → decode)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a web-encoded QR of a real key decodes back to the exact amk1: string", async () => {
    const pk = exportPublicKey(await generateIdentity());
    const { data, width, height } = rasterizeValue(pk);
    expect(decodeImageData(data, width, height)).toBe(pk);
  });

  it("the mobile-format fixture encodes then decodes to itself and passes the scan gate", () => {
    const { data, width, height } = rasterizeValue(MOBILE_FIXTURE);
    expect(decodeImageData(data, width, height)).toBe(MOBILE_FIXTURE);
    expect(isAcceptableScan(MOBILE_FIXTURE)).toBe(true);
  });

  it("performs the encode/decode entirely offline — fetch is never called", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { data, width, height } = rasterizeValue(MOBILE_FIXTURE);
    const decoded = decodeImageData(data, width, height);
    expect(decoded).toBe(MOBILE_FIXTURE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
