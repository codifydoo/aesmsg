import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Native modules cannot load under Node vitest — react-native-quick-crypto pulls in
// react-native (Flow syntax fails to parse) and expo-standard-web-crypto resolves to an
// unbundled subpath. Both MUST be mocked, and the mock factories MUST NOT reference
// non-hoisted locals, so the spies are created with vi.hoisted.
const { installSpy, polyfillSpy } = vi.hoisted(() => ({
  installSpy: vi.fn(),
  polyfillSpy: vi.fn(),
}));

vi.mock("react-native-quick-crypto", () => ({ install: installSpy }));
vi.mock("expo-standard-web-crypto", () => ({ polyfillWebCrypto: polyfillSpy }));

// Pin a real (Node) Web Crypto onto the global the way the device native backend would.
// globalThis.crypto is a read-only getter in Node 22 — plain assignment throws — so it
// must be replaced via Object.defineProperty.
function setGlobalCrypto(value: unknown): void {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    writable: true,
    value,
  });
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

afterEach(() => {
  // Restore whatever the runtime originally had so we don't leak state between files.
  if (originalCrypto) {
    Object.defineProperty(globalThis, "crypto", originalCrypto);
  }
});

describe("installWebCrypto", () => {
  beforeEach(() => {
    // Reset the module-scoped `installed` guard and clear spy call counts so each test
    // starts from a clean slate.
    vi.resetModules();
    installSpy.mockReset();
    polyfillSpy.mockReset();
    // The realistic case: the install hook wires a full Web Crypto onto the global.
    installSpy.mockImplementation(() => {
      setGlobalCrypto(webcrypto);
    });
  });

  it("provides getRandomValues that fills 16 bytes with entropy", async () => {
    // Blank the ambient (Node) crypto FIRST so this can only pass if the mocked install hook
    // actually wires crypto onto the global — otherwise Node's read-only globalThis.crypto would
    // satisfy the assertions even with a no-op install.
    setGlobalCrypto(undefined);

    const { installWebCrypto } = await import("@/src/crypto/webcrypto-polyfill");
    installWebCrypto();

    const out = new Uint8Array(16);
    const returned = globalThis.crypto.getRandomValues(out);

    expect(returned).toBe(out);
    expect(out.length).toBe(16);
    expect(out.some((b) => b !== 0)).toBe(true);
  });

  it("provides subtle.digest('SHA-256', 'abc') matching the known vector", async () => {
    // Blank the ambient (Node) crypto FIRST so this can only pass if the mocked install hook
    // actually wires crypto.subtle onto the global — otherwise Node's read-only globalThis.crypto
    // would satisfy the assertion even with a no-op install.
    setGlobalCrypto(undefined);

    const { installWebCrypto } = await import("@/src/crypto/webcrypto-polyfill");
    installWebCrypto();

    const digest = await globalThis.crypto.subtle.digest("SHA-256", utf8("abc"));
    expect(toHex(digest)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("calls the native install hook exactly once", async () => {
    const { installWebCrypto } = await import("@/src/crypto/webcrypto-polyfill");
    installWebCrypto();

    expect(installSpy).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: repeated calls install only once", async () => {
    const { installWebCrypto } = await import("@/src/crypto/webcrypto-polyfill");
    installWebCrypto();
    installWebCrypto();
    installWebCrypto();

    expect(installSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when the backend wires crypto without a subtle surface", async () => {
    installSpy.mockImplementation(() => {
      // A backend that only partially populates crypto: getRandomValues but no subtle.
      setGlobalCrypto({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    });

    const { installWebCrypto } = await import("@/src/crypto/webcrypto-polyfill");
    expect(() => installWebCrypto()).toThrow(/subtle/i);
  });
});
