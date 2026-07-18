// Pure mapping from the design's Material Symbols glyph names to MaterialCommunityIcons (MCI)
// glyph names, with outline-vs-filled awareness. The design (kit.jsx <Glyph>) drives every icon
// off a Material Symbols name + a `fill` flag; React Native has no Material Symbols variable font,
// so we render the closest MCI glyph instead. Each entry exposes an `outline` and a `filled`
// variant; the Icon component picks based on the `fill` prop. Where MCI has no distinct outline
// glyph, both point at the same name (the rendered shape is identical regardless of fill).
//
// Every glyph name below was verified to exist in @expo/vector-icons' MaterialCommunityIcons
// glyphmap (v15.1.1). Names are kept as a const map so this stays a plain, node-env-testable
// module with NO React Native imports — the .tsx stays thin and presentational.

/** The set of Material Symbols names the design actually uses (from grp-*.jsx + kit.jsx). */
export type DesignIconName =
  | "add"
  | "android"
  | "apple"
  | "arrow_back_ios_new"
  | "arrow_forward"
  | "attach_file"
  | "auto_delete"
  | "autorenew"
  | "bar_chart"
  | "block"
  | "blur_on"
  | "cancel"
  | "check"
  | "check_circle"
  | "chevron_right"
  | "close"
  | "cloud_off"
  | "cloud_upload"
  | "content_copy"
  | "content_paste"
  | "content_paste_off"
  | "dark_mode"
  | "delete_forever"
  | "delete_sweep"
  | "description"
  | "download"
  | "edit"
  | "encrypted"
  | "expand_more"
  | "face"
  | "favorite"
  | "fingerprint"
  | "flashlight_on"
  | "folder"
  | "gavel"
  | "gpp_maybe"
  | "group"
  | "help"
  | "history"
  | "inbox"
  | "info"
  | "ios_share"
  | "key"
  | "link"
  | "link_off"
  | "lock"
  | "lock_open"
  | "lock_reset"
  | "mail"
  | "more_horiz"
  | "notifications"
  | "open_in_new"
  | "person"
  | "person_add"
  | "person_remove"
  | "photo_camera"
  | "photo_library"
  | "picture_as_pdf"
  | "priority_high"
  | "progress_activity"
  | "qr_code_scanner"
  | "receipt_long"
  | "refresh"
  | "repeat"
  | "restore"
  | "schedule"
  | "screenshot_monitor"
  | "search"
  | "security"
  | "settings"
  | "shield"
  | "shield_lock"
  | "system_update"
  | "tune"
  | "verified"
  | "visibility"
  | "visibility_off"
  | "volume_up"
  | "vpn_key"
  | "warning";

/** An MCI glyph pair: which name to render unfilled vs filled. */
export interface MciVariant {
  /** Rendered when `fill` is false. */
  readonly outline: string;
  /** Rendered when `fill` is true. */
  readonly filled: string;
}

/** Returned by {@link resolveMciName} for unmapped names so the UI never crashes. */
export const FALLBACK_MCI_GLYPH = "help-circle-outline";

