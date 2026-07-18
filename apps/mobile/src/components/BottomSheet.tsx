import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from "react-native";
import { colors } from "@/src/theme";

// BottomSheet — mirrors the design's `.sheet-scrim` + `.sheet` (aesmsg.css): a transparent RN
// Modal with a scrim rgba(8,7,10,.62), a surface-container-high sheet pinned to the bottom with
// 22px top corners, a grip handle, and ~30px bottom safe padding. Tapping the scrim closes it.
// Controlled via `visible` + `onClose`. Content is the caller's responsibility.
//
// The bottom-pinned container is a KeyboardAvoidingView so sheets that hold a text input + action
// (Open-a-link, Recipient picker's paste field, Save-as-contact) rise above the software keyboard
// instead of being covered by it. A Modal presents in its own full-screen window (top = screen top),
// so no vertical offset is needed here — unlike the in-app KeyboardAvoider which compensates for the
// App SafeAreaView's top inset.

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.sheet}>
          <View style={styles.grip} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(8,7,10,0.62)",
  },
  sheet: {
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.outlineVariant,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 22,
    paddingBottom: 30,
  },
  grip: {
    width: 36,
    height: 4,
    borderRadius: 9999,
    backgroundColor: colors.outline,
    opacity: 0.6,
    alignSelf: "center",
    marginTop: 2,
    marginBottom: 16,
  },
});
