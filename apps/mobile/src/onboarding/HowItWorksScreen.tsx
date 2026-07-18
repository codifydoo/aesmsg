import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Chip, Icon, RowCard, Screen } from "@/src/components";
import { colors, radii, type as typo } from "@/src/theme";

// Screen 3 — How It Works (design: grp-onboarding.jsx S_HowItWorks).
//
// The "Encrypt before you send" explainer: the Plaintext → Cipher → Link → Decrypt pipeline strip,
// three numbered steps, the green "Zero-knowledge backend" chip, and a Continue button. Copy is
// lifted verbatim from the design so the product invariants (plaintext never leaves the device, the
// recipient decrypts locally) read identically.
//
// PRESENTATIONAL: drives nothing but the onContinue hand-off.

export interface HowItWorksScreenProps {
  /** Continue → next onboarding step (identity creation in the flow). */
  onContinue: () => void;
}

// The pipeline strip — icon + label per stage, arrows between (design: the Plaintext/Cipher/Link/Decrypt row).
const PIPELINE: ReadonlyArray<{ icon: string; label: string }> = [
  { icon: "description", label: "Plaintext" },
  { icon: "lock", label: "Cipher" },
  { icon: "link", label: "Link" },
  { icon: "key", label: "Decrypt" },
];

// The three numbered steps — verbatim from S_HowItWorks.
const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Encrypt on your device",
    body: "Your message and files are sealed locally. Plaintext never leaves your phone.",
  },
  {
    title: "Share the link anywhere",
    body: "Paste it into Slack, WhatsApp, email — any app you already use.",
  },
  {
    title: "Only they can open it",
    body: "The recipient decrypts on their device. No one in between can read it.",
  },
];

export function HowItWorksScreen({ onContinue }: HowItWorksScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <View>
        <Text style={styles.kicker}>HOW IT WORKS</Text>
        <Text style={styles.title} accessibilityRole="header">
          Encrypt before{"\n"}you send
        </Text>
      </View>

      <View style={styles.strip} accessibilityLabel="Plaintext to cipher to link to decrypt">
        {PIPELINE.map((stage, i) => (
          <Fragment key={stage.label}>
            <View style={styles.stage}>
              <Icon name={stage.icon} size={20} color={colors.primary} />
              <Text style={styles.stageLabel}>{stage.label}</Text>
            </View>
            {i < PIPELINE.length - 1 ? (
              <Icon name="arrow_forward" size={14} color={colors.outline} />
            ) : null}
          </Fragment>
        ))}
      </View>

      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          // Design uses .row-card with align-items:flex-start so the number badge sits at the top
          // of the (possibly multi-line) step copy. Reuse the kit RowCard and override alignment.
          <RowCard key={step.title} style={styles.stepRow}>
            <View style={styles.numBadge}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </RowCard>
        ))}
      </View>

      <View style={styles.chipRow}>
        <Chip tone="green" icon="shield_lock">
          Zero-knowledge backend
        </Chip>
      </View>

      <View style={styles.footer}>
        <Button onPress={onContinue}>Continue</Button>
      </View>
    </Screen>
  );
}

export default HowItWorksScreen;

const styles = StyleSheet.create({
  content: { gap: 16 },
  kicker: { ...typo.label, color: colors.primary, marginBottom: 6 },
  title: { ...typo.h1, color: colors.onSurface },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  stage: { alignItems: "center", gap: 4 },
  stageLabel: { fontSize: 11, color: colors.onSurfaceVariant },
  steps: { gap: 10 },
  // RowCard supplies the surface + border + radius + padding; we only override the alignment so
  // the leading number badge tops-aligns with multi-line copy (design: align-items:flex-start).
  stepRow: { alignItems: "flex-start" },
  numBadge: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  numText: { ...typo.h2, fontSize: 14, fontWeight: "600", color: colors.onPrimaryContainer },
  stepCopy: { flex: 1, gap: 2 },
  stepTitle: { ...typo.body, fontWeight: "600", color: colors.onSurface },
  stepBody: { fontSize: 13, lineHeight: 19, color: colors.onSurfaceVariant },
  chipRow: { flexDirection: "row" },
  footer: { paddingTop: 24 },
});
