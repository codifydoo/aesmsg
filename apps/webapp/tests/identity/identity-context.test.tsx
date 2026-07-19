import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __deleteDbForTests,
  CONTACTS_STORE,
  IDENTITY_STORE,
  SENT_LINKS_STORE,
} from "@/src/identity/db";
import {
  IdentityContext,
  type IdentityContextValue,
  IdentityProvider,
} from "@/src/identity/identity-context";
import { loadIdentity } from "@/src/identity/identity-store";
import { useIdentity } from "@/src/identity/use-identity";

const PASSPHRASE = "correct horse battery staple";
const WRONG = "not the passphrase at all";
const DB_NAME = "aesmsg-webapp";

function storageKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/**
 * Sweep EVERY client-side storage surface this origin can reach, so the "wrapped-only" invariant
 * is checked against reality rather than one lookup: all IndexedDB databases, the identity DB's
 * object stores + every record it holds, and both Web Storage areas.
 */
async function sweepStorage() {
  const dbs = await indexedDB.databases();
  const dbNames = dbs
    .map((d) => d.name)
    .filter((n): n is string => typeof n === "string")
    .sort();

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const storeNames = Array.from(db.objectStoreNames).sort();
  const records = await new Promise<unknown[]>((resolve, reject) => {
    const req = db.transaction(IDENTITY_STORE, "readonly").objectStore(IDENTITY_STORE).getAll();
    req.onsuccess = () => resolve(req.result as unknown[]);
    req.onerror = () => reject(req.error);
  });
  db.close();

  return {
    dbNames,
    storeNames,
    records,
    localStorageKeys: storageKeys(localStorage),
    sessionStorageKeys: storageKeys(sessionStorage),
  };
}

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

describe("IdentityProvider state machine", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
  });

  it("resolves a fresh device to no_identity", async () => {
    renderProvider();
    await waitForState("no_identity");
    expect(ctx.identity).toBeNull();
    expect(ctx.publicKeyString).toBeNull();
  });

  it("setupNew generates + wraps + persists and transitions to unlocked", async () => {
    renderProvider();
    await waitForState("no_identity");

    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });

    expect(ctx.state).toBe("unlocked");
    expect(ctx.identity).not.toBeNull();
    expect(ctx.publicKeyString).not.toBeNull();
    expect(await loadIdentity("primary")).not.toBeNull();
  });

  it("re-mounting with the same DB comes up locked (private key not in memory)", async () => {
    const first = renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    first.unmount();

    renderProvider();
    await waitForState("locked");
    expect(ctx.identity).toBeNull();
  });

  it("unlock with the wrong passphrase stays locked and sets the flag (no throw)", async () => {
    const first = renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    first.unmount();

    renderProvider();
    await waitForState("locked");

    await act(async () => {
      await ctx.unlock(WRONG);
    });

    expect(ctx.state).toBe("locked");
    expect(ctx.wrongPassphrase).toBe(true);
    expect(ctx.identity).toBeNull();
  });

  it("unlock with the correct passphrase transitions to unlocked", async () => {
    const first = renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    first.unmount();

    renderProvider();
    await waitForState("locked");
    await act(async () => {
      await ctx.unlock(PASSPHRASE);
    });

    expect(ctx.state).toBe("unlocked");
    expect(ctx.identity).not.toBeNull();
  });

  it("lock drops the in-memory key and returns to locked", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    expect(ctx.state).toBe("unlocked");

    act(() => {
      ctx.lock();
    });
    expect(ctx.state).toBe("locked");
    expect(ctx.identity).toBeNull();
  });

  it("wipe deletes the identity and returns to no_identity", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });

    await act(async () => {
      await ctx.wipe();
    });

    expect(ctx.state).toBe("no_identity");
    expect(await loadIdentity("primary")).toBeNull();
  });

  it("requireUnlocked returns the key when unlocked and throws when locked", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });
    expect(ctx.requireUnlocked()).toBe(ctx.identity);

    act(() => {
      ctx.lock();
    });
    expect(() => ctx.requireUnlocked()).toThrow(/locked/i);
  });

  it("INVARIANT: storage only ever holds the wrapped envelope — never an unwrapped key", async () => {
    renderProvider();
    await waitForState("no_identity");
    await act(async () => {
      await ctx.setupNew(PASSPHRASE);
    });

    // Sweep ALL client storage — not just one lookup — and assert nothing beyond the single
    // wrapped-envelope record exists anywhere.
    const sweep = await sweepStorage();
    expect(sweep.dbNames).toEqual([DB_NAME]); // the only database is our webapp store
    // Since SP2 the DB also carries the (empty here) sent-links store, and since SP4 the (empty
    // here) contacts store, alongside identity.
    expect(sweep.storeNames).toEqual([IDENTITY_STORE, SENT_LINKS_STORE, CONTACTS_STORE].sort());
    expect(sweep.records).toHaveLength(1); // with exactly one identity record
    expect(sweep.localStorageKeys).toEqual([]); // and nothing leaked to Web Storage
    expect(sweep.sessionStorageKeys).toEqual([]);

    // That record's shape is exactly the declared metadata + the wrapped envelope — no extra
    // (potentially key-bearing) fields. An exact key set is an assertion that can actually fail.
    const record = sweep.records[0] as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(
      ["createdAt", "id", "publicKeyString", "schemaVersion", "wrapped"].sort(),
    );

    // The only key-bearing field is `wrapped`, and it is the versioned Argon2id/AES-256-GCM
    // envelope produced by wrapPrivateKey — the raw private key lives solely inside its ciphertext.
    const env = JSON.parse(record.wrapped as string);
    expect(env.kdf).toBe("argon2id-aes256gcm");
    expect(env.v).toBe(1);

    // Cross-check that the store-level loader observes the same single record.
    expect(await loadIdentity("primary")).not.toBeNull();

    // The unwrapped keypair exists ONLY in the live context value, never on disk.
    expect(ctx.identity).not.toBeNull();
  });

  it("useIdentity throws when rendered outside a provider", () => {
    function Bare() {
      useIdentity();
      return null;
    }
    // Suppress React's error boundary console noise is unnecessary; assert the throw.
    expect(() => render(<Bare />)).toThrow(/IdentityProvider/);
    // Reference the context export so it is covered/imported intentionally.
    expect(IdentityContext).toBeTruthy();
  });
});
