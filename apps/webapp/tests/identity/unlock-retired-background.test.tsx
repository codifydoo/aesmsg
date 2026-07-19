import {
  type Ciphertext,
  decodePayload,
  encodePayload,
  exportPublicKey,
  type IdentityKeypair,
  importPublicKey,
  type MessageBindingContext,
  open,
  type PublicKeyString,
  seal,
} from "@aesmsg/crypto";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { decryptWithKeyFallback } from "@/src/identity/decrypt-keys";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { loadRetiredEntries } from "@/src/identity/retired-keys-store";
import { useIdentity } from "@/src/identity/use-identity";

// A controllable gate over the (deliberately slow) Argon2id unwrap of a SPECIFIC envelope — the
// RETIRED key's. Because FIX 1 unwraps retired keys in the BACKGROUND after the active unlock, this
// lets a test freeze that background unwrap at the KDF await and interleave a lock()/wipe() before
// releasing it. Only the target envelope is intercepted; the ACTIVE unwrap (a different envelope)
// always runs the real primitive, so the identity genuinely goes "unlocked". Multiple in-flight
// unwraps of the target are queued so a stale (killed-session) unwrap can be released independently.
const retiredGate = vi.hoisted(() => {
  let targetWrapped: string | null = null;
  const held: Array<(value: unknown) => void> = [];
  return {
    holdEnvelope(wrapped: string) {
      targetWrapped = wrapped;
      held.length = 0;
    },
    // Called by the mock. Returns a held promise iff `wrapped` is the target, else null (→ real).
    intercept(wrapped: string): Promise<unknown> | null {
      if (targetWrapped === null || wrapped !== targetWrapped) return null;
      return new Promise((resolve) => {
        held.push(resolve);
      });
    },
    heldCount() {
      return held.length;
    },
    // Resolve the Nth held unwrap with `value` (the unwrapped keypair): the KDF "succeeds".
    releaseAt(index: number, value: unknown) {
      held[index]?.(value);
    },
    reset() {
      targetWrapped = null;
      held.length = 0;
    },
  };
});

vi.mock("@aesmsg/crypto", async () => {
  const actual = await vi.importActual<typeof import("@aesmsg/crypto")>("@aesmsg/crypto");
  return {
    ...actual,
    // Intercept ONLY the retired envelope's unwrap; everything else (generate/wrap/export/seal/open
    // and the active unwrap) runs the real primitives so the flow stays faithful.
    unwrapPrivateKey: (...args: Parameters<typeof actual.unwrapPrivateKey>) => {
      const held = retiredGate.intercept(args[0] as string);
      return held ?? actual.unwrapPrivateKey(...args);
    },
  };
});

const PASSPHRASE = "correct horse battery staple";
const OTHER_PASSPHRASE = "a different login secret entirely";
const LINK_ID = "abcdefghijkl0123";

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
    return decodePayload(await open(sealed.ciphertext, key, context)).text;
  });
}

// Set up an identity, seal a legacy message to it, then rotate once so there is exactly one RETIRED
// key on disk. Returns the retired envelope (for gating), the real retired keypair (for releasing the
// gate + decrypting), and the sealed legacy message.
async function setupRotatedIdentity() {
  await act(async () => {
    await ctx.setupNew(PASSPHRASE);
  });
  const oldPk = ctx.publicKeyString as PublicKeyString;
  const sealed = await sealTo(oldPk);
  await act(async () => {
    await ctx.rotate(PASSPHRASE);
  });
  // After rotation the in-memory set is [newActive, oldActive]; capture the real retired keypair.
  const retiredKey = ctx.getAllPrivateKeysForDecrypt()[1] as IdentityKeypair;
  const retired = await loadRetiredEntries();
  const targetWrapped = retired[0]?.wrapped as unknown as string;
  return { sealed, retiredKey, targetWrapped };
}

