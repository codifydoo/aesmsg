import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import ContactsFlow from "@/src/contacts/ContactsFlow";
import type { Recipient } from "@/src/create/recipient";
import { HomeFlow } from "@/src/home/HomeFlow";
import { IdentityProvider, useIdentity } from "@/src/identity/identity-context";
import { SetupScreen } from "@/src/keys/GateScreens";
import KeysFlow from "@/src/keys/KeysFlow";
import LinksFlow from "@/src/links/LinksFlow";
import { parseLinkId } from "@/src/navigation/parse-link-id";
import { ReaderFlow } from "@/src/navigation/ReaderFlow";
import { TabBar } from "@/src/navigation/TabBar";
import type { Tab } from "@/src/navigation/tabs";
import * as notifications from "@/src/notifications/notifications";
import {
  EnableBiometricsScreenIntegration,
  ImportBackupScreenIntegration,
  OnboardingFlow,
} from "@/src/onboarding";
import { EntitlementProvider } from "@/src/pro/entitlement-context";
import { clearLocalHistory } from "@/src/settings/clear-local-history";
import SettingsFlow from "@/src/settings/SettingsFlow";
import { SettingsProvider, useSettings } from "@/src/settings/settings-context";
import { shieldConfig } from "@/src/shield/shield-logic";
import { usePrivacyShield } from "@/src/shield/usePrivacyShield";
import { AppLockReAuthScreen, PrivacyShieldOverlay, SplashBrand } from "@/src/system";
import { colors } from "@/src/theme";
import { useAppFonts } from "@/src/theme/app-fonts";

type NavIntent = "scan" | "add" | "compose";

function Root() {
  const { state, actions } = useIdentity();
  const { settings, loading: settingsLoading, update: updateSettings } = useSettings();
  const initialUrl = Linking.useURL();
  const [linkId, setLinkId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("encrypt");
  // One-shot navigation intent: opens a specific sub-screen on the destination tab (Contacts
  // scan/add, or the Encrypt tab's compose flow). May carry a pre-selected compose recipient (set
  // when "Send secure message" is tapped on a contact). Cleared on any manual tab switch so the tab
  // bar always lands on the tab's root.
  const [pendingIntent, setPendingIntent] = useState<{
    tab: Tab;
    sub: NavIntent;
    recipient?: Recipient;
  } | null>(null);

  const navigate = (next: Tab, sub: NavIntent | null = null) => {
    setPendingIntent(sub ? { tab: next, sub } : null);
    setTab(next);
  };
  // "Send secure message" off a contact: jump to the Encrypt tab's compose flow with the contact
  // pre-selected as the recipient (it already carries its real public key, so compose can seal to it
  // directly — same path as picking it in the recipient sheet).
  const sendToContact = (recipient: Recipient) => {
    setPendingIntent({ tab: "encrypt", sub: "compose", recipient });
    setTab("encrypt");
  };
  const contactsIntent =
    pendingIntent?.tab === "contacts" &&
    (pendingIntent.sub === "scan" || pendingIntent.sub === "add")
      ? pendingIntent.sub
      : undefined;
  const composeOnEncrypt = pendingIntent?.tab === "encrypt" && pendingIntent.sub === "compose";
  const composeRecipient = composeOnEncrypt ? pendingIntent?.recipient : undefined;
  // First-run intro gate. `settings.introSeen` is PERSISTED (encrypted settings blob), so the
  // Welcome/How-It-Works carousel is shown once and never re-appears on later cold starts — even if
  // the user quits before creating an identity. `restoring` opens the Import Backup screen off the
  // Welcome screen's "Restore from backup".
  const [restoring, setRestoring] = useState(false);

  // Capture the deep-link id once (initial or while running).
  useEffect(() => {
    const id = parseLinkId(initialUrl ?? null);
    if (id) setLinkId(id);
  }, [initialUrl]);

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

  if (state.status === "loading") {
    // Branded launch frame while identity probes the local keystore. Design default is no spinner —
    // the brand lockup alone (SplashBrand is full-bleed and inside the App SafeAreaView/StatusBar
    // wrapper). The keystore probe is fast; if it ever becomes known-slow, pass `slowProbe` to reveal
    // the muted "Checking your keys" label.
    return <SplashBrand />;
  }
  if (state.status === "no_identity") {
    // Restore-from-backup detour off the intro. The integration picks the file, decrypts it locally
    // with the entered passphrase, and on success calls actions.importIdentity — which transitions
    // the machine to `unlocked`, so this branch falls away and the app lands on Home naturally.
    if (restoring) {
      return (
        <ImportBackupScreenIntegration
          onBack={() => setRestoring(false)}
          importIdentity={actions.importIdentity}
        />
      );
    }
    // Wait for the persisted settings before deciding on the intro, so a returning (not-yet-set-up)
    // user who already dismissed it doesn't see it flash before `introSeen: true` loads. The keystore
    // probe already passed, so this is a brief hold on the same branded splash — no arbitrary delay.
    if (settingsLoading) {
      return <SplashBrand />;
    }
    // Show the first-run intro before the identity-creation gate. Persisting introSeen flips this
    // false, so it never re-shows; then we fall through to the existing SetupScreen unchanged.
    if (!settings.introSeen) {
      return (
        <OnboardingFlow
          onGetStarted={() => updateSettings({ introSeen: true })}
          onRestore={() => setRestoring(true)}
        />
      );
    }
    return <SetupScreen onSetup={actions.setupNew} />;
  }
  if (state.status === "locked") {
    // The designed re-auth gate (system/AppLockReAuthScreen), reached on every re-entry after an
    // auto-lock, a background lock, or a manual "Lock now". onUnlock runs the REAL unlock path
    // (identity-context → machine.unlock → biometric-gated device secret); a rejected/cancelled
    // prompt leaves us in "locked" and the user can retry. Passphrase-fallback surface is not built
    // yet (biometric-only today), so the screen's fallback link is intentionally left unwired.
    return (
      <AppLockReAuthScreen
        onUnlock={() => {
          void actions.unlock().catch(() => {});
        }}
      />
    );
  }

  // One-time, post-setup biometric onboarding (spec §5). Shown once a fresh identity is unlocked and
  // before anything else, gated by the persisted `biometricOnboardingSeen` flag. The wrapper's
  // useSettings().update persists the flag (Enable or Not now), flipping this condition false so we
  // fall through to the shell on the same unlocked session. A deep link captured meanwhile stays in
  // `linkId` and opens right after. onDone is a no-op: the re-render is driven by the persisted flag.
  // `settingsLoading` guard prevents a flash for returning users whose persisted `seen: true` hasn't
  // loaded yet — defaults read `false`, so we must wait for the store before acting on that flag.
  if (!settingsLoading && !settings.biometricOnboardingSeen) {
    return <EnableBiometricsScreenIntegration onDone={() => undefined} />;
  }

  // Unlocked: open a deep-linked message, or show the tabbed app shell.
  if (linkId) {
    return <ReaderFlow id={linkId} onDone={() => setLinkId(null)} />;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.tabBody}>
        {tab === "encrypt" && (
          <HomeFlow
            publicKeyString={state.publicKeyString}
            onOpenReader={(id) => setLinkId(id)}
            onNavigate={navigate}
            initialCompose={composeOnEncrypt}
            {...(composeRecipient ? { initialRecipient: composeRecipient } : {})}
          />
        )}
        {tab === "links" && <LinksFlow onCreate={() => navigate("encrypt", "compose")} />}
        {tab === "contacts" && (
          <ContactsFlow
            onSendToContact={sendToContact}
            {...(contactsIntent ? { initialIntent: contactsIntent } : {})}
          />
        )}
        {tab === "keys" && (
          <KeysFlow publicKeyString={state.publicKeyString} identity={state.identity} />
        )}
        {tab === "settings" && (
          <SettingsFlow
            onLock={actions.lock}
            onWipe={actions.wipe}
            onClearHistory={() => clearLocalHistory()}
            publicKeyString={state.publicKeyString}
            onOpenKeys={() => navigate("keys")}
          />
        )}
      </View>
      <TabBar active={tab} onChange={(t) => navigate(t)} />
    </View>
  );
}

