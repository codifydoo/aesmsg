import { toQrMatrix } from "@/src/lib/qr-encode";

// Test helper (NOT a test file — excluded from the vitest include glob). Rasterizes a QR module
// matrix into an RGBA ImageData-shaped buffer so the pure jsQR decode path (decodeImageData) can be
// exercised without a camera: each module becomes a `scale`×`scale` block on a white quiet zone,
// dark modules → [0,0,0,255], light → [255,255,255,255]. This is exactly what the camera loop feeds
// jsQR (a canvas getImageData sample), minus the camera.

export interface RasterizedQr {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

export function rasterizeMatrix(matrix: boolean[][], scale = 8, quiet = 4): RasterizedQr {
  const modules = matrix.length + quiet * 2;
  const size = modules * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  // Start all-white.
  data.fill(255);
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (!row[c]) continue;
      const x0 = (c + quiet) * scale;
      const y0 = (r + quiet) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const idx = ((y0 + dy) * size + (x0 + dx)) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        }
      }
    }
  }
  return { data, width: size, height: size };
}

/** Encode `value` to a QR and rasterize it in one step. */
export function rasterizeValue(value: string, scale = 8, quiet = 4): RasterizedQr {
  return rasterizeMatrix(toQrMatrix(value), scale, quiet);
}
