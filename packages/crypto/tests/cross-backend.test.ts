import { afterEach, describe, expect, it } from "vitest";
import type { MessageBindingContext } from "../src/aad.js";
import {
  __resetKemBackendForTests,
  __setKemBackendForTests,
  deriveKeypairFromIkm,
  exportRawPrivateKey,
  exportRawPublicKey,
} from "../src/hpke.js";
import { exportPublicKey } from "../src/identity.js";
import { decodePayload, encodePayload } from "../src/payload.js";
import { open, seal } from "../src/seal.js";
import { __test_only_identityFromIKM } from "../src/test-only.js";
import type { Ciphertext, IdentityKeypair, RecipientPublicKey } from "../src/types.js";

// These tests prove that the native (Web Crypto subtle X25519) backend used on web/Node and the
// pure-JS noble backend used on Hermes produce byte-identical, mutually-decryptable output. This
// is the web(native) <-> mobile(noble) interop guarantee at the wire-byte level.

const CTX_BASE = {
  linkId: "abcdefghij012345",
  createdAtMs: 1_700_000_000_000,
  expiresAtMs: 1_700_086_400_000,
  maxOpens: 1,
} as const;

async function identityFromIkmUnder(
  backend: "native" | "noble",
  ikm: Uint8Array,
): Promise<IdentityKeypair> {
  __setKemBackendForTests(backend);
  try {
    process.env.NODE_ENV = "test";
    return await __test_only_identityFromIKM(ikm);
  } finally {
    __resetKemBackendForTests();
  }
}

async function importPublicKeyUnder(
  backend: "native" | "noble",
  s: string,
): Promise<RecipientPublicKey> {
  __setKemBackendForTests(backend);
  try {
    // dynamic import to ensure the backend selection is observed by importPublicKey path
    const { importPublicKey } = await import("../src/identity.js");
    return await importPublicKey(s);
  } finally {
    __resetKemBackendForTests();
  }
}

async function sealUnder(
  backend: "native" | "noble",
  plaintext: Uint8Array,
  recipient: RecipientPublicKey,
  context: MessageBindingContext,
): Promise<Ciphertext> {
  __setKemBackendForTests(backend);
  try {
    return await seal(plaintext, recipient, context);
  } finally {
    __resetKemBackendForTests();
  }
}

async function openUnder(
  backend: "native" | "noble",
  ciphertext: Ciphertext,
  id: IdentityKeypair,
  context: MessageBindingContext,
): Promise<Uint8Array> {
  __setKemBackendForTests(backend);
  try {
    return await open(ciphertext, id, context);
  } finally {
    __resetKemBackendForTests();
  }
}

