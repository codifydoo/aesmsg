import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radii } from "@/src/theme";

// ListGroup — inset grouped list container. Mirrors the design's `.lgroup` (aesmsg.css):
//   surface-container-low, 1px border rgba(255,255,255,.05), radius md, overflow hidden.
//
// It injects `__first` into each ListRow child so only non-first rows draw the hairline separator
// (the design uses `.lrow + .lrow::before`). Children are expected to be <ListRow>s; anything else
// renders untouched.

export interface ListGroupProps {
  children: ReactNode;
}

export function ListGroup({ children }: ListGroupProps) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {items.map((child, i) =>
        isValidElement<{ __first?: boolean }>(child)
          ? cloneElement(child, { __first: i === 0 })
          : child,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: radii.md,
    overflow: "hidden",
  },
});
