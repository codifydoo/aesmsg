import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { AppBar, BottomSheet, Button, Chip, Field, Icon } from "@/src/components";
import { buildShareContent } from "@/src/create/share-content";
import { colors, fonts, type } from "@/src/theme";

// 17 · Link Created / Success (grp-create.jsx · S_LinkCreated) — restyled to the kit.
//
// "Share" uses React Native's Share.share ({ message: url }) — the correct primitive for a text link
// on BOTH iOS and Android — NOT expo-sharing, which only shares local file URIs and throws on an
// https:// string. Copy falls back to the clipboard if the OS sheet is unavailable.
//
// "Revoke link" is the sender's kill-switch for a mis-pasted link. It goes through the REAL
// authenticated revoke path (onRevoke, wired to revokeCreatedLink) with busy / success / error
// states — never a dead stub. A successful revoke locks the screen down (copy + share disabled) and
// shows the revoked state, since the ciphertext is now purged. Revoke is styled in error red because
// it is destructive — the one place red belongs here.
//
// Copy reinforces the invariant: only ciphertext was uploaded; the link is a pointer, useless
// without the recipient's private key.

export interface ResultScreenProps {
  url: string;
  onNew: () => void;
  /** Optional expiry chip label (e.g. "Expires in 23h 59m" / "Expires in 365d"). */
  expiryLabel?: string;
  /** Optional max-opens chip label (e.g. "Once", "Unlimited"). */
  opensLabel?: string;
  /**
   * Revoke this link. Resolves on success (a confirmed revoke, or an already-gone link); rejects on
   * a real failure (offline / server fault) so the screen keeps the link visible as still-live.
   * Omitted → the revoke control is hidden.
   */
  onRevoke?: () => Promise<void>;
  /**
   * When set, the recipient was a pasted key whose fingerprint is not yet saved — show a
   * "Save as contact" CTA. The handler persists the contact (label + the pre-filled public key).
   * Throws on a validation/duplicate error; the sheet surfaces it inline.
   */
  onSaveContact?: (label: string) => Promise<void>;
}

