import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { AppBar, ListGroup, ListRow, Screen, SectionLabel } from "@/src/components";
import { AppLockTimeoutSheet } from "@/src/settings/AppLockTimeoutSheet";
import { SwitchRow } from "@/src/settings/SwitchRow";
import { useSettings } from "@/src/settings/settings-context";
import {
  appLockTimeoutLabel,
  clipboardFillFraction,
  clipboardSecondsForX,
  formatClipboardClear,
} from "@/src/settings/settings-format";
import { colors, fonts, radii } from "@/src/theme";

// 46 · Security Settings. Now reads/writes the persisted SettingsRecord via useSettings — toggles and
// the clipboard slider are real, persisted preferences (no local useState). Behaviors they name are
// wired elsewhere this slice: appLockTimeout -> identity auto-lock, blur/blockScreens -> privacy
// shield, clipboardClearSeconds + autoWipe -> reader. "Biometric unlock" is reflected but is NOT a
// true on/off this slice (the gate cannot be disabled without the deferred passphrase fallback), so
// it carries an honest sub-label.

export interface SecuritySettingsScreenProps {
  onBack?: (() => void) | undefined;
}

const noop = () => {};

export function SecuritySettingsScreen({ onBack }: SecuritySettingsScreenProps) {
  const { settings, update } = useSettings();

  const [timeoutOpen, setTimeoutOpen] = useState(false);

  // Live slider value: while dragging we preview from local `dragSeconds` (cheap, screen-local
  // re-render); otherwise we show the persisted value. The committed value is only written ONCE on
  // release — not on every move — so a single drag no longer fires a storm of encrypted-store writes
  // (and app-wide settings re-renders) at one per pixel.
  const committedSeconds = settings.clipboardClearSeconds;
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);
  const clearSeconds = dragSeconds ?? committedSeconds;
  const fillPct: `${number}%` = `${Math.round(clipboardFillFraction(clearSeconds) * 100)}%`;
  const trackWidth = useRef(0);
  const dragSecondsRef = useRef<number | null>(null);

  // Interactive slider: map a horizontal drag/tap x-position over the measured track width into the
  // [10,90] range. Handlers close over `update` + the refs/state setter (all stable), so the
  // PanResponder is created once and never recreated.
  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers use stable refs/update; PanResponder must not be recreated on every render
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => previewAtX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => previewAtX(e.nativeEvent.locationX),
        onPanResponderRelease: commitDrag,
        onPanResponderTerminate: commitDrag,
      }),
    [],
  );

  // During the gesture: preview only (local state), never persist.
  function previewAtX(x: number) {
    const seconds = clipboardSecondsForX(x, trackWidth.current);
    if (seconds === null) return;
    dragSecondsRef.current = seconds;
    setDragSeconds(seconds);
  }

  // On release/terminate: persist the final value ONCE, then drop the local preview. Persisting
  // before clearing dragSeconds keeps the rendered value continuous (no fall-back-to-old-value frame).
  function commitDrag() {
    const seconds = dragSecondsRef.current;
    dragSecondsRef.current = null;
    if (seconds !== null) update({ clipboardClearSeconds: seconds });
    setDragSeconds(null);
  }

  return (
    <>
      <Screen topInset={false}>
        <AppBar title="Settings & Security" onLeading={onBack ?? noop} />

        <View style={styles.stack}>
          <View>
            <SectionLabel>Unlock</SectionLabel>
            <ListGroup>
              <SwitchRow
                icon="fingerprint"
                title="Biometric unlock"
                sub="Always on this device — disabling needs a passphrase fallback (coming soon)."
                value={settings.biometric}
                onValueChange={(v) => update({ biometric: v })}
              />
              <SwitchRow
                icon="lock"
                title="Require unlock before decrypting"
                sub="Ask for biometrics every time."
                value={settings.requireUnlock}
                onValueChange={(v) => update({ requireUnlock: v })}
              />
              <ListRow
                title="App-lock timeout"
                sub="Re-lock after inactivity"
                value={appLockTimeoutLabel(settings.appLockTimeout)}
                onPress={() => setTimeoutOpen(true)}
              />
            </ListGroup>
          </View>

          <View>
            <SectionLabel>On-screen protection</SectionLabel>
            <ListGroup>
              <SwitchRow
                icon="blur_on"
                title="Blur app preview"
                sub="Hide contents in the app switcher."
                value={settings.blurPreview}
                onValueChange={(v) => update({ blurPreview: v })}
              />
              <SwitchRow
                icon="screenshot_monitor"
                title="Block screenshots"
                sub="On screens showing plaintext."
                value={settings.blockScreens}
                onValueChange={(v) => update({ blockScreens: v })}
              />
            </ListGroup>
          </View>

          <View>
            <SectionLabel>After decryption</SectionLabel>
            <ListGroup>
              <SwitchRow
                icon="auto_delete"
                title="Auto-wipe local plaintext"
                sub="Clear decrypted text when you leave."
                value={settings.autoWipe}
                onValueChange={(v) => update({ autoWipe: v })}
              />
              <View style={styles.sliderRow}>
                <View style={styles.sliderHead}>
                  <Text style={styles.sliderTitle}>Clipboard auto-clear</Text>
                  <Text style={styles.sliderValue}>{formatClipboardClear(clearSeconds)}</Text>
                </View>
                <View
                  style={styles.track}
                  accessibilityRole="adjustable"
                  accessibilityLabel="Clipboard auto-clear delay"
                  accessibilityValue={{ text: formatClipboardClear(clearSeconds) }}
                  onLayout={(e) => {
                    trackWidth.current = e.nativeEvent.layout.width;
                  }}
                  {...pan.panHandlers}
                >
                  {/* The fill + knob must stay transparent to touches: locationX is measured relative
                      to the touch TARGET, so if the 16px knob (a child sitting under the finger)
                      becomes the target, locationX collapses into its 0–16px space and the slider
                      jumps/flickers. pointerEvents="none" keeps the track itself the gesture target. */}
                  <View pointerEvents="none" style={[styles.fill, { width: fillPct }]} />
                  <View pointerEvents="none" style={[styles.knob, { left: fillPct }]} />
                </View>
              </View>
            </ListGroup>
          </View>
        </View>
      </Screen>
      <AppLockTimeoutSheet
        visible={timeoutOpen}
        value={settings.appLockTimeout}
        onClose={() => setTimeoutOpen(false)}
        onConfirm={(v) => {
          update({ appLockTimeout: v });
          setTimeoutOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  sliderRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: "relative",
  },
  sliderHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sliderTitle: { fontSize: 15, color: colors.onSurface },
  sliderValue: { fontFamily: fonts.mono, color: colors.primary, fontSize: 13 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceContainerHighest,
    justifyContent: "center",
  },
  fill: { height: "100%", borderRadius: 2, backgroundColor: colors.primary },
  knob: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    marginLeft: -8,
  },
});
