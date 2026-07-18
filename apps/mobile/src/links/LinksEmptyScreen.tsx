import { StyleSheet, Text, View } from "react-native";
import { Button, Icon, Medallion, Screen } from "@/src/components";
import { colors } from "@/src/theme";

// LinksEmptyScreen (22) — mirrors grp-links.jsx `S_LinksEmpty`: the "Links" large title, then a
// centered link-Icon medallion, "No secure links yet" heading, explanatory body copy, and a
// "Create secure message" primary button. Shown when the store has no links. Thin & presentational.

export interface LinksEmptyScreenProps {
  onCreate: () => void;
}

export function LinksEmptyScreen({ onCreate }: LinksEmptyScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.center}>
        <Medallion>
          <Icon name="link" size={32} color={colors.onSurfaceVariant} />
        </Medallion>
        <Text style={styles.title}>No secure links yet</Text>
        <Text style={styles.body}>
          You haven't created any secure links yet. Encrypt something and share the link through any
          app.
        </Text>
        <Button kind="primary" icon="add" onPress={onCreate} style={styles.cta}>
          Create secure message
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "500",
    letterSpacing: -0.24,
    color: colors.onSurface,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 280,
  },
  cta: {
    marginTop: 8,
    width: "auto",
    paddingHorizontal: 24,
    alignSelf: "center",
  },
});