// Material-Symbols name -> MCI { outline, filled }. Keep alphabetical-ish by design name.
// Outline/filled distinctions matter for the design's semantics: nav/idle states render outline,
// active/emphasis states render filled (matching Material Symbols FILL 0 vs 1).
export const NAME_MAP: Record<DesignIconName, MciVariant> = {
  add: { outline: "plus", filled: "plus" },
  android: { outline: "android", filled: "android" },
  apple: { outline: "apple", filled: "apple" },
  // Material's back chevron — MCI has no "ios_new" variant; chevron-left is the closest visual.
  arrow_back_ios_new: { outline: "chevron-left", filled: "chevron-left" },
  arrow_forward: { outline: "arrow-right", filled: "arrow-right" },
  attach_file: { outline: "attachment", filled: "attachment" },
  auto_delete: { outline: "delete-clock-outline", filled: "delete-clock" },
  autorenew: { outline: "autorenew", filled: "autorenew" },
  bar_chart: { outline: "chart-bar", filled: "chart-bar" },
  block: { outline: "block-helper", filled: "block-helper" },
  blur_on: { outline: "blur", filled: "blur" },
  cancel: { outline: "close-circle-outline", filled: "close-circle" },
  check: { outline: "check", filled: "check" },
  check_circle: { outline: "check-circle-outline", filled: "check-circle" },
  chevron_right: { outline: "chevron-right", filled: "chevron-right" },
  close: { outline: "close", filled: "close" },
  cloud_off: { outline: "cloud-off-outline", filled: "cloud-off-outline" },
  cloud_upload: { outline: "cloud-upload-outline", filled: "cloud-upload" },
  content_copy: { outline: "content-copy", filled: "content-copy" },
  content_paste: { outline: "clipboard-text-outline", filled: "clipboard-text" },
  content_paste_off: { outline: "clipboard-off-outline", filled: "clipboard-off" },
  dark_mode: { outline: "weather-night", filled: "weather-night" },
  delete_forever: { outline: "delete-forever-outline", filled: "delete-forever" },
  delete_sweep: { outline: "delete-sweep-outline", filled: "delete-sweep" },
  description: { outline: "file-document-outline", filled: "file-document" },
  download: { outline: "download-outline", filled: "download" },
  edit: { outline: "pencil-outline", filled: "pencil" },
  // Lock-with-check reads as "encrypted / sealed" — matches the design's encrypted-payload usage.
  encrypted: { outline: "lock-check-outline", filled: "lock-check" },
  expand_more: { outline: "chevron-down", filled: "chevron-down" },
  // No literal face glyph in MCI; emoticon-outline is the standard substitute for Face ID prompts.
  face: { outline: "emoticon-outline", filled: "emoticon" },
  favorite: { outline: "heart-outline", filled: "heart" },
  fingerprint: { outline: "fingerprint", filled: "fingerprint" },
  flashlight_on: { outline: "flashlight", filled: "flashlight" },
  folder: { outline: "folder-outline", filled: "folder" },
  gavel: { outline: "gavel", filled: "gavel" },
  // gpp_maybe = "shield with question/alert" — security warning.
  gpp_maybe: { outline: "shield-alert-outline", filled: "shield-alert" },
  group: { outline: "account-group-outline", filled: "account-group" },
  help: { outline: "help-circle-outline", filled: "help-circle" },
  history: { outline: "history", filled: "history" },
  inbox: { outline: "inbox", filled: "inbox" },
  info: { outline: "information-outline", filled: "information" },
  ios_share: { outline: "export-variant", filled: "export-variant" },
  key: { outline: "key-outline", filled: "key" },
  link: { outline: "link-variant", filled: "link-variant" },
  link_off: { outline: "link-variant-off", filled: "link-variant-off" },
  lock: { outline: "lock-outline", filled: "lock" },
  lock_open: { outline: "lock-open-variant-outline", filled: "lock-open-variant" },
  lock_reset: { outline: "lock-reset", filled: "lock-reset" },
  mail: { outline: "email-outline", filled: "email" },
  more_horiz: { outline: "dots-horizontal", filled: "dots-horizontal" },
  notifications: { outline: "bell-outline", filled: "bell" },
  open_in_new: { outline: "open-in-new", filled: "open-in-new" },
  person: { outline: "account-outline", filled: "account" },
  person_add: { outline: "account-plus-outline", filled: "account-plus" },
  person_remove: { outline: "account-remove-outline", filled: "account-remove" },
  photo_camera: { outline: "camera-outline", filled: "camera" },
  photo_library: { outline: "image-multiple-outline", filled: "image-multiple" },
  picture_as_pdf: { outline: "file-pdf-box", filled: "file-pdf-box" },
  priority_high: { outline: "exclamation-thick", filled: "exclamation-thick" },
  // Indeterminate spinner placeholder; screens swap to <ActivityIndicator/> at render time.
  progress_activity: { outline: "loading", filled: "loading" },
  qr_code_scanner: { outline: "qrcode-scan", filled: "qrcode-scan" },
  receipt_long: { outline: "receipt-text-outline", filled: "receipt-text" },
  refresh: { outline: "refresh", filled: "refresh" },
  repeat: { outline: "repeat", filled: "repeat" },
  restore: { outline: "restore", filled: "restore" },
  schedule: { outline: "clock-outline", filled: "clock" },
  screenshot_monitor: { outline: "monitor-screenshot", filled: "monitor-screenshot" },
  search: { outline: "magnify", filled: "magnify" },
  security: { outline: "security", filled: "security" },
  settings: { outline: "cog-outline", filled: "cog" },
  shield: { outline: "shield-outline", filled: "shield" },
  shield_lock: { outline: "shield-lock-outline", filled: "shield-lock" },
  system_update: { outline: "cellphone-arrow-down", filled: "cellphone-arrow-down" },
  tune: { outline: "tune-variant", filled: "tune-variant" },
  // Material "verified" badge = the decagram check; our canonical green "verified" affordance.
  verified: { outline: "check-decagram-outline", filled: "check-decagram" },
  visibility: { outline: "eye-outline", filled: "eye" },
  visibility_off: { outline: "eye-off-outline", filled: "eye-off" },
  volume_up: { outline: "volume-high", filled: "volume-high" },
  vpn_key: { outline: "key-variant", filled: "key-variant" },
  warning: { outline: "alert-outline", filled: "alert" },
};

/**
 * Resolve a design Material-Symbols name + fill flag to a concrete MCI glyph name.
 * Unknown names degrade to {@link FALLBACK_MCI_GLYPH} so an unmapped icon renders a benign
 * placeholder instead of crashing the screen. Pure + side-effect free for node-env unit tests.
 */
export function resolveMciName(name: string, fill = false): string {
  const variant = (NAME_MAP as Record<string, MciVariant | undefined>)[name];
  if (!variant) return FALLBACK_MCI_GLYPH;
  return fill ? variant.filled : variant.outline;
}
