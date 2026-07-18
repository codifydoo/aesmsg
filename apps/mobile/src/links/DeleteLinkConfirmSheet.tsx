import { StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Icon } from "@/src/components";
import { deleteLinkConfirmCopy } from "@/src/links/link-confirm";
import type { Link } from "@/src/links/links-data";
import { colors } from "@/src/theme";

// DeleteLinkConfirmSheet — the confirmation gate before "Delete" on a link's detail screen. Delete
// here means UNTRACK LOCALLY: it removes the link from this device's history only. Unlike Revoke it
// does NOT touch the server — the link keeps working for recipients until it expires or is revoked.
// The copy makes that distinction explicit so the user never mistakes a local delete for a kill.
//
// Mirrors the RevokeConfirmSheet pattern (BottomSheet + centered badge + heading + copy + a danger
// primary action and a neutral Cancel). Red = destructive (delete), per the design's color semantics.

export interface DeleteLinkConfirmSheetProps {
  visible: boolean;
  link: Link | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteLinkConfirmSheet({
  visible,
  link,
  onCancel,
  onConfirm,
}: DeleteLinkConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Icon name="delete_forever" size={26} color={colors.onErrorContainer} />
        </View>

        <Text style={styles.title}>Delete from this device?</Text>
        <Text style={styles.copy}>{deleteLinkConfirmCopy(link?.status ?? null)}</Text>
      </View>

      <View style={styles.actions}>
        <Button kind="danger" onPress={onConfirm}>
          Delete
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
