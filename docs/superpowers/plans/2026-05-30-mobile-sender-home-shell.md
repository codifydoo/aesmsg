# Slice 13 — Mobile sender + home shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/mobile` into a navigable app you can send from — add a bottom-tab shell (Home · Encrypt · Keys · Settings), a Home overview, Settings (lock/wipe), and the Encrypt/Sender flow (compose text → encrypt locally to a pasted recipient key → upload ciphertext → share the `/l/:id` link).

**Architecture:** Reuse the trust-critical core (`@aesmsg/crypto` seal/encodePayload, the existing API, the identity state machine) unchanged. The sender's pure logic (`create-and-seal.ts`) mirrors `apps/web/src/create/encrypt-and-post.ts` line-for-line so a mobile-sent link is byte-compatible with the web reader. Navigation is a lightweight `activeTab` state + a `TabBar` (no nav library). **No new native dependencies** — runs on the current build with a Metro reload.

**Tech Stack:** Expo SDK 56 / RN 0.85 / Hermes, TypeScript strict, `@aesmsg/crypto` (workspace), `expo-sharing` + `expo-clipboard` (already installed), Vitest (node env, no React renderer — pure logic extracted + tested, native modules `vi.mock`'d; UI verified manually on the simulator).

**Spec:** [`docs/superpowers/specs/2026-05-30-mobile-sender-home-shell-design.md`](../specs/2026-05-30-mobile-sender-home-shell-design.md)

> ℹ️ **Test convention (apps/mobile):** Vitest runs `environment: 'node'` with NO React renderer — do not add one. Pure logic lives in `.ts` modules tested in `apps/mobile/tests/`; native modules (`expo-*`, `react-native`, `react-native-quick-crypto`) must be `vi.mock`'d; use REAL `@aesmsg/crypto`. React Native screens are verified manually on the simulator (their logic is extracted into the tested modules). Run a single test file with `pnpm --filter @aesmsg/mobile exec vitest run tests/<file>`.

---

## File map

```
apps/mobile/
├─ App.tsx                              (Task 7 — activeTab state + TabBar when unlocked)
└─ src/
   ├─ lib/
   │  ├─ base64.ts                      (Task 1 — add bytesToBase64Url)
   │  └─ link-id.ts                     (Task 1 — generateLinkId + LINK_ID_REGEX)
   ├─ api/client.ts                     (Task 2 — add API_BASE_URL export + postMessage)
   ├─ create/
   │  ├─ expiry.ts                      (Task 3 — ExpiryChoice/MaxOpensChoice + expiryToDate)
   │  ├─ create-and-seal.ts             (Task 4 — pure; mirrors web encrypt-and-post.ts)
   │  ├─ ComposeScreen.tsx              (Task 10)
   │  ├─ ResultScreen.tsx               (Task 11)
   │  └─ CreateFlow.tsx                 (Task 12 — compose→encrypting→result|error)
   ├─ navigation/
   │  ├─ tabs.ts                        (Task 5 — Tab union + TABS descriptors)
   │  └─ TabBar.tsx                     (Task 6)
   ├─ home/HomeScreen.tsx               (Task 8)
   └─ settings/
      ├─ SettingsScreen.tsx             (Task 9)
      └─ WipeConfirmModal.tsx           (Task 9)
apps/mobile/tests/
   ├─ link-id.test.ts                   (Task 1)
   ├─ base64.test.ts                    (Task 1 — extend)
   ├─ api-client.test.ts               (Task 2 — extend)
   ├─ expiry.test.ts                    (Task 3)
   ├─ create-and-seal.test.ts           (Task 4)
   └─ tabs.test.ts                      (Task 5)
```

---

## Task 1: Link-id generator (base64url + generateLinkId)

**Files:**
- Modify: `apps/mobile/src/lib/base64.ts`
- Create: `apps/mobile/src/lib/link-id.ts`
- Test: `apps/mobile/tests/base64.test.ts` (extend), `apps/mobile/tests/link-id.test.ts`

- [ ] **Step 1: Write the failing base64url test** — append to `apps/mobile/tests/base64.test.ts`:

```ts
import { bytesToBase64Url } from "@/src/lib/base64";

describe("bytesToBase64Url", () => {
  it("encodes 12 bytes to 16 url-safe chars with no padding", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const out = bytesToBase64Url(bytes);
    expect(out).toMatch(/^[A-Za-z0-9_-]{16}$/); // no +, /, or =
    expect(out).not.toMatch(/[+/=]/);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/base64.test.ts`
Expected: FAIL — `bytesToBase64Url is not exported`.

- [ ] **Step 3: Add `bytesToBase64Url`** to `apps/mobile/src/lib/base64.ts` (after the existing `bytesToBase64`):

```ts
// base64url (RFC 4648 §5): +→-, /→_, padding stripped. Used for link ids.
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```

- [ ] **Step 4: Write the failing link-id test** — `apps/mobile/tests/link-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateLinkId, LINK_ID_REGEX } from "@/src/lib/link-id";

describe("generateLinkId", () => {
  it("produces a 16-char url-safe id matching LINK_ID_REGEX", () => {
    const id = generateLinkId();
    expect(id).toMatch(LINK_ID_REGEX);
    expect(LINK_ID_REGEX.source).toBe("^[A-Za-z0-9_-]{16}$");
  });

  it("produces different ids across calls (CSPRNG)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateLinkId()));
    expect(ids.size).toBe(50);
  });
});
```

- [ ] **Step 5: Run it, verify it fails** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/link-id.test.ts` → FAIL (`link-id` not found).

- [ ] **Step 6: Implement** `apps/mobile/src/lib/link-id.ts` (mirrors `apps/web/src/lib/link-id.ts`):

```ts
import { bytesToBase64Url } from "@/src/lib/base64";

// 16-char url-safe id. Matches the web generator + the server's LINK_ID_REGEX, so a
// mobile-minted link opens with the same AAD frame as a web-minted one.
export const LINK_ID_REGEX = /^[A-Za-z0-9_-]{16}$/;

export function generateLinkId(): string {
  // crypto.getRandomValues is installed on Hermes by the Web Crypto polyfill at app entry,
  // and is native in Node (tests). 12 bytes → 16 base64url chars.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return bytesToBase64Url(bytes);
}
```

- [ ] **Step 7: Run both test files, verify pass**

Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/base64.test.ts tests/link-id.test.ts`
Expected: PASS (all green).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/lib/base64.ts apps/mobile/src/lib/link-id.ts apps/mobile/tests/base64.test.ts apps/mobile/tests/link-id.test.ts
git commit -m "feat(mobile): link-id generator (base64url) for the sender"
```

---

## Task 2: API client — `postMessage`

**Files:**
- Modify: `apps/mobile/src/api/client.ts`
- Test: `apps/mobile/tests/api-client.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `apps/mobile/tests/api-client.test.ts` (this file already `vi.mock`s `expo-constants`; reuse that mock). Add:

```ts
import { type CreateMessageRequest, postMessage } from "@/src/api/client";

describe("postMessage", () => {
  const req: CreateMessageRequest = {
    id: "abcdefghijklmnop",
    recipientFingerprint: "SM-0000-0000",
    ciphertext: "AAAA",
    createdAtMs: 1_700_000_000_000,
    expiresAt: new Date(1_700_000_000_000 + 86_400_000).toISOString(),
    maxOpens: 1,
  };

  afterEach(() => vi.restoreAllMocks());

  it("POSTs JSON to /api/messages and returns the parsed body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: req.id }), { status: 201 }));
    const res = await postMessage(req);
    expect(res.id).toBe(req.id);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/messages$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({ id: req.id, maxOpens: 1 });
  });

  it("throws ApiError on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(postMessage(req)).rejects.toMatchObject({ name: "ApiError", status: 500 });
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/api-client.test.ts` → FAIL (`postMessage`/`CreateMessageRequest` not exported).

- [ ] **Step 3: Implement** — in `apps/mobile/src/api/client.ts`: (a) export the base URL so the sender can build the share link; (b) add the request/response types + `postMessage`. Add `export ` to the existing `BASE_URL` line and append:

```ts
// (change the existing line `const BASE_URL = ...` to:)
export const BASE_URL = (Constants.expoConfig?.extra?.aesmsgApiBaseUrl as string) ?? "";

export interface CreateMessageRequest {
  id: string;
  recipientFingerprint: string;
  ciphertext: string; // base64
  createdAtMs: number;
  expiresAt: string; // ISO 8601
  maxOpens: number;
}

export interface CreateMessageResponse {
  id: string;
}

// Uploads the ciphertext + minimal metadata. The server stores ciphertext only.
export async function postMessage(req: CreateMessageRequest): Promise<CreateMessageResponse> {
  const res = await fetch(`${BASE_URL}/api/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as CreateMessageResponse;
}
```

- [ ] **Step 4: Run it, verify pass** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/api-client.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/api/client.ts apps/mobile/tests/api-client.test.ts
git commit -m "feat(mobile): api client postMessage (upload ciphertext)"
```

