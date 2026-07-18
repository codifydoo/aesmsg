import type { PublicKeyString } from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  BottomSheet,
  Button,
  Card,
  CautionCard,
  Chip,
  Icon,
  ListGroup,
  ListRow,
  RowCard,
  Screen,
  SectionLabel,
} from "@/src/components";
import { importBackupBlockedNote } from "@/src/home/import-backup-blocked";
import { type RecentLinkView, recentLinkChip } from "@/src/home/recent-links";
import { colors, type } from "@/src/theme";

// HomeScreen — the Encrypt-tab hub (design screen 9, S_Home), minus the header: the redundant
// "aesmsg" title + settings gear were removed (Settings is a dedicated bottom-nav tab). The hub now
// shows REAL recent links (passed in from HomeFlow's useSentLinks), a green "key secured" status
// card, the primary "Create secure message" CTA, an outline "Open secure link", a 2x2 quick-action
// grid, and the recent-links list. Presentational only — every action is a callback wired by HomeFlow.

export interface HomeScreenProps {
  publicKeyString: PublicKeyString;
  /** The user's most-recent links (already mapped + sliced by HomeFlow). */
  recentLinks: RecentLinkView[];
  onCompose: () => void;
  /** Open an existing secure link (paste / inbound). */
  onOpenLink?: () => void;
  /** "See all" / tap a recent row — go to the Links tab. */
  onSeeAllLinks?: () => void;
  /** Scan a contact's QR — go to the Contacts scanner. */
  onScan?: () => void;
  /** View this device's public key — go to the Keys tab. */
  onMyKey?: () => void;
  /** Add a contact — go to the Contacts add screen. */
  onAddContact?: () => void;
  /** Restoring a backup replaces the current identity — route the user to Settings (Wipe flow). */
  onImportBackup?: () => void;
  /** Show the calm, passive "not backed up" reminder tile (until an encrypted backup exists). */
  notBackedUp?: boolean;
  /** Tap the reminder tile → route to the Keys tab to create an encrypted backup. */
  onBackUp?: () => void;
}

const noop = () => {};

