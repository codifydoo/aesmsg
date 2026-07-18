import { describe, expect, it, vi } from "vitest";

// parse-link-id -> expo-linking, which (SDK 56) statically imports react-native; its Flow syntax
// cannot be parsed under Node vitest, so it MUST be mocked. This factory is FAITHFUL to the real
// expo-linking createURL.js parse(): it runs `new URL(url)` and returns hostname, the (colon-
// stripped) scheme, and pathname with the leading slash stripped. The behavior that matters for
// routing — and that a hand-rolled string mock previously got WRONG — is that a custom-scheme link
// `aesmsg://l/<id>` parses with hostname "l" and path "<id>" (the URL authority eats the first
// segment), NOT path "l/<id>". Building the mock on the same WHATWG `new URL` the runtime uses keeps
// the test boundary honest. A relative/invalid string throws and falls back to the raw path.
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

// Imported AFTER the mock is registered (vi.mock is hoisted, so order is safe either way).
import { parseLinkId } from "@/src/navigation/parse-link-id";

describe("parseLinkId", () => {
  it("extracts the id from an https /l/:id deep link", () => {
    expect(parseLinkId("https://host/l/abc123")).toBe("abc123");
  });

  it("extracts the id from a custom-scheme aesmsg://l/:id deep link", () => {
    expect(parseLinkId("aesmsg://l/abc123")).toBe("abc123");
  });

  it("extracts the id from the WhatsApp custom-scheme fallback where 'l' is the URL authority", () => {
    // When a link is opened from an in-app browser (WhatsApp/iMessage WebView) the OS does not
    // honor universal links, so the web bouncer falls back to window.location = aesmsg://l/<id>.
    // expo-linking's `new URL()` parse treats the "l" segment as the host (path becomes just the
    // bare id), so routing must fold the authority back into the path or the reader never opens.
    expect(parseLinkId("aesmsg://l/abcdefghijkl0123")).toBe("abcdefghijkl0123");
  });

  it("returns null for the bare root path '/'", () => {
    expect(parseLinkId("/")).toBeNull();
  });

  it("returns null for an unrelated single-segment path like 'keys'", () => {
    expect(parseLinkId("keys")).toBeNull();
  });

  it("returns null for null and for the empty string", () => {
    expect(parseLinkId(null)).toBeNull();
    expect(parseLinkId("")).toBeNull();
  });

  it("returns null for a malformed nested link 'l/abc/def' (must NOT misroute to 'abc')", () => {
    // A nested path has an extra slash the /^l\/([^/]+)$/ anchor rejects; routing must refuse it
    // rather than silently open the wrong message.
    expect(parseLinkId("l/abc/def")).toBeNull();
  });

  it("returns null for a deeper nested https link too", () => {
    expect(parseLinkId("https://host/l/abc/def")).toBeNull();
  });

  it("extracts the id when the link has no host (custom scheme without authority)", () => {
    // Sanity: a bare path string '/l/abc123' resolves the same way.
    expect(parseLinkId("/l/abc123")).toBe("abc123");
  });
});