---

## Task 3: Expiry + max-opens model

**Files:**
- Create: `apps/mobile/src/create/expiry.ts`
- Test: `apps/mobile/tests/expiry.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/mobile/tests/expiry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { expiryToDate, FAR_FUTURE, MAX_OPENS_OPTIONS } from "@/src/create/expiry";

describe("expiryToDate", () => {
  const now = new Date(1_700_000_000_000);
  it.each([
    ["10m", 10 * 60_000],
    ["1h", 60 * 60_000],
    ["24h", 24 * 60 * 60_000],
    ["7d", 7 * 24 * 60 * 60_000],
  ] as const)("%s adds the right delta", (choice, deltaMs) => {
    expect(expiryToDate(choice, now).getTime()).toBe(now.getTime() + deltaMs);
  });

  it("never → far future sentinel", () => {
    expect(expiryToDate("never", now).getTime()).toBe(FAR_FUTURE.getTime());
  });
});

describe("MAX_OPENS_OPTIONS", () => {
  it("offers 1 / 5 / 10 / unlimited(-1)", () => {
    expect(MAX_OPENS_OPTIONS.map((o) => o.value)).toEqual([1, 5, 10, -1]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/expiry.test.ts` → FAIL.

- [ ] **Step 3: Implement** `apps/mobile/src/create/expiry.ts` (ports `apps/web/src/create/ComposeForm.tsx` helpers):

