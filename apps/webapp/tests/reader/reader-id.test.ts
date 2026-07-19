import { describe, expect, it } from "vitest";
import { LINK_ID_REGEX, readLinkId } from "@/src/reader/reader-id";

const ID = "abcdefghijkl0123";

describe("readLinkId", () => {
  it("resolves the id from a rewritten /l/<id> pathname (production)", () => {
    expect(readLinkId(`/l/${ID}`, "")).toEqual({ ok: true, id: ID });
  });

  it("tolerates a trailing slash on the path", () => {
    expect(readLinkId(`/l/${ID}/`, "")).toEqual({ ok: true, id: ID });
  });

  it("resolves the id from ?id= when the path is the bare /l route (dev)", () => {
    expect(readLinkId("/l", `?id=${ID}`)).toEqual({ ok: true, id: ID });
  });

  it("returns ok:false for the bare /l route with no query", () => {
    expect(readLinkId("/l", "")).toEqual({ ok: false });
  });

  it("rejects a 15-char id (too short)", () => {
    expect(readLinkId("/l/abcdefghijkl012", "")).toEqual({ ok: false });
    expect(readLinkId("/l", "?id=abcdefghijkl012")).toEqual({ ok: false });
  });

  it("rejects a 17-char id (too long)", () => {
    expect(readLinkId(`/l/${ID}x`, "")).toEqual({ ok: false });
    expect(readLinkId("/l", `?id=${ID}x`)).toEqual({ ok: false });
  });

  it("rejects a non-url-safe id (contains + or /)", () => {
    expect(readLinkId("/l", "?id=abcdefghijk+/012")).toEqual({ ok: false });
  });

  it("gives the path id precedence over a conflicting ?id=", () => {
    const other = "zzzzzzzzzzzzzzzz";
    expect(readLinkId(`/l/${ID}`, `?id=${other}`)).toEqual({ ok: true, id: ID });
  });

  it("does not match unrelated paths", () => {
    expect(readLinkId("/", `?id=${ID}`)).toEqual({ ok: true, id: ID });
    expect(readLinkId(`/links/${ID}`, "")).toEqual({ ok: false });
  });

  it("LINK_ID_REGEX matches exactly the 16-char url-safe alphabet", () => {
    expect(LINK_ID_REGEX.test(ID)).toBe(true);
    expect(LINK_ID_REGEX.test("short")).toBe(false);
    expect(LINK_ID_REGEX.test("has space aaaaaa")).toBe(false);
  });
});
