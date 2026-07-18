# Mobile real-data wiring + Home cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the mobile Home hub to real link data, wire its dead quick-actions to real destinations, remove the redundant Home header, and replace the fake display name/initials with a key-derived identity label.

**Architecture:** `apps/mobile` is a self-navigated RN/Expo app — tab state lives in `App.tsx`; each tab is a `*Flow` with its own internal route state. Real data already flows through encrypted on-device stores (`useSentLinks`, contacts-store, settings-context). This plan (a) turns `home/recent-links.ts` from a fixture into a pure mapper over the real `useSentLinks()` data, (b) adds an `onNavigate(tab, intent?)` callback from `App` down into `HomeFlow` plus a one-shot Contacts sub-screen intent, and (c) adds a pure `identity-display` helper for a key-derived label/avatar, threading the real fingerprint into the Settings/Keys screens.

**Tech Stack:** TypeScript (strict), React Native / Expo, Vitest (node env, **no React renderer** — pure logic is extracted and unit-tested; presentational/wiring changes are verified by `typecheck` + `lint` and on-device), `@aesmsg/crypto` for fingerprints.

**Conventions:**
- Run all gates scoped to the package: `pnpm --filter @aesmsg/mobile <typecheck|lint|test>` from the repo root.
- Per the repo's test convention, `.tsx` screens and React hooks are **not** rendered in tests; only pure functions get unit tests. Wiring/presentational tasks below are verified with `typecheck` + `lint`.
- Conventional commits, scoped `mobile`.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `apps/mobile/src/home/recent-links.ts` | Pure: map real `Link[]` → Home recent-row view + status→chip (reuses Links-tab `statusDescriptor`) | 1, 3 |
| `apps/mobile/tests/recent-links.test.ts` | Unit tests for the pure mapper | 1 |
| `apps/mobile/src/identity/identity-display.ts` | Pure `IDENTITY_LABEL` + `keyDerivedInitials`; thin `useShortFingerprint` hook | 2 |
| `apps/mobile/tests/identity-display.test.ts` | Unit tests for the pure helpers | 2 |
| `apps/mobile/src/home/HomeScreen.tsx` | Presentational hub: no header, real recent rows, relabeled grid, wired actions | 3 |
| `apps/mobile/src/home/HomeFlow.tsx` | Reads `useSentLinks`, maps to recent rows, routes actions via `onNavigate` | 3 |
| `apps/mobile/App.tsx` | `navigate(tab, intent)`; `contactsIntent` state; pass to Home/Contacts; TabBar clears intent | 4 |
| `apps/mobile/src/contacts/ContactsFlow.tsx` | `initialIntent` seeds the initial sub-route | 4 |
| `apps/mobile/src/settings/SettingsFlow.tsx` | Thread `publicKeyString` into the root | 5 |
| `apps/mobile/src/settings/SettingsRootScreen.tsx` | Key-derived avatar/label + real short fingerprint | 5 |
| `apps/mobile/src/keys/KeysFlow.tsx` | Compute short fingerprint, pass to Rotate | 6 |
| `apps/mobile/src/keys/MyPublicKeyScreen.tsx` | Key-derived avatar/label | 6 |
| `apps/mobile/src/keys/RotateKeyScreen.tsx` | Real fingerprint, drop mock default | 6 |
| `apps/mobile/src/keys/WipeIdentityScreen.tsx` | Decouple from mock default | 6 |
| `apps/mobile/src/keys/mock-data.ts` | **Deleted** | 6 |
| `apps/mobile/src/settings/settings-mock.ts` | Drop `PROFILE_MOCK` (keep `ADVANCED_MOCK`) | 6 |

---

## Task 1: `recent-links.ts` — add the pure mapper (TDD)

Add the new pure API (`toRecentLinks`, `recentLinkChip`, `RecentLinkView`) **alongside** the existing fixture exports so `HomeScreen` keeps compiling; Task 3 removes the old exports once `HomeScreen` is switched over.

**Files:**
- Modify: `apps/mobile/src/home/recent-links.ts`
- Test: `apps/mobile/tests/recent-links.test.ts` (replace contents)

- [ ] **Step 1: Replace the test file with tests for the new mapper**