```ts
export type ExpiryChoice = "10m" | "1h" | "24h" | "7d" | "never";
export type MaxOpensChoice = 1 | 5 | 10 | -1;

export const FAR_FUTURE = new Date("9999-12-31T23:59:59.000Z");

export const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string }[] = [
  { value: "10m", label: "10 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "never", label: "Never (manual revoke)" },
];

export const MAX_OPENS_OPTIONS: { value: MaxOpensChoice; label: string }[] = [
  { value: 1, label: "Once" },
  { value: 5, label: "5 times" },
  { value: 10, label: "10 times" },
  { value: -1, label: "Unlimited (until expiry)" },
];

export function expiryToDate(choice: ExpiryChoice, now: Date): Date {
  switch (choice) {
    case "10m":
      return new Date(now.getTime() + 10 * 60 * 1000);
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1000);
    case "24h":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "never":
      return FAR_FUTURE;
  }
}
```

- [ ] **Step 4: Run it, verify pass** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/expiry.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/expiry.ts apps/mobile/tests/expiry.test.ts
git commit -m "feat(mobile): expiry + max-opens options for the sender"
```

---

## Task 4: `create-and-seal` (core sender logic)

**Files:**
- Create: `apps/mobile/src/create/create-and-seal.ts`
- Test: `apps/mobile/tests/create-and-seal.test.ts`

This is the load-bearing parity file. It mirrors `apps/web/src/create/encrypt-and-post.ts`. The test seals with this module, then opens the ciphertext with the recipient identity via the existing `fetchAndOpen` path — proving send↔receive round-trips in-process.

- [ ] **Step 1: Write the failing test** — `apps/mobile/tests/create-and-seal.test.ts`:

```ts
import {
  decodePayload,
  exportPublicKey,
  generateIdentity,
  importPublicKey,
  open,
} from "@aesmsg/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { aesmsgApiBaseUrl: "https://send.test" } } },
}));

import { createAndSeal } from "@/src/create/create-and-seal";
import { base64ToBytes } from "@/src/lib/base64";

describe("createAndSeal", () => {
  afterEach(() => vi.restoreAllMocks());

  it("seals to the recipient, posts ciphertext, returns a web link; recipient can open it", async () => {
    const recipient = await generateIdentity();
    const recipientKey = exportPublicKey(recipient);

    let posted: any = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      posted = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: posted.id }), { status: 201 });
    });

    const out = await createAndSeal({
      recipientPublicKeyString: recipientKey,
      message: "meet me at the bridge 🔐",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      maxOpens: 1,
    });

    // returns a shareable web link pointing at the configured host
    expect(out.url).toBe(`https://send.test/l/${out.id}`);
    expect(out.id).toMatch(/^[A-Za-z0-9_-]{16}$/);

    // the recipient opens the posted ciphertext with the SAME binding context the server reports
    const ciphertext = base64ToBytes(posted.ciphertext) as unknown as Parameters<typeof open>[0];
    const plaintext = await open(ciphertext, recipient, {
      linkId: out.id,
      recipientPublicKey: recipientKey,
      createdAtMs: posted.createdAtMs,
      expiresAtMs: new Date(posted.expiresAt).getTime(),
      maxOpens: posted.maxOpens,
    });
    expect(decodePayload(plaintext).text).toBe("meet me at the bridge 🔐");
  });

  it("rejects an invalid recipient key before any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      createAndSeal({
        recipientPublicKeyString: "not-a-key",
        message: "x",
        expiresAt: new Date(Date.now() + 60_000),
        maxOpens: 1,
      }),
    ).rejects.toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/create-and-seal.test.ts` → FAIL (module missing). Give crypto cases room: argon2 isn't involved here (seal/open only), but keep the default timeout.

- [ ] **Step 3: Implement** `apps/mobile/src/create/create-and-seal.ts` (mirror `apps/web/src/create/encrypt-and-post.ts`, with the URL built from the configured host):

```ts
import {
  encodePayload,
  type Fingerprint,
  fingerprint,
  importPublicKey,
  type MessageBindingContext,
  type PublicKeyString,
  seal,
} from "@aesmsg/crypto";
import { BASE_URL, postMessage } from "@/src/api/client";
import { bytesToBase64 } from "@/src/lib/base64";
import { generateLinkId } from "@/src/lib/link-id";

export interface CreateAndSealInput {
  recipientPublicKeyString: string;
  message: string;
  expiresAt: Date;
  maxOpens: number;
}

export interface CreateAndSealOutput {
  id: string;
  url: string;
  recipientFingerprint: Fingerprint;
}

