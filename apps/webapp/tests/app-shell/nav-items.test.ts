import { describe, expect, it } from "vitest";
import { isActive, NAV_ITEMS } from "@/src/app-shell/nav-items";

describe("nav-items", () => {
  it("exposes the six primary destinations from the dashboard mockup", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/new",
      "/links",
      "/contacts",
      "/identity",
      "/settings",
    ]);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Dashboard",
      "New Message",
      "Links",
      "Contacts",
      "Keys",
      "Settings",
    ]);
  });

  it("marks the dashboard active only on the exact root", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/links")).toBe(false);
    expect(isActive("/", "/identity")).toBe(false);
  });

  it("marks a section active on its route and any subroute", () => {
    expect(isActive("/links", "/links")).toBe(true);
    expect(isActive("/links", "/links/abc")).toBe(true);
    expect(isActive("/identity", "/identity")).toBe(true);
    expect(isActive("/identity", "/settings")).toBe(false);
  });
});
