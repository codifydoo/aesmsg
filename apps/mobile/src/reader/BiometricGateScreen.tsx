import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, Button, Fingerprint, Icon, RowCard } from "@/src/components";
import { colors, type } from "@/src/theme";

// 25 · Biometric Unlock Gate (grp-reader S_BioGate) — the Face-ID-before-decrypt prompt, now WIRED
// (FE-1 / R5). It guards the LOCAL decrypt of an already-opened (held) message: `onAuthenticate`
// runs the real biometric prompt + decrypt (supplied by ReaderFlow via runDecryptGate) and must
// RESOLVE on success (the parent then transitions to the decrypting/reader surface and unmounts us)
// and REJECT on cancel/failure. On rejection we STAY gated so the recipient can retry — the open was
// already consumed exactly once and its ciphertext is held by open-coordinator, so a retry costs no
// additional open. The biometric call itself lives outside this screen (the caller owns it); this
// screen owns only the busy / error / retry UI, mirroring keys/GateScreens.tsx.
//
// `unavailable` mode: the setting is on but the device can no longer prompt — we show honest copy
// and only a safe exit, NEVER a Decrypt button that could never succeed.
//
// COPY: reinforces "your private key never leaves this device". The scrim is a token-styled opaque
// overlay (no expo-blur dep) — a real blur is a follow-up.
export interface BiometricGateScreenProps {
  /**
   * Runs the biometric prompt then the local decrypt. Resolves on success, throws on cancel/fail.
   * Optional so `unavailable` mode (no prompt possible) can omit it.
   */
  onAuthenticate?: () => Promise<void> | void;
  /** Back to safety — dismiss the reader without decrypting. */
  onCancel?: () => void;
  /** True when a biometric prompt cannot run on this device: show honest copy, hide Decrypt. */
  unavailable?: boolean;
  /** Honest instruction shown in `unavailable` mode. */
  unavailableHint?: string;
  /** Recipient display name (the local user / contact label). Optional. */
  name?: string;
  /** The recipient's own truncated fingerprint (e.g. "A1B2 C3D4"). Optional. */
  fingerprint?: string;
  /** Whether the shown identity is verified (drives the green check). */
  verified?: boolean;
}

export function BiometricGateScreen({
  onAuthenticate,
  onCancel,
  unavailable = false,
  unavailableHint,
  name,
  fingerprint,
  verified = false,
}: BiometricGateScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy || !onAuthenticate) return;
    setBusy(true);
    setError(null);
    try {
      await onAuthenticate();
      // Success → the parent transitions off the gate (to the decrypting/reader surface) and
      // unmounts us; intentionally leave `busy` true so there is no button flicker before unmount.
    } catch {
      // Cancelled / failed biometric — stay gated so the recipient can retry. The already-consumed
      // open is held by open-coordinator, so retrying the prompt costs no additional open.
      setError("Couldn't verify. Try again.");
      setBusy(false);
    }
  };

  const showIdentity = !unavailable && (name != null || fingerprint != null);

  return (
    <View style={styles.root}>
      <View style={styles.scrim} />

      <View style={styles.sheet}>
        <View style={styles.grip} />

        <View style={styles.medallion}>
          <Icon name="lock" size={34} fill color={colors.primary} />
        </View>

        <Text style={styles.title}>Unlock to decrypt on this device</Text>
        <Text style={styles.body}>
          {unavailable
            ? (unavailableHint ?? "Biometric unlock isn't available on this device right now.")
            : "Your private key never leaves this device."}
        </Text>

        {showIdentity ? (
          <RowCard style={styles.idRow}>
            <Avatar initials={name ?? "?"} size={34} />
            <View style={styles.idMain}>
              {name ? <Text style={styles.idName}>{name}</Text> : null}
              {fingerprint ? <Fingerprint groups={fingerprint} /> : null}
            </View>
            {verified ? (
              <Icon
                name="verified"
                size={18}
                fill
                color={colors.emerald}
                accessibilityLabel="Verified"
              />
            ) : null}
          </RowCard>
        ) : null}

        {unavailable ? null : (
          <Button icon="face" onPress={run} disabled={busy}>
            Decrypt
          </Button>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {onCancel ? (
          <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>{unavailable ? "Close" : "Cancel"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,13,19,0.72)",
  },
  sheet: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.outlineVariant,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 22,
    paddingBottom: 30,
    alignItems: "center",
    gap: 14,
  },
  grip: {
    width: 36,
    height: 4,
    borderRadius: 9999,
    backgroundColor: colors.outline,
    opacity: 0.6,
    marginBottom: 6,
  },
  medallion: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.h2, color: colors.onSurface, textAlign: "center" },
  body: { ...type.body, color: colors.onSurfaceVariant, textAlign: "center" },
  // RowCard supplies the surface / border / radius / padding / row layout; only the width is local.
  // (RowCard's default gap is 14; the avatar+text spacing difference is negligible here.)
  idRow: { width: "100%" },
  idMain: { flex: 1, gap: 6 },
  idName: { ...type.body, color: colors.onSurface, fontWeight: "600" },
  // amber (not red): a retry-able "not yet verified" state, never a destructive one (color semantics).
  error: { ...type.body, color: colors.amber, textAlign: "center" },
  link: { ...type.body, color: colors.primary, fontWeight: "500", marginTop: 2 },
});
