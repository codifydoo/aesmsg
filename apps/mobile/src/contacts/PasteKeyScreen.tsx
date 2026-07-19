import { importPublicKey, type PublicKeyString } from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppBar, Button, Field, Icon, KeyboardAvoider, Screen } from "@/src/components";
import { addContact } from "@/src/contacts/contacts-store";
import { canAddContact, pasteContactError } from "@/src/contacts/paste-contact-error";
import { looksLikePublicKey } from "@/src/create/recipient";
import { colors } from "@/src/theme";

// 36b · Paste public key. Two modes over one UI:
//   - ADD (default): paste/enter an amk1: key + a name → validate via importPublicKey (authoritative)
//     → persist via addContact. On success the flow routes to the new contact's (unverified) detail.
//   - RE-KEY (`rekey` prop): update an EXISTING contact's key. The name field is hidden (the contact
//     is already named); on submit the validated key is handed to the parent's `onSubmitKey`, which
//     runs key-change detection (contacts/key-change.ts) and raises the Key-Changed alert. The parent
//     throws typed store errors (SameKeyError / RotatedAwayError) for a no-op re-scan, mapped inline.
// Thin either way: the submit gate + error→copy mapping live in the pure paste-contact-error module.

export interface PasteKeyScreenProps {
  onBack: () => void;
  /** ADD mode: called with the new contact's id after a successful add. */
  onAdded?: (contactId: string) => void;
  /**
   * RE-KEY mode: update an existing contact's key. Hides the name field; on submit the validated key
   * is passed to `onSubmitKey`, which navigates to the Key-Changed alert on a genuine change and
   * throws a typed store error (surfaced inline) for a same/rotated-away re-scan.
   */
  rekey?: {
    contactName: string;
    onSubmitKey: (publicKey: string) => void | Promise<void>;
  };
  /** Pre-populate the key field (e.g. handed in from the QR scanner). */
  initialKey?: string;
  /** Pre-populate the name field (e.g. the suggested name from an imported contact card). */
  initialName?: string;
}

export function PasteKeyScreen({
  onBack,
  onAdded,
  rekey,
  initialKey,
  initialName,
}: PasteKeyScreenProps) {
  const [key, setKey] = useState(initialKey ?? "");
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-key needs only a plausible key (the contact is already named); add needs a key + a name.
  const ready = rekey ? looksLikePublicKey(key) : canAddContact(key, name);

  async function pasteFromClipboard() {
    const text = await Clipboard.getStringAsync().catch(() => "");
    if (text) {
      setKey(text.trim());
      setError(null);
    }
  }

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = key.trim();
      await importPublicKey(trimmed); // authoritative validation; throws InvalidFormatError
      if (rekey) {
        // Hands the validated key to the parent: navigates to the Key-Changed alert on a real change
        // (this component then unmounts), or throws SameKeyError / RotatedAwayError for a no-op.
        await rekey.onSubmitKey(trimmed);
      } else {
        const record = await addContact({ label: name, publicKey: trimmed as PublicKeyString });
        onAdded?.(record.id);
      }
    } catch (e) {
      setError(pasteContactError(e));
      setBusy(false);
    }
  }

  const canSubmit = !busy && ready;

  return (
    <View style={styles.root}>
      <KeyboardAvoider>
        <AppBar title={rekey ? "Update public key" : "Paste public key"} onLeading={onBack} />
        <Screen topInset={false} contentStyle={styles.content}>
          <Text style={styles.lead}>
            {rekey
              ? `Scan or paste ${rekey.contactName}'s new aesmsg public key.`
              : "Paste your contact's aesmsg public key, then give them a name."}
          </Text>

          <View style={styles.group}>
            <Text style={styles.label}>Public key</Text>
            <Field
              placeholder="amk1:…"
              value={key}
              onChangeText={(t) => {
                setKey(t);
                setError(null);
              }}
              mono
              multiline
            />
            <Pressable
              onPress={() => void pasteFromClipboard()}
              accessibilityRole="button"
              accessibilityLabel="Paste from clipboard"
              hitSlop={8}
              style={styles.pasteBtn}
            >
              <Icon name="content_paste" size={16} color={colors.primary} />
              <Text style={styles.pasteText}>Paste from clipboard</Text>
            </Pressable>
          </View>

          {rekey ? null : (
            <View style={styles.group}>
              <Text style={styles.label}>Name</Text>
              <Field
                placeholder="e.g. Elena Rodriguez"
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setError(null);
                }}
              />
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.note}>
            <Icon name="info" size={18} color={colors.onSurfaceVariant} />
            <Text style={styles.noteText}>
              Verify this fingerprint with your contact before sending sensitive information.
            </Text>
          </View>

          <Button
            icon={rekey ? "autorenew" : "person_add"}
            onPress={() => void submit()}
            disabled={!canSubmit}
            style={styles.cta}
          >
            {rekey ? (busy ? "Checking…" : "Continue") : busy ? "Adding…" : "Add contact"}
          </Button>
        </Screen>
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { gap: 16, paddingTop: 4 },
  lead: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 23 },
  group: { gap: 8 },
  label: { fontSize: 13, fontWeight: "500", color: colors.onSurfaceVariant },
  pasteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  pasteText: { color: colors.primary, fontSize: 13, fontWeight: "500" },
  error: { color: colors.error, fontSize: 13, lineHeight: 19 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  noteText: { flex: 1, fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 20 },
  cta: { marginTop: 4 },
});