export function ResultScreen({
  url,
  onNew,
  expiryLabel,
  opensLabel,
  onRevoke,
  onSaveContact,
}: ResultScreenProps) {
  const [copied, setCopied] = useState(false);

  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [revokeErr, setRevokeErr] = useState<string | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function confirmSave() {
    if (saving || saveLabel.trim().length === 0) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await onSaveContact?.(saveLabel);
      setSaved(true);
      setSaveOpen(false);
    } catch {
      // Opaque, calm inline failure (e.g. duplicate / invalid label). The draft sheet stays open.
      setSaveErr("Couldn't save this contact. Try a different name.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (revoked) return; // a revoked link is dead — nothing useful to copy.
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (revoked) return;
    try {
      // Share.share carries the link in `message` — populates correctly on iOS and Android.
      await Share.share(buildShareContent(url), { dialogTitle: "Share secure link" });
    } catch {
      // OS sheet unavailable / failed → fall back to the clipboard so the link is never lost.
      await copy();
    }
  }

  async function revoke() {
    if (!onRevoke || revoking || revoked) return;
    setRevoking(true);
    setRevokeErr(null);
    try {
      await onRevoke();
      setRevoked(true);
    } catch {
      // Keep the link visible as still-live and let the sender retry. Never claim it's dead.
      setRevokeErr("Couldn't reach the server — this link is still live. Try again.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppBar leading="close" onLeading={onNew} />
      <View style={styles.body}>
        <View style={[styles.medallion, revoked && styles.medallionRevoked]}>
          <Icon
            name={revoked ? "block" : "check"}
            size={32}
            fill
            color={revoked ? colors.error : colors.emerald}
          />
        </View>

        <View style={styles.headingBlock}>
          <Text style={styles.heading} accessibilityRole="header">
            {revoked ? "Link revoked" : "Secure link created"}
          </Text>
          <Text style={styles.sub}>
            {revoked
              ? "The ciphertext was purged from the server. Recipients can no longer open this link."
              : "Only encrypted ciphertext was uploaded. The link is a pointer — useless without the recipient's private key."}
          </Text>
        </View>

        <Pressable
          style={[styles.linkBox, revoked && styles.linkBoxRevoked]}
          onPress={copy}
          disabled={revoked}
          accessibilityRole="button"
          accessibilityState={{ disabled: revoked }}
          accessibilityLabel={copied ? "Link copied" : "Copy secure link"}
        >
          {/* Mono is reserved for fingerprints / public keys / secure links. */}
          <Text style={styles.link} numberOfLines={1} selectable={!revoked}>
            {url}
          </Text>
          <Icon
            name={revoked ? "block" : copied ? "check" : "content_copy"}
            size={18}
            color={revoked ? colors.outline : copied ? colors.emerald : colors.primary}
          />
        </Pressable>

        {expiryLabel || opensLabel ? (
          <View style={styles.chips}>
            {expiryLabel ? (
              <Chip tone="green" icon="schedule" fill={false}>
                {expiryLabel}
              </Chip>
            ) : null}
            {opensLabel ? (
              <Chip tone="violet" icon="repeat" fill={false}>
                {opensLabel}
              </Chip>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button icon="ios_share" onPress={share} disabled={revoked}>
            {copied ? "Copied" : "Share link"}
          </Button>
          {onSaveContact && !saved ? (
            <Button kind="outline" icon="person_add" onPress={() => setSaveOpen(true)}>
              Save as contact
            </Button>
          ) : null}
          {saved ? (
            <Chip tone="green" icon="check_circle" fill>
              Saved to contacts
            </Chip>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        {revoked ? (
          <Chip tone="neutral" icon="block" fill={false}>
            Link revoked
          </Chip>
        ) : onRevoke ? (
          <>
            <Pressable
              onPress={revoke}
              disabled={revoking}
              accessibilityRole="button"
              accessibilityState={{ disabled: revoking, busy: revoking }}
              accessibilityLabel="Revoke link"
              hitSlop={8}
            >
              <Text style={[styles.revoke, revoking && styles.revokeBusy]}>
                {revoking ? "Revoking…" : "Revoke link"}
              </Text>
            </Pressable>
            {revokeErr ? <Text style={styles.revokeErr}>{revokeErr}</Text> : null}
          </>
        ) : null}
      </View>

      <BottomSheet visible={saveOpen} onClose={() => setSaveOpen(false)}>
        <Text style={styles.saveHeading} accessibilityRole="header">
          Save as contact
        </Text>
        <Text style={styles.saveSub}>
          Save this recipient's public key so you can send to them again without pasting it.
        </Text>
        <View style={styles.saveField}>
          <Field placeholder="Name" value={saveLabel} onChangeText={setSaveLabel} />
        </View>
        {saveErr ? <Text style={styles.saveErr}>{saveErr}</Text> : null}
        <Button
          icon="person_add"
          disabled={saving || saveLabel.trim().length === 0}
          onPress={confirmSave}
        >
          {saving ? "Saving…" : "Save contact"}
        </Button>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 22, paddingTop: 8, alignItems: "center", gap: 16 },
  medallion: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  medallionRevoked: { backgroundColor: colors.errorContainer },
  headingBlock: { alignItems: "center", gap: 8 },
  heading: { ...type.h2, color: colors.onSurface, textAlign: "center" },
  sub: { ...type.body, color: colors.onSurfaceVariant, textAlign: "center" },
  linkBox: {
    width: "100%",
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
  linkBoxRevoked: { opacity: 0.5 },
  link: { flex: 1, fontFamily: fonts.mono, fontSize: 12.5, color: colors.onSurface },
  chips: { flexDirection: "row", gap: 8 },
  actions: { width: "100%", gap: 10, marginTop: 4 },
  footer: { alignItems: "center", paddingTop: 16, paddingBottom: 8, gap: 8 },
  revoke: { color: colors.error, fontSize: 14, fontWeight: "500" },
  revokeBusy: { color: colors.onSurfaceVariant },
  revokeErr: { color: colors.error, fontSize: 12, textAlign: "center" },
  saveHeading: { ...type.h2, color: colors.onSurface, marginBottom: 6 },
  saveSub: { ...type.body, color: colors.onSurfaceVariant, marginBottom: 14 },
  saveField: { marginBottom: 12 },
  saveErr: { color: colors.error, fontSize: 13, marginBottom: 12 },
});
