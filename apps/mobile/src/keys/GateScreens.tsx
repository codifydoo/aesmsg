import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { gateErrorMessage } from "@/src/keys/gate-error";
import { colors } from "@/src/theme";

function ActionScreen({
  title,
  body,
  cta,
  onPress,
}: {
  title: string;
  body: string;
  cta: string;
  onPress: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onPress();
    } catch (e) {
      setError(gateErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={run} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>{cta}</Text>
        )}
      </Pressable>
    </View>
  );
}

export function SetupScreen({ onSetup }: { onSetup: () => Promise<void> }) {
  return (
    <ActionScreen
      title="Create your identity"
      body="A keypair is generated on this device and protected by your biometrics. Your private key never leaves the device."
      cta="Create identity"
      onPress={onSetup}
    />
  );
}

export function UnlockScreen({ onUnlock }: { onUnlock: () => Promise<void> }) {
  return (
    <ActionScreen
      title="Unlock aesmsg"
      body="Authenticate to unlock your private key for this session."
      cta="Unlock with biometrics"
      onPress={onUnlock}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: "center",
    gap: 16,
  },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "600", textAlign: "center" },
  body: { color: colors.onSurfaceVariant, textAlign: "center" },
  error: { color: colors.error, textAlign: "center" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: colors.onPrimary, fontWeight: "600", fontSize: 16 },
});
