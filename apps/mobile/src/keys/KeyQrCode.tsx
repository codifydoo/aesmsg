import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { toQrMatrix } from "./qr-matrix";

// Renders a public key (or fingerprint) as a scannable QR code on a white quiet-zone frame. Extracted
// so both My-Public-Key (40) and Rotate-Success can show a scannable key without duplicating the
// matrix rendering. The matrix computation is pure + synchronous (toQrMatrix); a bad value renders
// nothing rather than throwing.

export interface KeyQrCodeProps {
  value: string;
  /** Total on-screen QR edge in px; module size is derived so the grid stays crisp at any version. */
  size?: number;
}

export function KeyQrCode({ value, size = 150 }: KeyQrCodeProps) {
  const matrix = useMemo(() => {
    try {
      return toQrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix || matrix.length === 0) return null;
  const cell = size / matrix.length;

  return (
    <View accessibilityLabel="Public-key QR code" style={styles.frame}>
      <View style={styles.grid}>
        {matrix.map((row, r) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows of a fixed QR matrix are positional and stable
          <View key={r} style={styles.row}>
            {row.map((dark, c) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: cells of a fixed QR matrix are positional and stable
                key={c}
                style={{
                  width: cell,
                  height: cell,
                  backgroundColor: dark ? "#000000" : "#ffffff",
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // White quiet-zone frame so the QR scans reliably against the dark surface.
  frame: { backgroundColor: "#ffffff", padding: 12, borderRadius: 12 },
  grid: { flexDirection: "column" },
  row: { flexDirection: "row" },
});
