// Human-readable accessibility labels for the design's Material-Symbols icon names.
//
// Icon-only controls (an AppBar overflow button, a copy glyph, a share button) must expose a
// meaningful `accessibilityLabel` so screen-reader users hear "More options" — not the raw ligature
// name "more_horiz". Several controls historically fell back to the icon name itself (see AppBar),
// which VoiceOver/TalkBack read literally. This pure lookup gives each interactive glyph a spoken
// label; unknown names degrade to a de-slugified form ("qr_code_scanner" -> "Qr code scanner") so a
// missing entry is still intelligible rather than a code token.
//
// No React / React Native imports — kept node-env testable per the apps/mobile convention.

// Design icon name -> spoken label for its most common interactive use. Only the names that appear as
// standalone / icon-only controls need an entry; decorative icons inside a labelled row don't.
const ICON_A11Y_LABEL: Record<string, string> = {
  add: "Add",
  arrow_back_ios_new: "Back",
  arrow_forward: "Continue",
  attach_file: "Attach a file",
  close: "Close",
  content_copy: "Copy",
  content_paste: "Paste",
  delete_forever: "Delete",
  download: "Save",
  edit: "Edit",
  history: "History",
  info: "More information",
  ios_share: "Share",
  more_horiz: "More options",
  open_in_new: "Open",
  person_add: "Add contact",
  person_remove: "Remove contact",
  photo_camera: "Camera",
  photo_library: "Photo library",
  qr_code_scanner: "Scan QR code",
  refresh: "Refresh",
  search: "Search",
  settings: "Settings",
  shield: "Security",
  shield_lock: "Security",
  tune: "Options",
};

/** Convert an unmapped snake_case icon name into a readable sentence-case fallback. */
function humanize(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  if (words.length === 0) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The spoken accessibility label for an icon-only control rendering `name`.
 * Falls back to a de-slugified form for unmapped names so it is never a raw ligature token.
 */
export function iconA11yLabel(name: string): string {
  return ICON_A11Y_LABEL[name] ?? humanize(name);
}
