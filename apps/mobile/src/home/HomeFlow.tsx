import type { PublicKeyString } from "@aesmsg/crypto";
import { useEffect, useState } from "react";
import { CreateFlow } from "@/src/create/CreateFlow";
import type { Recipient } from "@/src/create/recipient";
import { HomeScreen } from "@/src/home/HomeScreen";
import { toRecentLinks } from "@/src/home/recent-links";
import { useBackupState } from "@/src/keys/use-backup-state";
import { useSentLinks } from "@/src/links/use-sent-links";
import type { Tab } from "@/src/navigation/tabs";
import { BackupNudgeSheet } from "@/src/onboarding";
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
  /** Start directly on the compose flow (one-shot intent from the Links empty-state CTA). */
  initialCompose?: boolean;
  /**
   * Recipient to pre-select for the one-shot compose (e.g. "Send secure message" off a contact).
   * Consumed once: it seeds the initial compose only; a later manual "Create secure message" starts
   * blank. Paired with `initialCompose` — App sets both together.
   */
  initialRecipient?: Recipient;
}

export function HomeFlow({
  publicKeyString,
  onOpenReader,
  onNavigate,
  initialCompose,
  initialRecipient,
}: HomeFlowProps) {
  const [route, setRoute] = useState<Route>(initialCompose ? "compose" : "home");
  // The pre-selected recipient is one-shot: it applies only to the compose this flow opens with.
  // A manual "Create secure message" (openCompose) clears it first, so a fresh draft starts blank.
  const [composeRecipient, setComposeRecipient] = useState<Recipient | undefined>(
    initialCompose ? initialRecipient : undefined,
  );
  const [sheetVisible, setSheetVisible] = useState(false);
  const { links } = useSentLinks();
  const recentLinks = toRecentLinks(links);

  // Backup-state: drives the one-time onboarding nudge (auto-shown once) and the passive "not backed
  // up" reminder tile (until an encrypted backup exists). See src/keys/backup-state.ts (PG-11 / R20).
  const backup = useBackupState();
  const [nudgeVisible, setNudgeVisible] = useState(false);
  useEffect(() => {
    // Surface the one-time nudge once the flag has loaded and says it's due; record it as seen the
    // moment we show it so it never becomes a modal-on-every-launch. The passive tile keeps nudging.
    if (backup.showNudge) {
      setNudgeVisible(true);
      backup.markNudgeSeen();
    }
  }, [backup.showNudge, backup.markNudgeSeen]);

  const openBackup = () => {
    setNudgeVisible(false);
    onNavigate?.("keys");
  };

  const openCompose = () => {
    setComposeRecipient(undefined);
    setRoute("compose");
  };

  if (route === "compose") {
    return (
      <CreateFlow
        onExit={() => setRoute("home")}
        {...(composeRecipient ? { initialRecipient: composeRecipient } : {})}
      />
    );
  }

  return (
    <>
      <HomeScreen
        publicKeyString={publicKeyString}
        recentLinks={recentLinks}
        onCompose={openCompose}
        onOpenLink={() => setSheetVisible(true)}
        onSeeAllLinks={() => onNavigate?.("links")}
        onScan={() => onNavigate?.("contacts", "scan")}
        onMyKey={() => onNavigate?.("keys")}
        onAddContact={() => onNavigate?.("contacts", "add")}
        onImportBackup={() => onNavigate?.("settings")}
        notBackedUp={backup.showReminder}
        onBackUp={openBackup}
      />
      <OpenLinkSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={(id) => {
          setSheetVisible(false);
          onOpenReader?.(id);
        }}
      />
      <BackupNudgeSheet
        visible={nudgeVisible}
        onBackUpNow={openBackup}
        onLater={() => setNudgeVisible(false)}
      />
    </>
  );
}