describe("cross-backend KEM interop (native <-> noble)", () => {
  afterEach(() => {
    __resetKemBackendForTests();
  });

  it("derives byte-identical raw public + private keys from a fixed IKM under both backends", async () => {
    const ikm = new Uint8Array(32).fill(0x42);

    __setKemBackendForTests("native");
    const nativeKp = await deriveKeypairFromIkm(ikm);
    const nativePub = await exportRawPublicKey(nativeKp.publicKey);
    const nativePriv = await exportRawPrivateKey(nativeKp.privateKey);
    __resetKemBackendForTests();

    __setKemBackendForTests("noble");
    const nobleKp = await deriveKeypairFromIkm(ikm);
    const noblePub = await exportRawPublicKey(nobleKp.publicKey);
    const noblePriv = await exportRawPrivateKey(nobleKp.privateKey);
    __resetKemBackendForTests();

    expect(Array.from(noblePub)).toEqual(Array.from(nativePub));
    expect(Array.from(noblePriv)).toEqual(Array.from(nativePriv));
  });

  it("native seal -> noble open round-trips a text payload", async () => {
    const ikm = new Uint8Array(32).fill(0x11);
    // Identity keys are byte-identical across backends (proven above), so derive once per backend.
    const recipientNoble = await identityFromIkmUnder("noble", ikm);
    const recipientPkString = exportPublicKey(recipientNoble);
    const recipientPkNative = await importPublicKeyUnder("native", recipientPkString);

    const ctx: MessageBindingContext = { ...CTX_BASE, recipientPublicKey: recipientPkString };
    const payload = encodePayload({ text: "native->noble secret", attachments: [] });

    const ct = await sealUnder("native", payload, recipientPkNative, ctx);
    const recovered = await openUnder("noble", ct, recipientNoble, ctx);
    expect(decodePayload(recovered).text).toBe("native->noble secret");
  });

  it("noble seal -> native open round-trips a text payload", async () => {
    const ikm = new Uint8Array(32).fill(0x22);
    const recipientNative = await identityFromIkmUnder("native", ikm);
    const recipientPkString = exportPublicKey(recipientNative);
    const recipientPkNoble = await importPublicKeyUnder("noble", recipientPkString);

    const ctx: MessageBindingContext = { ...CTX_BASE, recipientPublicKey: recipientPkString };
    const payload = encodePayload({ text: "noble->native secret", attachments: [] });

    const ct = await sealUnder("noble", payload, recipientPkNoble, ctx);
    const recovered = await openUnder("native", ct, recipientNative, ctx);
    expect(decodePayload(recovered).text).toBe("noble->native secret");
  });

  it("native seal -> noble open round-trips a payload with an attachment", async () => {
    const ikm = new Uint8Array(32).fill(0x33);
    const recipientNoble = await identityFromIkmUnder("noble", ikm);
    const recipientPkString = exportPublicKey(recipientNoble);
    const recipientPkNative = await importPublicKeyUnder("native", recipientPkString);

    const ctx: MessageBindingContext = { ...CTX_BASE, recipientPublicKey: recipientPkString };
    const fileBytes = new Uint8Array(256);
    for (let i = 0; i < fileBytes.length; i++) fileBytes[i] = (i * 7) & 0xff;
    const payload = encodePayload({
      text: "see attached",
      attachments: [
        { filename: "secret.bin", mimetype: "application/octet-stream", bytes: fileBytes },
      ],
    });

    const ct = await sealUnder("native", payload, recipientPkNative, ctx);
    const recovered = await openUnder("noble", ct, recipientNoble, ctx);
    const decoded = decodePayload(recovered);
    expect(decoded.text).toBe("see attached");
    expect(decoded.attachments).toHaveLength(1);
    expect(decoded.attachments[0]?.filename).toBe("secret.bin");
    expect(Array.from(decoded.attachments[0]?.bytes ?? new Uint8Array())).toEqual(
      Array.from(fileBytes),
    );
  });

  it("noble seal -> native open round-trips a payload with an attachment", async () => {
    const ikm = new Uint8Array(32).fill(0x44);
    const recipientNative = await identityFromIkmUnder("native", ikm);
    const recipientPkString = exportPublicKey(recipientNative);
    const recipientPkNoble = await importPublicKeyUnder("noble", recipientPkString);

    const ctx: MessageBindingContext = { ...CTX_BASE, recipientPublicKey: recipientPkString };
    const fileBytes = new Uint8Array(512);
    for (let i = 0; i < fileBytes.length; i++) fileBytes[i] = (i * 13 + 5) & 0xff;
    const payload = encodePayload({
      text: "from mobile",
      attachments: [{ filename: "doc.pdf", mimetype: "application/pdf", bytes: fileBytes }],
    });

    const ct = await sealUnder("noble", payload, recipientPkNoble, ctx);
    const recovered = await openUnder("native", ct, recipientNative, ctx);
    const decoded = decodePayload(recovered);
    expect(decoded.text).toBe("from mobile");
    expect(decoded.attachments).toHaveLength(1);
    expect(decoded.attachments[0]?.mimetype).toBe("application/pdf");
    expect(Array.from(decoded.attachments[0]?.bytes ?? new Uint8Array())).toEqual(
      Array.from(fileBytes),
    );
  });
});
