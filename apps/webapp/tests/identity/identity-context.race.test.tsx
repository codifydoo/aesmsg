import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { loadIdentity } from "@/src/identity/identity-store";
import { useIdentity } from "@/src/identity/use-identity";

// A controllable gate over the (deliberately slow) Argon2id unwrap. When "armed", `unwrapPrivateKey`
// hands back a promise WE resolve, letting the test freeze an in-flight unlock exactly at the KDF
// await and interleave a wipe() before it resolves. `vi.hoisted` is required because a `vi.mock`
// factory is hoisted above imports and may only close over hoisted values.
const kdfGate = vi.hoisted(() => {
  let deferred: { promise: Promise<unknown>; resolve: (value: unknown) => void } | null = null;
  let armed = false;
  let called = false;
  return {
    arm() {
      let resolve!: (value: unknown) => void;
      const promise = new Promise<unknown>((r) => {
        resolve = r;
      });
      deferred = { promise, resolve };
      armed = true;
      called = false;
    },
    take() {
      called = true;
      if (deferred === null) throw new Error("kdfGate.take() called while disarmed");
      return deferred.promise;
    },
    isArmed() {
      return armed;
    },
    wasCalled() {
      return called;
    },
    release(value: unknown) {
      deferred?.resolve(value);
    },
    disarm() {
      deferred = null;
      armed = false;
      called = false;
    },
  };
});

vi.mock("@aesmsg/crypto", async () => {
  const actual = await vi.importActual<typeof import("@aesmsg/crypto")>("@aesmsg/crypto");
  return {
    ...actual,
    // Only intercept the unwrap, and only while armed — everything else (generate/wrap/export)
    // runs the real primitives so setup remains faithful.
    unwrapPrivateKey: (...args: Parameters<typeof actual.unwrapPrivateKey>) =>
      kdfGate.isArmed() ? kdfGate.take() : actual.unwrapPrivateKey(...args),
  };
});

const PASSPHRASE = "correct horse battery staple";

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

describe("IdentityProvider unlock-vs-wipe race", () => {
  beforeEach(async () => {
    kdfGate.disarm();
    await __deleteDbForTests();
  });

  it("REGRESSION: a wipe() during the unlock KDF await must not resurrect the key", async () => {
    // Seed a real identity, then capture the genuine unwrapped keypair to "return" from the gated
    // unwrap later — this simulates the KDF succeeding after the wipe has already happened.
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    const realKey = ctx.identity;
    if (realKey === null) throw new Error("expected an unlocked identity after setup");

    act(() => {
      ctx.lock();
    });
    await waitForState("locked");

    // Start an unlock and let it advance INTO the (now gated) Argon2id unwrap, then hold it there.
    kdfGate.arm();
    const unlockPromise = ctx.unlock(PASSPHRASE);
    await waitFor(() => expect(kdfGate.wasCalled()).toBe(true));

    // Wipe fully completes while the unlock is still parked at the KDF await.
    await act(async () => {
      await ctx.wipe();
    });
    expect(ctx.state).toBe("no_identity");

    // Now the KDF "succeeds" and returns a valid keypair — the unlock must abandon it.
    await act(async () => {
      kdfGate.release(realKey);
      await unlockPromise;
    });

    expect(ctx.state).toBe("no_identity");
    expect(ctx.identity).toBeNull();
    expect(ctx.publicKeyString).toBeNull();
    // requireUnlocked must still throw — no key was retained in memory.
    expect(() => ctx.requireUnlocked()).toThrow(/locked/i);
    // And the wipe genuinely removed the persisted envelope.
    expect(await loadIdentity("primary")).toBeNull();
  });
});
