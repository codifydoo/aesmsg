import QRCode from "qrcode";

// Pure helper: encode `text` into a QR symbol and return its module matrix as a boolean grid
// (row-major, true = dark module). Direct port of apps/mobile/src/keys/qr-matrix.ts — SAME library,
// SAME error-correction level ("M"), SAME input (the raw amk1: public-key string), so the web QR is
// byte-for-byte format-compatible with the mobile QR by construction (D1/D2).
//
// The web renders this matrix as an inline SVG <rect> grid (QrCode.tsx) — not toCanvas/toDataURL —
// so there is no canvas dependency for display and the SVG is inert DOM (no CSP surface).
//
// A bad/oversized input throws (the caller catches and renders nothing).
export function toQrMatrix(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const grid: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const cells: boolean[] = [];
    for (let col = 0; col < size; col++) {
      cells.push(qr.modules.get(row, col) === 1);
    }
    grid.push(cells);
  }
  return grid;
}
