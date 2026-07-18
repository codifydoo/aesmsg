// @ts-check
/**
 * Expo config plugin: wires the local StoreKit Configuration file into the generated
 * iOS project so in-app-purchase testing works on the simulator straight after a
 * `prebuild` — no manual "drag file in + Edit Scheme" dance required.
 *
 * `prebuild` regenerates `ios/` from scratch, which would otherwise drop any manual
 * StoreKit wiring. This plugin re-applies it every time by:
 *   (a) copying `storekit/aesmsg.storekit` to `ios/aesmsg.storekit` (next to the `.xcodeproj`),
 *   (b) registering that file as a member of the Xcode project, and
 *   (c) injecting a `<StoreKitConfigurationFileReference>` into the shared scheme's
 *       `<LaunchAction>` so Xcode runs the app against the local store.
 *
 * The `.storekit` file itself must be the schema version the installed Xcode writes
 * (v5.0 for Xcode 26.x) — see storekit/README.md. This plugin only moves/links it; it
 * never edits the JSON.
 */

const fs = require("node:fs");
const path = require("node:path");
// Require via `expo/config-plugins` (a re-export), NOT `@expo/config-plugins` directly: under pnpm
// the latter is a transitive dep not resolvable from apps/mobile/plugins/, so `eas build` (which
// evaluates plugins from its own bundled eas-cli context) fails with "Cannot find module
// '@expo/config-plugins'". `expo` is a direct dep, so `expo/config-plugins` resolves everywhere.
const { withDangerousMod, withXcodeProject, IOSConfig } = require("expo/config-plugins");

/** Basename of the StoreKit config inside `ios/` (also the scheme reference identifier). */
const STOREKIT_FILENAME = "aesmsg.storekit";
/** Source path of the tracked config, relative to the mobile project root. */
const STOREKIT_SOURCE_RELATIVE = path.join("storekit", STOREKIT_FILENAME);
/**
 * Scheme `StoreKitConfigurationFileReference` identifier. Xcode resolves it relative to the
 * `.xcodeproj` BUNDLE dir (`ios/<name>.xcodeproj/`), NOT the `ios/` dir — so a file sitting at
 * `ios/aesmsg.storekit` is referenced as `../aesmsg.storekit` (`..` escapes the `.xcodeproj`).
 * Verified against an Xcode-authored scheme: a config at `ios/proconfig.storekit` serialized as
 * `../proconfig.storekit`. Getting this wrong = "StoreKit testing enabled" but 0 products at runtime.
 */
const STOREKIT_SCHEME_IDENTIFIER = `../${STOREKIT_FILENAME}`;

/**
 * Insert a `<StoreKitConfigurationFileReference>` into a `.xcscheme` XML string.
 *
 * Pure + idempotent so it can be unit-tested without running prebuild:
 *  - if the xml already references a StoreKit config, it is returned unchanged;
 *  - otherwise the element is inserted immediately before the closing `</LaunchAction>`,
 *    indented to match that tag;
 *  - if there is no `</LaunchAction>`, the xml is returned unchanged.
 *
 * @param {string} xml   Contents of the `.xcscheme` file.
 * @param {string} identifier  Path to the `.storekit`, relative to the `.xcodeproj` BUNDLE dir
 *   (`ios/<name>.xcodeproj/`) — that's how Xcode serializes scheme paths. For a file at
 *   `ios/aesmsg.storekit` this is `"../aesmsg.storekit"`, NOT `"aesmsg.storekit"`.
 * @returns {string} The (possibly) updated xml.
 */
function addStoreKitConfigToSchemeXml(xml, identifier) {
  // Already wired — never double-insert.
  if (xml.includes("StoreKitConfigurationFileReference")) {
    return xml;
  }

  const closingTag = "</LaunchAction>";
  const closingIndex = xml.indexOf(closingTag);
  // No LaunchAction to attach to — leave the scheme untouched.
  if (closingIndex === -1) {
    return xml;
  }

  // Match the indentation of the closing </LaunchAction> tag so the inserted element
  // lines up with its siblings inside <LaunchAction>.
  const lineStart = xml.lastIndexOf("\n", closingIndex - 1) + 1;
  const closingIndent = xml.slice(lineStart, closingIndex);
  const childIndent = `${closingIndent}   `;

  const element =
    `${childIndent}<StoreKitConfigurationFileReference\n` +
    `${childIndent}   identifier = "${identifier}">\n` +
    `${childIndent}</StoreKitConfigurationFileReference>\n`;

  return xml.slice(0, closingIndex) + element + xml.slice(closingIndex);
}

/**
 * (a) Copy the tracked `.storekit` into the generated `ios/` directory.
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
function withStoreKitConfigFile(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const source = path.join(projectRoot, STOREKIT_SOURCE_RELATIVE);
      const dest = path.join(platformProjectRoot, STOREKIT_FILENAME);
      fs.copyFileSync(source, dest);
      return cfg;
    },
  ]);
}

/**
 * (b) Register `aesmsg.storekit` as a member of the Xcode project so Xcode recognizes it.
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
function withStoreKitProjectMember(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    // Idempotent: prebuild can run twice; don't add a second file reference.
    if (project.hasFile(STOREKIT_FILENAME)) {
      return cfg;
    }
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: STOREKIT_FILENAME,
      groupName: projectName,
      project,
      isBuildFile: false,
      verbose: false,
    });
    return cfg;
  });
}

/**
 * (c) Inject the `<StoreKitConfigurationFileReference>` into the shared scheme.
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
function withStoreKitScheme(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const { platformProjectRoot } = cfg.modRequest;
      const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      const schemePath = path.join(
        platformProjectRoot,
        `${projectName}.xcodeproj`,
        "xcshareddata",
        "xcschemes",
        `${projectName}.xcscheme`,
      );
      if (!fs.existsSync(schemePath)) {
        return cfg;
      }
      const xml = fs.readFileSync(schemePath, "utf8");
      const next = addStoreKitConfigToSchemeXml(xml, STOREKIT_SCHEME_IDENTIFIER);
      if (next !== xml) {
        fs.writeFileSync(schemePath, next);
      }
      return cfg;
    },
  ]);
}

/**
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
function withStoreKitConfig(config) {
  config = withStoreKitConfigFile(config);
  config = withStoreKitProjectMember(config);
  config = withStoreKitScheme(config);
  return config;
}

module.exports = withStoreKitConfig;
module.exports.addStoreKitConfigToSchemeXml = addStoreKitConfigToSchemeXml;
