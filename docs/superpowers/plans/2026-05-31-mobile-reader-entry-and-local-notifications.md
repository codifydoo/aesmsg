# Mobile Reader Entry + Local Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app "Open a link" entry that routes a pasted aesmsg link into the existing mobile reader, plus on-device local notifications (permission priming + "expiring soon" reminders) with persisted settings — all client-side, no server changes.

**Architecture:** Three concerns, each in focused modules. (1) A `parsePastedLink` pure function + an `OpenLinkSheet` (reusing the `BottomSheet` kit pattern) that feeds the existing `App.tsx` `linkId` → `ReaderFlow` routing. (2) Pure, Node-tested decision/codec modules for notifications (`expiry-plan`, `prime-decision`, `prefs`). (3) A thin `expo-notifications` DI wrapper plus integration glue that hooks into `CreateFlow` and `App.tsx`. Pure logic is unit-tested in Node (vitest, `vi.mock` natives); presentational/native-glue is typecheck-verified + manually verified on the simulator. The crypto package and the reader decrypt engine are untouched.

**Tech Stack:** Expo SDK 56 / React Native 0.85, TypeScript strict, Vitest (node env, `tests/**/*.test.ts`), Biome, `expo-notifications` (new), `expo-secure-store` (existing) for prefs, `expo-clipboard` (existing).

**Spec:** `docs/superpowers/specs/2026-05-31-mobile-reader-entry-and-local-notifications-design.md`

---

## File structure

| File | New/Mod | Responsibility |
|---|---|---|
| `apps/mobile/src/navigation/parse-link-id.ts` | Mod | add `parsePastedLink` + `LINK_ID_REGEX` |
| `apps/mobile/tests/parse-pasted-link.test.ts` | New | unit tests for `parsePastedLink` |
| `apps/mobile/src/reader/OpenLinkSheet.tsx` | New | paste-a-link bottom sheet (presentational) |
| `apps/mobile/src/home/HomeFlow.tsx` | Mod | own sheet visibility; thread `onOpenReader` |
| `apps/mobile/App.tsx` | Mod | pass `onOpenReader` to HomeFlow; notif tap + foreground handler |
| `apps/mobile/src/notifications/expiry-plan.ts` | New | pure `planExpiryReminder` |
| `apps/mobile/tests/expiry-plan.test.ts` | New | unit tests |
| `apps/mobile/src/notifications/prime-decision.ts` | New | pure `shouldPrimeNotifications` |
| `apps/mobile/tests/prime-decision.test.ts` | New | unit tests |
| `apps/mobile/src/notifications/prefs.ts` | New | persisted `NotificationPrefs` (secure-store) |
| `apps/mobile/tests/notification-prefs.test.ts` | New | unit tests (secure-store mocked) |
| `apps/mobile/src/notifications/notifications.ts` | New | thin `expo-notifications` DI wrapper |
| `apps/mobile/src/notifications/expiry-reminder.ts` | New | integration glue: schedule on create |
| `apps/mobile/src/notifications/NotificationPrimer.tsx` | New | shows `PushPermissionScreen` once |
| `apps/mobile/src/create/CreateFlow.tsx` | Mod | schedule reminder + render primer on result |
| `apps/mobile/src/settings/SwitchRow.tsx` | Mod | add `disabled` ("Available soon") variant |
| `apps/mobile/src/settings/NotificationsScreen.tsx` | Mod | load/persist prefs; functional/inert toggles |
| `apps/mobile/app.config.ts` | Mod | add `expo-notifications` plugin |
| `apps/mobile/package.json` | Mod | add `expo-notifications` dep (via `expo install`) |

**Commands reference (run from repo root unless noted):**
- One test file: `pnpm --filter @aesmsg/mobile exec vitest run tests/<file>.test.ts`
- All mobile tests: `pnpm --filter @aesmsg/mobile test`
- Typecheck mobile: `pnpm --filter @aesmsg/mobile typecheck`
- Lint (Biome, whole repo): `pnpm lint` · safe fixes: `pnpm lint:fix`

---

## Phase 1 — Reader entry (client-only, no native rebuild)

### Task 1: `parsePastedLink` pure function

