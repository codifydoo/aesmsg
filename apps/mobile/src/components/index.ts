// The mobile shared UI kit barrel. Import every primitive from "@/src/components".
// Components are pure & presentational (controlled, no data fetching) and use tokens from
// "@/src/theme". Cross-checked against the design's kit.jsx + aesmsg.css.

// ── Layout / structure ──────────────────────────────────────────────────────
export { AppBar, type AppBarProps } from "@/src/components/AppBar";
// ── Identity / status display ────────────────────────────────────────────────
export { Avatar, type AvatarProps } from "@/src/components/Avatar";
// ── Overlays ─────────────────────────────────────────────────────────────────
export { BottomSheet, type BottomSheetProps } from "@/src/components/BottomSheet";
// ── Controls / inputs ────────────────────────────────────────────────────────
export { Button, type ButtonKind, type ButtonProps } from "@/src/components/Button";
// ── Surfaces ─────────────────────────────────────────────────────────────────
export { Card, type CardProps } from "@/src/components/Card";
export { CautionCard, type CautionCardProps } from "@/src/components/CautionCard";
export { Chip, type ChipProps, type ChipTone } from "@/src/components/Chip";
export { ErrorCard, type ErrorCardProps } from "@/src/components/ErrorCard";
export { Field, type FieldProps } from "@/src/components/Field";
export { Fingerprint, type FingerprintProps } from "@/src/components/Fingerprint";
// ── Pure helpers (also unit-tested co-located) ───────────────────────────────
export { chunkFingerprint } from "@/src/components/fingerprint-format";
// ── Icon (pre-existing) + its pure name-resolution helpers ──────────────────
export type { IconProps } from "@/src/components/Icon";
export { Icon } from "@/src/components/Icon";
export {
  type DesignIconName,
  FALLBACK_MCI_GLYPH,
  type MciVariant,
  NAME_MAP,
  resolveMciName,
} from "@/src/components/icon-map";
export { deriveInitials } from "@/src/components/initials";
export { KeyboardAvoider, type KeyboardAvoiderProps } from "@/src/components/KeyboardAvoider";
export { LargeTitle, type LargeTitleProps } from "@/src/components/LargeTitle";
// ── Lists ────────────────────────────────────────────────────────────────────
export { ListGroup, type ListGroupProps } from "@/src/components/ListGroup";
export { ListRow, type ListRowProps } from "@/src/components/ListRow";
export { Medallion, type MedallionProps } from "@/src/components/Medallion";
export { PageDots, type PageDotsProps } from "@/src/components/PageDots";
export { RowCard, type RowCardProps } from "@/src/components/RowCard";
export { Screen, type ScreenProps } from "@/src/components/Screen";
export { SectionLabel, type SectionLabelProps } from "@/src/components/SectionLabel";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentOption,
} from "@/src/components/SegmentedControl";
export { Toggle, type ToggleProps } from "@/src/components/Toggle";
