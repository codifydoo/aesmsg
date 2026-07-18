# Slice 9 — Identity-Aware Home + SideNav Rollout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 0 placeholder at `/` with an identity-aware home (Landing for `no_identity`/`locked`, Dashboard for `unlocked`) and wire `<SideNav>` chrome into a shared `(app)` route group covering `/`, `/create`, `/links`, `/contacts`, `/keys`.

**Architecture:** Next.js App Router route group `(app)` with a client-side layout that gates on `useIdentity()`. When unlocked, layout renders `<SideNav>` + page; otherwise it renders a full-bleed `<LandingScreen>` takeover and ignores `children`. The home route (`(app)/page.tsx`) renders `<HomeScreen>`, which switches Landing vs Dashboard for testability.

**Tech Stack:** Next.js 16 (Turbopack), React 19, Tailwind 4, Vitest browser mode (Chromium headless). No new deps.

**Spec:** [`docs/superpowers/specs/2026-05-10-identity-aware-home-design.md`](../specs/2026-05-10-identity-aware-home-design.md)

---

## File map

**Create:**
- `apps/web/app/(app)/layout.tsx` — client layout, wraps `<AuthenticatedShell>`
- `apps/web/app/(app)/page.tsx` — home route, renders `<HomeScreen>`
- `apps/web/src/lib/authenticated-shell.tsx` — identity-gated shell with SideNav
- `apps/web/src/lib/nav-items.ts` — `NAV_ITEMS` constant + `getActiveNavId(pathname)` helper
- `apps/web/src/home/HomeScreen.tsx` — switches Landing vs Dashboard
- `apps/web/src/home/LandingScreen.tsx` — `no_identity` + `locked` variants
- `apps/web/src/home/DashboardScreen.tsx` — full dashboard
- `apps/web/tests/lib/nav-items.test.ts`
- `apps/web/tests/lib/authenticated-shell.test.tsx`
- `apps/web/tests/home/LandingScreen.test.tsx`
- `apps/web/tests/home/HomeScreen.test.tsx`
- `apps/web/tests/home/DashboardScreen.test.tsx`

**Move (via `git mv`):**
- `apps/web/app/page.tsx` → `apps/web/app/(app)/page.tsx` (then content replaced in Task 8)
- `apps/web/app/create/` → `apps/web/app/(app)/create/`
- `apps/web/app/links/` → `apps/web/app/(app)/links/`
- `apps/web/app/contacts/` → `apps/web/app/(app)/contacts/`
- `apps/web/app/keys/` → `apps/web/app/(app)/keys/`

**Unchanged:** `apps/web/app/api/`, `apps/web/app/l/[id]/`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`.

---

## Task 1: Restructure routes into `(app)` route group

**Files:**
- Move: 5 directories under `apps/web/app/` (see file map)
- Create: `apps/web/app/(app)/layout.tsx` (pass-through stub)

**Why first:** Locks in the URL-transparent restructure before any new code lands. The pass-through layout keeps the app rendering the same as today; no behavior change yet.

- [ ] **Step 1: Move auth routes**

```bash
cd /path/to/aesmsg
mkdir -p "apps/web/app/(app)"
git mv apps/web/app/page.tsx "apps/web/app/(app)/page.tsx"
git mv apps/web/app/create "apps/web/app/(app)/create"
git mv apps/web/app/links "apps/web/app/(app)/links"
git mv apps/web/app/contacts "apps/web/app/(app)/contacts"
git mv apps/web/app/keys "apps/web/app/(app)/keys"
```

- [ ] **Step 2: Add pass-through layout**

Create `apps/web/app/(app)/layout.tsx`:

```tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Verify URLs unchanged**

```bash
pnpm --filter web typecheck
```
Expected: clean exit. Then in the running dev server, hit `/`, `/create`, `/links`, `/contacts`, `/keys`. All should render their existing content (Phase 0 placeholder for `/`; the existing screens for the others).

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```
Expected: 221/221 pass (no regressions; route group is URL-transparent).

- [ ] **Step 5: Commit**

```bash
git add -A "apps/web/app"
git commit -m "refactor(web): move auth routes into (app) route group"
```

---

## Task 2: NAV_ITEMS constant + getActiveNavId helper (TDD)

**Files:**
- Create: `apps/web/src/lib/nav-items.ts`
- Test: `apps/web/tests/lib/nav-items.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/lib/nav-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getActiveNavId, NAV_ITEMS } from "@/src/lib/nav-items.js";

describe("NAV_ITEMS", () => {
  it("contains five items in fixed order: dashboard, create, links, contacts, keys", () => {
    expect(NAV_ITEMS.map((i) => i.id)).toEqual([
      "dashboard",
      "create",
      "links",
      "contacts",
      "keys",
    ]);
  });

  it("has unique ids and non-empty labels, icons, and hrefs", () => {
    const ids = new Set(NAV_ITEMS.map((i) => i.id));
    expect(ids.size).toBe(NAV_ITEMS.length);
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/")).toBe(true);
    }
  });
});

