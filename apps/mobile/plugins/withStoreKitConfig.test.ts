import { describe, expect, it } from "vitest";
// The plugin is CommonJS (.js); import the pure, exported scheme helper.
import withStoreKitConfig from "./withStoreKitConfig.js";

const { addStoreKitConfigToSchemeXml } = withStoreKitConfig as unknown as {
  addStoreKitConfigToSchemeXml: (xml: string, identifier: string) => string;
};

// Minimal but realistic .xcscheme fixture with a <LaunchAction> block, matching the
// shape Expo prebuild generates.
const SCHEME_WITH_LAUNCH_ACTION = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1600"
   version = "1.3">
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release">
   </ProfileAction>
</Scheme>
`;

const SCHEME_WITHOUT_LAUNCH_ACTION = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme version = "1.3">
   <ProfileAction buildConfiguration = "Release">
   </ProfileAction>
</Scheme>
`;

describe("addStoreKitConfigToSchemeXml", () => {
  it("inserts a StoreKitConfigurationFileReference into the LaunchAction", () => {
    const out = addStoreKitConfigToSchemeXml(SCHEME_WITH_LAUNCH_ACTION, "../aesmsg.storekit");

    expect(out).toContain("StoreKitConfigurationFileReference");
    expect(out).toContain('identifier = "../aesmsg.storekit"');
    // Must land inside the LaunchAction block, before its closing tag.
    const refIndex = out.indexOf("StoreKitConfigurationFileReference");
    const closeIndex = out.indexOf("</LaunchAction>");
    expect(refIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeGreaterThan(refIndex);
    // The rest of the scheme is preserved.
    expect(out).toContain("<ProfileAction");
  });

  it("honors the provided identifier", () => {
    const out = addStoreKitConfigToSchemeXml(SCHEME_WITH_LAUNCH_ACTION, "Config/custom.storekit");
    expect(out).toContain('identifier = "Config/custom.storekit"');
  });

  it("is idempotent — running twice does not double-insert", () => {
    const once = addStoreKitConfigToSchemeXml(SCHEME_WITH_LAUNCH_ACTION, "../aesmsg.storekit");
    const twice = addStoreKitConfigToSchemeXml(once, "../aesmsg.storekit");

    expect(twice).toBe(once);
    const occurrences = twice.split("StoreKitConfigurationFileReference").length - 1;
    // Opening + closing tag of a single element => exactly two occurrences of the substring.
    expect(occurrences).toBe(2);
  });

  it("returns the input unchanged when there is no LaunchAction", () => {
    const out = addStoreKitConfigToSchemeXml(SCHEME_WITHOUT_LAUNCH_ACTION, "../aesmsg.storekit");
    expect(out).toBe(SCHEME_WITHOUT_LAUNCH_ACTION);
  });
});
