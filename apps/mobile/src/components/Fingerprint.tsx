import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { chunkFingerprint } from "@/src/components/fingerprint-format";
import { colors, fonts } from "@/src/theme";

// Fingerprint — JetBrains-mono block for a fingerprint or public key. Mirrors the design's `.fp`
// (aesmsg.css): mono 13 / 0.04em, surface-container-lowest bg, 1px outline-variant border,
// radius 8, padding 12/14, line-height 1.7. Pass `groups` (a raw or pre-spaced string — it gets
// re-chunked into 4-char groups) or arbitrary `children` (rendered verbatim, e.g. a multi-line key).
//
// Mono styling is reserved for fingerprints / public keys / secure links — never general UI text.

export interface FingerprintProps {
  groups?: string;
  children?: ReactNode;
}

export function Fingerprint({ groups, children }: FingerprintProps) {
  const content = children ?? (groups !== undefined ? chunkFingerprint(groups) : "");
  return (
    <Text style={styles.fp} selectable>
      {content}
    </Text>
  );
}

const styles = StyleSheet.create({
  fp: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 0.52, // 0.04em * 13
    lineHeight: 22, // ~1.7
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
