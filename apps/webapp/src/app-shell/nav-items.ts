export interface NavItem {
  /** Route the item links to. */
  readonly href: string;
  /** Visible label. */
  readonly label: string;
  /** Material Symbols ligature name (must exist in the vendored subset — see fonts-src/README.md). */
  readonly icon: string;
}

// Primary navigation, matching the dashboard_aesmsg mockup's side-nav. In SP1 only the
// Keys (identity) destination becomes a real flow; the others land in later sub-projects
// and render calm placeholder panels until then.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/new", label: "New Message", icon: "add_box" },
  { href: "/links", label: "Links", icon: "link" },
  { href: "/contacts", label: "Contacts", icon: "group" },
  { href: "/identity", label: "Keys", icon: "vpn_key" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

/** True when `pathname` is within the section rooted at `href`. */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
