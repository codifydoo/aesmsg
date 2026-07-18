import {
  type Ciphertext,
  DecryptionError,
  encodePayload,
  exportPublicKey,
  generateIdentity,
  type IdentityKeypair,
  importPublicKey,
  type MessageBindingContext,
  seal,
} from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenMessageResponse } from "@/src/api/client";
import { allPrivateKeysForDecrypt, decryptWithKeyFallback } from "@/src/identity/decrypt-keys";
import type { IdentityState } from "@/src/identity/identity-machine";
import { bytesToBase64 } from "@/src/lib/base64";
import { decryptOpenResponse } from "@/src/reader/fetch-and-open";
import { classifyReaderError } from "@/src/reader/reader-error";

// ReaderFlow's post-open LOCAL decrypt (2.4 key rotation): after a rotation the device holds an
// ACTIVE keypair plus retained RETIRED keypairs, and the reader must try the active key first, then
// each retired key, so a link sealed to a pre-rotation public key still opens. ReaderFlow.decryptHeld
// does exactly:
//     decryptWithKeyFallback(allPrivateKeysForDecrypt(identity), (key) =>
//       decryptOpenResponse(response, key, id))
// ReaderFlow is a React component and the mobile suite runs node-env with NO React renderer, so we
// exercise that SEAM here with REAL @aesmsg/crypto: a genuine retired-sealed ciphertext must open via
// fallback, an all-wrong ciphertext must land on the terminal "failed" classification, the active key
// must be tried first, and the local decrypt must consume NO /open (it never touches the network).
//
// decryptOpenResponse imports @/src/api/client, whose expo-constants dep (SDK 56) statically imports
// react-native (Flow syntax unparseable under Node vitest) — so it MUST be mocked, as in
// fetch-and-open.test.ts.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "" } } },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// encodeAad hard-requires a 16-char link id and expiresAtMs strictly greater than createdAtMs.
const BASE_CREATED_AT_MS = Date.UTC(2026, 4, 10, 12, 0, 0);
const BASE_EXPIRES_AT_MS = BASE_CREATED_AT_MS + 24 * 60 * 60 * 1000;
const ID = "abcdefghijkl0123"; // exactly 16 chars, matches /^[A-Za-z0-9_-]{16}$/

function contextFor(recipientPublicKey: string): MessageBindingContext {
  return {
    linkId: ID,
    recipientPublicKey,
    createdAtMs: BASE_CREATED_AT_MS,
    expiresAtMs: BASE_EXPIRES_AT_MS,
    maxOpens: 1,
  };
}

// createdAt !== null ⇒ decryptOpenResponse reconstructs the v1 AAD (createdAtMs included), matching
// the sealed context above.
function responseWith(ciphertext: string): OpenMessageResponse {
  return {
    ciphertext,
    createdAt: new Date(BASE_CREATED_AT_MS).toISOString(),
    expiresAt: new Date(BASE_EXPIRES_AT_MS).toISOString(),
    opensCount: 1,
    maxOpens: 1,
    status: "active",
  };
}

async function sealTextTo(recipientPublicKeyString: string, text: string): Promise<string> {
  const recipient = await importPublicKey(recipientPublicKeyString);
  const envelope = encodePayload({ text, attachments: [] });
  const ct = await seal(envelope, recipient, contextFor(recipientPublicKeyString));
  return bytesToBase64(ct as unknown as Ciphertext as unknown as Uint8Array);
}

function unlockedState(
  identity: IdentityKeypair,
  retiredKeypairs: IdentityKeypair[],
): IdentityState {
  return {
    status: "unlocked",
    identity,
    publicKeyString: exportPublicKey(identity),
    retiredKeypairs,
  };
}

// The exact expression ReaderFlow.decryptHeld runs (minus React state plumbing). Keeping it in one
// place makes the "faithful to the call site" intent explicit for every test below.
function decryptHeldViaFallback(state: IdentityState, response: OpenMessageResponse) {
  return decryptWithKeyFallback(allPrivateKeysForDecrypt(state), (key) =>
    decryptOpenResponse(response, key, ID),
  );
}

describe("ReaderFlow decryptHeld key-fallback (real crypto seam)", () => {
  it("opens a link sealed to a RETIRED key via fallback, consuming no /open", async () => {
    const activeIdentity = await generateIdentity();
    const retiredIdentity = await generateIdentity();
    const retiredPubkey = exportPublicKey(retiredIdentity);

    // Sealed to the PRE-rotation (retired) public key only.
    const response = responseWith(await sealTextTo(retiredPubkey, "legacy secret"));
    const state = unlockedState(activeIdentity, [retiredIdentity]);

    // Any network call here would be a second /open. The local decrypt must never touch fetch.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const output = await decryptHeldViaFallback(state, response);

    expect(output.text).toBe("legacy secret");
    expect(fetchSpy).not.toHaveBeenCalled();

    // Prove the fallback was load-bearing: the ACTIVE key alone cannot open this legacy ciphertext,
    // so decryptOpenResponse rebuilds the exact retired-key AAD binding to succeed.
    await expect(decryptOpenResponse(response, activeIdentity, ID)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("tries the ACTIVE key first, then the retired key", async () => {
    const activeIdentity = await generateIdentity();
    const retiredIdentity = await generateIdentity();

    const response = responseWith(
      await sealTextTo(exportPublicKey(retiredIdentity), "after active"),
    );
    const state = unlockedState(activeIdentity, [retiredIdentity]);

    const tried: IdentityKeypair[] = [];
    const output = await decryptWithKeyFallback(allPrivateKeysForDecrypt(state), (key) => {
      tried.push(key);
      return decryptOpenResponse(response, key, ID);
    });

    expect(output.text).toBe("after active");
    // active attempted (DecryptionError, swallowed) → retired attempted (success).
    expect(tried).toEqual([activeIdentity, retiredIdentity]);
  });

  it("opens directly on the ACTIVE key without touching retired keys", async () => {
    const activeIdentity = await generateIdentity();
    const retiredIdentity = await generateIdentity();

    const response = responseWith(
      await sealTextTo(exportPublicKey(activeIdentity), "current secret"),
    );
    const state = unlockedState(activeIdentity, [retiredIdentity]);

    const tried: IdentityKeypair[] = [];
    const output = await decryptWithKeyFallback(allPrivateKeysForDecrypt(state), (key) => {
      tried.push(key);
      return decryptOpenResponse(response, key, ID);
    });

    expect(output.text).toBe("current secret");
    expect(tried).toEqual([activeIdentity]);
  });

  it("fails TERMINALLY (→ 'failed') when NO held key can decrypt", async () => {
    const activeIdentity = await generateIdentity();
    const retiredIdentity = await generateIdentity();
    const strangerIdentity = await generateIdentity();

    // Sealed to a key this device never held — neither active nor retired can open it.
    const response = responseWith(
      await sealTextTo(exportPublicKey(strangerIdentity), "not for you"),
    );
    const state = unlockedState(activeIdentity, [retiredIdentity]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // The fallback rethrows the last DecryptionError, which ReaderFlow classifies as the opaque
    // DecryptionFailed terminal — no recovery, and crucially NO re-open.
    await expect(decryptHeldViaFallback(state, response)).rejects.toBeInstanceOf(DecryptionError);
    await decryptHeldViaFallback(state, response).catch((err) => {
      expect(classifyReaderError(err, "open")).toBe("failed");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
