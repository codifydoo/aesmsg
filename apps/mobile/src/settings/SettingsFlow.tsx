import type { PublicKeyString } from "@aesmsg/crypto";
import * as Linking from "expo-linking";
import { useState } from "react";
import AccountFlow from "@/src/account/AccountFlow";
import { AppBar } from "@/src/components";
import { AdvancedScreen } from "@/src/settings/AdvancedScreen";
import { NotificationsScreen } from "@/src/settings/NotificationsScreen";
import { PrivacySettingsScreen } from "@/src/settings/PrivacySettingsScreen";
import { SecuritySettingsScreen } from "@/src/settings/SecuritySettingsScreen";
import { SettingsRootScreen, type SettingsSection } from "@/src/settings/SettingsRootScreen";
import { AboutLegalScreen, ActivityInboxScreen, HelpFaqScreen } from "@/src/system";
import { resolveAboutLinkUrl, SOURCE_URL } from "@/src/system/legal-links";
import { supportMailtoUrl } from "@/src/system/support";

// SettingsFlow — the self-contained Settings stack: a root (45) that pushes to Security (46),
// Privacy (47), Advanced (48), or Notifications (49) and pops back. Lock/Wipe are threaded through
// from the host; publicKeyString flows to Advanced so it can show the real fingerprint.
//
// Account (50–53) is reached via the nested AccountFlow; Help & About fans out to a small Help → About
// sub-stack (61 → 62). The "Activity" row opens the Activity inbox (54). The "keys" section routes out
// to the Keys tab via onOpenKeys.

type Route =
  | "root"
  | "security"
  | "privacy"
  | "advanced"
  | "notifications"
  | "account"
  | "help"
  | "about"
  | "activity";

const SECTION_ROUTE: Partial<Record<SettingsSection, Route>> = {
  security: "security",
  privacy: "privacy",
  advanced: "advanced",
  notifications: "notifications",
  account: "account",
  help: "help",
  about: "about",
  activity: "activity",
};

export interface SettingsFlowProps {
  /** Re-lock the app (surfaced on the Security screen). */
  onLock?: (() => void) | undefined;
  /** Permanently wipe this device's identity (and best-effort revoke live links) via the Privacy screen's confirm modal. */
  onWipe?: (() => void) | undefined;
  /** Clear locally-cached opened messages + sent-links (raw action; confirm lives in the screen). */
  onClearHistory?: (() => void | Promise<void>) | undefined;
  /** The real public key — passed to Advanced for its fingerprint. */
  publicKeyString?: PublicKeyString | undefined;
  /** Open the Keys tab (the Keys section routes out of the Settings stack). */
  onOpenKeys?: (() => void) | undefined;
}

export default function SettingsFlow({
  onLock,
  onWipe,
  onClearHistory,
  publicKeyString,
  onOpenKeys,
}: SettingsFlowProps) {
  const [route, setRoute] = useState<Route>("root");
  const back = () => setRoute("root");

  switch (route) {
    case "security":
      return <SecuritySettingsScreen onBack={back} />;
    case "privacy":
      return (
        <PrivacySettingsScreen onBack={back} onWipe={onWipe} onClearHistory={onClearHistory} />
      );
    case "advanced":
      return <AdvancedScreen onBack={back} publicKeyString={publicKeyString} />;
    case "notifications":
      return <NotificationsScreen onBack={back} />;
    case "account":
      // Self-contained Account / Monetization stack (50–53). It owns its own internal navigation;
      // onClose pops back to the Settings root. publicKeyString flows through so the Account profile
      // shows the real key-derived avatar + fingerprint.
      return <AccountFlow onClose={back} publicKeyString={publicKeyString} />;
    case "help":
      // Help / FAQ (61). "Contact support" opens the device mail composer to the support address
      // (placeholder — support@aesmsg.com). About / Legal is reached via its own "About & Legal"
      // root row, not by hijacking the support button (which would mislabel it).
      return (
        <HelpFaqScreen
          onBack={back}
          onContactSupport={() => {
            void Linking.openURL(supportMailtoUrl()).catch(() => {});
          }}
        />
      );
    case "about":
      // About / Legal (62). Reached from the "About & Legal" root row. Each legal/info row resolves
      // to its live web destination (or the public repo) via resolveAboutLinkUrl; "View source" opens
      // the repo directly. App Store Guideline 3.1.2 wants these functional.
      return (
        <AboutLegalScreen
          onBack={back}
          onOpenLink={(link) => {
            const url = resolveAboutLinkUrl(link.id);
            if (url) void Linking.openURL(url).catch(() => {});
          }}
          onViewSource={() => void Linking.openURL(SOURCE_URL).catch(() => {})}
        />
      );
    case "activity":
      // Activity inbox (54) — metadata-only event feed. It's authored as a tab-root (its own
      // LargeTitle "Activity", no back affordance), so we prepend a leading-only AppBar to give the
      // user a way back. The LargeTitle stays the heading; the bar carries only the back chevron. If
      // the Integration phase promotes Activity to a top-level destination, drop this wrapper.
      return (
        <>
          <AppBar leading="arrow_back_ios_new" onLeading={back} />
          <ActivityInboxScreen />
        </>
      );
    default:
      return (
        <SettingsRootScreen
          onLock={onLock}
          onWipe={onWipe}
          publicKeyString={publicKeyString}
          onOpen={(section) => {
            if (section === "keys") {
              onOpenKeys?.();
              return;
            }
            const next = SECTION_ROUTE[section];
            if (next) setRoute(next);
          }}
        />
      );
  }
}
