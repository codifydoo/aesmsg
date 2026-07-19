"use client";

import { useContext } from "react";
import { IdentityContext } from "@/src/identity/identity-context";
import { useSettings } from "./settings-context";
import { appLockTimeoutMs } from "./settings-format";
import { useAutoLock } from "./use-auto-lock";

// Mounts the idle auto-lock inside the unlocked workspace (AppShell). It reads the IdentityContext
// DIRECTLY (nullable) rather than via useIdentity() so it never throws when rendered without a
// provider (e.g. AppShell's own render test). The timer is armed ONLY while the identity is unlocked
// AND a finite timeout is configured; "never" (→ null ms) arms nothing. Renders no DOM.

export function AutoLockController() {
  const identity = useContext(IdentityContext);
  const { settings } = useSettings();
  const armedMs = identity?.state === "unlocked" ? appLockTimeoutMs(settings.appLockTimeout) : null;
  useAutoLock(armedMs, () => identity?.lock());
  return null;
}
