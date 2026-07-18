// Metro config for the pnpm monorepo: watch the repo root so workspace packages
// (notably @aesmsg/crypto) resolve through the symlinked node_modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// pnpm stores each package's deps as siblings under .pnpm/<pkg>/node_modules. Metro must keep
// HIERARCHICAL lookup enabled (the default) so that when e.g. `expo` requires `expo-modules-core`
// it walks up from expo's real location to that sibling. Symlink following is handled separately
// by resolver.unstable_enableSymlinks (on by default). Disabling hierarchical lookup here breaks
// pnpm nested resolution (the full-app bundle fails with "Unable to resolve module
// expo-modules-core"), so we must NOT set disableHierarchicalLookup = true.

module.exports = config;