// App-root wrapper that mounts two app-wide, cross-cutting concerns above every screen:
//  1. Activity observer — a passive capture-phase responder that reports every touch to
//     signalActivity (resetting the inactivity auto-lock timer) WITHOUT capturing the touch, so
//     child scrolls/taps/inputs behave normally (onStartShouldSetResponderCapture returns false).
//  2. App-wide privacy shield — obscures the app-switcher snapshot on ANY non-active AppState with
//     the designed PrivacyShieldOverlay, on every screen (not just the reader). blockScreens is
//     false here: FLAG_SECURE stays scoped to the plaintext surfaces (compose + reader) per
//     shieldConfig, so non-plaintext screens remain screenshot-able.
function AppShell({ children }: { children: ReactNode }) {
  const { signalActivity } = useIdentity();
  const { settings } = useSettings();
  const { isObscured } = usePrivacyShield(shieldConfig("app", settings));
  return (
    <View
      style={styles.appRoot}
      onStartShouldSetResponderCapture={() => {
        signalActivity();
        return false; // observe only — never steal the responder from children
      }}
    >
      {children}
      <PrivacyShieldOverlay visible={isObscured} />
    </View>
  );
}

export function App() {
  // Gate the first render on the custom-font loader (theme/app-fonts.ts). No fonts are bundled yet,
  // so this resolves true immediately and the branded splash below is never shown today; once the
  // Geist / Inter / JetBrains Mono assets are added it holds the splash until they paint (no FOUC).
  const fontsLoaded = useAppFonts();
  if (!fontsLoaded) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={styles.appRoot}>
          <StatusBar style="light" />
          <SplashBrand />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    // react-native-safe-area-context measures the REAL device insets on BOTH iOS and Android
    // (react-native's own SafeAreaView is a no-op on Android, and Expo enables edge-to-edge there by
    // default — so the status bar / gesture nav bar would otherwise overlap content). `initialMetrics`
    // seeds the first frame's insets to avoid a layout flash on cold start.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* SettingsProvider sits ABOVE IdentityProvider so identity auto-lock can read appLockTimeout
          without a settings<->identity render race (spec §4). */}
      <SettingsProvider>
        <IdentityProvider>
          {/* EntitlementProvider wraps the whole shell (above the StatusBar/SafeAreaView) so any
              screen — Account, Compose — can call useEntitlement(). It does NOT depend on identity;
              this placement is purely structural. It talks only to the device<->store (StoreKit 2 /
              Play Billing), never the aesmsg API, preserving the zero-knowledge boundary. */}
          <EntitlementProvider>
            <StatusBar style="light" />
            {/* AppShell wraps the whole tree so the activity observer + the app-wide privacy-shield
                overlay cover EVERY screen (including the status-bar inset area for the app-switcher
                snapshot), not just the reader. */}
            <AppShell>
              {/* Inset every screen below the status bar / Dynamic Island and above the home indicator /
                  nav bar. The kit's small design gaps (Screen STATUS_CLEARANCE, footers) sit on top. */}
              <SafeAreaView style={styles.safe}>
                <Root />
              </SafeAreaView>
            </AppShell>
          </EntitlementProvider>
        </IdentityProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: colors.background },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  shell: { flex: 1, backgroundColor: colors.background },
  tabBody: { flex: 1 },
});
