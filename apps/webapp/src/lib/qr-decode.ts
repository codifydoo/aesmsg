import jsQR from "jsqr";

// Pure, offline QR decode. `data` is RGBA pixel data (a `<canvas>` `getImageData().data`, or a
// rasterized matrix in tests). jsQR is a pure-JS decoder — no network, no eval, no wasm — so it runs
// under the SP1 strict CSP unchanged and works in the headless Chromium the tests use (D2/D3).
// Returns the decoded text, or null when no QR is found.
export function decodeImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  return jsQR(data, width, height)?.data ?? null;
}
