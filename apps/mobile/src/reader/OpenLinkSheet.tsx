import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Field, Icon } from "@/src/components";
import { parsePastedLink } from "@/src/navigation/parse-link-id";
import { colors, type } from "@/src/theme";

// Open-a-link entry sheet. The reader decrypt engine already exists (ReaderFlow); this is purely an
// in-app way to REACH it without an OS deep link. On open it reads the clipboard once and, if it
// holds an aesmsg link, pre-fills the field (a convenience — the user still confirms). Only a
// link POINTER is handled here; no key/ciphertext/plaintext. The clipboard is read, never written.
//
// Built entirely from existing kit (BottomSheet / Field / Button / Icon), mirroring
// RecipientPickerSheet — no new visual primitives.

export interface OpenLinkSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with a validated canonical link id; the parent routes it into ReaderFlow. */
  onSubmit: (id: string) => void;
  /** Injected for tests; defaults to the device clipboard. */
  readClipboard?: () => Promise<string>;
}

export function OpenLinkSheet({ visible, onClose, onSubmit, readClipboard }: OpenLinkSheetProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  // On open: clear prior state, then try to pre-fill from the clipboard. On close: reset.
  useEffect(() => {
    if (!visible) {
      setValue("");
      setError(null);
      setDetected(false);
      return;
    }
    let cancelled = false;
    const read = readClipboard ?? (() => Clipboard.getStringAsync());
    void read()
      .then((text) => {
        const id = parsePastedLink(text ?? "");
        if (!cancelled && id) {
          setValue((text ?? "").trim());
          setDetected(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, readClipboard]);

  function open() {
    const id = parsePastedLink(value);
    if (!id) {
      setError("That doesn't look like an aesmsg link.");
      return;
    }
    onSubmit(id);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.heading} accessibilityRole="header">
        Open a secure link
      </Text>
      <Text style={styles.body}>
        Paste an aesmsg link or its id. It opens here and is decrypted on this device.
      </Text>

      <Field
        mono
        placeholder="https://…/l/… or the link id"
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setError(null);
          setDetected(false);
        }}
      />

      {detected && (
        <View style={styles.hint}>
          <Icon name="content_paste" size={16} color={colors.emerald} />
          <Text style={styles.hintText}>Detected a secure link from your clipboard.</Text>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <Button
        icon="lock_open"
        disabled={value.trim().length === 0}
        onPress={open}
        style={styles.cta}
      >
        Open
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.h2, color: colors.onSurface, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: colors.onSurfaceVariant, marginBottom: 16 },
  hint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  hintText: { fontSize: 13, color: colors.emerald, flex: 1 },
  error: { fontSize: 13, color: colors.error, marginTop: 10 },
  cta: { marginTop: 16 },
});
