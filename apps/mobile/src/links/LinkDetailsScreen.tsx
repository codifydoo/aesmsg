import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppBar,
  Avatar,
  Button,
  Chip,
  Icon,
  ListGroup,
  ListRow,
  RowCard,
  Screen,
} from "@/src/components";
import { isExpiringStatus, statusDescriptor } from "@/src/links/link-status";
import type { Link } from "@/src/links/links-data";
import { formatOpensUsed } from "@/src/links/opens-format";
import { colors, fonts } from "@/src/theme";

// LinkDetailsScreen (20) — mirrors grp-links.jsx `S_LinkDetails`:
//   AppBar "Link details" trailing "more_horiz"; the status Chip (amber "Expiring soon" here); a
//   mono link row with a copy Icon; a ListGroup of Created / Expires (amber when expiring) /
//   Opens-used; a recipient RowCard (Avatar + name + mono short-fp + emerald verified Icon); the
//   "Plaintext is not stored…" zero-knowledge caption; and a footer with an outline "Revoke link"
//   button + a danger "Delete" button. Thin & presentational — all data comes from `link`.

export interface LinkDetailsScreenProps {
  link: Link;
  onBack: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  /** Optional "more" affordance (kebab). Wired by the Flow; safe to omit. */
  onMore?: () => void;
}

export function LinkDetailsScreen({
  link,
  onBack,
  onRevoke,
  onDelete,
  onMore,
}: LinkDetailsScreenProps) {
  const { tone, icon, label } = statusDescriptor(link.status);
  const expiring = isExpiringStatus(link.status);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await Clipboard.setStringAsync(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Screen topInset={false} contentStyle={styles.content}>
      <AppBar
        title="Link details"
        onLeading={onBack}
        trailing="more_horiz"
        {...(onMore ? { onTrailing: onMore } : {})}
      />

      <View style={styles.body}>
        <View style={styles.chipRow}>
          <Chip tone={tone} icon={icon} fill={tone === "green"}>
            {label}
          </Chip>
        </View>

        {/* Opaque pointer link — mono-styled (links are pointers, not secrets). */}
        <Pressable
          style={styles.linkRow}
          onPress={copyLink}
          accessibilityRole="button"
          accessibilityLabel={copied ? "Secure link copied" : "Copy secure link"}
        >
          <Text style={styles.linkText} numberOfLines={1}>
            {link.url}
          </Text>
          <Icon name={copied ? "check_circle" : "content_copy"} size={18} color={colors.primary} />
        </Pressable>

        <ListGroup>
          <ListRow
            title="Created"
            trailing={<Text style={styles.metaValue}>{link.createdAt}</Text>}
          />
          <ListRow
            title="Expires"
            trailing={
              <Text style={[styles.metaValue, expiring && styles.metaAmber]}>
                {link.expiresLabel}
              </Text>
            }
          />
          <ListRow
            title="Opens used"
            trailing={
              <Text style={styles.metaValue}>{formatOpensUsed(link.opensUsed, link.opensMax)}</Text>
            }
          />
        </ListGroup>

        {/* Recipient — verified contact (emerald check). Reuses the kit RowCard (`.row-card`). */}
        <RowCard>
          <Avatar initials={link.recipient.name} size={38} />
          <View style={styles.recipientMain}>
            <Text style={styles.recipientName}>{link.recipient.name}</Text>
            <Text style={styles.recipientFp}>{link.recipient.shortFingerprint}</Text>
          </View>
          {link.recipient.verified ? (
            <Icon
              name="verified"
              size={20}
              fill
              color={colors.emerald}
              accessibilityLabel="Verified recipient"
            />
          ) : null}
        </RowCard>

        <Text style={styles.caption}>
          Plaintext is not stored. This screen shows encrypted-message metadata only.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button kind="outline" onPress={onRevoke}>
          Revoke link
        </Button>
        <Button kind="danger" onPress={onDelete}>
          Delete
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 0,
    // The App-level SafeAreaView already clears the status bar / dynamic island, so the AppBar only
    // needs a small gap below it — matching the other AppBar screens (AddContact, VerifyFingerprint).
    // (The old fixed 48px clearance double-counted the safe-area inset and pushed the header down.)
    paddingTop: 4,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 4,
    gap: 16,
  },
  chipRow: {
    alignItems: "flex-start",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  linkText: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 12.5,
    color: colors.onSurface,
  },
  metaValue: {
    fontSize: 15,
    color: colors.onSurfaceVariant,
  },
  metaAmber: {
    color: colors.tertiary,
  },
  recipientMain: {
    flex: 1,
    minWidth: 0,
  },
  recipientName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.onSurface,
  },
  recipientFp: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.outline,
    marginTop: 1,
  },
  caption: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 16,
    gap: 10,
  },
});
