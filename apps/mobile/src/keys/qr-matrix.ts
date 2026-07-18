import QRCode from "qrcode";

// Pure helper: encode `text` into a QR symbol and return its module matrix as a boolean grid
// (row-major, true = dark module). Rendering this as a grid of small RN <View>s avoids
// react-native-svg / any native module — there is no native rebuild. The web app renders the
// same public-key string via QrCodePreview (SVG); this is the RN-friendly equivalent.
//
// Error correction level "M" matches the web QrCodePreview so the two produce visually
// equivalent codes for the same input.
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
