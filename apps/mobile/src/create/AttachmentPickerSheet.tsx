import * as DocumentPicker from "expo-document-picker";
// SDK 56 keeps the string-URI file helpers behind the /legacy subpath (see reader/attachment-cache).
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, CautionCard, Chip, Icon, ListGroup, ListRow } from "@/src/components";
import {
  type ComposeAttachment,
  type DocumentPickDeps,
  formatSize,
  type ImagePickDeps,
  MAX_ATTACHMENT_BYTES,
  type PickResult,
  pickDocument,
  pickFromCamera,
  pickFromLibrary,
} from "@/src/create/pick-attachment";
import { colors, radii, type } from "@/src/theme";

// 13 · Attachment Picker (grp-create.jsx · S_Attachment). Real on-device file/photo picking: the
// three source rows invoke the expo pickers via the DI pick-attachment module; the picked file is
// read into memory, size-checked against the tier-appropriate byte limit, and shown in the file
// card. The plaintext bytes are sealed into the payload envelope by create-and-seal — the channel
// only ever sees ciphertext. "Attach to message" commits the pending selection to the composer.

export interface AttachmentPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The attachment already committed to the composer (so re-opening shows it). */
  value: ComposeAttachment | null;
  /** Commit the pending selection to the composer. */
  onConfirm: (attachment: ComposeAttachment) => void;
  /** Per-attachment byte limit — defaults to MAX_ATTACHMENT_BYTES (Free tier). Pass
   *  maxAttachmentBytes(isPro) from the caller to enforce the tier-appropriate ceiling. */
  maxBytes?: number;
}

// The actual expo modules satisfy the DI interfaces structurally; the only mismatch is the
// ReadingOptions.encoding type narrowing in the real SDK vs. the `string` used by FileReaderLike
// (which is intentionally loose for testability). The cast is safe: we always pass the
// EncodingType.Base64 constant which is a valid ReadingOptions encoding value at runtime.
const imageDeps = { ImagePicker, FileSystem } as unknown as ImagePickDeps;
const documentDeps = { DocumentPicker, FileSystem } as unknown as DocumentPickDeps;

export function AttachmentPickerSheet({
  visible,
  onClose,
  value,
  onConfirm,
  maxBytes,
}: AttachmentPickerSheetProps) {
  const limit = maxBytes ?? MAX_ATTACHMENT_BYTES;
  const maxMb = limit / (1024 * 1024);
  const [pending, setPending] = useState<ComposeAttachment | null>(value);
  const [tooLarge, setTooLarge] = useState<{ filename: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped each time the sheet re-syncs (opens / value changes). Captured in run() so an in-flight
  // pick that resolves AFTER a dismiss+re-open is dropped instead of clobbering fresh state.
  const genRef = useRef(0);

  // Re-sync local pending state to the committed value each time the sheet opens.
  useEffect(() => {
    if (visible) {
      genRef.current += 1;
      setPending(value);
      setTooLarge(null);
      setBusy(false);
    }
  }, [visible, value]);

  function apply(result: PickResult) {
    if (result.kind === "picked") {
      setPending(result.attachment);
      setTooLarge(null);
    } else if (result.kind === "too-large") {
      setPending(null);
      setTooLarge({ filename: result.filename, size: result.size });
    }
    // "cancelled" → leave the current state untouched.
  }

  async function run(pick: () => Promise<PickResult>) {
    if (busy) return;
    const gen = genRef.current;
    setBusy(true);
    try {
      const result = await pick();
      if (genRef.current !== gen) return; // sheet re-synced meanwhile — drop the stale result
      apply(result);
    } catch {
      // A picker/read failure is non-fatal: leave the prior selection, surface nothing destructive.
    } finally {
      if (genRef.current === gen) setBusy(false);
    }
  }

  function clear() {
    setPending(null);
    setTooLarge(null);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.heading} accessibilityRole="header">
        Attach a file or photo
      </Text>
      <Text style={styles.sub}>It is encrypted on this device before anything is uploaded.</Text>

      <View style={styles.group}>
        <ListGroup>
          <ListRow
            icon="photo_library"
            iconColor={colors.primary}
            title="Photo Library"
            onPress={() => void run(() => pickFromLibrary(imageDeps, limit))}
          />
          <ListRow
            icon="photo_camera"
            iconColor={colors.primary}
            title="Take Photo"
            onPress={() => void run(() => pickFromCamera(imageDeps, limit))}
          />
          <ListRow
            icon="folder"
            iconColor={colors.primary}
            title="Browse Files"
            onPress={() => void run(() => pickDocument(documentDeps, limit))}
          />
        </ListGroup>
      </View>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.busyText}>Reading file…</Text>
        </View>
      ) : null}

      {tooLarge ? (
        <CautionCard style={styles.tooLarge}>
          <Text style={styles.tooLargeTitle}>This file is too large</Text>
          <Text style={styles.tooLargeBody}>
            {`${tooLarge.filename} is ${formatSize(tooLarge.size)}, over the ${maxMb.toFixed(0)} MB limit.`}
          </Text>
        </CautionCard>
      ) : null}

      {pending && !busy ? (
        <View style={styles.fileCard}>
          <View style={styles.fileIcon}>
            <Icon
              name={pending.mimetype.startsWith("image/") ? "image" : "description"}
              size={22}
              color={colors.onSurfaceVariant}
            />
          </View>
          <View style={styles.fileMain}>
            <Text style={styles.fileName} numberOfLines={1}>
              {pending.filename}
            </Text>
            <Text style={styles.fileMeta}>{formatSize(pending.size)}</Text>
          </View>
          <Pressable
            onPress={clear}
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
            hitSlop={8}
          >
            <Icon name="close" size={20} color={colors.outline} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.chipRow}>
        <Chip tone="green" icon="lock" fill>
          Encrypted on this device before upload
        </Chip>
      </View>
      <Text style={styles.limit}>{`Up to ${maxMb.toFixed(0)} MB per attachment`}</Text>

      <Button
        onPress={() => {
          if (pending) onConfirm(pending);
        }}
        disabled={!pending || busy}
        style={styles.attach}
      >
        Attach to message
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.h2, color: colors.onSurface },
  sub: { ...type.body, color: colors.onSurfaceVariant, marginTop: 6 },
  group: { marginTop: 16 },
  busy: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  busyText: { ...type.body, color: colors.onSurfaceVariant },
  tooLarge: { marginTop: 16 },
  tooLargeTitle: { ...type.body, fontWeight: "600", color: colors.onSurface },
  tooLargeBody: { fontSize: 13, color: colors.onSurfaceVariant, marginTop: 4 },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: radii.lg,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  fileMain: { flex: 1, minWidth: 0 },
  fileName: { ...type.body, fontWeight: "500", color: colors.onSurface },
  fileMeta: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  chipRow: { marginTop: 16 },
  limit: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 10 },
  attach: { marginTop: 20 },
});