export async function createAndSeal(input: CreateAndSealInput): Promise<CreateAndSealOutput> {
  // Validate + parse the recipient key FIRST — a bad key throws here, before any network call.
  const recipient = await importPublicKey(input.recipientPublicKeyString);
  const recipientPk = input.recipientPublicKeyString as PublicKeyString;
  const recipientFingerprint = await fingerprint(recipientPk);

  const id = generateLinkId();
  const createdAtMs = Date.now();
  const expiresAtMs = input.expiresAt.getTime();

  const context: MessageBindingContext = {
    linkId: id,
    recipientPublicKey: recipientPk,
    createdAtMs,
    expiresAtMs,
    maxOpens: input.maxOpens,
  };

  const plaintext = encodePayload({ text: input.message, attachments: [] });
  const ciphertext = await seal(plaintext, recipient, context);

  await postMessage({
    id,
    recipientFingerprint,
    ciphertext: bytesToBase64(ciphertext as unknown as Uint8Array),
    createdAtMs,
    expiresAt: input.expiresAt.toISOString(),
    maxOpens: input.maxOpens,
  });

  // The link must point at the WEB host so a recipient without the app falls back to the web
  // reader, and a recipient with the app deep-links in. BASE_URL is the configured web origin.
  return { id, url: `${BASE_URL}/l/${id}`, recipientFingerprint };
}
```

- [ ] **Step 4: Run it, verify pass** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/create-and-seal.test.ts` → PASS (round-trip + invalid-key cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/create/create-and-seal.ts apps/mobile/tests/create-and-seal.test.ts
git commit -m "feat(mobile): create-and-seal — encrypt locally + upload ciphertext (mirrors web)"
```

---

## Task 5: Tab model

**Files:**
- Create: `apps/mobile/src/navigation/tabs.ts`
- Test: `apps/mobile/tests/tabs.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/mobile/tests/tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TABS } from "@/src/navigation/tabs";

