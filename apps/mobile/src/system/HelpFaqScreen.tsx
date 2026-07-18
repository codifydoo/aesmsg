import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  AppBar,
  Button,
  Icon,
  KeyboardAvoider,
  ListGroup,
  Screen,
  SectionLabel,
} from "@/src/components";
import { FAQ_ITEMS, type FaqItem, filterFaq, groupFaq } from "@/src/system/faq-data";
import { colors } from "@/src/theme";

// 61 · Help / FAQ (grp-system.jsx · S_Help). An AppBar "Help", a search field, then FAQ items grouped
// under section labels in accordion rows (tap to expand the answer). A "Contact support" footer
// button. The FAQ content + filtering / grouping live in the tested ./faq-data module; this screen is
// thin & presentational: it owns only the search query + which row is expanded.
//
// The answers reinforce the security model in calm support copy — zero-knowledge, private keys stay
// on the device, and the no-recovery reality stated plainly (per faq-data). Search filters live as
// you type; an empty result shows a gentle "no matches" line rather than a blank screen.

export interface HelpFaqScreenProps {
  /** Back navigation from the AppBar. */
  onBack?: (() => void) | undefined;
  /** Open the support contact flow (presentational; wired in Integration). */
  onContactSupport?: (() => void) | undefined;
  /** Override the FAQ content (defaults to the seeded set). */
  items?: FaqItem[];
}

const noop = () => {};

export function HelpFaqScreen({ onBack, onContactSupport, items = FAQ_ITEMS }: HelpFaqScreenProps) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sections = useMemo(() => groupFaq(filterFaq(items, query)), [items, query]);

  return (
    <KeyboardAvoider>
      <AppBar title="Help" onLeading={onBack ?? noop} />
      <Screen topInset={false} contentStyle={styles.content}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.outline} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search help"
            placeholderTextColor={colors.outline}
            style={styles.searchInput}
            accessibilityLabel="Search help"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        {sections.length === 0 ? (
          <Text style={styles.noResults}>No help articles match "{query.trim()}".</Text>
        ) : (
          sections.map((section) => (
            <View key={section.section} style={styles.section}>
              <SectionLabel>{section.section}</SectionLabel>
              <ListGroup>
                {section.items.map((item) => (
                  <FaqRow
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    onToggle={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                  />
                ))}
              </ListGroup>
            </View>
          ))
        )}
      </Screen>

      <View style={styles.footer}>
        <Button kind="outline" icon="mail" onPress={onContactSupport ?? noop}>
          Contact support
        </Button>
      </View>
    </KeyboardAvoider>
  );
}

function FaqRow({
  item,
  expanded,
  onToggle,
  __first = false,
}: {
  item: FaqItem;
  expanded: boolean;
  onToggle: () => void;
  /** Injected by ListGroup — true for the first row, which suppresses the top hairline. Internal. */
  __first?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={item.question}
      style={({ pressed }) => [styles.faqRow, pressed && styles.faqRowPressed]}
    >
      {!__first && <View style={styles.hairline} />}
      <View style={styles.faqHeader}>
        <Text style={styles.question}>{item.question}</Text>
        {/* `expand_less` isn't in the icon map; rotate `expand_more` 180° when expanded. */}
        <Icon
          name="expand_more"
          size={20}
          color={colors.outline}
          style={expanded ? styles.chevronUp : undefined}
        />
      </View>
      {expanded ? <Text style={styles.answer}>{item.answer}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface, padding: 0 },
  noResults: { fontSize: 14, color: colors.onSurfaceVariant, paddingHorizontal: 2, marginTop: 4 },
  section: { gap: 8 },
  faqRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  faqRowPressed: { backgroundColor: colors.surfaceContainer },
  hairline: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    opacity: 0.4,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  question: { flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface },
  chevronUp: { transform: [{ rotate: "180deg" }] },
  answer: { fontSize: 13, lineHeight: 21, color: colors.onSurfaceVariant },
  footer: { paddingHorizontal: 22, paddingBottom: 8, paddingTop: 8 },
});
