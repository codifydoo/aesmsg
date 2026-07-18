import { afterEach, beforeEach } from "vitest";

// Global per-test reset: drop the memoized EncryptedStore singleton so domain-store tests (contacts,
// sent-links, settings — added in later phases) never leak state across cases. Domain stores obtain
// their store via getEncryptedStore(); clearing the singleton here is the single shared reset point.
//
// The import is dynamic so non-storage tests (which do not mock expo-secure-store /
// expo-file-system/legacy) never trigger native-module loading. Storage tests that DO mock those
// modules will succeed; for all others this is a silent no-op.
beforeEach(async () => {
  // @/src/storage imports native expo modules at the top level; skip silently in test contexts
  // where those modules are not mocked (i.e. all non-storage tests).
  const mod = await import("@/src/storage").catch(() => null);
  mod?.__resetEncryptedStoreForTests();

  // Reset the contacts store between cases so persisted blobs from one test never leak into the
  // next. Dynamic import so this is a silent no-op until Task 2.2 creates the module; once it
  // lands the reset activates automatically without touching this file.
  const contactsMod = await import("@/src/contacts/contacts-store").catch(() => null);
  contactsMod?.__resetContactsForTests();

  // Reset the sent-links store between cases so link blobs from one test never leak into the next.
  // Dynamic import matches the pattern above; silent no-op in non-storage tests.
  const sentLinksMod = await import("@/src/links/sent-links-store").catch(() => null);
  await sentLinksMod?.__deleteSentLinksStoreForTests();
});

// Settings-store tests mock @/src/storage per-file with their own in-memory blob; nothing global is
// required for them. This hook is a guard for any future test that imports the REAL settings-store
// against the shared storage mock — it removes the "settings" blob so cases don't bleed state.
afterEach(async () => {
  try {
    const storage = await import("@/src/storage");
    if (typeof storage.getEncryptedStore === "function") {
      const store = await storage.getEncryptedStore();
      await store.remove("settings");
    }
  } catch {
    // No real/shared store in this run (per-file mocks own their reset) — nothing to clear.
  }
});