Overwrite `apps/mobile/tests/recent-links.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { recentLinkChip, toRecentLinks } from "@/src/home/recent-links";
import type { Link } from "@/src/links/links-data";

// recent-links is pure (no React/store), so the slice + status->Chip mapping is unit-tested here
// per the node-env / no-React-renderer convention — HomeScreen stays presentational.

function link(over: Pick<Link, "id" | "status"> & Partial<Link>): Link {
  return {
    id: over.id,
    to: over.to ?? "Secure link",
    recipient: { name: "Secure link", shortFingerprint: "AM-0000", verified: false },
    createdAt: over.createdAt ?? "Jan 1, 12:00",
    time: over.time ?? "2h ago",
    status: over.status,
    opensUsed: 0,
    opensMax: null,
    url: "https://aesmsg.to/l/x",
    expiresLabel: "in 3h",
  };
}

describe("toRecentLinks", () => {
  it("maps a Link to a Home row (title=to, sub=time, status passthrough)", () => {
    const rows = toRecentLinks([
      link({ id: "a", to: "Q3 deck → Elena", time: "2h ago", status: "available" }),
    ]);
    expect(rows).toEqual([
      { id: "a", title: "Q3 deck → Elena", sub: "2h ago", status: "available" },
    ]);
  });

  it("keeps only the first `limit` links (default 3) preserving input order", () => {
    const links = ["a", "b", "c", "d"].map((id) => link({ id, status: "available" }));
    expect(toRecentLinks(links).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(toRecentLinks(links, 2).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns [] for no links", () => {
    expect(toRecentLinks([])).toEqual([]);
  });
});

describe("recentLinkChip", () => {
  it("fills only the available (green check) chip", () => {
    expect(recentLinkChip("available")).toEqual({
      tone: "green",
      icon: "check_circle",
      label: "Available",
      fill: true,
    });
  });

  it("renders the other statuses as outline chips with their Links-tab tones", () => {
    expect(recentLinkChip("expiring")).toEqual({
      tone: "amber",
      icon: "schedule",
      label: "Expiring soon",
      fill: false,
    });
    expect(recentLinkChip("opened")).toEqual({
      tone: "violet",
      icon: "visibility",
      label: "Opened",
      fill: false,
    });
    expect(recentLinkChip("revoked")).toEqual({
      tone: "error",
      icon: "block",
      label: "Revoked",
      fill: false,
    });
    expect(recentLinkChip("expired")).toEqual({
      tone: "neutral",
      icon: "history",
      label: "Expired",
      fill: false,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test -- recent-links`
Expected: FAIL — `toRecentLinks`/`recentLinkChip` are not exported.

- [ ] **Step 3: Add the new pure API to `recent-links.ts`**

Keep the existing `RecentLink`, `RecentLinkStatus`, `RecentLinkChip`, `CHIP_BY_STATUS`, `chipForStatus`, and `RECENT_LINKS` for now (Task 3 removes them — `HomeScreen` still imports them until then). The existing file already has `import type { ChipTone } from "@/src/components";` — do **not** re-add it. Add these two imports near the top:

```ts
import { type LinkStatus, statusDescriptor } from "@/src/links/link-status";
import type { Link } from "@/src/links/links-data";
```

Then append the new type + functions to the end of the file (the new `RecentChip` interface name avoids clashing with the existing `RecentLinkChip`):

```ts
/** A recent-link row as shown on the Home hub (metadata only — never plaintext). */
export interface RecentLinkView {
  /** Stable id for React keys / navigation. Not the secret link itself. */
  id: string;
  /** Short, non-sensitive label, e.g. "Q3 board deck → Elena". */
  title: string;
  /** Relative age, e.g. "2h ago". */
  sub: string;
  status: LinkStatus;
}

/** How a status renders as a Home status Chip. */
export interface RecentChip {
  tone: ChipTone;
  icon: string;
  label: string;
  /** Filled glyph variant — the design fills only the "available" (green check) chip. */
  fill: boolean;
}

/**
 * Map a link status to its Home Chip presentation. Reuses the Links tab's statusDescriptor
 * (single source for tone/icon/label across all five statuses) and adds the design's fill rule:
 * only the "available" green check is filled.
 */
export function recentLinkChip(status: LinkStatus): RecentChip {
  const d = statusDescriptor(status);
  return { tone: d.tone, icon: d.icon, label: d.label, fill: status === "available" };
}

/**
 * Take the most-recent links for the Home hub. listSentLinks() returns newest-first by createdAt
 * and reconciliation preserves that order, so this just maps + slices to `limit`.
 */
export function toRecentLinks(links: readonly Link[], limit = 3): RecentLinkView[] {
  return links.slice(0, Math.max(0, limit)).map((link) => ({
    id: link.id,
    title: link.to,
    sub: link.time,
    status: link.status,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test -- recent-links`
Expected: PASS (both `toRecentLinks` and `recentLinkChip` suites).

- [ ] **Step 5: Typecheck (old fixture exports still present, HomeScreen still compiles)**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/home/recent-links.ts apps/mobile/tests/recent-links.test.ts
git commit -m "feat(mobile): add pure toRecentLinks/recentLinkChip mapper"
```

---

## Task 2: `identity-display.ts` — key-derived label helpers (TDD)

**Files:**
- Create: `apps/mobile/src/identity/identity-display.ts`
- Test: `apps/mobile/tests/identity-display.test.ts`

- [ ] **Step 1: Write the failing test (pure helpers only)**

Create `apps/mobile/tests/identity-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IDENTITY_LABEL, keyDerivedInitials } from "@/src/identity/identity-display";

