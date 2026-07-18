import type { PayloadAttachment } from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
// SDK 56's default `expo-file-system` export is the new File/Paths API; the string-URI
// helpers this screen uses (cacheDirectory, writeAsStringAsync, deleteAsync, EncodingType)
// live behind the `/legacy` subpath now.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, CautionCard, Chip, Icon, RowCard } from "@/src/components";
import { clearCachedFiles, writeAttachmentToCache } from "@/src/reader/attachment-cache";
import { useSettings } from "@/src/settings/settings-context";
import { useClipboardAutoClear, usePrivacyShield } from "@/src/shield/usePrivacyShield";
import { colors, type } from "@/src/theme";

// 27 / 28 · Secure Reader (+ attachment). Presentational restyle to the design (grp-reader
// S_Reader / S_ReaderAttachment) using the kit. The prop contract (text / attachments / onDone)
// and EVERY security-critical behavior are byte-identical to the prior version:
//   • usePrivacyShield blur-on-background cover (isObscured),
//   • useClipboardAutoClear 60s clipboard wipe,
//   • the tempFiles ref accumulator + single empty-dep unmount cleanup (clearCachedFiles),
//   • writeAttachmentToCache's track-before-handoff (record the cache URI BEFORE the share can
//     reject) so decrypted plaintext is never orphaned,
//   • the swallow-on-share-rejection no-op.
// Only the rendered markup/styles changed; no crypto/cache/clipboard call was touched.

export interface ReaderScreenProps {
  text: string;
  attachments: PayloadAttachment[];
  onDone: () => void;
}

export function ReaderScreen({ text, attachments, onDone }: ReaderScreenProps) {
  const { settings } = useSettings();
  const { isObscured } = usePrivacyShield({
    blurPreview: settings.blurPreview,
    blockScreens: settings.blockScreens,
  });
  // Clipboard auto-clear honors the persisted delay (clipboardClearSeconds). When auto-wipe is off
  // the schedule is simply never armed (see onCopy) — the copy persists until the OS/user clears it.
  const { scheduleClear } = useClipboardAutoClear(settings.clipboardClearSeconds * 1000);
  const [copied, setCopied] = useState(false);
  const hasText = text.length > 0;
  const attachmentItems = useMemo(
    () => attachments.map((attachment) => ({ id: crypto.randomUUID(), attachment })),
    [attachments],
  );

  // Track every decrypted file written to the cache dir so all of them can be wiped exactly once
  // when leaving the reader. A ref accumulator (not state) is essential: a state array re-created
  // each download would retrigger a [tempFiles] cleanup effect and PREMATURELY delete earlier
  // files that may still be in-flight to the OS share sheet. Mirrors the web DecryptedScreen
  // objectUrls.current pattern. The single empty-dep effect runs cleanup only on unmount.
  //
  // AUTO-WIPE: when settings.autoWipe is on (default), unmount wipes the cached decrypted files. When
  // a user explicitly turns it off, the files are intentionally left in the app's cache (their
  // responsibility past decryption, per the security model). We read the flag through a ref so the
  // empty-dep unmount effect sees the latest value without re-running.
  const autoWipeRef = useRef(settings.autoWipe);
  autoWipeRef.current = settings.autoWipe;
  const tempFiles = useRef<string[]>([]);
  useEffect(
    () => () => {
      if (autoWipeRef.current) {
        void clearCachedFiles({ FileSystem }, tempFiles.current);
      }
      tempFiles.current = [];
    },
    [],
  );

  const onCopy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    // Only auto-clear when auto-wipe is enabled; otherwise the copied text persists (user's choice).
    if (settings.autoWipe) {
      scheduleClear(async () => {
        const current = await Clipboard.getStringAsync().catch(() => "");
        if (current === text) await Clipboard.setStringAsync("");
        setCopied(false);
      });
    }
  };

  const onDownload = async (attachment: PayloadAttachment) => {
    // track-before-handoff: writeAttachmentToCache records the cache URI into tempFiles BEFORE it
    // awaits the share sheet, so even if the share rejects (double-tap / platform error) the
    // already-written decrypted-plaintext file is tracked and wiped on unmount — never orphaned.
    await writeAttachmentToCache({ FileSystem, Sharing }, attachment, (uri) =>
      tempFiles.current.push(uri),
    );
  };

  if (isObscured) {
    return <View style={styles.cover} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <View style={styles.barSlot} />
        <Chip tone="green" icon="lock_open">
          Decrypted on this device
        </Chip>
        <Pressable
          onPress={onDone}
          style={styles.barSlot}
          accessibilityRole="button"
          accessibilityLabel="Close and wipe"
          hitSlop={8}
        >
          <Icon name="close" size={22} color={colors.error} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <CautionCard style={styles.caution}>
          <Icon name="visibility" size={18} color={colors.tertiary} />
          <Text style={styles.cautionText}>Anyone who can see your screen can read this now.</Text>
        </CautionCard>

        {hasText && (
          <View style={styles.textBox}>
            <Text style={styles.textBody} selectable>
              {text}
            </Text>
          </View>
        )}

        {attachments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.secLabel}>
              {attachments.length === 1 ? "Attachment" : "Attachments"}
            </Text>
            {attachmentItems.map(({ id, attachment }) => (
              // Non-tappable RowCard (the whole row must NOT be a button — only the download icon
              // is interactive), so the share handoff can't be triggered by an errant row tap.
              <RowCard key={id}>
                <View style={styles.attachIcon}>
                  <Icon name="picture_as_pdf" size={20} color={colors.onSurfaceVariant} />
                </View>
                <Text style={styles.attachName} numberOfLines={1}>
                  {attachment.filename}
                </Text>
                <Pressable
                  onPress={() => {
                    // Swallow a share rejection (double-tap / platform error): the cache file is
                    // already tracked for the unmount wipe (track-before-handoff), so nothing leaks
                    // and there is no recoverable action — silently no-op rather than crash.
                    void onDownload(attachment).catch(() => {});
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Save ${attachment.filename}`}
                  hitSlop={8}
                >
                  <Icon name="download" size={22} color={colors.primary} />
                </Pressable>
              </RowCard>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {hasText && (
          <Button kind="outline" icon="content_copy" onPress={onCopy} style={styles.copyBtn}>
            {copied
              ? settings.autoWipe
                ? `Copied — clears in ${settings.clipboardClearSeconds}s`
                : "Copied"
              : "Copy"}
          </Button>
        )}
        <Button kind="primary" icon="lock" onPress={onDone} style={styles.closeBtn}>
          Close and wipe
        </Button>
      </View>
      <Text style={styles.footnote}>Saved only to this app · wiped when you leave</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  cover: { flex: 1, backgroundColor: colors.background },
  bar: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  barSlot: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingBottom: 16, gap: 14 },
  caution: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  cautionText: { fontSize: 13, color: colors.tertiary, flex: 1 },
  textBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  textBody: { ...type.bodyLg, color: colors.onSurface },
  section: { gap: 10 },
  secLabel: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.72,
    textTransform: "uppercase",
    color: colors.onSurfaceVariant,
    paddingHorizontal: 2,
  },
  attachIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  attachName: { ...type.body, color: colors.onSurface, flex: 1, fontWeight: "500" },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  copyBtn: { flex: 1, minHeight: 50 },
  closeBtn: { flex: 1.4, minHeight: 50 },
  footnote: {
    textAlign: "center",
    fontSize: 12,
    color: colors.onSurfaceVariant,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 8,
  },
});
