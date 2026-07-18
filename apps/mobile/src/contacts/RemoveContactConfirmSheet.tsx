import { StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Icon } from "@/src/components";
import type { Contact } from "@/src/contacts/contacts-data";
import { colors } from "@/src/theme";

// RemoveContactConfirmSheet — the confirmation gate before "Remove contact" on the detail screen.
// Removing a contact deletes their public key from THIS device only; it does not affect links already
// sent to them (those keep working until they expire or are revoked). Red = destructive, per the
// design's color semantics — mirrors the RevokeConfirmSheet / DeleteLinkConfirmSheet pattern so the
// destructive actions across the app read consistently.

export interface RemoveContactConfirmSheetProps {
  visible: boolean;
  contact: Contact | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RemoveContactConfirmSheet({
  visible,
  contact,
  onCancel,
  onConfirm,
}: RemoveContactConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Icon name="person_remove" size={26} color={colors.onErrorContainer} />
        </View>

        <Text style={styles.title}>{contact ? `Remove ${contact.name}?` : "Remove contact?"}</Text>
        <Text style={styles.copy}>
          This deletes their public key from this device. Links you've already sent them keep
          working until they expire.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button kind="danger" onPress={onConfirm}>
          Remove contact
        </Button>
        <Button kind="ghost" onPress={onCancel} style={styles.cancel}>
          Cancel
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "500",
    letterSpacing: -0.24,
    color: colors.onSurface,
    textAlign: "center",
  },
  copy: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 18,
  },
  actions: {
    gap: 10,
  },
  cancel: {
    backgroundColor: colors.surfaceContainerHighest,
  },
});