export function HomeScreen({
  publicKeyString,
  recentLinks,
  onCompose,
  onOpenLink = noop,
  onSeeAllLinks = noop,
  onScan = noop,
  onMyKey = noop,
  onAddContact = noop,
  onImportBackup = noop,
  notBackedUp = false,
  onBackUp = noop,
}: HomeScreenProps) {
  const [copied, setCopied] = useState(false);
  // On Home an identity always exists, so "Import backup" can't restore in place — it would replace
  // the current identity. Surface a calm note that points to the Wipe flow in Settings instead.
  const [importNoteVisible, setImportNoteVisible] = useState(false);
  const importNote = importBackupBlockedNote();

  // The public key is shareable (not a secret). Tapping "My public key" navigates to the Keys tab
  // (which has its own Share/Copy + QR); a long-press here copies as a shortcut and shows "Copied".
  async function copyPublicKey() {
    await Clipboard.setStringAsync(publicKeyString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Screen>
        {/* Green-tinted status card: key secured + biometric unlock. green = safe. */}
        <Card style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Icon name="shield_lock" size={22} fill color={colors.emerald} />
          </View>
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>Private key secured on this device</Text>
            <Text style={styles.statusSub}>Biometric unlock enabled</Text>
          </View>
        </Card>

        {/* Passive "not backed up" reminder (PG-11). Amber = attention, not danger. Stays until an
            encrypted backup exists; tapping it routes to the Keys tab to create one. */}
        {notBackedUp ? (
          <Pressable
            onPress={onBackUp}
            accessibilityRole="button"
            accessibilityLabel="Back up your key. If you lose this device without a backup, messages sent to you can't be recovered."
            style={styles.reminderPressable}
          >
            <CautionCard style={styles.reminder}>
              <Icon name="shield_lock" size={20} color={colors.tertiary} />
              <View style={styles.reminderText}>
                <Text style={styles.reminderTitle}>Back up your key</Text>
                <Text style={styles.reminderSub}>
                  If you lose this device without a backup, messages sent to you can't be recovered.
                </Text>
              </View>
              <Icon name="chevron_right" size={20} color={colors.onSurfaceVariant} />
            </CautionCard>
          </Pressable>
        ) : null}

        {/* Primary CTA. */}
        <Button icon="add" onPress={onCompose} style={styles.primaryCta}>
          Create secure message
        </Button>

        {/* Open an existing secure link. */}
        <Button kind="outline" icon="link_off" onPress={onOpenLink} style={styles.outlineCta}>
          Open secure link
        </Button>

        {/* 2x2 quick-action grid. "My public key" long-press also copies the key. */}
        <View style={styles.grid}>
          <QuickAction icon="qr_code_scanner" label="Scan QR" onPress={onScan} />
          <QuickAction
            icon="vpn_key"
            label={copied ? "Copied" : "My public key"}
            onPress={onMyKey}
            onLongPress={() => void copyPublicKey()}
            accessibilityLabel="My public key. Long-press to copy your public key."
          />
          <QuickAction icon="person_add" label="Add contact" onPress={onAddContact} />
          <QuickAction
            icon="restore"
            label="Import backup"
            onPress={() => setImportNoteVisible(true)}
          />
        </View>

        {/* Recent links header row — "See all" only when there are links. */}
        <View style={styles.recentHead}>
          <SectionLabel>Recent links</SectionLabel>
          {recentLinks.length > 0 ? (
            <Pressable
              onPress={onSeeAllLinks}
              accessibilityRole="button"
              accessibilityLabel="See all links"
              hitSlop={8}
            >
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Recent links list — real rows, or a muted empty row. */}
        <ListGroup>
          {recentLinks.length === 0 ? (
            <ListRow
              icon="lock"
              iconColor={colors.onSurfaceVariant}
              title="No secure links yet"
              sub="Links you create will show up here"
            />
          ) : (
            recentLinks.map((link) => {
              const chip = recentLinkChip(link.status);
              return (
                <ListRow
                  key={link.id}
                  icon="lock"
                  iconColor={colors.onSurfaceVariant}
                  title={link.title}
                  sub={link.sub}
                  onPress={onSeeAllLinks}
                  trailing={
                    <Chip tone={chip.tone} icon={chip.icon} fill={chip.fill}>
                      {chip.label}
                    </Chip>
                  }
                />
              );
            })
          )}
        </ListGroup>
      </Screen>

      {/* Import-backup note. Restoring a backup replaces this device's identity, and Home always has
          one, so we never auto-start a restore here. Amber = attention (not danger): explain the
          consequence and route to the deliberate Wipe flow in Settings. */}
      <BottomSheet visible={importNoteVisible} onClose={() => setImportNoteVisible(false)}>
        <View style={styles.importSheet}>
          <View style={styles.importSheetIcon}>
            <Icon name="restore" size={26} color={colors.tertiary} />
          </View>
          <Text style={styles.importSheetTitle}>{importNote.title}</Text>
          <Text style={styles.importSheetBody}>{importNote.body}</Text>
          <View style={styles.importSheetActions}>
            <Button
              kind="outline"
              onPress={() => setImportNoteVisible(false)}
              style={styles.importSheetBtn}
            >
              Not now
            </Button>
            <Button
              icon="settings"
              onPress={() => {
                setImportNoteVisible(false);
                onImportBackup();
              }}
              style={styles.importSheetBtn}
            >
              {importNote.cta}
            </Button>
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

// QuickAction — one cell of the 2x2 grid. A RowCard with a primary-tinted glyph + label.
function QuickAction({
  icon,
  label,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    // The RowCard is a plain (non-pressable) surface here: the inner Pressable is the SOLE touch
    // target. A pressable RowCard wrapping a pressable inner view produced two overlapping a11y
    // buttons for one cell (VoiceOver announced the action twice). Keeping only the inner Pressable
    // preserves onLongPress (My-public-key copy) with a single, correctly-labelled target.
    <RowCard style={styles.gridCell}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={styles.gridCellInner}
      >
        <Icon name={icon} size={20} color={colors.primary} />
        <Text style={styles.gridLabel} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </RowCard>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 99,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(111,210,154,0.12)",
  },
  statusText: { flex: 1 },
  statusTitle: { ...type.body, fontWeight: "600", color: colors.onSurface },
  statusSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  reminderPressable: { marginBottom: 14 },
  reminder: { flexDirection: "row", alignItems: "center", gap: 12 },
  reminderText: { flex: 1 },
  reminderTitle: { ...type.body, fontWeight: "600", color: colors.onSurface },
  reminderSub: { fontSize: 12, lineHeight: 17, color: colors.onSurfaceVariant, marginTop: 2 },
  primaryCta: { marginBottom: 14 },
  outlineCta: { minHeight: 52, marginBottom: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  gridCell: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 0,
  },
  gridCellInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
  },
  gridLabel: { ...type.body, fontWeight: "500", color: colors.onSurface, flexShrink: 1 },
  recentHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  seeAll: { fontSize: 13, color: colors.primary },
  importSheet: { gap: 12, alignItems: "center", paddingTop: 6 },
  importSheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(231,195,101,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  importSheetTitle: {
    fontSize: 19,
    fontWeight: "600",
    color: colors.onSurface,
    textAlign: "center",
  },
  importSheetBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginBottom: 6,
  },
  importSheetActions: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  importSheetBtn: { flex: 1 },
});