describe("getActiveNavId", () => {
  it("returns 'dashboard' for /", () => {
    expect(getActiveNavId("/")).toBe("dashboard");
  });

  it.each([
    ["/create", "create"],
    ["/create?contact=abc", "create"],
    ["/links", "links"],
    ["/links/anything", "links"],
    ["/contacts", "contacts"],
    ["/contacts/new", "contacts"],
    ["/contacts/abc-123", "contacts"],
    ["/keys", "keys"],
  ])("returns %j for pathname %j", (pathname, expected) => {
    expect(getActiveNavId(pathname)).toBe(expected);
  });

  it("returns empty string for unknown paths", () => {
    expect(getActiveNavId("/l/abc")).toBe("");
    expect(getActiveNavId("/somewhere-else")).toBe("");
  });
});
```

- [ ] **Step 2: Run test (must fail with module not found)**

```bash
pnpm --filter web test tests/lib/nav-items.test.ts
```
Expected: FAIL — "Cannot find module '@/src/lib/nav-items'".

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/nav-items.ts`:

```ts
import type { SideNavItem } from "@aesmsg/ui";

export const NAV_ITEMS: SideNavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/" },
  { id: "create", label: "New Message", icon: "mail", href: "/create" },
  { id: "links", label: "Links", icon: "link", href: "/links" },
  { id: "contacts", label: "Contacts", icon: "group", href: "/contacts" },
  { id: "keys", label: "Keys", icon: "key", href: "/keys" },
];

export function getActiveNavId(pathname: string): string {
  if (pathname === "/") return "dashboard";
  if (pathname.startsWith("/create")) return "create";
  if (pathname.startsWith("/links")) return "links";
  if (pathname.startsWith("/contacts")) return "contacts";
  if (pathname.startsWith("/keys")) return "keys";
  return "";
}
```

- [ ] **Step 4: Run test (must pass)**

```bash
pnpm --filter web test tests/lib/nav-items.test.ts
```
Expected: all assertions pass.

- [ ] **Step 5: Lint + commit**

```bash
pnpm lint
git add apps/web/src/lib/nav-items.ts apps/web/tests/lib/nav-items.test.ts
git commit -m "feat(web): add NAV_ITEMS + getActiveNavId helper for SideNav"
```
Expected: lint exit 0.

---

## Task 3: LandingScreen component (TDD)

**Files:**
- Create: `apps/web/src/home/LandingScreen.tsx`
- Test: `apps/web/tests/home/LandingScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/home/LandingScreen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingScreen } from "@/src/home/LandingScreen.js";

describe("LandingScreen", () => {
  describe("variant=no_identity", () => {
    it("renders the hero headline", () => {
      render(<LandingScreen variant="no_identity" />);
      expect(
        screen.getByRole("heading", { level: 1, name: /encrypted links/i }),
      ).toBeInTheDocument();
    });

    it("renders three trust pillars", () => {
      render(<LandingScreen variant="no_identity" />);
      expect(screen.getByRole("heading", { name: /encrypt locally/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /share anywhere/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /recipient decrypts/i })).toBeInTheDocument();
    });

    it("renders the 'Set up your identity' CTA linking to /keys", () => {
      render(<LandingScreen variant="no_identity" />);
      const cta = screen.getByRole("link", { name: /set up your identity/i });
      expect(cta).toHaveAttribute("href", "/keys");
    });

    it("does NOT render the locked microcopy", () => {
      render(<LandingScreen variant="no_identity" />);
      expect(screen.queryByText(/already have an identity/i)).not.toBeInTheDocument();
    });
  });

  describe("variant=locked", () => {
    it("renders the 'Unlock your identity' CTA linking to /keys", () => {
      render(<LandingScreen variant="locked" />);
      const cta = screen.getByRole("link", { name: /unlock your identity/i });
      expect(cta).toHaveAttribute("href", "/keys");
    });

    it("renders the locked microcopy", () => {
      render(<LandingScreen variant="locked" />);
      expect(screen.getByText(/already have an identity on this device/i)).toBeInTheDocument();
    });

    it("does NOT render the 'Set up your identity' CTA", () => {
      render(<LandingScreen variant="locked" />);
      expect(screen.queryByRole("link", { name: /set up your identity/i })).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test (must fail)**

```bash
pnpm --filter web test tests/home/LandingScreen.test.tsx
```
Expected: FAIL — "Cannot find module '@/src/home/LandingScreen'".

- [ ] **Step 3: Implement**

Create `apps/web/src/home/LandingScreen.tsx`:

```tsx
"use client";

import { MaterialIcon } from "@aesmsg/ui";

export type LandingVariant = "no_identity" | "locked";

export interface LandingScreenProps {
  variant: LandingVariant;
}

const PILLARS = [
  {
    icon: "lock",
    title: "Encrypt locally",
    body: "Your data is encrypted in this browser before it ever touches our servers.",
  },
  {
    icon: "share",
    title: "Share anywhere",
    body: "Send the link via Slack, WhatsApp, iMessage, or email — the platform only sees random data.",
  },
  {
    icon: "vpn_key",
    title: "Recipient decrypts",
    body: "Only the holder of the matching private key can unlock and read the message.",
  },
] as const;

