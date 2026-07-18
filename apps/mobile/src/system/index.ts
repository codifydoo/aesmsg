// System / cross-cutting STATE screens barrel (grp-system.jsx screens 56, 57, 58, 59, 60, 63).
// These are reusable, props-driven presentational building blocks — NOT hardcoded one-offs — so any
// feature can render the right state. Integration routes the ones with a natural home and leaves the
// rest exported for future use:
//
//   • GenericEmptyState (56)   — REUSABLE. Empty Activity / Links / Contacts tabs can render this.
//   • OfflineErrorScreen (57)  — REUSABLE. Any tab's network-failure / offline state.
//   • SkeletonScreen (58)      — REUSABLE. Any list's loading state; SkeletonBlock composes new shapes.
//   • AppLockReAuthScreen (59) — NATURAL HOME. The auto-lock re-auth gate (pairs with identity
//                                auto-lock); Integration wires onUnlock to real biometrics.
//   • PrivacyShieldOverlay (60)— NATURAL HOME. The background privacy cover; Integration renders it
//                                from usePrivacyShield's `isObscured`.
//   • UpdateRequiredScreen (63)— REUSABLE GATE. Shown when isUpdateRequired(installed, minimum); kept
//                                exported until Integration adds a remote min-version check.

// ── Cross-cutting INFO / content screens (grp-system.jsx screens 54, 55, 61, 62) ──────────────────
//   • ActivityInboxScreen (54) — the activity inbox; metadata-only event feed grouped by time.
//   • PushPermissionScreen (55)— notification-permission priming sheet ("never includes content").
//   • HelpFaqScreen (61)       — searchable, accordion Help / FAQ.
//   • AboutLegalScreen (62)    — About / Legal: version, security model, legal links.
export { AboutLegalScreen, type AboutLegalScreenProps } from "./AboutLegalScreen";
export { ActivityInboxScreen, type ActivityInboxScreenProps } from "./ActivityInboxScreen";
// ── Cross-cutting STATE screens (grp-system.jsx screens 56, 57, 58, 59, 60, 63) ──────────────────
export { AppLockReAuthScreen, type AppLockReAuthScreenProps } from "./AppLockReAuthScreen";
export {
  ABOUT_LINKS,
  type AboutLink,
  APP_BUILD,
  APP_NAME,
  APP_VERSION,
  KEYS_ON_DEVICE_LINE,
  OPEN_SOURCE_LINE,
  SECURITY_MODEL_LINE,
} from "./about-data";

// Info-screen data + pure logic (unit-tested co-located in tests/activity-data.test.ts +
// tests/faq-data.test.ts).
export {
  type ActivityBucket,
  type ActivityEvent,
  type ActivityGroup,
  type ActivityKind,
  type ActivityVisual,
  activityVisual,
  bucketFor,
  groupActivity,
  relativeTime,
  unreadCount,
} from "./activity-data";
// The aesmsg brand mark (stroked ring + bar, no react-native-svg) + its pure geometry. Reusable by
// Keys / Onboarding later.
export { BrandMark, type BrandMarkProps } from "./BrandMark";
export { type MarkGeometry, markGeometry } from "./brand-mark-geometry";
export { FAQ_ITEMS, type FaqItem, type FaqSection, filterFaq, groupFaq } from "./faq-data";
export { GenericEmptyState, type GenericEmptyStateProps } from "./GenericEmptyState";
export { HelpFaqScreen, type HelpFaqScreenProps } from "./HelpFaqScreen";
export { OfflineErrorScreen, type OfflineErrorScreenProps } from "./OfflineErrorScreen";
export { PrivacyShieldOverlay, type PrivacyShieldOverlayProps } from "./PrivacyShieldOverlay";
export { PushPermissionScreen, type PushPermissionScreenProps } from "./PushPermissionScreen";
export {
  SkeletonBlock,
  type SkeletonBlockProps,
  SkeletonScreen,
  type SkeletonScreenProps,
} from "./SkeletonScreen";
// Onboarding screen 1 · Splash / Launch brand lockup (grp-onboarding.jsx · S_Splash). Reusable
// launch frame; Integration wires it (App.tsx) and drives `slowProbe` from the keystore probe.
export { SplashBrand, type SplashBrandProps } from "./SplashBrand";
export { UpdateRequiredScreen, type UpdateRequiredScreenProps } from "./UpdateRequiredScreen";

// Pure logic (unit-tested co-located in tests/update-version.test.ts) backing the update gate.
export {
  APP_STORE_URL,
  compareVersions,
  isUpdateRequired,
  PLAY_STORE_URL,
  parseVersion,
  storeUrlForPlatform,
} from "./update-version";