// keyDerivedInitials is pure (node-tested); useShortFingerprint is a thin React hook exercised
// on-device, not by the renderer (per the apps/mobile no-React-renderer convention).

describe("keyDerivedInitials", () => {
  it("takes the first two alphanumerics of a short fingerprint, uppercased", () => {
    expect(keyDerivedInitials("E82F 4D11")).toBe("E8");
    expect(keyDerivedInitials("a1b2")).toBe("A1");
  });

  it("skips separators / non-alphanumerics", () => {
    expect(keyDerivedInitials("  -E8 2F")).toBe("E8");
  });

  it("falls back to '?' for empty / separator-only input", () => {
    expect(keyDerivedInitials("")).toBe("?");
    expect(keyDerivedInitials("   ")).toBe("?");
    expect(keyDerivedInitials("----")).toBe("?");
  });
});

describe("IDENTITY_LABEL", () => {
  it("is the honest device label, not a fake personal name", () => {
    expect(IDENTITY_LABEL).toBe("This device");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile test -- identity-display`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `apps/mobile/src/identity/identity-display.ts`:

```ts
import { fingerprint as computeFingerprint, type PublicKeyString } from "@aesmsg/crypto";
import { useEffect, useState } from "react";
import { formatFingerprintGroups } from "@/src/settings/settings-format";

// Key-derived identity presentation. A zero-knowledge keypair identity has no real "name", so the
// app shows an honest device label + an avatar derived from the real fingerprint — never a fake
// name. keyDerivedInitials is pure (node-tested); useShortFingerprint is the thin React hook that
// resolves the crypto fingerprint (the compute pattern previously duplicated in MyPublicKey /
// Advanced) and is exercised on-device, not by the renderer.

/** Honest primary label shown where a display name used to be ("You"). */
export const IDENTITY_LABEL = "This device";

/**
 * Avatar initials derived from a formatted short fingerprint — the first two alphanumeric
 * characters, uppercased. Never fake-personal; deterministic for a given key.
 *   keyDerivedInitials("E82F 4D11") -> "E8"
 *   keyDerivedInitials("")          -> "?"
 */
export function keyDerivedInitials(shortFingerprint: string): string {
  const alnum = (shortFingerprint ?? "").replace(/[^\p{L}\p{N}]/gu, "");
  if (alnum.length === 0) return "?";
  return alnum.slice(0, 2).toUpperCase();
}

/**
 * Resolve a public key's short fingerprint as the design's space-joined hex groups (default 4
 * groups, e.g. "E82F 4D11 A9C2 77BE"). Returns "" while resolving, when no key is provided, or on
 * failure (callers treat the label as informational, never a trust gate).
 */
export function useShortFingerprint(
  publicKeyString: PublicKeyString | undefined,
  groups = 4,
): string {
  const [shortFp, setShortFp] = useState("");
  useEffect(() => {
    if (!publicKeyString) {
      setShortFp("");
      return;
    }
    let cancelled = false;
    computeFingerprint(publicKeyString)
      .then((fp) => {
        if (!cancelled) setShortFp(formatFingerprintGroups(fp, groups));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicKeyString, groups]);
  return shortFp;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile test -- identity-display`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/identity/identity-display.ts apps/mobile/tests/identity-display.test.ts
git commit -m "feat(mobile): add key-derived identity label helpers"
```

---

## Task 3: Home hub — remove header, real recent links, wired actions

Switch `HomeScreen`/`HomeFlow` to the new recent-links API and `onNavigate`, then remove the now-unused fixture exports from `recent-links.ts`.

**Files:**
- Modify: `apps/mobile/src/home/HomeScreen.tsx` (full replace)
- Modify: `apps/mobile/src/home/HomeFlow.tsx` (full replace)
- Modify: `apps/mobile/src/home/recent-links.ts` (remove old fixture/API)

- [ ] **Step 1: Replace `HomeScreen.tsx`**

Overwrite `apps/mobile/src/home/HomeScreen.tsx` with:

```tsx
import type { PublicKeyString } from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  Chip,
  Icon,
  ListGroup,
  ListRow,
  RowCard,
  Screen,
  SectionLabel,
} from "@/src/components";
import { recentLinkChip, type RecentLinkView } from "@/src/home/recent-links";
import { colors, type } from "@/src/theme";

// HomeScreen — the Encrypt-tab hub (design screen 9, S_Home), minus the header: the redundant
// "aesmsg" title + settings gear were removed (Settings is a dedicated bottom-nav tab). The hub now
// shows REAL recent links (passed in from HomeFlow's useSentLinks), a green "key secured" status
// card, the primary "Create secure message" CTA, an outline "Open secure link", a 2x2 quick-action
// grid, and the recent-links list. Presentational only — every action is a callback wired by HomeFlow.

export interface HomeScreenProps {
  publicKeyString: PublicKeyString;
  /** The user's most-recent links (already mapped + sliced by HomeFlow). */
  recentLinks: RecentLinkView[];
  onCompose: () => void;
  /** Open an existing secure link (paste / inbound). */
  onOpenLink?: () => void;
  /** "See all" / tap a recent row — go to the Links tab. */
  onSeeAllLinks?: () => void;
  /** Scan a contact's QR — go to the Contacts scanner. */
  onScan?: () => void;
  /** View this device's public key — go to the Keys tab. */
  onMyKey?: () => void;
  /** Add a contact — go to the Contacts add screen. */
  onAddContact?: () => void;
  /** Export an encrypted key backup — go to the Keys tab. */
  onExportBackup?: () => void;
}

const noop = () => {};

export function HomeScreen({
  publicKeyString,
  recentLinks,
  onCompose,
  onOpenLink = noop,
  onSeeAllLinks = noop,
  onScan = noop,
  onMyKey = noop,
  onAddContact = noop,
  onExportBackup = noop,
}: HomeScreenProps) {
  const [copied, setCopied] = useState(false);

  // The public key is shareable (not a secret). Tapping "My public key" navigates to the Keys tab
  // (which has its own Share/Copy + QR); a long-press here copies as a shortcut and shows "Copied".
  async function copyPublicKey() {
    await Clipboard.setStringAsync(publicKeyString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Screen>
      {/* Green-tinted status card: key secured + biometric unlock. green = safe. */}
      <Card style={styles.statusCard}>
        <View style={styles.statusIcon}>
          <Icon name="shield_lock" size={22} fill color={colors.emerald} />
        </View>
        <View style={styles.statusText}>
          <Text style={styles.statusTitle}>Private key secured on this device</Text>
          <Text style={styles.statusSub}>Biometric unlock enabled</Text>
        </View>
      </Card>

      {/* Primary CTA. */}
      <Button icon="add" onPress={onCompose} style={styles.primaryCta}>
        Create secure message
      </Button>

      {/* Open an existing secure link. */}
      <Button kind="outline" icon="link_off" onPress={onOpenLink} style={styles.outlineCta}>
        Open secure link
      </Button>

      {/* 2x2 quick-action grid. "My public key" long-press also copies the key. */}
      <View style={styles.grid}>
        <QuickAction icon="qr_code_scanner" label="Scan QR" onPress={onScan} />
        <QuickAction
          icon="vpn_key"
          label={copied ? "Copied" : "My public key"}
          onPress={onMyKey}
          onLongPress={() => void copyPublicKey()}
          accessibilityLabel="My public key. Long-press to copy your public key."
        />
        <QuickAction icon="person_add" label="Add contact" onPress={onAddContact} />
        <QuickAction icon="cloud_download" label="Export backup" onPress={onExportBackup} />
      </View>

      {/* Recent links header row — "See all" only when there are links. */}
      <View style={styles.recentHead}>
        <SectionLabel>Recent links</SectionLabel>
        {recentLinks.length > 0 ? (
          <Pressable
            onPress={onSeeAllLinks}
            accessibilityRole="button"
            accessibilityLabel="See all links"
            hitSlop={8}
          >
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Recent links list — real rows, or a muted empty row. */}
      <ListGroup>
        {recentLinks.length === 0 ? (
          <ListRow
            icon="lock"
            iconColor={colors.onSurfaceVariant}
            title="No secure links yet"
            sub="Links you create will show up here"
          />
        ) : (
          recentLinks.map((link) => {
            const chip = recentLinkChip(link.status);
            return (
              <ListRow
                key={link.id}
                icon="lock"
                iconColor={colors.onSurfaceVariant}
                title={link.title}
                sub={link.sub}
                onPress={onSeeAllLinks}
                trailing={
                  <Chip tone={chip.tone} icon={chip.icon} fill={chip.fill}>
                    {chip.label}
                  </Chip>
                }
              />
            );
          })
        )}
      </ListGroup>
    </Screen>
  );
}

// QuickAction — one cell of the 2x2 grid. A RowCard with a primary-tinted glyph + label.
function QuickAction({
  icon,
  label,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <RowCard onPress={onPress} style={styles.gridCell}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={styles.gridCellInner}
      >
        <Icon name={icon} size={20} color={colors.primary} />
        <Text style={styles.gridLabel} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </RowCard>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 99,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(111,210,154,0.12)",
  },
  statusText: { flex: 1 },
  statusTitle: { ...type.body, fontWeight: "600", color: colors.onSurface },
  statusSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  primaryCta: { marginBottom: 14 },
  outlineCta: { minHeight: 52, marginBottom: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  gridCell: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 0,
  },
  gridCellInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
  },
  gridLabel: { ...type.body, fontWeight: "500", color: colors.onSurface, flexShrink: 1 },
  recentHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  seeAll: { fontSize: 13, color: colors.primary },
});
```

- [ ] **Step 2: Replace `HomeFlow.tsx`**

Overwrite `apps/mobile/src/home/HomeFlow.tsx` with:

```tsx
import type { PublicKeyString } from "@aesmsg/crypto";
import { useState } from "react";
import { CreateFlow } from "@/src/create/CreateFlow";
import { HomeScreen } from "@/src/home/HomeScreen";
import { toRecentLinks } from "@/src/home/recent-links";
import { useSentLinks } from "@/src/links/use-sent-links";
import type { Tab } from "@/src/navigation/tabs";
import { OpenLinkSheet } from "@/src/reader/OpenLinkSheet";

// HomeFlow — the Encrypt tab's local stack. Renders the Home hub (now backed by the real
// useSentLinks() store for "Recent links") and, on "Create secure message", swaps to <CreateFlow/>.
// "Open secure link" opens <OpenLinkSheet/> and hands a parsed id up via onOpenReader (same path a
// deep link uses). The other hub actions route across tabs via onNavigate (wired by App).

type Route = "home" | "compose";

export interface HomeFlowProps {
  publicKeyString: PublicKeyString;
  /** Route a parsed link id into the reader (App sets linkId → mounts ReaderFlow). */
  onOpenReader?: (id: string) => void;
  /** Switch tabs, with an optional one-shot Contacts sub-screen intent. Wired by App. */
  onNavigate?: (tab: Tab, intent?: "scan" | "add") => void;
}

export function HomeFlow({ publicKeyString, onOpenReader, onNavigate }: HomeFlowProps) {
  const [route, setRoute] = useState<Route>("home");
  const [sheetVisible, setSheetVisible] = useState(false);
  const { links } = useSentLinks();
  const recentLinks = toRecentLinks(links);

  if (route === "compose") {
    return <CreateFlow onExit={() => setRoute("home")} />;
  }

  return (
    <>
      <HomeScreen
        publicKeyString={publicKeyString}
        recentLinks={recentLinks}
        onCompose={() => setRoute("compose")}
        onOpenLink={() => setSheetVisible(true)}
        onSeeAllLinks={() => onNavigate?.("links")}
        onScan={() => onNavigate?.("contacts", "scan")}
        onMyKey={() => onNavigate?.("keys")}
        onAddContact={() => onNavigate?.("contacts", "add")}
        onExportBackup={() => onNavigate?.("keys")}
      />
      <OpenLinkSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={(id) => {
          setSheetVisible(false);
          onOpenReader?.(id);
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Remove the obsolete fixture/API from `recent-links.ts`**

Edit `apps/mobile/src/home/recent-links.ts`: delete `RecentLink`, `RecentLinkStatus`, the old `RecentLinkChip` interface, `CHIP_BY_STATUS`, `chipForStatus`, and `RECENT_LINKS`. Keep `RecentLinkView`, `RecentChip`, `recentLinkChip`, `toRecentLinks`, and the imports they need. The file should end as:

```ts
// Pure data + logic for the Home hub's "Recent links" section.
//
// The hub shows the user's REAL most-recent sent links (from the encrypted sent-links store,
// surfaced via useSentLinks() in HomeFlow), not a fixture. This module stays pure (no React, no
// store) so the slice + status->Chip mapping is unit-tested here, per the node-env / no-renderer
// test convention; HomeScreen stays presentational.
//
// COLOR SEMANTICS (non-negotiable): green = available/safe, violet = opened (informational),
// amber = expiring soon, error = revoked (destructive end-state), neutral = expired (inert).

import type { ChipTone } from "@/src/components";
import { type LinkStatus, statusDescriptor } from "@/src/links/link-status";
import type { Link } from "@/src/links/links-data";

/** A recent-link row as shown on the Home hub (metadata only — never plaintext). */
export interface RecentLinkView {
  id: string;
  title: string;
  sub: string;
  status: LinkStatus;
}

/** How a status renders as a Home status Chip. */
export interface RecentChip {
  tone: ChipTone;
  icon: string;
  label: string;
  /** Filled glyph variant — the design fills only the "available" (green check) chip. */
  fill: boolean;
}

/**
 * Map a link status to its Home Chip presentation. Reuses the Links tab's statusDescriptor (single
 * source for tone/icon/label across all five statuses) and adds the design's fill rule.
 */
export function recentLinkChip(status: LinkStatus): RecentChip {
  const d = statusDescriptor(status);
  return { tone: d.tone, icon: d.icon, label: d.label, fill: status === "available" };
}

/**
 * Take the most-recent links for the Home hub. listSentLinks() returns newest-first by createdAt
 * and reconciliation preserves that order, so this just maps + slices to `limit`.
 */
export function toRecentLinks(links: readonly Link[], limit = 3): RecentLinkView[] {
  return links.slice(0, Math.max(0, limit)).map((link) => ({
    id: link.id,
    title: link.to,
    sub: link.time,
    status: link.status,
  }));
}
```

- [ ] **Step 4: Verify gates**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm --filter @aesmsg/mobile test -- recent-links && pnpm --filter @aesmsg/mobile lint`
Expected: typecheck PASS (no remaining references to `RECENT_LINKS`/`chipForStatus`), tests PASS, lint PASS. If lint reports formatting, run `pnpm --filter @aesmsg/mobile lint:fix`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/home/HomeScreen.tsx apps/mobile/src/home/HomeFlow.tsx apps/mobile/src/home/recent-links.ts
git commit -m "feat(mobile): real recent links on Home, remove header, wire quick-actions"
```

---

## Task 4: App-level cross-tab navigation + Contacts intent

**Files:**
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/contacts/ContactsFlow.tsx`

- [ ] **Step 1: Add `initialIntent` to `ContactsFlow`**

In `apps/mobile/src/contacts/ContactsFlow.tsx`, extend the props and seed the initial route. Replace the `ContactsFlowProps` interface and the function signature + initial `useState<Route>` line with:

```tsx
export interface ContactsFlowProps {
  /** Navigate out of the tab to compose a message to a contact (Integration phase wires this). */
  onSendToContact?: (contact: Contact) => void;
  /** Open directly on a sub-screen (one-shot intent handed in from the Home hub). */
  initialIntent?: "scan" | "add";
}

export default function ContactsFlow({ onSendToContact, initialIntent }: ContactsFlowProps = {}) {
  const [records, setRecords] = useState<ContactRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [route, setRoute] = useState<Route>(
    initialIntent === "scan"
      ? { name: "scan" }
      : initialIntent === "add"
        ? { name: "add" }
        : { name: "list" },
  );
```

(The existing empty-store guard already exempts `add`/`scan`, so a contactless user who arrives with `intent: "scan"` lands on the scanner, not the empty state.)

- [ ] **Step 2: Add `navigate` + `contactsIntent` to `App.tsx` and wire Home / Contacts / TabBar**

In `apps/mobile/App.tsx`, inside `Root()`:

Add state next to the existing `const [tab, setTab] = useState<Tab>("encrypt");`:

```tsx
  const [contactsIntent, setContactsIntent] = useState<"scan" | "add" | null>(null);

  // Cross-tab navigation for the Home hub. A one-shot Contacts intent opens a specific sub-screen;
  // it is cleared on any manual tab switch so the tab bar always lands on the tab's root.
  const navigate = (next: Tab, intent: "scan" | "add" | null = null) => {
    setContactsIntent(next === "contacts" ? intent : null);
    setTab(next);
  };
```

Update the Encrypt-tab render to pass `onNavigate`:

```tsx
        {tab === "encrypt" && (
          <HomeFlow
            publicKeyString={state.publicKeyString}
            onOpenReader={(id) => setLinkId(id)}
            onNavigate={navigate}
          />
        )}
```

Update the Contacts-tab render to pass the one-shot intent:

```tsx
        {tab === "contacts" && <ContactsFlow initialIntent={contactsIntent ?? undefined} />}
```

Update the TabBar so a manual tab switch clears the intent:

```tsx
      <TabBar active={tab} onChange={(t) => navigate(t)} badges={badges} />
```

(`ContactsFlow` is the default export already imported at the top of `App.tsx`.)

- [ ] **Step 3: Verify gates**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm --filter @aesmsg/mobile lint`
Expected: PASS. (`navigate`'s wider `intent` type — `"scan" | "add" | null` — is assignable to `HomeFlow`'s `onNavigate(tab, intent?: "scan" | "add")`.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/src/contacts/ContactsFlow.tsx
git commit -m "feat(mobile): cross-tab navigation from Home with one-shot Contacts intent"
```

---

## Task 5: Settings root — real fingerprint + key-derived label

**Files:**
- Modify: `apps/mobile/src/settings/SettingsRootScreen.tsx`
- Modify: `apps/mobile/src/settings/SettingsFlow.tsx`

- [ ] **Step 1: Update `SettingsRootScreen.tsx`**

Replace the imports block, the `SettingsRootScreenProps` interface, the function signature, and the profile `Card` with the versions below.

Imports — drop `PROFILE_MOCK`, add the identity helpers and the `PublicKeyString` type:

```tsx
import type { PublicKeyString } from "@aesmsg/crypto";
import { StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  Card,
  Chip,
  Icon,
  LargeTitle,
  ListGroup,
  ListRow,
  Screen,
  SectionLabel,
} from "@/src/components";
import { IDENTITY_LABEL, keyDerivedInitials, useShortFingerprint } from "@/src/identity/identity-display";
import { colors, fonts } from "@/src/theme";
```

Props — replace `shortFingerprint?` with `publicKeyString?`:

```tsx
export interface SettingsRootScreenProps {
  /** Navigate to a settings sub-screen / destination. */
  onOpen?: ((section: SettingsSection) => void) | undefined;
  /** Re-lock the app (surfaced here and on the Security screen). */
  onLock?: (() => void) | undefined;
  /** Begin the wipe/delete-account flow (handled with the WipeConfirmModal on Privacy). */
  onWipe?: (() => void) | undefined;
  /** Real public key — drives the key-derived avatar + the real short fingerprint. */
  publicKeyString?: PublicKeyString | undefined;
}
```

Function signature + derived values:

```tsx
export function SettingsRootScreen({ onOpen, publicKeyString }: SettingsRootScreenProps) {
  const shortFingerprint = useShortFingerprint(publicKeyString);
  const initials = keyDerivedInitials(shortFingerprint);
```

Profile card — use the key-derived label/avatar and the real fingerprint; the plan chip stays a static "Free":

```tsx
        <Card style={styles.profileCard}>
          <Avatar initials={initials} size={48} />
          <View style={styles.profileMain}>
            <Text style={styles.profileName}>{IDENTITY_LABEL}</Text>
            <View style={styles.fpRow}>
              <Text style={styles.fp} selectable>
                {shortFingerprint}
              </Text>
              <Icon name="verified" size={14} fill color={colors.emerald} />
            </View>
          </View>
          <Chip tone="violet">Free</Chip>
        </Card>
```

(Leave the section lists, footer, and styles unchanged.)

- [ ] **Step 2: Pass `publicKeyString` from `SettingsFlow`**

In `apps/mobile/src/settings/SettingsFlow.tsx`, update the `default` case to thread the key:

```tsx
    default:
      return (
        <SettingsRootScreen
          onLock={onLock}
          onWipe={onWipe}
          publicKeyString={publicKeyString}
          onOpen={(section) => {
            const next = SECTION_ROUTE[section];
            if (next) setRoute(next);
          }}
        />
      );
```

- [ ] **Step 3: Verify gates**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm --filter @aesmsg/mobile lint`
Expected: PASS. (`SettingsFlow` already receives `publicKeyString` from `App.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/settings/SettingsRootScreen.tsx apps/mobile/src/settings/SettingsFlow.tsx
git commit -m "feat(mobile): real fingerprint + key-derived label on Settings root"
```

---

## Task 6: Keys screens + mock cleanup

**Files:**
- Modify: `apps/mobile/src/keys/MyPublicKeyScreen.tsx`
- Modify: `apps/mobile/src/keys/KeysFlow.tsx`
- Modify: `apps/mobile/src/keys/RotateKeyScreen.tsx`
- Modify: `apps/mobile/src/keys/WipeIdentityScreen.tsx`
- Delete: `apps/mobile/src/keys/mock-data.ts`
- Modify: `apps/mobile/src/settings/settings-mock.ts`

- [ ] **Step 1: `MyPublicKeyScreen.tsx` — key-derived avatar/label**

Replace `import { MY_IDENTITY } from "./mock-data";` with:

```tsx
import { IDENTITY_LABEL, keyDerivedInitials } from "@/src/identity/identity-display";
```

In the JSX profile card, replace the three `MY_IDENTITY` usages (it already computes `shortFp`):

```tsx
        <Avatar initials={keyDerivedInitials(shortFp)} size={52} />
        <View style={styles.identity}>
          <Text style={styles.name}>{IDENTITY_LABEL}</Text>
          <Text style={styles.subtitle}>Your device</Text>
        </View>
```

- [ ] **Step 2: `KeysFlow.tsx` — compute + pass the real fingerprint to Rotate**

Add the hook import and compute the short fingerprint, then pass it to `RotateKeyScreen`:

```tsx
import { useShortFingerprint } from "@/src/identity/identity-display";
```

In the component body (after `const [route, setRoute] = useState<Route>({ kind: "publicKey" });`):

```tsx
  const shortFp = useShortFingerprint(publicKeyString);
```

In the `rotateKey` branch, pass `currentFingerprint`:

```tsx
  if (route.kind === "rotateKey") {
    return (
      <RotateKeyScreen
        currentFingerprint={shortFp}
        onCancel={() => setRoute({ kind: "publicKey" })}
        onRotate={() => setRoute({ kind: "publicKey" })}
      />
    );
  }
```

- [ ] **Step 3: `RotateKeyScreen.tsx` — drop the mock default**

Remove `import { CURRENT_KEY_FINGERPRINT } from "./mock-data";`. Change the default in the destructure from the mock to an empty string:

```tsx
export function RotateKeyScreen({
  currentFingerprint = "",
  onBack,
  onRotate,
  onCancel,
}: RotateKeyScreenProps) {
```

Also update the prop doc comment in `RotateKeyScreenProps` from "Defaults to the design's sample." to "Empty until the real fingerprint resolves." (cosmetic).

- [ ] **Step 4: `WipeIdentityScreen.tsx` — decouple from the mock**

Remove `import { CURRENT_KEY_FINGERPRINT } from "./mock-data";`. Change the `fingerprint` default in the destructure from `CURRENT_KEY_FINGERPRINT` to `""`:

```tsx
  fingerprint = "",
```

(This screen is export-only — not rendered in any flow — so no real fingerprint wiring is needed; this just lets the mock module be deleted.)

- [ ] **Step 5: Delete the mock module and `PROFILE_MOCK`**

```bash
git rm apps/mobile/src/keys/mock-data.ts
```

In `apps/mobile/src/settings/settings-mock.ts`, delete the `PROFILE_MOCK` export (lines 9-19, the "45 · Settings Root — profile card" block) and keep `ADVANCED_MOCK`. Update the file header comment's first sentence to note only the Advanced sample remains:

```ts
// Demo / sample data for the Settings feature. Only the Advanced screen's technical sample remains
// (deviceId has no real source yet — a documented follow-up; encryptionFormat is static). The
// profile card now derives its identity from the real key (see identity-display.ts).
```

- [ ] **Step 6: Confirm no dangling mock references**

Run: `grep -rn "PROFILE_MOCK\|MY_IDENTITY\|CURRENT_KEY_FINGERPRINT\|mock-data" apps/mobile/src apps/mobile/tests`
Expected: **no output** (every reference removed).

- [ ] **Step 7: Verify gates**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm --filter @aesmsg/mobile lint && pnpm --filter @aesmsg/mobile test`
Expected: PASS across the board. If lint reports formatting, run `pnpm --filter @aesmsg/mobile lint:fix` and re-run.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/keys/MyPublicKeyScreen.tsx apps/mobile/src/keys/KeysFlow.tsx apps/mobile/src/keys/RotateKeyScreen.tsx apps/mobile/src/keys/WipeIdentityScreen.tsx apps/mobile/src/settings/settings-mock.ts
git commit -m "feat(mobile): key-derived identity on Keys screens, drop mock-data"
```

---

## Task 7: Full verification

**Files:** none (gates only).

- [ ] **Step 1: Run the full mobile gate suite**

Run:
```bash
pnpm --filter @aesmsg/mobile typecheck
pnpm --filter @aesmsg/mobile lint
pnpm --filter @aesmsg/mobile test
```
Expected: all PASS. `test` includes the new `recent-links` + `identity-display` suites.

- [ ] **Step 2: Confirm no leftover fixtures / dead callbacks**

Run: `grep -rn "RECENT_LINKS\|chipForStatus\|onImportBackup\|onSettings\b" apps/mobile/src`
Expected: no output (all removed/renamed).

- [ ] **Step 3: On-device sanity (manual, simulator)**

Boot the app (see `apps/mobile/README.md` for the iOS-sim build recipe) and verify:
- Home has **no** `aesmsg` title / settings gear; the green status card is the top element.
- "Recent links" shows your real sent links (or the muted "No secure links yet" row on a fresh identity).
- Quick-actions land correctly: **Scan QR** → Contacts scanner; **Add contact** → Contacts add; **My public key** / **Export backup** → Keys tab; **See all** / a recent row → Links tab.
- Switching to Contacts via the bottom tab bar opens the contacts **list** (intent not stuck on the scanner).
- Settings root and My-public-key show the **real** short fingerprint and a key-derived avatar (e.g. `E8`), labeled "This device" — no "You" / "YK".

---

## Notes / acceptance

- **Out of scope (unchanged):** billing / Account tab, Activity inbox (`SAMPLE_ACTIVITY`), real device-id (`ADVANCED_MOCK.deviceId`), in-app import-over-existing-identity, and the Home status-card copy.
- **Transient empty flash:** `useSentLinks()` starts with `links = []` while it loads, so Home may briefly show "No secure links yet" before real rows appear. Acceptable for the hub (the Links tab itself owns the spinner); not worth a Home-local loading state.
