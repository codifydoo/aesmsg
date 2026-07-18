import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Icon, KeyboardAvoider, Screen } from "@/src/components";
import { colors, fonts } from "@/src/theme";
import { matchesWipeConfirm, WIPE_CONFIRM_WORD } from "./wipe-confirm";

// Screen 43 — Wipe Identity Confirm (design: grp-keys.jsx S_WipeConfirm).
// The full-screen confirmation for permanently deleting the device's private key. A type-to-confirm
// gate (the user must type "WIPE") arms the single RED destructive action. Copy is plain about the
// NO-RECOVERY-BY-DESIGN consequence — messages sealed to this key become unrecoverable here, with no
// backup and no recovery — and offers NO false reassurance, matching the security model.
//
// The design renders this as a bottom sheet; per the kit contract it is built here as a full screen
// so Integration can surface it from Keys and/or Settings (there is already a Settings WipeConfirmModal;
// Integration decides which presentation to wire where).
//
// PRESENTATIONAL: this screen does NOT perform the wipe. Wiring `onWipe` to the actual private-key
// deletion (clear the device-held key + dependent state) is owned by src/identity / src/settings and
// is wired by Integration — not this screen.

export interface WipeIdentityScreenProps {
  /** The key's short fingerprint (mono), so the user wipes a clearly-identified key. */
  fingerprint?: string;
  /** Confirmed wipe (only reachable once the user typed the confirm word). Wiring is a follow-up. */
  onWipe?: () => void;
  /** Backed out without wiping. */
  onCancel?: () => void;
}

// No-op default so optional handlers satisfy the kit's required-callback props under
// exactOptionalPropertyTypes without threading `undefined` through.
const noop = () => {};

export function WipeIdentityScreen({
  fingerprint = "",
  onWipe,
  onCancel,
}: WipeIdentityScreenProps) {
  const [confirm, setConfirm] = useState("");
  const armed = matchesWipeConfirm(confirm);

  return (
    <KeyboardAvoider>
      <Screen scroll={false} contentStyle={styles.content}>
        <View style={styles.center}>
          {/* Red error-tinted warning disc — destructive treatment from the design's wipe sheet. */}
          <View style={styles.iconDisc}>
            <Icon name="warning" size={26} color={colors.error} />
          </View>

          <Text style={styles.title}>Wipe this private key?</Text>
          <Text style={styles.body}>
            This permanently deletes your private key from this device. Messages encrypted to it
            become unrecoverable here. There is no backup and no recovery — this is by design.
          </Text>

          {/* The key being wiped, identified by its mono fingerprint (mono reserved for keys/fps/links). */}
          <Text style={styles.fingerprint} selectable>
            {fingerprint}
          </Text>

          <View style={styles.confirmBlock}>
            <Text style={styles.confirmLabel}>Type {WIPE_CONFIRM_WORD} to confirm</Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder={WIPE_CONFIRM_WORD}
              placeholderTextColor={colors.outline}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={`Type ${WIPE_CONFIRM_WORD} to confirm`}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            kind="danger"
            icon="delete_forever"
            disabled={!armed}
            onPress={() => {
              setConfirm("");
              onWipe?.();
            }}
          >
            Wipe private key
          </Button>
          <Button
            kind="ghost"
            onPress={() => {
              setConfirm("");
              (onCancel ?? noop)();
            }}
          >
            Cancel
          </Button>
        </View>
      </Screen>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "space-between" },
  center: { flex: 1, justifyContent: "center", alignItems: "stretch", gap: 0 },
  // 56px round error-container disc with the warning glyph (design's wipe-sheet header).
  iconDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.errorContainer,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.24,
    color: colors.onSurface,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 14,
  },
  fingerprint: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 0.52, // 0.04em * 13
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginBottom: 14,
  },
  confirmBlock: { gap: 8 },
  confirmLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.onSurfaceVariant,
  },
  // The confirm input uses mono because the user types the literal token (and to echo the design's
  // mono confirm cell). surface-container-highest bg + outline-variant border per the design.
  input: {
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontFamily: fonts.mono,
    fontSize: 14,
    letterSpacing: 0.5,
    color: colors.onSurface,
  },
  actions: { gap: 10 },
});