describe("unlock applies immediately, retired keys load in the background (FIX 1)", () => {
  beforeEach(async () => {
    retiredGate.reset();
    await __deleteDbForTests();
  });

  it("goes unlocked on the ACTIVE key while a retired unwrap is still pending", async () => {
    renderProvider();
    await waitForState("no_identity");
    const { targetWrapped } = await setupRotatedIdentity();

    // Lock and re-mount so a fresh unlock must re-derive both the active and the retired key.
    act(() => {
      ctx.lock();
    });
    await waitForState("locked");

    // Gate the retired unwrap, then unlock. The active unwrap is real, so unlock resolves "unlocked"
    // even though the retired unwrap is parked at the (gated) KDF await.
    retiredGate.holdEnvelope(targetWrapped);
    await act(async () => {
      await ctx.unlock(PASSPHRASE);
    });

    expect(ctx.state).toBe("unlocked");
    expect(ctx.identity).not.toBeNull();
    // Only the active key is available yet — the retired unwrap has not settled.
    expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(1);

    // Confirm the background genuinely reached (and is parked at) the retired unwrap, and that the
    // decrypt set is STILL just the active key while it stays pending.
    await waitFor(() => expect(retiredGate.heldCount()).toBe(1));
    expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(1);
  }, 30_000);

  it("makes the retired key available to getAllPrivateKeysForDecrypt after the background settles", async () => {
    renderProvider();
    await waitForState("no_identity");
    const { sealed, retiredKey, targetWrapped } = await setupRotatedIdentity();

    act(() => {
      ctx.lock();
    });
    await waitForState("locked");

    retiredGate.holdEnvelope(targetWrapped);
    await act(async () => {
      await ctx.unlock(PASSPHRASE);
    });
    await waitFor(() => expect(retiredGate.heldCount()).toBe(1));
    expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(1);

    // Release the background retired unwrap — it now appears in the decrypt set.
    await act(async () => {
      retiredGate.releaseAt(0, retiredKey);
    });
    await waitFor(() => expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(2));

    // And it genuinely opens the pre-rotation (legacy) link the active key cannot.
    const keys = ctx.getAllPrivateKeysForDecrypt();
    expect(await openWithFallback(keys, sealed)).toBe("sealed to the old key");
  }, 30_000);

  it("REGRESSION: a lock() during the background retired-unwrap never resurrects the key", async () => {
    renderProvider();
    await waitForState("no_identity");
    const { retiredKey, targetWrapped } = await setupRotatedIdentity();

    act(() => {
      ctx.lock();
    });
    await waitForState("locked");

    // Unlock A parks its background retired unwrap at the gate (held[0]).
    retiredGate.holdEnvelope(targetWrapped);
    await act(async () => {
      await ctx.unlock(PASSPHRASE);
    });
    await waitFor(() => expect(retiredGate.heldCount()).toBe(1));

    // lock() drops the session (and bumps the epoch) while unlock A's retired unwrap is still parked.
    act(() => {
      ctx.lock();
    });
    await waitForState("locked");

    // Unlock B (a NEW session) succeeds on the active key and parks ITS background retired unwrap
    // (held[1]). Its decrypt set starts at just the active key.
    await act(async () => {
      await ctx.unlock(PASSPHRASE);
    });
    await waitFor(() => expect(retiredGate.heldCount()).toBe(2));
    expect(ctx.state).toBe("unlocked");
    expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(1);

    // Release the STALE unlock-A unwrap (from the locked-out session). The epoch guard must discard
    // it: it must NOT be resurrected into unlock B's live decrypt set. Give it ample time to (wrongly)
    // land, then assert the set is unchanged.
    await act(async () => {
      retiredGate.releaseAt(0, retiredKey);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(1);

    // Sanity: unlock B's OWN (current-epoch) retired unwrap still populates exactly one retired key —
    // no duplicate from the discarded stale unwrap.
    await act(async () => {
      retiredGate.releaseAt(1, retiredKey);
    });
    await waitFor(() => expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(2));
    expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(2);
  }, 30_000);

  it("REGRESSION: a wipe()+new identity during the background unwrap never leaks the old key", async () => {
    renderProvider();
    await waitForState("no_identity");
    const { retiredKey, targetWrapped } = await setupRotatedIdentity();

    act(() => {
      ctx.lock();
    });
    await waitForState("locked");

    // Unlock parks its background retired unwrap at the gate.
    retiredGate.holdEnvelope(targetWrapped);
    await act(async () => {
      await ctx.unlock(PASSPHRASE);
    });
    await waitFor(() => expect(retiredGate.heldCount()).toBe(1));

    // Wipe (bumps the epoch, clears the retired store) then create a BRAND-NEW identity.
    await act(async () => {
      await ctx.wipe();
    });
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(OTHER_PASSPHRASE);
    });
    expect(ctx.state).toBe("unlocked");

    // Release the stale unwrap from the WIPED identity. It must never resurrect into the new
    // identity's decrypt set (that would leak a discarded private key into a later session).
    await act(async () => {
      retiredGate.releaseAt(0, retiredKey);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(ctx.getAllPrivateKeysForDecrypt()).toHaveLength(1);
    expect(await loadRetiredEntries()).toEqual([]);
  }, 30_000);
});
