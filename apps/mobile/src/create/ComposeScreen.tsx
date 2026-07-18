import { fingerprint, importPublicKey, truncateFingerprint } from "@aesmsg/crypto";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  AppBar,
  Button,
  Chip,
  Icon,
  KeyboardAvoider,
  RowCard,
  Screen,
  Toggle,
} from "@/src/components";
import { AttachmentPickerSheet } from "@/src/create/AttachmentPickerSheet";
import { DEFAULT_EXPIRY, expirySummary, maxOpensSummary } from "@/src/create/compose-options";
import { ExpirySelectorSheet } from "@/src/create/ExpirySelectorSheet";
import { type ExpiryChoice, expiryToDate, type MaxOpensChoice } from "@/src/create/expiry";
import { KeyChangedWarningScreen } from "@/src/create/KeyChangedWarningScreen";
import { MaxOpensSheet } from "@/src/create/MaxOpensSheet";
import type { ComposeAttachment } from "@/src/create/pick-attachment";
import { RecipientPickerSheet } from "@/src/create/RecipientPickerSheet";
import type { Recipient } from "@/src/create/recipient";
import {
  recipientLabel,
  recipientPublicKeyString,
  seedComposeRecipient,
} from "@/src/create/recipient";
import { customExpirySummary } from "@/src/pro/custom-expiry";
import { useEntitlement } from "@/src/pro/entitlement-context";
import { allowsCustomExpiry, maxAttachmentBytes } from "@/src/pro/entitlements";
import { useSettings } from "@/src/settings/settings-context";
import { shieldConfig } from "@/src/shield/shield-logic";
import { usePrivacyShield } from "@/src/shield/usePrivacyShield";
import { colors, fonts, type } from "@/src/theme";

// 11 · Compose Secure Message (grp-create.jsx · S_Compose) — restyled to the kit, logic preserved.
//
// TRUST-CRITICAL: the seal inputs are unchanged. The recipient public-key string (from a pasted
// key or a contact that carries one), the chosen expiry → expiryToDate, and the max-opens value all
// feed the EXISTING onSubmit({ recipientPublicKeyString, message, expiresAt, maxOpens }) contract,
// which CreateFlow hands to create-and-seal verbatim. The displayed fingerprint is still derived
// the same way (importPublicKey → fingerprint → truncate) with the same stale-fingerprint guard.
//
// Draft preservation: this component owns the draft (message, recipient, expiry, max-opens) and is
// kept MOUNTED by CreateFlow across the encrypting + error states, so a failed seal never wipes what
// the user typed — they retry against the same in-memory draft. The error is surfaced inline via the
// `error` prop rather than swapping the screen out.

export interface ComposeSubmit {
  recipientPublicKeyString: string;
  message: string;
  expiresAt: Date;
  maxOpens: MaxOpensChoice;
  attachment: ComposeAttachment | null;
}

export interface ComposeScreenProps {
  onSubmit: (v: ComposeSubmit) => void;
  /** Disable the submit button while a seal is in flight (CreateFlow's "encrypting" state). */
  busy?: boolean;
  /** Inline, opaque failure message shown above the footer; the draft is preserved. */
  error?: string | null;
  /** Close the composer (the app-bar's leading "close"); returns to the host (e.g. the Home hub). */
  onClose?: (() => void) | undefined;
  /**
   * Pre-selected recipient (e.g. "Send secure message" off a contact's detail screen). Seeds the
   * recipient once at mount; a changed-key contact is held behind the key-changed warning rather
   * than adopted directly (seedComposeRecipient), so the MitM gate is never bypassed.
   */
  initialRecipient?: Recipient;
}

const noop = () => {};