describe("TABS", () => {
  it("lists the four destinations in order", () => {
    expect(TABS.map((t) => t.key)).toEqual(["home", "encrypt", "keys", "settings"]);
  });
  it("every tab has a label + glyph", () => {
    for (const t of TABS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.glyph.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/tabs.test.ts` → FAIL.

- [ ] **Step 3: Implement** `apps/mobile/src/navigation/tabs.ts`:

```ts
export type Tab = "home" | "encrypt" | "keys" | "settings";

export interface TabDescriptor {
  key: Tab;
  label: string;
  glyph: string; // simple text/emoji glyph — no native icon font
}

export const TABS: TabDescriptor[] = [
  { key: "home", label: "Home", glyph: "⌂" },
  { key: "encrypt", label: "Encrypt", glyph: "🔒" },
  { key: "keys", label: "Keys", glyph: "🔑" },
  { key: "settings", label: "Settings", glyph: "⚙" },
];
```

- [ ] **Step 4: Run it, verify pass** — Run: `pnpm --filter @aesmsg/mobile exec vitest run tests/tabs.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/navigation/tabs.ts apps/mobile/tests/tabs.test.ts
git commit -m "feat(mobile): tab model for the app shell"
```

---

## Task 6: TabBar component (UI)

**Files:**
- Create: `apps/mobile/src/navigation/TabBar.tsx`

> UI task — verified manually on the simulator (no renderer). Follow the existing screen style (`src/theme.ts` colors, `StyleSheet`).

- [ ] **Step 1: Implement** `apps/mobile/src/navigation/TabBar.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type Tab, TABS } from "@/src/navigation/tabs";
import { colors } from "@/src/theme";

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={styles.item}
            onPress={() => onChange(t.key)}
          >
            <Text style={[styles.glyph, on && styles.on]}>{t.glyph}</Text>
            <Text style={[styles.label, on && styles.on]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.outline,
    backgroundColor: colors.surfaceContainerLow,
  },
  item: { flex: 1, alignItems: "center", paddingVertical: 8, gap: 2 },
  glyph: { fontSize: 18, color: colors.onSurfaceVariant },
  label: { fontSize: 11, color: colors.onSurfaceVariant },
  on: { color: colors.primary },
});
```

- [ ] **Step 2: Typecheck + lint** — Run: `pnpm --filter @aesmsg/mobile typecheck && pnpm exec biome check apps/mobile/src/navigation/TabBar.tsx`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/navigation/TabBar.tsx
git commit -m "feat(mobile): TabBar component"
```

---

## Task 7: Wire the tab shell into App.tsx

**Files:**
- Modify: `apps/mobile/App.tsx`

The unlocked, no-deep-link state currently renders only `MyPublicKeyScreen`. Replace that with a tabbed shell. Keep the loading / no_identity / locked / deep-link branches exactly as they are.

- [ ] **Step 1: Implement** — in `apps/mobile/App.tsx`, add a `Tab` state and render the active tab + `TabBar`. Replace the final `return <MyPublicKeyScreen .../>` block of `Root` with the shell. The relevant `Root` tail becomes:

```tsx
// (add these imports — `useState` and `View` are ALREADY imported in App.tsx, do NOT re-add them)
import { CreateFlow } from "@/src/create/CreateFlow";
import { HomeScreen } from "@/src/home/HomeScreen";
import { SettingsScreen } from "@/src/settings/SettingsScreen";
import { TabBar } from "@/src/navigation/TabBar";
import type { Tab } from "@/src/navigation/tabs";

// (inside Root, after the existing `const [linkId, setLinkId] = useState(...)`)
const [tab, setTab] = useState<Tab>("home");

// (replace the final `return <MyPublicKeyScreen publicKeyString={state.publicKeyString} />;`)
return (
  <View style={styles.shell}>
    <View style={styles.tabBody}>
      {tab === "home" && (
        <HomeScreen
          publicKeyString={state.publicKeyString}
          onCompose={() => setTab("encrypt")}
        />
      )}
      {tab === "encrypt" && <CreateFlow />}
      {tab === "keys" && <MyPublicKeyScreen publicKeyString={state.publicKeyString} />}
      {tab === "settings" && <SettingsScreen onLock={actions.lock} onWipe={actions.wipe} />}
    </View>
    <TabBar active={tab} onChange={setTab} />
  </View>
);
```

Add to the `StyleSheet.create({...})` at the bottom:

```ts
  shell: { flex: 1, backgroundColor: colors.background },
  tabBody: { flex: 1 },
```

> NOTE: `actions.lock` and `actions.wipe` already exist on the identity context (`useIdentity().actions`). `state.publicKeyString` is present in the `unlocked` state. Tasks 8/9/12 create `HomeScreen`, `SettingsScreen`, `CreateFlow`; until they exist this file won't typecheck — implement Tasks 8, 9, 12 before running the app, or stub them. Recommended order: do Tasks 8, 9, 10, 11, 12, then this wiring compiles. **Reorder note:** move this Task 7 commit to after Task 12 so `App.tsx` references resolve; keep the code here for reference.

- [ ] **Step 2: Defer build/commit to after Task 12** (so imports resolve). When all screens exist: `pnpm --filter @aesmsg/mobile typecheck` → clean.

- [ ] **Step 3: Commit (after Task 12)**

```bash
git add apps/mobile/App.tsx
git commit -m "feat(mobile): tabbed app shell (Home/Encrypt/Keys/Settings)"
```

---

## Task 8: Home screen (UI)

**Files:**
- Create: `apps/mobile/src/home/HomeScreen.tsx`

> Visual reference: `all_design_screens/mobile_home_aesmsg`. Build the **security-status card** + the two quick actions in scope (New secure message, Copy public key). Omit the Scan QR / Add Contact tiles (Contacts slice).

- [ ] **Step 1: Implement** `apps/mobile/src/home/HomeScreen.tsx`:

```tsx
import type { PublicKeyString } from "@aesmsg/crypto";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/src/theme";

export function HomeScreen({
  publicKeyString,
  onCompose,
}: {
  publicKeyString: PublicKeyString;
  onCompose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>aesmsg</Text>
      <View style={styles.statusCard}>
        <Text style={styles.statusDot}>●</Text>
        <Text style={styles.statusText}>Private key secured on this device</Text>
      </View>
      <Text style={styles.section}>Quick actions</Text>
      <Pressable style={styles.action} onPress={onCompose}>
        <Text style={styles.actionPrimary}>New secure message</Text>
      </Pressable>
      <Pressable
        style={styles.action}
        onPress={async () => {
          await Clipboard.setStringAsync(publicKeyString);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <Text style={styles.actionText}>{copied ? "Copied ✓" : "Copy public key"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16 },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "700" },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  statusDot: { color: "#7ee2a8", fontSize: 12 },
  statusText: { color: colors.onSurface, fontSize: 15 },
  section: { color: colors.onSurfaceVariant, fontSize: 13, textTransform: "uppercase", marginTop: 8 },
  action: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  actionPrimary: { color: colors.primary, fontSize: 16, fontWeight: "600", textAlign: "center" },
  actionText: { color: colors.onSurface, fontSize: 16, textAlign: "center" },
});
```

- [ ] **Step 2: Typecheck + lint** — `pnpm --filter @aesmsg/mobile typecheck && pnpm exec biome check apps/mobile/src/home/HomeScreen.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/home/HomeScreen.tsx
git commit -m "feat(mobile): Home screen (status + quick actions)"
```

---

## Task 9: Settings + Wipe confirm (UI)

**Files:**
- Create: `apps/mobile/src/settings/WipeConfirmModal.tsx`, `apps/mobile/src/settings/SettingsScreen.tsx`

> Mirrors the web `WipeConfirmModal` (type a fixed word to enable the destructive action). `onLock`/`onWipe` come from `useIdentity().actions` (passed in by App.tsx). Wipe is irreversible — no recovery, matching the foundation invariants.

- [ ] **Step 1: Implement** `apps/mobile/src/settings/WipeConfirmModal.tsx`:

```tsx
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/src/theme";

const CONFIRM_WORD = "WIPE";

export function WipeConfirmModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [text, setText] = useState("");
  const armed = text.trim().toUpperCase() === CONFIRM_WORD;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Wipe identity?</Text>
          <Text style={styles.body}>
            This permanently deletes your private key from this device. Messages sealed to it become
            unreadable. There is no backup and no recovery. Type {CONFIRM_WORD} to confirm.
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            autoCapitalize="characters"
            placeholder={CONFIRM_WORD}
            placeholderTextColor={colors.onSurfaceVariant}
            style={styles.input}
          />
          <View style={styles.row}>
            <Pressable style={styles.cancel} onPress={() => { setText(""); onCancel(); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!armed}
              style={[styles.destructive, !armed && styles.disabled]}
              onPress={() => { setText(""); onConfirm(); }}
            >
              <Text style={styles.destructiveText}>Wipe</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.surfaceContainer, borderRadius: 16, padding: 20, gap: 14 },
  title: { color: colors.error, fontSize: 18, fontWeight: "700" },
  body: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 10,
    padding: 12,
    color: colors.onSurface,
    fontFamily: "monospace",
  },
  row: { flexDirection: "row", gap: 12 },
  cancel: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.outline },
  cancelText: { color: colors.onSurface, textAlign: "center", fontWeight: "600" },
  destructive: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.error },
  destructiveText: { color: "#3a0a08", textAlign: "center", fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
```

- [ ] **Step 2: Implement** `apps/mobile/src/settings/SettingsScreen.tsx`:

```tsx
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WipeConfirmModal } from "@/src/settings/WipeConfirmModal";
import { colors } from "@/src/theme";

export function SettingsScreen({ onLock, onWipe }: { onLock: () => void; onWipe: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Pressable style={styles.action} onPress={onLock}>
        <Text style={styles.actionText}>Lock</Text>
      </Pressable>
      <Pressable style={[styles.action, styles.danger]} onPress={() => setConfirming(true)}>
        <Text style={styles.dangerText}>Wipe identity</Text>
      </Pressable>
      <WipeConfirmModal
        visible={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onWipe(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "700", marginBottom: 8 },
  action: { padding: 16, borderRadius: 12, backgroundColor: colors.surfaceContainer, borderWidth: 1, borderColor: colors.outline },
  actionText: { color: colors.onSurface, fontSize: 16 },
  danger: { borderColor: colors.error },
  dangerText: { color: colors.error, fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 3: Typecheck + lint** — `pnpm --filter @aesmsg/mobile typecheck && pnpm exec biome check apps/mobile/src/settings/` → clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/settings/
git commit -m "feat(mobile): Settings (lock + type-to-confirm wipe)"
```

---

## Task 10: Compose screen (UI)

**Files:**
- Create: `apps/mobile/src/create/ComposeScreen.tsx`

> Visual reference: `all_design_screens/mobile_encrypt_aesmsg` (text field, expiry, max-opens, Encrypt & Send). No "Add file" (text-only this slice). On a valid pasted key, show the derived fingerprint via `@aesmsg/crypto`'s `fingerprint`/`truncateFingerprint`; importPublicKey throwing = invalid key.

- [ ] **Step 1: Implement** `apps/mobile/src/create/ComposeScreen.tsx`:

```tsx
import { fingerprint, importPublicKey, truncateFingerprint } from "@aesmsg/crypto";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  EXPIRY_OPTIONS,
  type ExpiryChoice,
  expiryToDate,
  MAX_OPENS_OPTIONS,
  type MaxOpensChoice,
} from "@/src/create/expiry";
import { colors } from "@/src/theme";

export interface ComposeSubmit {
  recipientPublicKeyString: string;
  message: string;
  expiresAt: Date;
  maxOpens: MaxOpensChoice;
}

export function ComposeScreen({ onSubmit }: { onSubmit: (v: ComposeSubmit) => void }) {
  const [message, setMessage] = useState("");
  const [recipientKey, setRecipientKey] = useState("");
  const [fp, setFp] = useState<string | null>(null);
  const [keyError, setKeyError] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryChoice>("24h");
  const [maxOpens, setMaxOpens] = useState<MaxOpensChoice>(1);

  // Validate the pasted key (debounced via effect) and show its fingerprint.
  useEffect(() => {
    const trimmed = recipientKey.trim();
    if (!trimmed) { setFp(null); setKeyError(false); return; }
    let cancelled = false;
    (async () => {
      try {
        await importPublicKey(trimmed);
        const f = await fingerprint(trimmed as Parameters<typeof fingerprint>[0]);
        if (!cancelled) { setFp(truncateFingerprint(f, 8)); setKeyError(false); }
      } catch {
        if (!cancelled) { setFp(null); setKeyError(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [recipientKey]);

  const canSend = message.trim().length > 0 && fp !== null && !keyError;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>New secure message</Text>

      <Text style={styles.label}>Message</Text>
      <TextInput
        value={message}
        onChangeText={setMessage}
        multiline
        placeholder="Type your secret…"
        placeholderTextColor={colors.onSurfaceVariant}
        style={[styles.input, styles.multiline]}
      />

      <Text style={styles.label}>Recipient public key</Text>
      <TextInput
        value={recipientKey}
        onChangeText={setRecipientKey}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste the recipient's public key"
        placeholderTextColor={colors.onSurfaceVariant}
        style={[styles.input, styles.mono]}
      />
      {fp && <Text style={styles.fpOk}>Sealing to fingerprint {fp} — verify out-of-band</Text>}
      {keyError && <Text style={styles.fpErr}>That doesn't look like a valid public key.</Text>}

      <Text style={styles.label}>Expiry</Text>
      <View style={styles.chips}>
        {EXPIRY_OPTIONS.map((o) => (
          <Pressable
            key={o.value}
            style={[styles.chip, expiry === o.value && styles.chipOn]}
            onPress={() => setExpiry(o.value)}
          >
            <Text style={[styles.chipText, expiry === o.value && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Max opens</Text>
      <View style={styles.chips}>
        {MAX_OPENS_OPTIONS.map((o) => (
          <Pressable
            key={o.value}
            style={[styles.chip, maxOpens === o.value && styles.chipOn]}
            onPress={() => setMaxOpens(o.value)}
          >
            <Text style={[styles.chipText, maxOpens === o.value && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        disabled={!canSend}
        style={[styles.send, !canSend && styles.disabled]}
        onPress={() =>
          onSubmit({
            recipientPublicKeyString: recipientKey.trim(),
            message,
            expiresAt: expiryToDate(expiry, new Date()),
            maxOpens,
          })
        }
      >
        <Text style={styles.sendText}>Encrypt &amp; create link</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 10 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  label: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.outline, borderRadius: 10, padding: 12, color: colors.onSurface, backgroundColor: colors.surfaceContainer },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  mono: { fontFamily: "monospace", fontSize: 13 },
  fpOk: { color: "#7ee2a8", fontSize: 12, fontFamily: "monospace" },
  fpErr: { color: colors.error, fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.outline },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.onSurfaceVariant, fontSize: 13 },
  chipTextOn: { color: colors.onPrimary, fontWeight: "600" },
  send: { marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: colors.primary },
  sendText: { color: colors.onPrimary, fontSize: 16, fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.4 },
});
```

- [ ] **Step 2: Typecheck + lint** — `pnpm --filter @aesmsg/mobile typecheck && pnpm exec biome check apps/mobile/src/create/ComposeScreen.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/create/ComposeScreen.tsx
git commit -m "feat(mobile): compose screen (text + recipient key + expiry/max-opens)"
```

---

## Task 11: Result screen (UI)

**Files:**
- Create: `apps/mobile/src/create/ResultScreen.tsx`

> Shows the `/l/:id` link + Share (OS share sheet) + Copy + New message. `expo-sharing` + `expo-clipboard` are already installed.

- [ ] **Step 1: Implement** `apps/mobile/src/create/ResultScreen.tsx`:

```tsx
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/src/theme";

export function ResultScreen({ url, onNew }: { url: string; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Secure link created</Text>
      <Text style={styles.help}>Share this link through any app. Only the recipient can open it.</Text>
      <View style={styles.linkBox}>
        <Text style={styles.link} selectable>
          {url}
        </Text>
      </View>
      <Pressable
        style={styles.primary}
        onPress={async () => {
          // expo-sharing shares a string via the OS sheet on supported platforms.
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(url, { dialogTitle: "Share secure link" });
          } else {
            await Clipboard.setStringAsync(url);
            setCopied(true);
          }
        }}
      >
        <Text style={styles.primaryText}>Share link</Text>
      </Pressable>
      <Pressable
        style={styles.secondary}
        onPress={async () => {
          await Clipboard.setStringAsync(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <Text style={styles.secondaryText}>{copied ? "Copied ✓" : "Copy link"}</Text>
      </Pressable>
      <Pressable style={styles.ghost} onPress={onNew}>
        <Text style={styles.ghostText}>New message</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "700" },
  help: { color: colors.onSurfaceVariant, fontSize: 14 },
  linkBox: { padding: 14, borderRadius: 10, backgroundColor: colors.surfaceContainer, borderWidth: 1, borderColor: colors.outline },
  link: { color: colors.primary, fontFamily: "monospace", fontSize: 13 },
  primary: { padding: 16, borderRadius: 12, backgroundColor: colors.primary, marginTop: 8 },
  primaryText: { color: colors.onPrimary, fontWeight: "700", textAlign: "center", fontSize: 16 },
  secondary: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.outline },
  secondaryText: { color: colors.onSurface, textAlign: "center", fontSize: 16 },
  ghost: { padding: 12 },
  ghostText: { color: colors.onSurfaceVariant, textAlign: "center" },
});
```

- [ ] **Step 2: Typecheck + lint** — `pnpm --filter @aesmsg/mobile typecheck && pnpm exec biome check apps/mobile/src/create/ResultScreen.tsx` → clean.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/create/ResultScreen.tsx
git commit -m "feat(mobile): result screen (share/copy the secure link)"
```

---

## Task 12: CreateFlow (compose → encrypting → result | error)

**Files:**
- Create: `apps/mobile/src/create/CreateFlow.tsx`

> The Encrypt tab's container. Owns the small state machine + the call into `createAndSeal`. Preserves the draft on error (mirrors web).

- [ ] **Step 1: Implement** `apps/mobile/src/create/CreateFlow.tsx`:

```tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ComposeScreen, type ComposeSubmit } from "@/src/create/ComposeScreen";
import { createAndSeal } from "@/src/create/create-and-seal";
import { ResultScreen } from "@/src/create/ResultScreen";
import { colors } from "@/src/theme";

type State =
  | { kind: "compose" }
  | { kind: "encrypting" }
  | { kind: "result"; url: string }
  | { kind: "error"; message: string };

export function CreateFlow() {
  const [state, setState] = useState<State>({ kind: "compose" });

  async function submit(v: ComposeSubmit) {
    setState({ kind: "encrypting" });
    try {
      const out = await createAndSeal(v);
      setState({ kind: "result", url: out.url });
    } catch {
      // Opaque, channel-agnostic failure; draft is reconstructable by going back to compose.
      setState({ kind: "error", message: "Could not create the secure link. Check your connection and try again." });
    }
  }

  if (state.kind === "encrypting") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.note}>Encrypting on this device…</Text>
      </View>
    );
  }
  if (state.kind === "result") {
    return <ResultScreen url={state.url} onNew={() => setState({ kind: "compose" })} />;
  }
  if (state.kind === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{state.message}</Text>
        <Pressable style={styles.retry} onPress={() => setState({ kind: "compose" })}>
          <Text style={styles.retryText}>Back to compose</Text>
        </Pressable>
      </View>
    );
  }
  return <ComposeScreen onSubmit={submit} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  note: { color: colors.onSurfaceVariant },
  err: { color: colors.onSurface, textAlign: "center", fontSize: 15 },
  retry: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.outline },
  retryText: { color: colors.onSurface },
});
```

- [ ] **Step 2: Now do Task 7's App.tsx wiring** (the imports resolve once all screens exist). Then typecheck the whole app.

Run: `pnpm --filter @aesmsg/mobile typecheck`
Expected: clean (App.tsx + all screens compile).

- [ ] **Step 3: Commit** (this commit + Task 7's App.tsx together)

```bash
git add apps/mobile/src/create/CreateFlow.tsx apps/mobile/App.tsx
git commit -m "feat(mobile): CreateFlow + wire the tab shell"
```

---

## Task 13: Full verification + on-sim acceptance

**Files:** none (verification only)

- [ ] **Step 1: Gates** — Run, expect all green:

```bash
pnpm --filter @aesmsg/mobile typecheck
pnpm --filter @aesmsg/mobile test
pnpm typecheck
pnpm lint
```

- [ ] **Step 2: Run on the simulator** (Metro reload — no native rebuild needed; the slice adds no native deps). With the web app running (`pnpm dev`) and a build pointed at it (`AESMSG_API_BASE_URL=http://localhost:3000`):
  - Unlock → land on **Home**; tabs switch between Home/Encrypt/Keys/Settings.
  - **Encrypt:** paste a public key (use the Keys tab's "Copy public key" from a second identity, or any valid key) → fingerprint shows → type a message → pick expiry/max-opens → **Encrypt & create link** → Result shows a `http://localhost:3000/l/<id>` link → **Share** opens the OS sheet; **Copy** copies it.
  - **Round-trip:** open that link in a browser (web reader) OR `xcrun simctl openurl booted "aesmsg://l/<id>"` on a device holding the recipient identity → it decrypts to your message. (Sending to your OWN key + opening on the same device is the quickest check.)
  - **Settings:** Lock → returns to the Unlock gate. Wipe → type-to-confirm → identity gone (re-setup required).
  - Confirm no content renders under the status bar (safe-area still good).

- [ ] **Step 3: Commit any fixes**, then this slice is complete. Use superpowers:finishing-a-development-branch to open the PR.

---

## Verification (how to test the whole slice)

1. **Logic:** `pnpm --filter @aesmsg/mobile test` — link-id, postMessage, expiry, create-and-seal (real-crypto send↔receive round-trip), tabs.
2. **Types/lint:** `pnpm typecheck` + `pnpm lint` across the repo.
3. **Manual E2E:** the Task 13 simulator walkthrough — compose → encrypt → share link → open it → decrypt.

## Risks & mitigations

- **Share sheet for a plain string:** `expo-sharing.shareAsync` is file-oriented on some OS versions; the Result screen falls back to clipboard copy when `isAvailableAsync()` is false, so the link is always obtainable. Confirm the share behavior on the sim during Task 13; if string-share is unreliable, copy is the guaranteed path (acceptable for this slice).
- **Link host:** the shared URL uses the configured `aesmsgApiBaseUrl`. In local dev that's `http://localhost:3000` (only openable on the same machine) — fine for testing; production uses the real https host.
- **No new native deps:** verified by construction (custom tabs, paste-only recipient, text-only send, `expo-sharing`/`expo-clipboard` already present). If any step reaches for a native module, stop — it belongs in a later slice.
