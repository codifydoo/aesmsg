import type { ReactNode } from "react";
import { ScrollView, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "@/src/theme";

// Screen — the kit's top-level screen container. Mirrors the design's `.sm-scroll` region
// (aesmsg.css): `padding: 60px 20px 132px` — horizontal gutter, top padding, and bottom padding
// so content scrolls clear of the glass tab bar.
//
// The App-level SafeAreaView (App.tsx) already provides the *measured* device insets (status bar /
// dynamic island at the top, home indicator at the bottom). So STATUS_CLEARANCE is no longer a
// status-bar substitute — it is only the small design gap below the safe area. (It used to be 60,
// which double-counted the SafeAreaView inset and pushed every screen's header well down.)

const H_PADDING = 22; // matches the phone-shell content gutter (.plarge / .pcontent use 22)
const STATUS_CLEARANCE = 12; // small design gap below the SafeAreaView top inset
const TAB_BAR_CLEARANCE = 120; // bottom padding so content scrolls clear of the pinned tab bar

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default) or a plain View when false. */
  scroll?: boolean;
  /** Extra style applied to the content container (ScrollView) or the View. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Apply the top status-bar clearance (default true). Set false when an AppBar already clears it. */
  topInset?: boolean;
}

export function Screen({ children, scroll = true, contentStyle, topInset = true }: ScreenProps) {
  const padding: ViewStyle = {
    paddingHorizontal: H_PADDING,
    paddingTop: topInset ? STATUS_CLEARANCE : 0,
    paddingBottom: TAB_BAR_CLEARANCE,
  };

  if (scroll) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[padding, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.root, padding, contentStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
