import type { ReactNode } from "react";
import { KeyboardAvoidingView, type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// KeyboardAvoider — wraps a screen's content so the software keyboard never covers the action below
// the field the user is typing into (the "encrypt" button, "add contact", "restore", etc.). It is a
// thin, token-free layout primitive: drop it around the outermost element of any screen that pairs a
// text input with a button (a pinned footer, an in-scroll CTA, or a fixed action row).
//
// Why `behavior="padding"` on BOTH platforms: the app runs edge-to-edge (App.tsx · SafeAreaProvider),
// and edge-to-edge Android does NOT auto-resize the window for the keyboard, so KeyboardAvoidingView
// is the single source of avoidance on iOS and Android alike — there is no double-avoidance to guard
// against. The KAV pads its own bottom by the keyboard overlap: a pinned footer rises to sit on top
// of the keyboard, and a ScrollView child shrinks so its in-scroll CTA scrolls clear.
//
// Why `keyboardVerticalOffset = insets.top`: every screen renders inside the App-level SafeAreaView,
// which pushes content down by the top inset (status bar / Dynamic Island). KeyboardAvoidingView
// measures its frame relative to its parent (so its top reads as 0) but compares against the
// keyboard's absolute screen position — a mismatch equal to the top inset. Feeding the top inset back
// as the vertical offset cancels it, so the lift is exactly the keyboard overlap, no more, no less.
//
// Modals (BottomSheet, WipeConfirmModal) present in their own full-screen window OUTSIDE the
// SafeAreaView, so they handle keyboard avoidance inline with offset 0 rather than using this wrapper.

export interface KeyboardAvoiderProps {
  children: ReactNode;
  /** Extra style merged onto the flex:1 container. */
  style?: StyleProp<ViewStyle>;
}

export function KeyboardAvoider({ children, style }: KeyboardAvoiderProps) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.fill, style]}
      behavior="padding"
      keyboardVerticalOffset={insets.top}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
