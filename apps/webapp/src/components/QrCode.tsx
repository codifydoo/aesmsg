"use client";

import { useMemo } from "react";
import { toQrMatrix } from "@/src/lib/qr-encode";

export interface QrCodeProps {
  /** The value to encode — for aesmsg this is the raw `amk1:` public-key string (D1). */
  value: string;
  /** Total on-screen edge in px. The module size is derived so the grid stays crisp at any version. */
  size?: number;
}

// Standard QR quiet zone (4 modules) so the code scans reliably against the app's dark surface.
const QUIET = 4;

/**
 * Render a value (a public key) as a scannable QR code, drawn as a single inline <svg> `<rect>` grid
 * on a white quiet-zone frame — mirroring mobile's KeyQrCode. Inline SVG ONLY: no <canvas>, no
 * data-URL, no <img>, so it is inert DOM with no CSP surface (D3). The matrix is computed in a memo
 * under try/catch; a bad value renders nothing rather than throwing.
 */
export function QrCode({ value, size = 176 }: QrCodeProps) {
  const matrix = useMemo(() => {
    if (value.length === 0) return null;
    try {
      return toQrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix || matrix.length === 0) return null;

  const modules = matrix.length + QUIET * 2;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (row[c]) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={c + QUIET}
            y={r + QUIET}
            width={1}
            height={1}
            fill="#000000"
          />,
        );
      }
    }
  }

  return (
    <svg
      role="img"
      aria-label="Public-key QR code"
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      className="rounded-xl"
    >
      <rect x={0} y={0} width={modules} height={modules} fill="#ffffff" />
      {rects}
    </svg>
  );
}
