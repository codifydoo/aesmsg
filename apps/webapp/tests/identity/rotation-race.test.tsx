import type { PublicKeyString } from "@aesmsg/crypto";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __deleteDbForTests } from "@/src/identity/db";
import { type IdentityContextValue, IdentityProvider } from "@/src/identity/identity-context";
import { loadIdentity } from "@/src/identity/identity-store";
import { loadRetiredEntries } from "@/src/identity/retired-keys-store";
import { useIdentity } from "@/src/identity/use-identity";

// A controllable gate over the IndexedDB `loadIdentity` read that rotate() performs BEFORE it snapshots
// the epoch (pre-FIX-2). When armed, `loadIdentity` hands back a promise WE resolve, letting the test
// freeze rotate exactly at that read and land a full wipe() before it resolves. FIX 2 snapshots the
// epoch at the very TOP of rotate (before this read) and re-checks it right after, so a wipe during the
// read aborts the rotation — otherwise the later write would re-put the wiped identity to disk.
const loadIdentityGate = vi.hoisted(() => {
  let armed = false;
  let called = false;
  let resolveHeld: ((value: unknown) => void) | null = null;
  return {
    arm() {
      armed = true;
      called = false;
      resolveHeld = null;
    },
    take() {
      called = true;
      return new Promise((resolve) => {
        resolveHeld = resolve;
      });
    },
    isArmed() {
      return armed;
    },
    wasCalled() {
      return called;
    },
    resolveWith(value: unknown) {
      resolveHeld?.(value);
    },
    disarm() {
      armed = false;
      called = false;
      resolveHeld = null;
    },
  };
});

vi.mock("@/src/identity/identity-store", async () => {
  const actual = await vi.importActual<typeof import("@/src/identity/identity-store")>(
    "@/src/identity/identity-store",
  );
  return {
    ...actual,
    // Only intercept `loadIdentity`, and only while armed — save/has/delete run the real store so
    // setup + the post-abort assertions observe genuine on-disk state.
    loadIdentity: (...args: Parameters<typeof actual.loadIdentity>) =>
      loadIdentityGate.isArmed() ? loadIdentityGate.take() : actual.loadIdentity(...args),
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

describe("IdentityProvider rotate-vs-wipe race (FIX 2)", () => {
  beforeEach(async () => {
    loadIdentityGate.disarm();
    await __deleteDbForTests();
  });

  it("REGRESSION: a wipe() during rotate's loadIdentity read aborts — nothing is re-put to disk", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });

    // Capture the real stored envelope while the gate is disarmed (real read) — we resolve rotate's
    // gated read with THIS non-null record so rotate proceeds past its null-check and into the epoch
    // guard (rather than aborting on a coincidental null).
    const stored = await loadIdentity("primary");
    expect(stored).not.toBeNull();
    const activePkBefore = ctx.publicKeyString as PublicKeyString;

    // Arm the gate and start a rotation; it parks at the `await loadIdentity(PRIMARY)` read.
    loadIdentityGate.arm();
    let rotateResult: { ok?: PublicKeyString; err?: unknown } = {};
    const rotatePromise = ctx.rotate(PASSPHRASE).then(
      (ok) => {
        rotateResult = { ok };
      },
      (err) => {
        rotateResult = { err };
      },
    );
    await waitFor(() => expect(loadIdentityGate.wasCalled()).toBe(true));

    // A full wipe() completes while rotate is still parked at that read (bumps the epoch).
    await act(async () => {
      await ctx.wipe();
    });
    expect(ctx.state).toBe("no_identity");

    // The read now resolves with the (pre-wipe) record. rotate must detect the epoch moved and abort
    // BEFORE writing anything.
    await act(async () => {
      loadIdentityGate.resolveWith(stored);
      await rotatePromise;
    });
    loadIdentityGate.disarm();

    // Rotation aborted (did not resolve with a new key).
    expect(rotateResult.ok).toBeUndefined();
    expect(rotateResult.err).toBeInstanceOf(Error);
    expect((rotateResult.err as Error).message).toMatch(/aborted|state changed/i);

    // State stays no_identity, and NOTHING was written: no active identity re-put, no retired entry.
    expect(ctx.state).toBe("no_identity");
    expect(await loadIdentity("primary")).toBeNull();
    expect(await loadRetiredEntries()).toEqual([]);
    // The pre-wipe active key was never resurrected in memory.
    expect(ctx.identity).toBeNull();
    expect(ctx.publicKeyString).toBeNull();
    expect(activePkBefore).not.toBeNull();
  }, 30_000);
});