export function LandingScreen({ variant }: LandingScreenProps) {
  const ctaLabel = variant === "locked" ? "Unlock your identity" : "Set up your identity";

  return (
    <main className="min-h-dvh bg-background text-on-surface flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-4xl flex flex-col items-center gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-[-0.04em] max-w-3xl">
            Encrypted links for private messages and files.
          </h1>
          <p className="font-sans text-lg leading-relaxed text-on-surface-variant max-w-2xl">
            Encrypt before you send. Share through any app. Only the intended recipient can decrypt.
          </p>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {PILLARS.map((p) => (
            <li
              key={p.title}
              className="bg-surface-container/60 border border-outline-variant/10 rounded-xl p-6 flex flex-col gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center">
                <MaterialIcon name={p.icon} />
              </div>
              <h2 className="font-display text-lg font-semibold text-on-surface">{p.title}</h2>
              <p className="font-sans text-sm leading-relaxed text-on-surface-variant">{p.body}</p>
            </li>
          ))}
        </ul>

        <div className="flex flex-col items-center gap-3">
          <a
            href="/keys"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-on-primary font-label-sm uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            <MaterialIcon name={variant === "locked" ? "lock_open" : "key"} />
            <span>{ctaLabel}</span>
          </a>
          {variant === "locked" && (
            <p className="font-sans text-sm text-on-surface-variant">
              You already have an identity on this device — enter your passphrase to continue.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run test (must pass)**

```bash
pnpm --filter web test tests/home/LandingScreen.test.tsx
```
Expected: all 8 assertions pass.

- [ ] **Step 5: Lint + commit**

```bash
pnpm lint
git add apps/web/src/home/LandingScreen.tsx apps/web/tests/home/LandingScreen.test.tsx
git commit -m "feat(web): LandingScreen with no_identity + locked variants"
```

---

## Task 4: AuthenticatedShell component (TDD)

**Files:**
- Create: `apps/web/src/lib/authenticated-shell.tsx`
- Test: `apps/web/tests/lib/authenticated-shell.test.tsx`
- Modify: `apps/web/app/(app)/layout.tsx` (replace pass-through)

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/lib/authenticated-shell.test.tsx`. The shell depends on `useIdentity()` and `usePathname()` — mock both. Use `vi.mock` for the identity hook (consistent with how other tests mock providers — see `tests/contacts/ContactScreen.test.tsx` for the pattern).

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseIdentity = vi.fn();
const mockUsePathname = vi.fn();

vi.mock("@/src/hooks/use-identity.js", () => ({
  useIdentity: () => mockUseIdentity(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

import { AuthenticatedShell } from "@/src/lib/authenticated-shell.js";

describe("AuthenticatedShell", () => {
  beforeEach(() => {
    mockUseIdentity.mockReset();
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue("/");
  });

  it("renders Loading state when identity is loading", () => {
    mockUseIdentity.mockReturnValue({ state: { status: "loading" }, actions: {} });
    render(<AuthenticatedShell>Page content</AuthenticatedShell>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });

  it("renders LandingScreen no_identity when state is no_identity (children ignored)", () => {
    mockUseIdentity.mockReturnValue({ state: { status: "no_identity" }, actions: {} });
    render(<AuthenticatedShell>Page content</AuthenticatedShell>);
    expect(screen.getByRole("link", { name: /set up your identity/i })).toBeInTheDocument();
    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });

  it("renders LandingScreen locked when state is locked (children ignored)", () => {
    mockUseIdentity.mockReturnValue({
      state: { status: "locked", storedIdentity: {} },
      actions: {},
    });
    render(<AuthenticatedShell>Page content</AuthenticatedShell>);
    expect(screen.getByRole("link", { name: /unlock your identity/i })).toBeInTheDocument();
    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });

  it("renders SideNav + children when unlocked", () => {
    mockUseIdentity.mockReturnValue({
      state: { status: "unlocked", storedIdentity: {}, identity: {} },
      actions: {},
    });
    mockUsePathname.mockReturnValue("/");
    render(<AuthenticatedShell>Page content</AuthenticatedShell>);
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("aria-current", "page");
  });

  it("highlights /create as active when pathname is /create", () => {
    mockUseIdentity.mockReturnValue({
      state: { status: "unlocked", storedIdentity: {}, identity: {} },
      actions: {},
    });
    mockUsePathname.mockReturnValue("/create");
    render(<AuthenticatedShell>Page content</AuthenticatedShell>);
    expect(screen.getByRole("link", { name: /new message/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run test (must fail)**

```bash
pnpm --filter web test tests/lib/authenticated-shell.test.tsx
```
Expected: FAIL — "Cannot find module '@/src/lib/authenticated-shell'".

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/authenticated-shell.tsx`:

```tsx
"use client";

import { SideNav } from "@aesmsg/ui";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LandingScreen } from "@/src/home/LandingScreen.js";
import { useIdentity } from "@/src/hooks/use-identity.js";
import { getActiveNavId, NAV_ITEMS } from "./nav-items.js";

export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { state } = useIdentity();
  const pathname = usePathname();

  if (state.status === "loading") {
    return (
      <main className="min-h-dvh bg-background text-on-surface flex items-center justify-center">
        <p className="font-sans text-on-surface-variant">Loading…</p>
      </main>
    );
  }

  if (state.status === "no_identity") {
    return <LandingScreen variant="no_identity" />;
  }

  if (state.status === "locked") {
    return <LandingScreen variant="locked" />;
  }

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <SideNav items={NAV_ITEMS} activeId={getActiveNavId(pathname ?? "/")} />
      <main className="md:ml-64 min-h-dvh">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Run test (must pass)**

```bash
pnpm --filter web test tests/lib/authenticated-shell.test.tsx
```
Expected: 5/5 pass.

- [ ] **Step 5: Wire into the (app) layout**

Replace `apps/web/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { AuthenticatedShell } from "@/src/lib/authenticated-shell.js";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
```

- [ ] **Step 6: Run typecheck + full suite**

```bash
pnpm --filter web typecheck
pnpm --filter web test
```
Expected: clean. 221 prior + 5 new = 226 tests pass.

- [ ] **Step 7: Manual browser smoke test**

In the running dev server: hit `/`, `/create`, `/links`, `/contacts`, `/keys`. With no identity set up, all five should render the LandingScreen ("Set up your identity" CTA). The Phase 0 placeholder no longer surfaces because the layout takeover wins.

- [ ] **Step 8: Lint + commit**

```bash
pnpm lint
git add apps/web/src/lib/authenticated-shell.tsx apps/web/tests/lib/authenticated-shell.test.tsx "apps/web/app/(app)/layout.tsx"
git commit -m "feat(web): AuthenticatedShell — gate auth routes with SideNav or Landing"
```

---

## Task 5: DashboardScreen — header + Create panel + Public Key card (TDD)

**Files:**
- Create: `apps/web/src/home/DashboardScreen.tsx`
- Test: `apps/web/tests/home/DashboardScreen.test.tsx`

This task ships the static parts of the dashboard. Tasks 6 and 7 add the async cards (Recent Links, Verified Contacts) to this same component + test file.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/home/DashboardScreen.test.tsx`:

```tsx
import { exportPublicKey, generateIdentity } from "@aesmsg/crypto";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { DashboardScreen } from "@/src/home/DashboardScreen.js";

describe("DashboardScreen — header + Create + Public Key", () => {
  let identity: Awaited<ReturnType<typeof generateIdentity>>;
  let storedIdentity: { id: string; createdAt: string; schemaVersion: number; wrappedPrivateKey: string; publicKey: string; label?: string };

  beforeAll(async () => {
    identity = await generateIdentity();
    storedIdentity = {
      id: "primary",
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      wrappedPrivateKey: "x",
      publicKey: await exportPublicKey(identity.publicKey),
    };
  });

  it("renders the Vault Dashboard heading", () => {
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    expect(screen.getByRole("heading", { level: 1, name: /vault dashboard/i })).toBeInTheDocument();
  });

  it("renders the system integrity badge", () => {
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    expect(screen.getByText(/private key available on this device/i)).toBeInTheDocument();
  });

  it("renders the 'Initialize Message' CTA linking to /create", () => {
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    const cta = screen.getByRole("link", { name: /initialize message/i });
    expect(cta).toHaveAttribute("href", "/create");
  });

  it("renders the 'Advanced Options' secondary CTA also linking to /create", () => {
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    const cta = screen.getByRole("link", { name: /advanced options/i });
    expect(cta).toHaveAttribute("href", "/create");
  });

  it("renders the local public key fingerprint", async () => {
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    // Fingerprint format is SM-XXXX-XXXX-XXXX-… — match the SM- prefix
    expect(await screen.findByText(/SM-[A-Z0-9]{4}/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (must fail)**

```bash
pnpm --filter web test tests/home/DashboardScreen.test.tsx
```
Expected: FAIL — "Cannot find module '@/src/home/DashboardScreen'".

- [ ] **Step 3: Implement minimal DashboardScreen**

Create `apps/web/src/home/DashboardScreen.tsx`:

```tsx
"use client";

import {
  exportPublicKey,
  fingerprint as computeFingerprint,
  type Fingerprint,
  type IdentityKeypair,
} from "@aesmsg/crypto";
import type { StoredIdentity } from "@aesmsg/key-store";
import { FingerprintDisplay, MaterialIcon } from "@aesmsg/ui";
import { useEffect, useState } from "react";

export interface DashboardScreenProps {
  identity: IdentityKeypair;
  storedIdentity: StoredIdentity;
}

export function DashboardScreen({ identity }: DashboardScreenProps) {
  const [fp, setFp] = useState<Fingerprint | null>(null);
  const [fpError, setFpError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pub = await exportPublicKey(identity.publicKey);
        const f = await computeFingerprint(pub);
        if (!cancelled) setFp(f);
      } catch {
        if (!cancelled) setFpError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  return (
    <div className="px-8 py-8 flex flex-col gap-8 max-w-6xl">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Vault Dashboard</h1>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-tertiary-container/30 text-tertiary border border-tertiary/20 text-xs uppercase tracking-widest">
          <MaterialIcon name="verified_user" />
          <span>System Integrity — Private key available on this device</span>
        </div>
      </header>

      <section
        aria-label="Create encrypted message"
        className="bg-surface-container/60 border border-outline-variant/10 rounded-xl p-6 flex flex-col gap-4"
      >
        <h2 className="font-display text-xl font-semibold">Create Encrypted Message</h2>
        <p className="font-sans text-sm text-on-surface-variant max-w-2xl">
          Encrypt locally with AES-256-GCM. Only the intended recipient's private key can decrypt.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-primary text-on-primary font-label-sm uppercase tracking-widest hover:opacity-90"
          >
            <MaterialIcon name="bolt" />
            <span>Initialize Message</span>
          </a>
          <a
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-surface-container-high text-on-surface border border-outline-variant/20 font-label-sm uppercase tracking-widest hover:bg-surface-container-highest"
          >
            <span>Advanced Options</span>
          </a>
        </div>
      </section>

      <section
        aria-label="Local public key"
        className="bg-surface-container/60 border border-outline-variant/10 rounded-xl p-6 flex flex-col gap-4"
      >
        <h2 className="font-display text-xl font-semibold">Local Public Key</h2>
        {fpError && (
          <p className="font-sans text-sm text-error">Couldn't display public key.</p>
        )}
        {fp && <FingerprintDisplay fingerprint={fp} />}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test (must pass)**

```bash
pnpm --filter web test tests/home/DashboardScreen.test.tsx
```
Expected: 5/5 pass.

- [ ] **Step 5: Lint + commit**

```bash
pnpm lint
git add apps/web/src/home/DashboardScreen.tsx apps/web/tests/home/DashboardScreen.test.tsx
git commit -m "feat(web): DashboardScreen — vault header, Create panel, Public Key card"
```

---

## Task 6: DashboardScreen — Recent Links card (TDD)

**Files:**
- Modify: `apps/web/src/home/DashboardScreen.tsx`
- Modify: `apps/web/tests/home/DashboardScreen.test.tsx`

This task adds the third dashboard section. The data comes from `refreshAndList()` (existing in `apps/web/src/links/refresh-and-list.ts`). Use the same mocking pattern as `tests/links/LinksScreen.test.tsx` — read that file before starting to copy the pattern.

- [ ] **Step 1: Read the existing LinksScreen test for the mocking pattern**

```bash
cat apps/web/tests/links/LinksScreen.test.tsx | head -80
```

Note how it seeds `sent-links-store` and mocks `listMessages`. Use the same pattern.

- [ ] **Step 2: Add failing tests**

Append to `apps/web/tests/home/DashboardScreen.test.tsx`:

```tsx
import { recordSentLink } from "@/src/lib/sent-links-store.js";

describe("DashboardScreen — Recent Links", () => {
  let identity: Awaited<ReturnType<typeof generateIdentity>>;
  let storedIdentity: { id: string; createdAt: string; schemaVersion: number; wrappedPrivateKey: string; publicKey: string };
  const fakeFingerprint = "SM-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-1111-2222" as never;

  beforeAll(async () => {
    identity = await generateIdentity();
    storedIdentity = {
      id: "primary",
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      wrappedPrivateKey: "x",
      publicKey: await exportPublicKey(identity.publicKey),
    };
  });

  it("renders empty state when no sent links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    expect(await screen.findByText(/no links sent yet/i)).toBeInTheDocument();
  });

  it("renders top 3 most recent rows from refreshAndList()", async () => {
    // Seed 4 records so we can verify slicing to 3.
    // recordSentLink requires: id, recipientFingerprint, createdAt, expiresAt (string),
    // maxOpens, label. listSentLinks sorts by createdAt desc internally.
    const mkId = (n: number) => `link${n.toString().padStart(11, "0")}`;
    const baseDate = Date.parse("2026-05-10T12:00:00Z");
    for (let i = 0; i < 4; i++) {
      await recordSentLink({
        id: mkId(i),
        recipientFingerprint: fakeFingerprint,
        createdAt: new Date(baseDate + i * 60_000).toISOString(),
        expiresAt: new Date(baseDate + i * 60_000 + 86_400_000).toISOString(),
        maxOpens: 3,
        label: null,
      });
    }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [0, 1, 2, 3].map((i) => ({
            id: mkId(i),
            status: "active",
            opensCount: 0,
            expiresAt: new Date(baseDate + i * 60_000 + 86_400_000).toISOString(),
            recipientFingerprint: fakeFingerprint,
            maxOpens: 3,
          })),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);

    // Expect the three most-recent ids visible (links 3, 2, 1 — i=3 is newest)
    expect(await screen.findByText(/link00000000003/)).toBeInTheDocument();
    expect(screen.getByText(/link00000000002/)).toBeInTheDocument();
    expect(screen.getByText(/link00000000001/)).toBeInTheDocument();
    // Oldest (i=0) should NOT appear
    expect(screen.queryByText(/link00000000000/)).not.toBeInTheDocument();
  });

  it("renders local-only with 'Status unavailable' hint when bulk fetch rejects", async () => {
    await recordSentLink({
      id: "link00000000099",
      recipientFingerprint: fakeFingerprint,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      maxOpens: 1,
      label: null,
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));

    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);

    expect(await screen.findByText(/status unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/link00000000099/)).toBeInTheDocument();
  });

  it("includes a 'View all' link to /links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    const viewAll = await screen.findByRole("link", { name: /view all/i });
    expect(viewAll).toHaveAttribute("href", "/links");
  });
});
```

- [ ] **Step 3: Run tests (must fail on the new ones)**

```bash
pnpm --filter web test tests/home/DashboardScreen.test.tsx
```
Expected: 5/9 pass (Task 5 tests still pass; the 4 new ones fail).

- [ ] **Step 4: Add Recent Links section to DashboardScreen**

In `apps/web/src/home/DashboardScreen.tsx`, add to imports:

```tsx
import { refreshAndList } from "@/src/links/refresh-and-list.js";
import type { SentLinkRow } from "@/src/links/types.js";
```

Add state inside the component:

```tsx
type LinksFetchState =
  | { status: "loading" }
  | { status: "ok"; rows: SentLinkRow[] }
  | { status: "degraded"; rows: SentLinkRow[] };

const [linksState, setLinksState] = useState<LinksFetchState>({ status: "loading" });

useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const rows = await refreshAndList();
      if (!cancelled) setLinksState({ status: "ok", rows: rows.slice(0, 3) });
    } catch {
      // refreshAndList rejects when the bulk fetch fails; fall back to local-only.
      const { listSentLinks } = await import("@/src/lib/sent-links-store.js");
      const local = await listSentLinks();
      if (!cancelled) {
        setLinksState({
          status: "degraded",
          rows: local.slice(0, 3).map((r) => ({
            id: r.id,
            recipientFingerprint: r.recipientFingerprint,
            createdAt: new Date(r.createdAt),
            expiresAt: null,
            maxOpens: r.maxOpens,
            opensCount: 0,
            liveStatus: "gone",
          })),
        });
      }
    }
  })();
  return () => {
    cancelled = true;
  };
}, []);
```

Add the section JSX before the closing `</div>`:

```tsx
<section
  aria-label="Recent secure links"
  className="bg-surface-container/60 border border-outline-variant/10 rounded-xl p-6 flex flex-col gap-4"
>
  <div className="flex items-center justify-between">
    <h2 className="font-display text-xl font-semibold">Recent Secure Links</h2>
    <a href="/links" className="text-sm text-primary hover:underline font-label-sm uppercase tracking-widest">
      View all
    </a>
  </div>
  {linksState.status === "loading" && (
    <p className="font-sans text-sm text-on-surface-variant">Loading…</p>
  )}
  {linksState.status === "degraded" && (
    <p className="font-sans text-xs text-on-surface-variant">Status unavailable — showing local data only.</p>
  )}
  {(linksState.status === "ok" || linksState.status === "degraded") && (
    linksState.rows.length === 0 ? (
      <p className="font-sans text-sm text-on-surface-variant">No links sent yet — create your first one.</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {linksState.rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface-container-low border border-outline-variant/10"
          >
            <span className="font-mono text-mono-code text-on-surface truncate">{row.id}</span>
            <span className="text-xs uppercase tracking-widest text-on-surface-variant">{row.liveStatus}</span>
          </li>
        ))}
      </ul>
    )
  )}
</section>
```

(Ordering: insert this section after the Local Public Key section and before the closing `</div>`.)

- [ ] **Step 5: Run tests (all must pass)**

```bash
pnpm --filter web test tests/home/DashboardScreen.test.tsx
```
Expected: 9/9 pass.

- [ ] **Step 6: Lint + commit**

```bash
pnpm lint
git add apps/web/src/home/DashboardScreen.tsx apps/web/tests/home/DashboardScreen.test.tsx
git commit -m "feat(web): DashboardScreen — Recent Secure Links card (top 3, with degraded fallback)"
```

---

## Task 7: DashboardScreen — Verified Contacts card (TDD)

**Files:**
- Modify: `apps/web/src/home/DashboardScreen.tsx`
- Modify: `apps/web/tests/home/DashboardScreen.test.tsx`

- [ ] **Step 1: Add failing tests**

Append to `apps/web/tests/home/DashboardScreen.test.tsx`:

```tsx
import { addContact } from "@/src/lib/contacts-store.js";

describe("DashboardScreen — Verified Contacts", () => {
  let identity: Awaited<ReturnType<typeof generateIdentity>>;
  let storedIdentity: { id: string; createdAt: string; schemaVersion: number; wrappedPrivateKey: string; publicKey: string };

  beforeAll(async () => {
    identity = await generateIdentity();
    storedIdentity = {
      id: "primary",
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      wrappedPrivateKey: "x",
      publicKey: await exportPublicKey(identity.publicKey),
    };
  });

  async function makePub(): Promise<string> {
    const id = await generateIdentity();
    return await exportPublicKey(id.publicKey);
  }

  it("renders empty state when no verified contacts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    expect(await screen.findByText(/no verified contacts yet/i)).toBeInTheDocument();
  });

  it("renders top 3 verified contacts and filters out unverified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const { setContactVerified } = await import("@/src/lib/contacts-store.js");
    // 5 contacts added in order Alice → Eve. Mark all but Bob as verified.
    // listContacts sorts alphabetically; DashboardScreen must re-sort by createdAt desc.
    // Most-recently-added verified are Eve (idx 4), Dan (3), Carol (2). Alice (0) is oldest verified.
    const labels = ["Alice", "Bob", "Carol", "Dan", "Eve"];
    for (const label of labels) {
      const pub = await makePub();
      const c = await addContact({ label, publicKey: pub });
      if (label !== "Bob") await setContactVerified(c.id, true);
      // Sleep 5ms between adds so createdAt timestamps are strictly increasing.
      await new Promise((r) => setTimeout(r, 5));
    }

    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);

    // ContactRow renders the contact's label as aria-label on the button. Use byLabelText.
    expect(await screen.findByLabelText("Eve")).toBeInTheDocument();
    expect(screen.getByLabelText("Dan")).toBeInTheDocument();
    expect(screen.getByLabelText("Carol")).toBeInTheDocument();
    expect(screen.queryByLabelText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Alice")).not.toBeInTheDocument();
  });

  it("includes a 'View all' link to /contacts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    render(<DashboardScreen identity={identity} storedIdentity={storedIdentity} />);
    const links = await screen.findAllByRole("link", { name: /view all/i });
    // Two "View all" links exist: one for /links (Task 6) and one for /contacts (this task).
    const contactsViewAll = links.find((a) => a.getAttribute("href") === "/contacts");
    expect(contactsViewAll).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests (must fail on the new ones)**

```bash
pnpm --filter web test tests/home/DashboardScreen.test.tsx
```
Expected: 9/12 pass (the 3 new ones fail).

- [ ] **Step 3: Add Verified Contacts section to DashboardScreen**

Add to imports in `apps/web/src/home/DashboardScreen.tsx`:

```tsx
import { ContactRow } from "@/src/contacts/ContactRow.js";
import { type ContactRecord, listContacts } from "@/src/lib/contacts-store.js";
```

Add state inside the component. Note: `listContacts()` sorts alphabetically by label; we need the most-recently-added verified contacts, so re-sort by `createdAt` descending before slicing.

```tsx
const [verified, setVerifiedContacts] = useState<ContactRecord[]>([]);
const [contactsLoaded, setContactsLoaded] = useState(false);

useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const all = await listContacts();
      const top = all
        .filter((c) => c.verified)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 3);
      if (!cancelled) {
        setVerifiedContacts(top);
        setContactsLoaded(true);
      }
    } catch {
      if (!cancelled) setContactsLoaded(true);
    }
  })();
  return () => {
    cancelled = true;
  };
}, []);
```

Add the section JSX after Recent Links and before the closing `</div>`:

```tsx
<section
  aria-label="Verified contacts"
  className="bg-surface-container/60 border border-outline-variant/10 rounded-xl p-6 flex flex-col gap-4"
>
  <div className="flex items-center justify-between">
    <h2 className="font-display text-xl font-semibold">Verified Contacts</h2>
    <a href="/contacts" className="text-sm text-primary hover:underline font-label-sm uppercase tracking-widest">
      View all
    </a>
  </div>
  {!contactsLoaded && (
    <p className="font-sans text-sm text-on-surface-variant">Loading…</p>
  )}
  {contactsLoaded && verified.length === 0 && (
    <p className="font-sans text-sm text-on-surface-variant">No verified contacts yet.</p>
  )}
  {contactsLoaded && verified.length > 0 && (
    <ul className="flex flex-col gap-2">
      {verified.map((c) => (
        <li key={c.id}>
          <ContactRow contact={c} onClick={(id) => { window.location.href = `/contacts/${id}`; }} />
        </li>
      ))}
    </ul>
  )}
</section>
```

- [ ] **Step 4: Run tests (all must pass)**

```bash
pnpm --filter web test tests/home/DashboardScreen.test.tsx
```
Expected: 12/12 pass.

- [ ] **Step 5: Lint + commit**

```bash
pnpm lint
git add apps/web/src/home/DashboardScreen.tsx apps/web/tests/home/DashboardScreen.test.tsx
git commit -m "feat(web): DashboardScreen — Verified Contacts card (top 3 verified)"
```

---

## Task 8: HomeScreen + replace `(app)/page.tsx` content (TDD)

**Files:**
- Create: `apps/web/src/home/HomeScreen.tsx`
- Test: `apps/web/tests/home/HomeScreen.test.tsx`
- Modify: `apps/web/app/(app)/page.tsx` (replace Phase 0 content with HomeScreen)

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/home/HomeScreen.test.tsx`. Mock `useIdentity` and stub the heavy children (`DashboardScreen` is async; we don't want full async waits in this test):

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseIdentity = vi.fn();

vi.mock("@/src/hooks/use-identity.js", () => ({
  useIdentity: () => mockUseIdentity(),
}));

vi.mock("@/src/home/DashboardScreen.js", () => ({
  DashboardScreen: () => <div data-testid="dashboard-stub">Dashboard</div>,
}));

import { HomeScreen } from "@/src/home/HomeScreen.js";

describe("HomeScreen", () => {
  beforeEach(() => {
    mockUseIdentity.mockReset();
  });

  it("renders Loading state when identity is loading", () => {
    mockUseIdentity.mockReturnValue({ state: { status: "loading" }, actions: {} });
    render(<HomeScreen />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders LandingScreen no_identity when state is no_identity", () => {
    mockUseIdentity.mockReturnValue({ state: { status: "no_identity" }, actions: {} });
    render(<HomeScreen />);
    expect(screen.getByRole("link", { name: /set up your identity/i })).toBeInTheDocument();
  });

  it("renders LandingScreen locked when state is locked", () => {
    mockUseIdentity.mockReturnValue({
      state: { status: "locked", storedIdentity: {} },
      actions: {},
    });
    render(<HomeScreen />);
    expect(screen.getByRole("link", { name: /unlock your identity/i })).toBeInTheDocument();
  });

  it("renders DashboardScreen when state is unlocked", () => {
    mockUseIdentity.mockReturnValue({
      state: { status: "unlocked", storedIdentity: {}, identity: {} },
      actions: {},
    });
    render(<HomeScreen />);
    expect(screen.getByTestId("dashboard-stub")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (must fail)**

```bash
pnpm --filter web test tests/home/HomeScreen.test.tsx
```
Expected: FAIL — "Cannot find module '@/src/home/HomeScreen'".

- [ ] **Step 3: Implement**

Create `apps/web/src/home/HomeScreen.tsx`:

```tsx
"use client";

import { useIdentity } from "@/src/hooks/use-identity.js";
import { DashboardScreen } from "./DashboardScreen.js";
import { LandingScreen } from "./LandingScreen.js";

export function HomeScreen() {
  const { state } = useIdentity();

  if (state.status === "loading") {
    return (
      <main className="min-h-dvh bg-background text-on-surface flex items-center justify-center">
        <p className="font-sans text-on-surface-variant">Loading…</p>
      </main>
    );
  }

  if (state.status === "no_identity") return <LandingScreen variant="no_identity" />;
  if (state.status === "locked") return <LandingScreen variant="locked" />;

  return <DashboardScreen identity={state.identity} storedIdentity={state.storedIdentity} />;
}
```

- [ ] **Step 4: Run test (must pass)**

```bash
pnpm --filter web test tests/home/HomeScreen.test.tsx
```
Expected: 4/4 pass.

- [ ] **Step 5: Replace `(app)/page.tsx`**

Replace the entire contents of `apps/web/app/(app)/page.tsx`:

```tsx
import { HomeScreen } from "@/src/home/HomeScreen.js";

export default function Home() {
  return <HomeScreen />;
}
```

- [ ] **Step 6: Manual browser smoke test**

In the running dev server:
- With **no identity**: hit `/` → Landing with "Set up your identity" CTA. Hit `/create`, `/links`, `/contacts`, `/keys` → all show the same Landing.
- Set up an identity in `/keys`. Refresh `/` → Dashboard renders with header, Create panel, Public Key card, and the (likely empty) Recent Links + Verified Contacts cards. SideNav is visible with "Dashboard" active.
- Click "New Message" in the SideNav → /create page renders with SideNav still visible, "New Message" item highlighted active.
- Lock identity. Refresh `/` → Landing variant with "Unlock your identity" CTA + microcopy.

If anything looks broken, stop and document — do not move on.

- [ ] **Step 7: Run full suite + typecheck + lint**

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm lint
```
Expected: typecheck clean. All tests pass (221 prior + ~24 new = ~245). Lint exit 0 with no new infos.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/home/HomeScreen.tsx apps/web/tests/home/HomeScreen.test.tsx "apps/web/app/(app)/page.tsx"
git commit -m "feat(web): replace Phase 0 placeholder at / with identity-aware HomeScreen"
```

---

## Task 9: Final verification + plan-complete commit (if needed)

**Files:** None expected to change.

- [ ] **Step 1: Repo-wide gates**

```bash
pnpm typecheck
pnpm lint
pnpm test
```
Expected: 6/6 typecheck workspaces clean. Lint exit 0. All tests pass across all workspaces.

- [ ] **Step 2: Browser regression spot-check**

In `pnpm dev`, walk these flows:
- Public route `/l/<some-id>` (use any link id format) — should still render the receiver flow with NO SideNav (it's outside `(app)`).
- API route still responds: `curl -s -X POST http://localhost:3000/api/messages/list -H 'content-type: application/json' -d '{"ids":[]}' | head -c 200`. Expect a JSON response, not a 500.
- All five auth routes show SideNav with the correct active item highlighted.
- Logged-out: every auth route shows Landing.

- [ ] **Step 3: Confirm no orphaned files**

```bash
ls apps/web/app/page.tsx 2>&1 || echo "OK: removed"
test -f "apps/web/app/(app)/page.tsx" && echo "OK: (app)/page.tsx exists"
```
Expected: first command says removed; second says exists.

- [ ] **Step 4: If any cleanup is needed, commit it**

```bash
git status --short
```
If anything's modified, commit with `chore(web): post-slice cleanup`. If nothing's pending, this task is a no-op verification gate.

---

## Spec coverage check

| Spec section | Covered by |
|---|---|
| §3 In-scope: identity-aware `/` | Tasks 3, 5–8 |
| §3 In-scope: shared `(app)` layout with SideNav | Tasks 1, 2, 4 |
| §3 In-scope: full dashboard with 5 sections | Tasks 5, 6, 7 |
| §3 In-scope: minimal Landing with no_identity + locked variants | Task 3 |
| §3 In-scope: active nav-item highlighting via `usePathname()` | Tasks 2, 4 |
| §3 Out-of-scope: full marketing landing | Not implemented (correct) |
| §3 Out-of-scope: `/settings` SideNav item | Not in `NAV_ITEMS` (correct) |
| §3 Out-of-scope: removing per-page gating in /create etc. | Per-page gates left in place (correct) |
| §3 Out-of-scope: `<SideNav>` `<a>` → `<Link>` migration | Not touched (correct) |
| §4 UX state table | Tasks 3, 4, 8 |
| §5 Routing & file layout | Task 1 (move) + Task 4 (layout) + Task 8 ((app)/page.tsx replace) |
| §6 Components | Tasks 3 (Landing), 4 (Shell), 5–7 (Dashboard), 8 (Home) |
| §7 Data flow | Tasks 4 + 8 wire it; 5–7 implement async leaves |
| §8 Error handling — degraded Recent Links | Task 6 |
| §8 Error handling — public key fingerprint failure | Task 5 |
| §9 Tests inventory | Tasks 2, 3, 4, 5, 6, 7, 8 each contribute |
| §10 Migration of existing routes | Task 1 |
| §11 Dependencies (no new deps) | All tasks use existing primitives |
| §12 Acceptance criteria | Task 9 verification gate |
| §13 Risks (per-page gates, /settings absence) | Acknowledged in plan; not changed |

No gaps.
