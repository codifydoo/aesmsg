import {
  type Ciphertext,
  decodePayload,
  encodePayload,
  exportPublicKey,
  fingerprint,
  type IdentityKeypair,
  importPublicKey,
  type MessageBindingContext,
  open,
  type PublicKeyString,
  seal,
} from "@aesmsg/crypto";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { decryptWithKeyFallback } from "@/src/identity/decrypt-keys";
import {
  type IdentityContextValue,
  IdentityProvider,
  WrongPassphraseError,
} from "@/src/identity/identity-context";
import { loadIdentity } from "@/src/identity/identity-store";
import { loadRetiredEntries } from "@/src/identity/retired-keys-store";
import { useIdentity } from "@/src/identity/use-identity";

const PASSPHRASE = "correct horse battery staple";
const WRONG = "not the passphrase at all";
const LINK_ID = "abcdefghijkl0123";
const DB_NAME = "aesmsg-webapp";

let ctx: IdentityContextValue;
function Capture() {
  ctx = useIdentity();
  return <div data-testid="state">{ctx.state}</div>;
}

function renderProvider() {
  return render(
    <IdentityProvider>
      <Capture />
    </IdentityProvider>,
  );
}

async function waitForState(value: string) {
  await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent(value));
}

// Seal a message TO `recipientPk` (as a sender would), returning the ciphertext + its binding facts.
async function sealTo(recipientPk: PublicKeyString) {
  const expiresAtMs = Date.now() + 60_000;
  const maxOpens = 1;
  const context: MessageBindingContext = {
    linkId: LINK_ID,
    recipientPublicKey: recipientPk,
    expiresAtMs,
    maxOpens,
  };
  const ciphertext = await seal(
    encodePayload({ text: "sealed to the old key", attachments: [] }),
    await importPublicKey(recipientPk),
    context,
  );
  return { ciphertext, expiresAtMs, maxOpens };
}

// Open with the key-fallback set, re-deriving each tried key's own AAD (exactly like the reader).
function openWithFallback(
  keys: IdentityKeypair[],
  sealed: { ciphertext: Ciphertext; expiresAtMs: number; maxOpens: number },
): Promise<string> {
  return decryptWithKeyFallback(keys, async (key) => {
    const ownPk = exportPublicKey(key);
    const context: MessageBindingContext = {
      linkId: LINK_ID,
      recipientPublicKey: ownPk,
      expiresAtMs: sealed.expiresAtMs,
      maxOpens: sealed.maxOpens,
    };
    const plaintext = await open(sealed.ciphertext, key, context);
    return decodePayload(plaintext).text;
  });
}

describe("key rotation (retain old keys)", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
  });

  it("rotate retains the old key: a message sealed to the OLD key still opens after rotation", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });

    const oldPk = ctx.publicKeyString as PublicKeyString;
    const sealed = await sealTo(oldPk);

    let newPk: PublicKeyString = oldPk;
    await act(async () => {
      newPk = await ctx.rotate(PASSPHRASE);
    });

    // The active key changed to a brand-new fingerprint.
    expect(newPk).not.toBe(oldPk);
    expect(ctx.publicKeyString).toBe(newPk);

    // The retired entry retains the old key (wrapped) + its public fingerprint.
    const retired = await loadRetiredEntries();
    expect(retired).toHaveLength(1);
    expect(retired[0]?.publicKeyString).toBe(oldPk);
    expect(retired[0]?.fingerprint).toBe(await fingerprint(oldPk));

    // The in-memory key set still opens the pre-rotation (legacy) link.
    const opened = await openWithFallback(ctx.getAllPrivateKeysForDecrypt(), sealed);
    expect(opened).toBe("sealed to the old key");
  });

  it("the retained retired key survives a lock → unlock round-trip under the SAME passphrase", async () => {
    // Heavy: setupNew + rotate + unlock + the BACKGROUND retired unwrap are all Argon2id (m=64 MiB).
    const first = renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    const oldPk = ctx.publicKeyString as PublicKeyString;
    const sealed = await sealTo(oldPk);
    await act(async () => {
      await ctx.rotate(PASSPHRASE);
    });
    first.unmount();

    // Re-mount → locked; the single login passphrase must unwrap BOTH the active and the retired key.
    renderProvider();
    await waitForState("locked");
    await act(async () => {
      await ctx.unlock(PASSPHRASE);
    });
    await waitForState("unlocked");

    // Unlock goes "unlocked" on the ACTIVE key immediately; the retired key is unwrapped in the
    // BACKGROUND (heavy Argon2id). Await that settle rather than assuming it was ready at unlock.
    await waitFor(() => expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(2), {
      timeout: 20_000,
    });
    const keys = ctx.getAllPrivateKeysForDecrypt();
    expect(keys).toHaveLength(2); // active + one retired
    expect(await openWithFallback(keys, sealed)).toBe("sealed to the old key");
  }, 30_000);

  it("rotate with the wrong passphrase throws WrongPassphraseError and leaves the identity unchanged", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });

    const before = await loadIdentity("primary");
    const beforePk = ctx.publicKeyString;

    let thrown: unknown;
    await act(async () => {
      thrown = await ctx.rotate(WRONG).catch((e) => e);
    });

    expect(thrown).toBeInstanceOf(WrongPassphraseError);
    // Identity + stored envelope untouched, and no retired key was created.
    expect(ctx.publicKeyString).toBe(beforePk);
    const after = await loadIdentity("primary");
    expect(after?.wrapped).toBe(before?.wrapped);
    expect(after?.publicKeyString).toBe(before?.publicKeyString);
    expect(await loadRetiredEntries()).toEqual([]);
  });

  it("wipe clears the retired keys and returns to no_identity", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    await act(async () => {
      await ctx.rotate(PASSPHRASE);
    });
    expect(await loadRetiredEntries()).toHaveLength(1);

    await act(async () => {
      await ctx.wipe();
    });

    expect(ctx.state).toBe("no_identity");
    expect(await loadRetiredEntries()).toEqual([]);
    expect(ctx.getAllPrivateKeysForDecrypt()).toEqual([]);
  });

  it("INVARIANT: storage only ever holds WrappedKey envelopes — never a raw keypair", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    await act(async () => {
      await ctx.rotate(PASSPHRASE);
    });

    // The active identity's only key-bearing field is the wrapped envelope.
    const active = await loadIdentity("primary");
    const env = JSON.parse(active?.wrapped ?? "{}");
    expect(env.kdf).toBe("argon2id-aes256gcm");
    expect(env.v).toBe(1);

    // Every retired entry stores its private key ONLY as a wrapped envelope (never raw).
    const retired = await loadRetiredEntries();
    for (const entry of retired) {
      const renv = JSON.parse(entry.wrapped);
      expect(renv.kdf).toBe("argon2id-aes256gcm");
      expect(renv.v).toBe(1);
      // The plaintext private key must never appear as a field on the entry.
      expect(Object.keys(entry).sort()).toEqual(
        ["fingerprint", "publicKeyString", "retiredAtMs", "wrapped"].sort(),
      );
    }

    // Only the one webapp database exists.
    const dbs = (await indexedDB.databases())
      .map((d) => d.name)
      .filter((n): n is string => typeof n === "string");
    expect(dbs).toEqual([DB_NAME]);
  });
});
