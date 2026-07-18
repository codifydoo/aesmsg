// aesmsg bottom-tab descriptor. Mirrors the design's 5-tab glassmorphic bar — see
// /tmp/aesmsg_bundle/aesmsg/project/app/kit.jsx (KTABS) and grp-shell.jsx (S_TabBar, screen 10).
//
// The design's first tab is labeled "Encrypt" and its root is the Home hub. Icons are the exact
// Material Symbols names the design uses (Icon resolves them to MaterialCommunityIcons glyphs).

export type Tab = "encrypt" | "links" | "contacts" | "keys" | "settings";

export interface TabDescriptor {
  key: Tab;
  label: string;
  /** Material Symbols name from the design (resolved by the kit's Icon primitive). */
  icon: string;
}

export const TABS: TabDescriptor[] = [
  { key: "encrypt", label: "Encrypt", icon: "lock" },
  { key: "links", label: "Links", icon: "link" },
  { key: "contacts", label: "Contacts", icon: "group" },
  { key: "keys", label: "Keys", icon: "vpn_key" },
  { key: "settings", label: "Settings", icon: "settings" },
];