export function ComposeScreen({
  onSubmit,
  busy = false,
  error = null,
  onClose,
  initialRecipient,
}: ComposeScreenProps) {
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(
    () => seedComposeRecipient(initialRecipient).recipient,
  );
  const [recipientKey, setRecipientKey] = useState("");
  const [fp, setFp] = useState<string | null>(null);
  const [keyError, setKeyError] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const [maxOpens, setMaxOpens] = useState<MaxOpensChoice>(1);
  const [requireBiometric, setRequireBiometric] = useState(true);
  const [attachment, setAttachment] = useState<ComposeAttachment | null>(null);
  const { entitlement } = useEntitlement();
  const { settings } = useSettings();
  // Compose is a PLAINTEXT surface (the secret is typed here), so it gets the same shield the reader
  // has — not only the app-wide app-switcher blur. blockScreens applies FLAG_SECURE / prevents screen
  // capture while mounted; isObscured covers the content on background as defense-in-depth over the
  // app-root overlay. shieldConfig("compose", …) honours the user's Block-screenshots / Blur-preview
  // settings and uses expo-screen-capture PREVENTION only (never the READ_MEDIA_IMAGES detector).
  const { isObscured } = usePrivacyShield(shieldConfig("compose", settings));
  // Pro-only custom expiry instant. When set, it overrides the preset `expiry` choice on submit and
  // in the summary row; picking a preset clears it. Free users never set it (the Custom row is gated).
  const [customExpiresAt, setCustomExpiresAt] = useState<Date | null>(null);

  // Which sheet is open (only one at a time). null = none.
  const [sheet, setSheet] = useState<"recipient" | "attachment" | "expiry" | "maxopens" | null>(
    null,
  );

  // When the picker selects a contact whose key CHANGED (MitM signal), we stash it here and show
  // the amber Key-Changed warning (18) BEFORE adopting it as the recipient — the user must choose
  // to proceed, verify, or cancel. This never seals; it only gates which recipient becomes active.
  // Seeded from initialRecipient too, so a changed-key contact opened via "Send secure message"
  // hits the same warning instead of being silently sealed against.
  const [keyChanged, setKeyChanged] = useState<(Recipient & { kind: "contact" }) | undefined>(
    () => seedComposeRecipient(initialRecipient).keyChanged,
  );

  function handlePicked(r: Recipient) {
    setSheet(null);
    if (r.kind === "contact" && r.contact.status === "changed") {
      setKeyChanged(r);
      return;
    }
    setRecipient(r);
  }

  // The public key string we validate + seal against. Both recipient sources now supply one: a
  // pasted key directly, and a saved "contact" via its stored publicKey. recipientKey is the single
  // source of truth for the seal input — it tracks the chosen recipient.
  useEffect(() => {
    setRecipientKey(recipientPublicKeyString(recipient) ?? "");
  }, [recipient]);

  // Validate the key and show its fingerprint. Clearing fp for the whole in-flight validation window
  // ensures a stale fingerprint can never be shown — or sealed against — for a key since edited
  // (the displayed fingerprint is the out-of-band MitM check, so it must always track the key value).
  useEffect(() => {
    const trimmed = recipientKey.trim();
    if (!trimmed) {
      setFp(null);
      setKeyError(false);
      return;
    }
    setFp(null);
    setKeyError(false);
    let cancelled = false;
    (async () => {
      try {
        await importPublicKey(trimmed);
        const f = await fingerprint(trimmed as Parameters<typeof fingerprint>[0]);
        if (!cancelled) {
          setFp(truncateFingerprint(f, 8));
          setKeyError(false);
        }
      } catch {
        if (!cancelled) {
          setFp(null);
          setKeyError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipientKey]);

  const canSend =
    (message.trim().length > 0 || attachment !== null) && fp !== null && !keyError && !busy;

  function submit() {
    if (!canSend) return;
    onSubmit({
      recipientPublicKeyString: recipientKey.trim(),
      message,
      expiresAt: customExpiresAt ?? expiryToDate(expiry, new Date()),
      maxOpens,
      attachment,
    });
  }

  // Obscure the plaintext draft when the app leaves the foreground (app-switcher snapshot /
  // background). The component stays mounted, so the in-memory draft (message, recipient, …) is
  // preserved and reappears on return.
  if (isObscured) {
    return <View style={styles.cover} />;
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoider>
        <AppBar
          title="New secure message"
          leading="close"
          onLeading={onClose ?? noop}
          trailing="shield"
          onTrailing={noop}
        />

        <Screen scroll topInset={false} contentStyle={styles.content}>
          {/* Recipient selector → opens the picker sheet (12). */}
          <RowCard onPress={() => setSheet("recipient")} style={styles.recipientRow}>
            {recipient ? (
              <View style={styles.recipientMain}>
                <Text style={styles.recipientName} numberOfLines={1}>
                  {recipientLabel(recipient)}
                </Text>
                {fp ? (
                  <Chip tone="green" icon="check_circle" fill>
                    {`Sealing to ${fp}`}
                  </Chip>
                ) : keyError ? (
                  <Chip tone="amber" icon="priority_high" fill={false}>
                    Invalid key
                  </Chip>
                ) : null}
              </View>
            ) : (
              <View style={styles.recipientMain}>
                <Text style={styles.recipientPlaceholder}>Select recipient</Text>
              </View>
            )}
            <Icon name="expand_more" size={20} color={colors.outline} />
          </RowCard>

          {/* Message body. Plaintext-secret hardening preserved (no autocorrect/keyboard cache). */}
          <View style={styles.messageCard}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              textContentType="none"
              placeholder="Type your secret…"
              placeholderTextColor={colors.outline}
              style={styles.messageInput}
              accessibilityLabel="Message"
            />
            <View style={styles.messageFooter}>
              <Pressable
                onPress={() => setSheet("attachment")}
                accessibilityRole="button"
                accessibilityLabel="Add file"
                style={styles.addFile}
                hitSlop={6}
              >
                <Icon name="attach_file" size={18} color={colors.primary} />
                <Text style={styles.addFileText}>{attachment ? "Change file" : "Add file"}</Text>
              </Pressable>
              <Text style={styles.deviceNote}>Plaintext never leaves this device</Text>
            </View>
            {attachment ? (
              <View style={styles.attachedRow}>
                <Icon
                  name={attachment.mimetype.startsWith("image/") ? "image" : "description"}
                  size={18}
                  color={colors.onSurfaceVariant}
                />
                <Text style={styles.attachedName} numberOfLines={1}>
                  {attachment.filename}
                </Text>
                <Pressable
                  onPress={() => setAttachment(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove attachment"
                  hitSlop={8}
                >
                  <Icon name="close" size={18} color={colors.outline} />
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Pasted-key inline feedback (kept as text below the recipient row for the paste path). */}
          {recipientKey.trim().length > 0 && keyError ? (
            <Text style={styles.keyErr}>That doesn't look like a valid public key.</Text>
          ) : null}

          {/* Expiry summary → sheet (14). */}
          <RowCard onPress={() => setSheet("expiry")} style={styles.summaryRow}>
            <View style={styles.summaryLeft}>
              <Icon name="schedule" size={20} color={colors.onSurfaceVariant} />
              <Text style={styles.summaryLabel}>Expiry</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryValue}>
                {customExpiresAt ? customExpirySummary(customExpiresAt) : expirySummary(expiry)}
              </Text>
              <Icon name="chevron_right" size={18} color={colors.outline} />
            </View>
          </RowCard>

          {/* Max opens summary → sheet (15). */}
          <RowCard onPress={() => setSheet("maxopens")} style={styles.summaryRow}>
            <View style={styles.summaryLeft}>
              <Icon name="repeat" size={20} color={colors.onSurfaceVariant} />
              <Text style={styles.summaryLabel}>Max opens</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryValue}>{maxOpensSummary(maxOpens)}</Text>
              <Icon name="chevron_right" size={18} color={colors.outline} />
            </View>
          </RowCard>

          {/* Require biometric to open (presentational toggle — recipient-side enforcement is a
            follow-up; it does not alter the seal inputs). */}
          <RowCard style={styles.summaryRow}>
            <View style={styles.summaryLeft}>
              <Icon name="fingerprint" size={20} color={colors.onSurfaceVariant} />
              <Text style={styles.summaryLabel}>Require biometric to open</Text>
            </View>
            <Toggle value={requireBiometric} onValueChange={setRequireBiometric} />
          </RowCard>

          {/* Operational failure (could not create the link) is a transient, recoverable state — a
            calm inline notice, NOT a red ErrorCard. Red is reserved for destructive actions; the
            draft above is preserved so the user just retries. */}
          {error ? (
            <View style={styles.notice} accessibilityRole="alert">
              <Icon name="warning" size={18} color={colors.tertiary} />
              <Text style={styles.noticeText}>{error}</Text>
            </View>
          ) : null}
        </Screen>

        <View style={styles.footer}>
          <Button icon="lock" disabled={!canSend} onPress={submit}>
            {busy ? "Encrypting…" : "Encrypt & create link"}
          </Button>
        </View>
      </KeyboardAvoider>

      <RecipientPickerSheet
        visible={sheet === "recipient"}
        onClose={() => setSheet(null)}
        onSelect={handlePicked}
      />
      <AttachmentPickerSheet
        visible={sheet === "attachment"}
        onClose={() => setSheet(null)}
        value={attachment}
        maxBytes={maxAttachmentBytes(entitlement.isPro)}
        onConfirm={(a) => {
          setAttachment(a);
          setSheet(null);
        }}
      />
      <ExpirySelectorSheet
        visible={sheet === "expiry"}
        value={expiry}
        onClose={() => setSheet(null)}
        allowCustom={allowsCustomExpiry(entitlement.isPro)}
        onConfirm={(v) => {
          setExpiry(v);
          setCustomExpiresAt(null);
          setSheet(null);
        }}
        onConfirmCustom={(d) => {
          setCustomExpiresAt(d);
          setSheet(null);
        }}
      />
      <MaxOpensSheet
        visible={sheet === "maxopens"}
        value={maxOpens}
        onClose={() => setSheet(null)}
        onConfirm={(v) => {
          setMaxOpens(v);
          setSheet(null);
        }}
      />

      {/* Key-Changed warning (18) — overlays compose when a changed-key contact is picked. Both
          fingerprints are REAL: `contact.fingerprint` is the key it presents now ("Now") and
          `contact.previousFingerprint` is the actual key it rotated away from (from the contacts
          store's rotation history) — no fabricated sample. Proceeding adopts the recipient anyway
          (sending stays possible); verify/cancel leaves the draft untouched. A "changed" contact
          always carries a prior fingerprint (both derive from a non-empty rotation history), so the
          "—" fallback is only a defensive placeholder and never a made-up fingerprint. */}
      {keyChanged ? (
        <View style={StyleSheet.absoluteFill}>
          <KeyChangedWarningScreen
            recipientName={keyChanged.contact.name}
            previousFingerprint={keyChanged.contact.previousFingerprint ?? "—"}
            currentFingerprint={keyChanged.contact.fingerprint}
            onVerify={() => setKeyChanged(undefined)}
            onProceed={() => {
              setRecipient(keyChanged);
              setKeyChanged(undefined);
            }}
            onCancel={() => setKeyChanged(undefined)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  cover: { flex: 1, backgroundColor: colors.background },
  content: { gap: 14 },
  recipientRow: { justifyContent: "space-between" },
  recipientMain: { flex: 1, minWidth: 0, gap: 6 },
  recipientName: { ...type.body, fontWeight: "600", color: colors.onSurface },
  recipientPlaceholder: { ...type.body, color: colors.onSurfaceVariant },
  messageCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderTopColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 16,
    minHeight: 150,
  },
  messageInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
    lineHeight: 23,
    textAlignVertical: "top",
    minHeight: 90,
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  addFile: { flexDirection: "row", alignItems: "center", gap: 6 },
  addFileText: { color: colors.primary, fontSize: 15 },
  attachedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  attachedName: { ...type.body, color: colors.onSurface, flex: 1, minWidth: 0 },
  deviceNote: { fontSize: 12, color: colors.onSurfaceVariant },
  keyErr: { color: colors.error, fontSize: 12, fontFamily: fonts.body, marginTop: -6 },
  summaryRow: { justifyContent: "space-between" },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  summaryLabel: { ...type.body, color: colors.onSurface },
  summaryRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryValue: { ...type.body, color: colors.onSurfaceVariant },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(231,195,101,0.08)",
    borderWidth: 1,
    borderColor: "rgba(231,195,101,0.30)",
    borderRadius: 12,
    padding: 14,
  },
  noticeText: { color: colors.onSurface, fontSize: 14, flex: 1 },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
});
