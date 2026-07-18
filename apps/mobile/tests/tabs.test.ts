import { describe, expect, it } from "vitest";
import { TABS } from "@/src/navigation/tabs";

describe("TABS", () => {
  it("lists the five destinations in the design's order", () => {
    expect(TABS.map((t) => t.key)).toEqual(["encrypt", "links", "contacts", "keys", "settings"]);
  });

  it("uses the design's Material Symbols icon names", () => {
    expect(TABS.map((t) => t.icon)).toEqual(["lock", "link", "group", "vpn_key", "settings"]);
  });

  it("every tab has a label + icon", () => {
    for (const t of TABS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });
});