**Files:**
- Modify: `apps/mobile/src/navigation/parse-link-id.ts`
- Test: `apps/mobile/tests/parse-pasted-link.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/parse-pasted-link.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

// parse-link-id imports expo-linking (which statically pulls react-native Flow syntax that Node
// vitest can't parse), so mock it with the same observable contract the existing parse-link-id
// test uses: parse(url) strips scheme + host and returns the path with NO leading slash.
vi.mock("expo-linking", () => {
  function parse(url: string): { path: string | null } {
    let rest = url;
    const httpHost = rest.match(/^https?:\/\/[^/]*/);
    if (httpHost) {
      rest = rest.slice(httpHost[0].length);
    } else {
      const customScheme = rest.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//);
      if (customScheme) rest = rest.slice(customScheme[0].length);
    }
    rest = rest.split(/[?#]/)[0] ?? "";
    return { path: rest.replace(/^\//, "") };
  }
  return { parse, useURL: () => null };
});

import { parsePastedLink } from "@/src/navigation/parse-link-id";

// A canonical link id: 16 chars from [A-Za-z0-9_-].
const ID = "ab_cd-ef12345678";

describe("parsePastedLink", () => {
  it("returns a bare canonical link id as-is", () => {
    expect(parsePastedLink(ID)).toBe(ID);
  });

  it("trims surrounding whitespace around a bare id", () => {
    expect(parsePastedLink(`  ${ID}\n`)).toBe(ID);
  });

  it("extracts the id from a full https /l/:id link", () => {
    expect(parsePastedLink(`https://app.aesmsg.example/l/${ID}`)).toBe(ID);
  });

  it("extracts the id from a custom-scheme aesmsg://l/:id link", () => {
    expect(parsePastedLink(`aesmsg://l/${ID}`)).toBe(ID);
  });

  it("extracts the id from a bare l/:id path form", () => {
    expect(parsePastedLink(`l/${ID}`)).toBe(ID);
  });

  it("rejects a URL whose id is the wrong length (typo guard)", () => {
    expect(parsePastedLink("https://app.aesmsg.example/l/tooShort")).toBeNull();
  });

  it("rejects a bare id of the wrong length", () => {
    expect(parsePastedLink("ab_cd-ef1234567")).toBeNull(); // 15 chars
    expect(parsePastedLink("ab_cd-ef123456789")).toBeNull(); // 17 chars
  });

  it("rejects a nested link that must not misroute", () => {
    expect(parsePastedLink(`https://host/l/${ID}/extra`)).toBeNull();
  });

  it("rejects free text, empty, and whitespace-only input", () => {
    expect(parsePastedLink("hello world")).toBeNull();
    expect(parsePastedLink("")).toBeNull();
    expect(parsePastedLink("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/parse-pasted-link.test.ts`
Expected: FAIL — `parsePastedLink` is not exported.

- [ ] **Step 3: Add the implementation**

Append to `apps/mobile/src/navigation/parse-link-id.ts` (keep the existing `parseLinkId` unchanged):

```typescript
// Canonical link id: 12 random bytes base64url-encoded → exactly 16 [A-Za-z0-9_-] chars (matches
// the web/server LINK_ID format). Used to validate user-pasted input more strictly than the
// deep-link path (which trusts the OS), so a typo'd or truncated link is rejected rather than
// routed into a guaranteed "not found".
export const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;

// Resolve a user-pasted value to a canonical link id, or null. Accepts a bare id, a full
// https://<host>/l/:id universal link, or a aesmsg://l/:id app-scheme link (and the bare
// `l/:id` path form). Anything else — free text, wrong-length id, nested path — returns null.
export function parsePastedLink(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // A bare canonical id pasted on its own (no scheme/path for parseLinkId to match).
  if (LINK_ID_REGEX.test(trimmed)) return trimmed;
  // Otherwise treat it as a link and reuse the deep-link extraction, then tighten to the
  // canonical id shape so a short/typo'd id is refused.
  const id = parseLinkId(trimmed);
  return id && LINK_ID_REGEX.test(id) ? id : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/parse-pasted-link.test.ts`
Expected: PASS (10 assertions across the cases).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/navigation/parse-link-id.ts apps/mobile/tests/parse-pasted-link.test.ts
git commit -m "feat(mobile): parsePastedLink for in-app open-a-link entry"
```

---

### Task 2: `OpenLinkSheet` component

**Files:**
- Create: `apps/mobile/src/reader/OpenLinkSheet.tsx`

No unit test: presentational RN component (repo convention — native-backed UI is exercised on device; the logic it relies on, `parsePastedLink`, is unit-tested in Task 1). Verified by typecheck + manual sim.

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/reader/OpenLinkSheet.tsx`:

```tsx
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Field, Icon } from "@/src/components";
import { parsePastedLink } from "@/src/navigation/parse-link-id";
import { colors, type } from "@/src/theme";

// Open-a-link entry sheet. The reader decrypt engine already exists (ReaderFlow); this is purely an
// in-app way to REACH it without an OS deep link. On open it reads the clipboard once and, if it
// holds a aesmsg link, pre-fills the field (a convenience — the user still confirms). Only a
// link POINTER is handled here; no key/ciphertext/plaintext. The clipboard is read, never written.
//
// Built entirely from existing kit (BottomSheet / Field / Button / Icon), mirroring
// RecipientPickerSheet — no new visual primitives.

export interface OpenLinkSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with a validated canonical link id; the parent routes it into ReaderFlow. */
  onSubmit: (id: string) => void;
  /** Injected for tests; defaults to the device clipboard. */
  readClipboard?: () => Promise<string>;
}

export function OpenLinkSheet({ visible, onClose, onSubmit, readClipboard }: OpenLinkSheetProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  // On open: clear prior state, then try to pre-fill from the clipboard. On close: reset.
  useEffect(() => {
    if (!visible) {
      setValue("");
      setError(null);
      setDetected(false);
      return;
    }
    let cancelled = false;
    const read = readClipboard ?? (() => Clipboard.getStringAsync());
    void read()
      .then((text) => {
        const id = parsePastedLink(text ?? "");
        if (!cancelled && id) {
          setValue((text ?? "").trim());
          setDetected(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, readClipboard]);

  function open() {
    const id = parsePastedLink(value);
    if (!id) {
      setError("That doesn't look like a aesmsg link.");
      return;
    }
    onSubmit(id);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.heading} accessibilityRole="header">
        Open a secure link
      </Text>
      <Text style={styles.body}>
        Paste a aesmsg link or its id. It opens here and is decrypted on this device.
      </Text>

      <Field
        mono
        placeholder="https://…/l/… or the link id"
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setError(null);
          setDetected(false);
        }}
      />

      {detected && (
        <View style={styles.hint}>
          <Icon name="content_paste" size={16} color={colors.emerald} />
          <Text style={styles.hintText}>Detected a secure link from your clipboard.</Text>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <Button icon="lock_open" disabled={value.trim().length === 0} onPress={open} style={styles.cta}>
        Open
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.h2, color: colors.onSurface, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: colors.onSurfaceVariant, marginBottom: 16 },
  hint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  hintText: { fontSize: 13, color: colors.emerald, flex: 1 },
  error: { fontSize: 13, color: colors.error, marginTop: 10 },
  cta: { marginTop: 16 },
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (no type errors). If `type.h2` or any token name errors, confirm against `apps/mobile/src/theme/typography.ts` — the export is `type.h2` and `type.bodyLg`.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS (or run `pnpm lint:fix` then re-run).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/reader/OpenLinkSheet.tsx
git commit -m "feat(mobile): OpenLinkSheet paste-a-link bottom sheet"
```

---

### Task 3: Wire the sheet into HomeFlow + App routing

**Files:**
- Modify: `apps/mobile/src/home/HomeFlow.tsx`
- Modify: `apps/mobile/App.tsx`

No unit test (wiring/presentational). Verified by typecheck + manual sim (Task 15).

- [ ] **Step 1: Update HomeFlow to own the sheet and accept `onOpenReader`**

Replace the full contents of `apps/mobile/src/home/HomeFlow.tsx` with:

```tsx
import type { PublicKeyString } from "@aesmsg/crypto";
import { useState } from "react";
import { CreateFlow } from "@/src/create/CreateFlow";
import { HomeScreen } from "@/src/home/HomeScreen";
import { OpenLinkSheet } from "@/src/reader/OpenLinkSheet";

// HomeFlow — the Encrypt tab's local stack. It renders the Home hub and, when "Create secure
// message" fires, swaps to the EXISTING <CreateFlow/>. The "Open secure link" hub action now opens
// an <OpenLinkSheet/>; a parsed link id is handed up via onOpenReader so App can route it into the
// existing ReaderFlow (the same path a deep link uses). The other secondary hub actions remain
// presentational placeholders wired in a later integration pass.

type Route = "home" | "compose";

export interface HomeFlowProps {
  publicKeyString: PublicKeyString;
  /** Route a parsed link id into the reader (App sets linkId → mounts ReaderFlow). */
  onOpenReader?: (id: string) => void;
}

export function HomeFlow({ publicKeyString, onOpenReader }: HomeFlowProps) {
  const [route, setRoute] = useState<Route>("home");
  const [sheetVisible, setSheetVisible] = useState(false);

  if (route === "compose") {
    return <CreateFlow onExit={() => setRoute("home")} />;
  }

  return (
    <>
      <HomeScreen
        publicKeyString={publicKeyString}
        onCompose={() => setRoute("compose")}
        onOpenLink={() => setSheetVisible(true)}
        // TODO(integration): route these to See-all-links / Scan / My-key / Add-contact /
        // Import-backup / Settings destinations. Presentational placeholders for now.
        onSeeAllLinks={() => {}}
        onScan={() => {}}
        onMyKey={() => {}}
        onAddContact={() => {}}
        onImportBackup={() => {}}
        onSettings={() => {}}
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

- [ ] **Step 2: Pass `onOpenReader` from App**

In `apps/mobile/App.tsx`, find the tab-shell line (currently):

```tsx
{tab === "encrypt" && <HomeFlow publicKeyString={state.publicKeyString} />}
```

Replace it with:

```tsx
{tab === "encrypt" && (
  <HomeFlow publicKeyString={state.publicKeyString} onOpenReader={(id) => setLinkId(id)} />
)}
```

(`setLinkId` already exists in `Root()`; setting it makes the existing `if (linkId) return <ReaderFlow .../>` branch mount the reader — the same routing the OS deep link uses.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/home/HomeFlow.tsx apps/mobile/App.tsx
git commit -m "feat(mobile): wire Open-secure-link button to the reader via OpenLinkSheet"
```

---

## Phase 2 — Notification pure logic (no native deps, fully unit-tested)

### Task 4: `planExpiryReminder`

**Files:**
- Create: `apps/mobile/src/notifications/expiry-plan.ts`
- Test: `apps/mobile/tests/expiry-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/expiry-plan.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { planExpiryReminder } from "@/src/notifications/expiry-plan";

const HOUR = 60 * 60 * 1000;

describe("planExpiryReminder", () => {
  it("schedules one hour before expiry when there is more than an hour left", () => {
    const plan = planExpiryReminder({ expiresAtMs: 10 * HOUR, nowMs: 0 });
    expect(plan).toEqual({ fireAtMs: 9 * HOUR });
  });

  it("returns null when the link expires in under an hour (no immediate reminder)", () => {
    expect(planExpiryReminder({ expiresAtMs: 30 * 60 * 1000, nowMs: 0 })).toBeNull();
  });

  it("returns null when the reminder time is exactly now", () => {
    expect(planExpiryReminder({ expiresAtMs: HOUR, nowMs: 0 })).toBeNull();
  });

  it("returns null when the link is already expired", () => {
    expect(planExpiryReminder({ expiresAtMs: 0, nowMs: 5 * HOUR })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/expiry-plan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/notifications/expiry-plan.ts`:

```typescript
// Pure scheduling decision for the local "expiring soon" reminder: fire one hour before expiry,
// and only if that moment is still in the future. Kept side-effect-free so it is unit-tested in
// Node; the actual scheduling (expo-notifications) lives in the integration layer.

const LEAD_MS = 60 * 60 * 1000; // one hour before expiry

export interface ExpiryReminderPlan {
  fireAtMs: number;
}

export function planExpiryReminder(input: {
  expiresAtMs: number;
  nowMs: number;
}): ExpiryReminderPlan | null {
  const fireAtMs = input.expiresAtMs - LEAD_MS;
  if (fireAtMs <= input.nowMs) return null;
  return { fireAtMs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/expiry-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/notifications/expiry-plan.ts apps/mobile/tests/expiry-plan.test.ts
git commit -m "feat(mobile): planExpiryReminder pure scheduling rule"
```

---

### Task 5: `shouldPrimeNotifications`

**Files:**
- Create: `apps/mobile/src/notifications/prime-decision.ts`
- Test: `apps/mobile/tests/prime-decision.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/prime-decision.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { shouldPrimeNotifications } from "@/src/notifications/prime-decision";

describe("shouldPrimeNotifications", () => {
  it("primes when permission is undetermined and we have not asked before", () => {
    expect(shouldPrimeNotifications({ permission: "undetermined", alreadyPrimed: false })).toBe(
      true,
    );
  });

  it("does not prime once we have already primed", () => {
    expect(shouldPrimeNotifications({ permission: "undetermined", alreadyPrimed: true })).toBe(
      false,
    );
  });

  it("does not prime when permission is already granted", () => {
    expect(shouldPrimeNotifications({ permission: "granted", alreadyPrimed: false })).toBe(false);
  });

  it("does not prime when permission was denied (respect the user's choice)", () => {
    expect(shouldPrimeNotifications({ permission: "denied", alreadyPrimed: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/prime-decision.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/notifications/prime-decision.ts`:

```typescript
// Whether to show the soft permission-priming sheet. Only when the OS permission is still
// undetermined (so we have not yet shown the system dialog) AND we have not already primed once.
// A denied or granted status both mean "don't ask again here".

export type PermissionStatus = "granted" | "denied" | "undetermined";

export function shouldPrimeNotifications(input: {
  permission: PermissionStatus;
  alreadyPrimed: boolean;
}): boolean {
  return input.permission === "undetermined" && !input.alreadyPrimed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/prime-decision.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/notifications/prime-decision.ts apps/mobile/tests/prime-decision.test.ts
git commit -m "feat(mobile): shouldPrimeNotifications decision"
```

---

### Task 6: Notification preferences store

**Files:**
- Create: `apps/mobile/src/notifications/prefs.ts`
- Test: `apps/mobile/tests/notification-prefs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/tests/notification-prefs.test.ts` (mirrors the `secure-store.test.ts` mocking convention — in-memory `Map` via `vi.hoisted`, `Symbol` sentinel for the accessibility constant):

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, WHEN_UNLOCKED_THIS_DEVICE_ONLY } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: Symbol("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  getItemAsync: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

import {
  DEFAULT_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  updateNotificationPrefs,
} from "@/src/notifications/prefs";

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("notification prefs", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await loadNotificationPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("round-trips saved prefs", async () => {
    const next = { ...DEFAULT_PREFS, expiringSoon: false };
    await saveNotificationPrefs(next);
    expect(await loadNotificationPrefs()).toEqual(next);
  });

  it("merges a partial patch over the current prefs and returns the result", async () => {
    const result = await updateNotificationPrefs({ permissionPrimed: true });
    expect(result.permissionPrimed).toBe(true);
    expect(result.expiringSoon).toBe(DEFAULT_PREFS.expiringSoon);
    expect((await loadNotificationPrefs()).permissionPrimed).toBe(true);
  });

  it("backfills newly-added keys when stored JSON predates them", async () => {
    // A stored blob missing quietHours / permissionPrimed must not lose the new defaults.
    store.set("aesmsg.notification-prefs", JSON.stringify({ expiringSoon: false }));
    const loaded = await loadNotificationPrefs();
    expect(loaded.expiringSoon).toBe(false);
    expect(loaded.quietHours).toEqual(DEFAULT_PREFS.quietHours);
    expect(loaded.permissionPrimed).toBe(false);
  });

  it("falls back to defaults on corrupt JSON", async () => {
    store.set("aesmsg.notification-prefs", "{not json");
    expect(await loadNotificationPrefs()).toEqual(DEFAULT_PREFS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/notification-prefs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/notifications/prefs.ts`:

```typescript
import * as SecureStore from "expo-secure-store";

// Local notification preferences. Not secret, but stored via SecureStore (already a dependency) with
// the device-local accessibility class so they share the app's no-iCloud-sync posture and we avoid
// adding an AsyncStorage native module. Stored as one JSON blob under a single key. Loads merge over
// DEFAULT_PREFS so a stored blob written by an older build (missing newer keys) backfills defaults.

const KEY = "aesmsg.notification-prefs";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface NotificationPrefs {
  /** Inert this round (no remote push yet); value persisted so it lights up later. */
  linkOpened: boolean;
  /** Gates the on-device "expiring soon" reminder. */
  expiringSoon: boolean;
  /** Inert this round (contact-verification feature); value persisted. */
  keyChanged: boolean;
  /** Persisted; not enforced this round. */
  quietHours: { enabled: boolean; from: string; to: string };
  /** Whether the soft permission-priming sheet has been shown once. */
  permissionPrimed: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  linkOpened: true,
  expiringSoon: true,
  keyChanged: true,
  quietHours: { enabled: true, from: "22:00", to: "07:00" },
  permissionPrimed: false,
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      quietHours: { ...DEFAULT_PREFS.quietHours, ...(parsed.quietHours ?? {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(prefs), OPTIONS);
}

export async function updateNotificationPrefs(
  patch: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const current = await loadNotificationPrefs();
  const next: NotificationPrefs = {
    ...current,
    ...patch,
    quietHours: { ...current.quietHours, ...(patch.quietHours ?? {}) },
  };
  await saveNotificationPrefs(next);
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/notification-prefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/notifications/prefs.ts apps/mobile/tests/notification-prefs.test.ts
git commit -m "feat(mobile): persisted notification preferences store"
```

---

## Phase 3 — Native deps + wiring (requires a clean rebuild for on-device)

### Task 7: Add `expo-notifications` dependency + plugin

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`)
- Modify: `apps/mobile/app.config.ts`

No unit test. Verified by typecheck (types resolve) + the rebuild in Task 15.

- [ ] **Step 1: Install the SDK-compatible version**

Run: `pnpm --filter @aesmsg/mobile exec expo install expo-notifications`
Expected: adds `expo-notifications` at the SDK-56-compatible range to `apps/mobile/package.json` and updates the lockfile.
If `expo install` misbehaves under pnpm, fall back to: `pnpm --filter @aesmsg/mobile add expo-notifications@~56.0.0` then verify the resolved version sits in the `~56.0.x` line like the sibling `expo-*` deps.

- [ ] **Step 2: Register the config plugin**

In `apps/mobile/app.config.ts`, change the `plugins` array from:

```typescript
plugins: ["expo-secure-store", "expo-local-authentication"],
```

to:

```typescript
plugins: ["expo-secure-store", "expo-local-authentication", "expo-notifications"],
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: PASS (the new dependency's types resolve).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.config.ts pnpm-lock.yaml
git commit -m "build(mobile): add expo-notifications (local notifications)"
```

---

### Task 8: `expo-notifications` DI wrapper

**Files:**
- Create: `apps/mobile/src/notifications/notifications.ts`

No unit test (native-backed glue, per repo convention). Verified by typecheck + manual sim.

> **IMPORTANT for the implementer:** expo-notifications' `scheduleNotificationAsync` trigger shape and `setNotificationHandler` return shape have changed across SDK versions. Before finalizing, confirm the exact shapes against the installed types in `apps/mobile/node_modules/expo-notifications/build/` (e.g. `Notifications.types.d.ts` / `NotificationHandler` / `SchedulableTriggerInputTypes`). The code below targets SDK 56; adjust only the wrapper if the installed types differ — callers depend on this interface, not on expo-notifications directly.

- [ ] **Step 1: Create the wrapper**

Create `apps/mobile/src/notifications/notifications.ts`:

```typescript
import * as Notifications from "expo-notifications";
import type { PermissionStatus } from "@/src/notifications/prime-decision";

// Thin DI seam over expo-notifications so the rest of the app depends on this small interface (and
// so the native module is imported in exactly one place). Not unit-tested — verified on device.

function toStatus(status: Notifications.PermissionStatus): PermissionStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function getPermissionStatus(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return toStatus(status);
}

export async function requestPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync();
  return toStatus(status);
}

export interface ScheduleLocalInput {
  title: string;
  body: string;
  fireAtMs: number;
  data?: Record<string, unknown>;
}

export async function scheduleLocal(input: ScheduleLocalInput): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title: input.title, body: input.body, data: input.data ?? {} },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(input.fireAtMs),
    },
  });
}

export async function cancel(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

// Present alerts even while the app is foregrounded (a reminder that fires in-app is still useful).
export function configureForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Fires when the user taps a notification. Returns a subscription with remove().
export function addResponseListener(
  handler: (data: Record<string, unknown>) => void,
): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data ?? {});
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm lint`
Expected: PASS. If `SchedulableTriggerInputTypes` or the handler keys type-error, reconcile with the installed expo-notifications types (see the IMPORTANT note) and keep the public function signatures identical.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/notifications/notifications.ts
git commit -m "feat(mobile): expo-notifications DI wrapper"
```

---

### Task 9: Schedule-on-create integration glue + hook into CreateFlow

**Files:**
- Create: `apps/mobile/src/notifications/expiry-reminder.ts`
- Modify: `apps/mobile/src/create/CreateFlow.tsx`

No unit test for the glue (the decision logic `planExpiryReminder` and `prefs` are already tested; this layer only composes them with the native wrapper). Verified by manual sim.

- [ ] **Step 1: Create the integration function**

Create `apps/mobile/src/notifications/expiry-reminder.ts`:

```typescript
import { planExpiryReminder } from "@/src/notifications/expiry-plan";
import * as notifications from "@/src/notifications/notifications";
import { loadNotificationPrefs } from "@/src/notifications/prefs";

// Best-effort: after a link is created, schedule the local "expiring soon" reminder if the user has
// the preference on, permission is granted, and the reminder time is still in the future. Never
// blocks or surfaces an error to the create flow — a missing reminder must not break sending.
export async function scheduleExpiryReminderOnCreate(input: {
  id: string;
  expiresAt: Date;
}): Promise<void> {
  try {
    const prefs = await loadNotificationPrefs();
    if (!prefs.expiringSoon) return;
    if ((await notifications.getPermissionStatus()) !== "granted") return;
    const plan = planExpiryReminder({ expiresAtMs: input.expiresAt.getTime(), nowMs: Date.now() });
    if (!plan) return;
    await notifications.scheduleLocal({
      title: "aesmsg",
      body: "A secure link is expiring soon.",
      fireAtMs: plan.fireAtMs,
      data: { linkId: input.id },
    });
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 2: Hook it into the create success path**

In `apps/mobile/src/create/CreateFlow.tsx`, add the import near the top (after the existing create imports):

```tsx
import { scheduleExpiryReminderOnCreate } from "@/src/notifications/expiry-reminder";
```

Then in the `submit` function, change the success branch from:

```tsx
const out = await createAndSeal(v);
setState({ kind: "result", url: out.url, submit: v });
```

to:

```tsx
const out = await createAndSeal(v);
setState({ kind: "result", url: out.url, submit: v });
// Fire-and-forget: schedule the local expiry reminder. Best-effort, never blocks the result.
void scheduleExpiryReminderOnCreate({ id: out.id, expiresAt: v.expiresAt });
```

(`out.id` and `v.expiresAt` are both already available — `createAndSeal` returns `{ id, url, recipientFingerprint }` and `ComposeSubmit` carries `expiresAt: Date`.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/notifications/expiry-reminder.ts apps/mobile/src/create/CreateFlow.tsx
git commit -m "feat(mobile): schedule local expiring-soon reminder on link create"
```

---

### Task 10: Notification priming on first result

**Files:**
- Create: `apps/mobile/src/notifications/NotificationPrimer.tsx`
- Modify: `apps/mobile/src/create/CreateFlow.tsx`

No unit test (the decision `shouldPrimeNotifications` is tested; this is glue). Verified by manual sim.

- [ ] **Step 1: Create the primer**

Create `apps/mobile/src/notifications/NotificationPrimer.tsx`:

```tsx
import { useEffect, useState } from "react";
import * as notifications from "@/src/notifications/notifications";
import { loadNotificationPrefs, updateNotificationPrefs } from "@/src/notifications/prefs";
import { shouldPrimeNotifications } from "@/src/notifications/prime-decision";
import { PushPermissionScreen } from "@/src/system";

// Shows the soft permission-priming sheet (PushPermissionScreen) at most once. Mount it where a
// prime is appropriate (after a link is created). It self-gates: it only appears when the OS
// permission is still undetermined AND we have not primed before (persisted flag), so re-mounting
// on later creates is a no-op. Enabling or dismissing both mark it primed.
export function NotificationPrimer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prefs = await loadNotificationPrefs();
      const permission = await notifications.getPermissionStatus();
      if (!cancelled && shouldPrimeNotifications({ permission, alreadyPrimed: prefs.permissionPrimed })) {
        setVisible(true);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function finish() {
    setVisible(false);
    await updateNotificationPrefs({ permissionPrimed: true }).catch(() => {});
  }

  return (
    <PushPermissionScreen
      visible={visible}
      onEnable={() => {
        void notifications.requestPermission().finally(() => void finish());
      }}
      onDismiss={() => void finish()}
    />
  );
}
```

- [ ] **Step 2: Render it on the result screen**

In `apps/mobile/src/create/CreateFlow.tsx`, add the import:

```tsx
import { NotificationPrimer } from "@/src/notifications/NotificationPrimer";
```

Then change the `result` branch from:

```tsx
if (state.kind === "result") {
  const labels = resultChipLabels(state.submit.expiresAt, state.submit.maxOpens);
  return (
    <ResultScreen
      url={state.url}
      onNew={() => setState({ kind: "compose", error: null })}
      expiryLabel={labels.expiry}
      opensLabel={labels.opens}
    />
  );
}
```

to:

```tsx
if (state.kind === "result") {
  const labels = resultChipLabels(state.submit.expiresAt, state.submit.maxOpens);
  return (
    <>
      <ResultScreen
        url={state.url}
        onNew={() => setState({ kind: "compose", error: null })}
        expiryLabel={labels.expiry}
        opensLabel={labels.opens}
      />
      <NotificationPrimer />
    </>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/notifications/NotificationPrimer.tsx apps/mobile/src/create/CreateFlow.tsx
git commit -m "feat(mobile): soft notification permission priming after first link"
```

---

### Task 11: `SwitchRow` disabled ("Available soon") variant

**Files:**
- Modify: `apps/mobile/src/settings/SwitchRow.tsx`

No unit test (presentational). Verified by typecheck + manual sim.

- [ ] **Step 1: Add a `disabled` prop and the inert trailing label**

In `apps/mobile/src/settings/SwitchRow.tsx`, update the props interface to add `disabled`:

```tsx
export interface SwitchRowProps {
  icon?: string | undefined;
  title: ReactNode;
  sub?: ReactNode;
  value: boolean;
  onValueChange?: ((value: boolean) => void) | undefined;
  /** Render the row inert: dimmed, no toggle, with an "Available soon" trailing label. */
  disabled?: boolean | undefined;
  /** Set by ListGroup — true for the first row, which suppresses the top hairline. Internal. */
  __first?: boolean | undefined;
}
```

Update the destructure to include `disabled = false`:

```tsx
export function SwitchRow({
  icon,
  title,
  sub,
  value,
  onValueChange,
  disabled = false,
  __first = false,
}: SwitchRowProps) {
```

Change the row's outer `View` style and the trailing element. Replace:

```tsx
    <View style={styles.row}>
      {!__first && <View style={styles.hairline} />}
```

with:

```tsx
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      {!__first && <View style={styles.hairline} />}
```

and replace the trailing `<Toggle .../>` line:

```tsx
      <Toggle value={value} onValueChange={onValueChange ?? (() => {})} />
```

with:

```tsx
      {disabled ? (
        <Text style={styles.soon}>Available soon</Text>
      ) : (
        <Toggle value={value} onValueChange={onValueChange ?? (() => {})} />
      )}
```

Add two styles to the `StyleSheet.create({ ... })` block:

```tsx
  rowDisabled: { opacity: 0.6 },
  soon: { fontSize: 12, color: colors.onSurfaceVariant, fontWeight: "500", alignSelf: "center" },
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/settings/SwitchRow.tsx
git commit -m "feat(mobile): SwitchRow disabled 'Available soon' variant"
```

---

### Task 12: Wire `NotificationsScreen` to persisted prefs

**Files:**
- Modify: `apps/mobile/src/settings/NotificationsScreen.tsx`

No unit test (presentational; loads the tested prefs store). Verified by manual sim.

- [ ] **Step 1: Replace the screen body to load/persist prefs**

Replace the full contents of `apps/mobile/src/settings/NotificationsScreen.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppBar, Icon, ListGroup, ListRow, Screen, SectionLabel } from "@/src/components";
import {
  DEFAULT_PREFS,
  loadNotificationPrefs,
  type NotificationPrefs,
  updateNotificationPrefs,
} from "@/src/notifications/prefs";
import { SwitchRow } from "@/src/settings/SwitchRow";
import { colors, radii } from "@/src/theme";

// 49 · Notifications Settings. Loads persisted preferences and writes each change back. Only
// "Expiring soon" is functional this round (it gates the on-device reminder scheduled at create
// time). "Link opened" and "Contact key changed" need the deferred remote-push / contact-verify
// work, so they render disabled with an "Available soon" label (their value is still persisted).
// Quiet hours is persisted but not enforced yet — stated in-screen.

export interface NotificationsScreenProps {
  onBack?: (() => void) | undefined;
  onOpenQuietFrom?: (() => void) | undefined;
  onOpenQuietTo?: (() => void) | undefined;
}

const noop = () => {};

export function NotificationsScreen({
  onBack,
  onOpenQuietFrom,
  onOpenQuietTo,
}: NotificationsScreenProps) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;
    void loadNotificationPrefs()
      .then((p) => {
        if (!cancelled) setPrefs(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic local update + best-effort persist.
  function set(patch: Partial<NotificationPrefs>) {
    setPrefs((current) => ({ ...current, ...patch }));
    void updateNotificationPrefs(patch).catch(() => {});
  }

  return (
    <Screen topInset={false}>
      <AppBar title="Notifications" onLeading={onBack ?? noop} />

      <View style={styles.stack}>
        <View style={styles.infoCard}>
          <Icon name="info" size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            Notifications never include message content — only that something happened.
          </Text>
        </View>

        <View>
          <SectionLabel>Alerts</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="visibility"
              title="Link opened"
              sub="When a recipient opens one of your links."
              value={prefs.linkOpened}
              disabled
            />
            <SwitchRow
              icon="schedule"
              title="Expiring soon"
              sub="An hour before a link expires."
              value={prefs.expiringSoon}
              onValueChange={(v) => set({ expiringSoon: v })}
            />
            <SwitchRow
              icon="key"
              title="Contact key changed"
              sub="When a verified contact's fingerprint changes."
              value={prefs.keyChanged}
              disabled
            />
          </ListGroup>
        </View>

        <View>
          <SectionLabel>Quiet hours</SectionLabel>
          <ListGroup>
            <SwitchRow
              icon="dark_mode"
              title="Quiet hours"
              sub="Silence alerts during this window."
              value={prefs.quietHours.enabled}
              onValueChange={(v) =>
                set({ quietHours: { ...prefs.quietHours, enabled: v } })
              }
            />
            <ListRow
              title="From"
              value={prefs.quietHours.from}
              trailing={null}
              onPress={onOpenQuietFrom ?? noop}
            />
            <ListRow
              title="To"
              value={prefs.quietHours.to}
              trailing={null}
              onPress={onOpenQuietTo ?? noop}
            />
          </ListGroup>
          <Text style={styles.note}>Applies to future alerts on this device.</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    padding: 16,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant },
  note: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 8, paddingHorizontal: 4 },
});
```

(Note: this removes the `QUIET_HOURS_MOCK` import and the local `useState` toggles — From/To now read from persisted prefs; the picker callbacks stay presentational.)

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm lint`
Expected: PASS. (If `settings-mock`'s `QUIET_HOURS_MOCK` is now unused elsewhere, leave it — other settings screens may use it; do not delete.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/settings/NotificationsScreen.tsx
git commit -m "feat(mobile): persist notification settings; functional expiring-soon, inert others"
```

---

### Task 13: Notification tap + foreground handler in App

**Files:**
- Modify: `apps/mobile/App.tsx`

No unit test (native glue). Verified by manual sim.

- [ ] **Step 1: Add the import**

In `apps/mobile/App.tsx`, add to the imports:

```tsx
import * as notifications from "@/src/notifications/notifications";
```

- [ ] **Step 2: Configure foreground presentation + tap routing**

Inside `Root()`, after the existing deep-link `useEffect` (the one that calls `parseLinkId`), add:

```tsx
  // Local notifications: present alerts in-foreground, and on tap land the user on the Links tab.
  // (Per-link deep routing waits on the real links store; the Links tab is the V1 destination.)
  useEffect(() => {
    notifications.configureForeground();
    const sub = notifications.addResponseListener(() => {
      setLinkId(null);
      setTab("links");
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/App.tsx
git commit -m "feat(mobile): foreground notification presentation + tap routes to Links"
```

---

## Phase 4 — Gates + verification

### Task 14: Full automated gates

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: PASS across all packages (no regressions in web/crypto).

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS (run `pnpm lint:fix` for safe fixes, re-run, and commit any formatting with `git commit -m "style(mobile): biome formatting"` if needed).

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: PASS, including the four new mobile test files (`parse-pasted-link`, `expiry-plan`, `prime-decision`, `notification-prefs`).

- [ ] **Step 4: Commit any fixups** (only if Steps 1-3 required changes)

```bash
git add -A
git commit -m "chore(mobile): gate fixups"
```

---

### Task 15: Clean iOS rebuild + manual simulator verification

**Files:** none (manual verification).

> Adding `expo-notifications` is a native module → the existing prebuilt `ios/` requires a **clean** rebuild (incremental builds crash with stale codegen). Follow the project's iOS build recipe (pod install with the macOS SDK env, then `xcodebuild`). Local notifications work in the simulator; remote push does not (and is out of scope this round).

- [ ] **Step 1: Clean rebuild & launch on the iOS simulator** (per the project build recipe).

- [ ] **Step 2: Verify the reader entry**
  - Copy a link of the form `https://app.aesmsg.example/l/<16-char-id>` to the clipboard.
  - On Home tap **"Open secure link"** → the sheet opens with the link **pre-filled** and the "Detected a secure link" hint.
  - Tap **Open** → `ReaderFlow` mounts (it reaches the landing/preview against a reachable backend, or the network terminal against the placeholder host — either confirms routing).
  - Paste garbage → tap Open → inline "That doesn't look like a aesmsg link." and no navigation.

- [ ] **Step 3: Verify permission priming**
  - Fresh install (or reset prefs). Create a secure message → after the result screen, the priming sheet appears. Tap **Enable notifications** → OS dialog. Create another message → the sheet does **not** reappear.

- [ ] **Step 4: Verify the expiring-soon reminder**
  - With permission granted and "Expiring soon" on, create a link. Confirm a local notification is scheduled via `expo-notifications`' `getAllScheduledNotificationsAsync()` (temporary log) or by creating a link with a short custom expiry so the lead time lands soon, then waiting for it to fire.
  - Toggle "Expiring soon" off in Settings → Notifications, create a link → no reminder is scheduled.

- [ ] **Step 5: Verify settings persistence + inert toggles**
  - Settings → Notifications: "Link opened" and "Contact key changed" show **"Available soon"** (dimmed, no toggle). "Expiring soon" and "Quiet hours" toggle. The "Applies to future alerts" note shows.
  - Toggle "Expiring soon" off, relaunch the app → it is still off (persisted).

- [ ] **Step 6: Verify notification tap**
  - Tap a fired local notification → the app opens to the **Links** tab.

- [ ] **Step 7: Final state**

```bash
git status   # expect clean; all work committed
git log --oneline -15
```

---

## Self-review

**Spec coverage:** §4 Open-a-link entry → Tasks 1-3. §5.1 dep+plugin → Task 7. §5.2 wrapper → Task 8. §5.3 prefs → Task 6. §5.4 priming → Tasks 5, 10. §5.5 expiry scheduling → Tasks 4, 9. §5.6 settings (functional/inert/quiet-hours) → Tasks 11, 12. §5.7 tap+foreground → Task 13. §7 module boundaries → matches the file table. §8 testing → Tasks 1, 4, 5, 6, 14, 15. §9 deferred remote push → explicitly NOT built (documented in spec). No spec requirement is left without a task.

**Type consistency:** `NotificationPrefs` shape is identical across `prefs.ts`, `NotificationsScreen.tsx`, `NotificationPrimer.tsx`, `expiry-reminder.ts`. `PermissionStatus` union (`"granted" | "denied" | "undetermined"`) is defined once in `prime-decision.ts` and reused by `notifications.ts`. `planExpiryReminder({ expiresAtMs, nowMs })` is called with exactly those keys in `expiry-reminder.ts`. `parsePastedLink(input): string | null` is the signature used by `OpenLinkSheet`. `scheduleExpiryReminderOnCreate({ id, expiresAt })` matches the `CreateFlow` call site (`out.id`, `v.expiresAt`). `onOpenReader(id)` in `HomeFlowProps` matches the `App.tsx` `setLinkId(id)` pass-through.

**Placeholder scan:** No "TBD"/"implement later"/"add error handling" — every code step has complete code. The one explicit implementer caveat (Task 8, expo-notifications trigger/handler API verification against installed types) is a deliberate version-guard, not a placeholder, and the surrounding code is fully written.
