import { describe, expect, it, vi } from "vitest";

// parse-link-id imports expo-linking (which statically pulls react-native Flow syntax that Node
// vitest can't parse), so mock it. This factory is FAITHFUL to the real expo-linking createURL.js
// parse(): it runs `new URL(url)` and returns hostname, the (colon-stripped) scheme, and pathname
// with the leading slash stripped — matching the same WHATWG parser the runtime uses. Critically a
// custom-scheme link `aesmsg://l/<id>` parses with hostname "l" and path "<id>" (the authority eats
// the first segment), which is what routing must handle. Kept in sync with parse-link-id.test.ts.
vi.mock("expo-linking", () => {
  function parse(url: string): {
    scheme: string | null;
    hostname: string | null;
    path: string | null;
  } {
    try {
      const u = new URL(url);
      return {
        scheme: u.protocol ? u.protocol.replace(/:$/, "") : null,
        hostname: u.hostname || null,
        path: (u.pathname || "").replace(/^\//, "") || null,
      };
    } catch {
      return { scheme: null, hostname: null, path: url.replace(/^\//, "") || null };
    }
  }
  return { parse, useURL: () => null };
});

import { parsePastedLink } from "@/src/navigation/parse-link-id";

// A canonical link id: 16 chars from [A-Za-z0-9_-].
const ID = "ab_cd-ef12345678";

describe("parsePastedLink", () => {
  it("returns a bare canonical link id as-is", () => {
    expect(parsePastedLink(ID)).toBe(ID);
  });

  it("trims surrounding whitespace around a bare id", () => {
    expect(parsePastedLink(`  ${ID}\n`)).toBe(ID);
  });

  it("extracts the id from a full https /l/:id link", () => {
    expect(parsePastedLink(`https://app.aesmsg.example/l/${ID}`)).toBe(ID);
  });

  it("extracts the id from a custom-scheme aesmsg://l/:id link", () => {
    expect(parsePastedLink(`aesmsg://l/${ID}`)).toBe(ID);
  });

  it("extracts the id from a bare l/:id path form", () => {
    expect(parsePastedLink(`l/${ID}`)).toBe(ID);
  });

  it("rejects a URL whose id is the wrong length (typo guard)", () => {
    expect(parsePastedLink("https://app.aesmsg.example/l/tooShort")).toBeNull();
  });

  it("rejects a bare id of the wrong length", () => {
    expect(parsePastedLink("ab_cd-ef1234567")).toBeNull(); // 15 chars
    expect(parsePastedLink("ab_cd-ef123456789")).toBeNull(); // 17 chars
  });

  it("rejects a nested link that must not misroute", () => {
    expect(parsePastedLink(`https://host/l/${ID}/extra`)).toBeNull();
  });

  it("rejects free text, empty, and whitespace-only input", () => {
    expect(parsePastedLink("hello world")).toBeNull();
    expect(parsePastedLink("")).toBeNull();
    expect(parsePastedLink("   ")).toBeNull();
  });
});
