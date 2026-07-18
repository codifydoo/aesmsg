import { describe, expect, it } from "vitest";
import {
  type DesignIconName,
  FALLBACK_MCI_GLYPH,
  NAME_MAP,
  resolveMciName,
} from "@/src/components/icon-map";

// icon-map is the pure name-resolution layer behind the kit's <Icon>. The .tsx is a thin wrapper
// around @expo/vector-icons (not rendered here, per the node-env / no-React-renderer convention);
// all the real branching — name lookup, outline-vs-filled selection, fallback — lives here and is
// exercised directly.

// The complete set of Material Symbols names the design actually uses (grp-*.jsx + kit.jsx).
const DESIGN_NAMES: DesignIconName[] = [
  "add",
  "android",
  "apple",
  "arrow_back_ios_new",
  "arrow_forward",
  "attach_file",
  "auto_delete",
  "autorenew",
  "bar_chart",
  "block",
  "blur_on",
  "cancel",
  "check",
  "check_circle",
  "chevron_right",
  "close",
  "cloud_off",
  "cloud_upload",
  "content_copy",
  "content_paste",
  "content_paste_off",
  "dark_mode",
  "delete_forever",
  "delete_sweep",
  "description",
  "download",
  "edit",
  "encrypted",
  "expand_more",
  "face",
  "favorite",
  "fingerprint",
  "flashlight_on",
  "folder",
  "gavel",
  "gpp_maybe",
  "group",
  "help",
  "history",
  "inbox",
  "info",
  "ios_share",
  "key",
  "link",
  "link_off",
  "lock",
  "lock_open",
  "lock_reset",
  "mail",
  "more_horiz",
  "notifications",
  "open_in_new",
  "person",
  "person_add",
  "person_remove",
  "photo_camera",
  "photo_library",
  "picture_as_pdf",
  "priority_high",
  "progress_activity",
  "qr_code_scanner",
  "receipt_long",
  "refresh",
  "repeat",
  "restore",
  "schedule",
  "screenshot_monitor",
  "search",
  "security",
  "settings",
  "shield",
  "shield_lock",
  "system_update",
  "tune",
  "verified",
  "visibility",
  "visibility_off",
  "volume_up",
  "vpn_key",
  "warning",
];

describe("icon-map", () => {
  it("maps every design icon name the screens use (80 distinct names)", () => {
    expect(DESIGN_NAMES.length).toBe(80);
    for (const name of DESIGN_NAMES) {
      expect(NAME_MAP[name]).toBeDefined();
    }
  });

  it("NAME_MAP has no extra entries beyond the design set", () => {
    expect(Object.keys(NAME_MAP).sort()).toEqual([...DESIGN_NAMES].sort());
  });

  it("every variant supplies a non-empty outline and filled glyph", () => {
    for (const [name, variant] of Object.entries(NAME_MAP)) {
      expect(variant.outline, `${name}.outline`).toMatch(/\S/);
      expect(variant.filled, `${name}.filled`).toMatch(/\S/);
    }
  });

  describe("resolveMciName", () => {
    it("returns the outline glyph when fill is false (default)", () => {
      expect(resolveMciName("lock")).toBe("lock-outline");
      expect(resolveMciName("lock", false)).toBe("lock-outline");
      expect(resolveMciName("settings")).toBe("cog-outline");
      expect(resolveMciName("verified")).toBe("check-decagram-outline");
    });

    it("returns the filled glyph when fill is true", () => {
      expect(resolveMciName("lock", true)).toBe("lock");
      expect(resolveMciName("settings", true)).toBe("cog");
      expect(resolveMciName("verified", true)).toBe("check-decagram");
    });

    it("returns the same glyph for both fills when MCI has no distinct outline variant", () => {
      // chevron_right / link_off have a single shape; fill must not change it.
      expect(resolveMciName("chevron_right", false)).toBe("chevron-right");
      expect(resolveMciName("chevron_right", true)).toBe("chevron-right");
      expect(resolveMciName("link_off", false)).toBe(resolveMciName("link_off", true));
    });

    it("maps semantically meaningful security glyphs (encrypted -> lock-check)", () => {
      expect(resolveMciName("encrypted")).toBe("lock-check-outline");
      expect(resolveMciName("encrypted", true)).toBe("lock-check");
      expect(resolveMciName("shield_lock")).toBe("shield-lock-outline");
      expect(resolveMciName("gpp_maybe")).toBe("shield-alert-outline");
    });

    it("falls back to a benign placeholder for unmapped names (never crashes)", () => {
      expect(resolveMciName("not_a_real_icon")).toBe(FALLBACK_MCI_GLYPH);
      expect(resolveMciName("not_a_real_icon", true)).toBe(FALLBACK_MCI_GLYPH);
      expect(resolveMciName("")).toBe(FALLBACK_MCI_GLYPH);
    });

    it("resolves a concrete glyph for all 80 design names, both fills", () => {
      // Each known name resolves via its own NAME_MAP entry (not the fallback codepath). Note
      // "help" deliberately maps to "help-circle-outline" which equals FALLBACK_MCI_GLYPH, so the
      // assertion must distinguish "mapped" from "string-equals-fallback".
      for (const name of DESIGN_NAMES) {
        expect(resolveMciName(name, false)).toBe(NAME_MAP[name].outline);
        expect(resolveMciName(name, true)).toBe(NAME_MAP[name].filled);
      }
    });
  });
});
