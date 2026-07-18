#!/usr/bin/env bash
#
# run-ios-sim.sh — build & launch apps/mobile on the iOS simulator on this Mac.
#
# WHY THIS EXISTS (do NOT just run `expo run:ios`): under Xcode 26.x two things break the
# stock Expo flow, and `expo run:ios` re-triggers both on every run because it wipes ios/ and
# re-runs `pod install` with a bare environment:
#
#   1. pod install -> `ld: library 'System' not found`
#      Expo builds the macOS slice of ExpoModulesJSI.xcframework; Xcode 26's linker needs the
#      macOS SDK scoped onto the library path. We set SDKROOT/LIBRARY_PATH for pod install only.
#
#   2. App boots but STICKS on the splash with a red "Uncaught (in promise)" and
#      `Calling the 'getValueWithKeyAsync' function has failed`.
#      That's expo-secure-store hitting the Keychain with no entitlement (errSecMissingEntitlement
#      / -34018) because an UNSIGNED build (CODE_SIGNING_ALLOWED=NO) has no keychain access group.
#      We build with ad-hoc signing ("Sign to Run Locally") so ios/aesmsg/aesmsg.entitlements is
#      applied and the app gets a keychain group. No Apple Developer team needed for the simulator.
#
# Usage:
#   ./scripts/run-ios-sim.sh            # incremental: prebuild only if ios/ is missing,
#                                       # pod install only if Podfile.lock is missing
#   ./scripts/run-ios-sim.sh --clean    # force a fresh prebuild + pod install (use after adding
#                                       # or upgrading a NATIVE module — e.g. expo-notifications)
#
# NOTE: to COMPLETE identity setup in-app, enroll Face ID first:
#   Simulator menu -> Features -> Face ID -> Enrolled
# Otherwise onboarding intentionally dead-ends with "biometric unavailable" (by design).

set -euo pipefail

CLEAN=0
[[ "${1:-}" == "--clean" ]] && CLEAN=1

# Resolve apps/mobile (this script lives in apps/mobile/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

log() { printf '\033[1;35m▸ %s\033[0m\n' "$*"; }

# --- 1. Pick a booted simulator (boot one if none) -------------------------------------------
UDID="$(xcrun simctl list devices booted | grep -oE '[0-9A-Fa-f-]{36}' | head -1 || true)"
if [[ -z "$UDID" ]]; then
  log "No booted simulator — booting an iPhone…"
  UDID="$(xcrun simctl list devices available | grep -E 'iPhone' | grep -oE '[0-9A-Fa-f-]{36}' | head -1)"
  xcrun simctl boot "$UDID"
  open -a Simulator
fi
log "Simulator: $UDID"

# --- 2. Regenerate native project if needed --------------------------------------------------
if [[ $CLEAN -eq 1 || ! -d ios ]]; then
  log "expo prebuild (regenerate ios/, no install)…"
  npx expo prebuild -p ios --no-install
fi

# --- 3. pod install with the macOS SDK scoped onto the linker (fixes 'ld: library System') ----
if [[ $CLEAN -eq 1 || ! -f ios/Podfile.lock ]]; then
  SDK="$(xcrun --sdk macosx --show-sdk-path)"
  log "pod install (SDKROOT=$SDK)…"
  ( cd ios && SDKROOT="$SDK" LIBRARY_PATH="$SDK/usr/lib" pod install )
fi

WS="$(ls -d ios/*.xcworkspace | head -1)"
SCHEME="$(basename "$WS" .xcworkspace)"
log "Workspace: $WS  Scheme: $SCHEME"

# --- 4. Ensure Metro is running (the dev build connects to it) -------------------------------
if ! curl -fsS "http://localhost:8081/status" 2>/dev/null | grep -q "packager-status:running"; then
  log "Starting Metro on :8081 (background, log: /tmp/aesmsg-metro.log)…"
  nohup npx expo start --port 8081 > /tmp/aesmsg-metro.log 2>&1 &
  for _ in $(seq 1 20); do
    curl -fsS "http://localhost:8081/status" 2>/dev/null | grep -q "packager-status:running" && break
    sleep 1
  done
else
  log "Metro already running on :8081"
fi

# --- 5. Build with AD-HOC signing so entitlements (=> keychain group) are applied ------------
build() {
  xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Debug \
    -sdk iphonesimulator -destination "id=$UDID" -derivedDataPath ios/build \
    CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES CODE_SIGN_IDENTITY="-" build
}
log "xcodebuild (ad-hoc signed)…"
# The first build occasionally flakes on AppDelegate.swift; an immediate incremental retry succeeds.
build || { log "build flaked — retrying incrementally…"; build; }

# --- 6. Install + launch ---------------------------------------------------------------------
APP="ios/build/Build/Products/Debug-iphonesimulator/$SCHEME.app"
BUNDLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
log "Installing $APP ($BUNDLE)…"
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE"
log "Launched $BUNDLE on $UDID ✓"
