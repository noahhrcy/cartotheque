#!/usr/bin/env bash
# Generates the Xcode project of the iOS shell (Capacitor) with the Cartothèque icon, splash, permissions and swipe-back gesture.
# usage (from mobile/): bash prepare-ios.sh [start URL]   — the optional URL replaces server.url (simulator tests)
set -euo pipefail
npm install --no-audit --no-fund
if [ -n "${1:-}" ]; then
  python3 - "$1" <<'PY'
import json, sys
p = "capacitor.config.json"
c = json.load(open(p, encoding="utf-8"))
c["server"]["url"] = sys.argv[1]
json.dump(c, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
fi
npx cap add ios
APP=ios/App/App
cp res-ios/AppIcon-512@2x.png "$APP/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
for f in "$APP"/Assets.xcassets/Splash.imageset/*.png; do cp res-ios/splash-2732x2732.png "$f"; done
PL="$APP/Info.plist"
plutil -replace CFBundleDisplayName -string "Cartothèque" "$PL"
plutil -replace NSCameraUsageDescription -string "Cartothèque utilise l'appareil photo pour scanner et identifier vos cartes." "$PL"
plutil -replace NSPhotoLibraryUsageDescription -string "Cartothèque ouvre uniquement les photos de cartes que vous choisissez d'importer." "$PL"
plutil -replace NSPhotoLibraryAddUsageDescription -string "Cartothèque enregistre les exports que vous demandez." "$PL"
plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$PL"
plutil -replace UISupportedInterfaceOrientations -json '["UIInterfaceOrientationPortrait"]' "$PL"
# swipe from the left edge to go back, as in Safari
python3 - "$APP/AppDelegate.swift" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
hook = "func applicationDidBecomeActive(_ application: UIApplication) {"
assert hook in s, "applicationDidBecomeActive not found"
if "import WebKit" not in s:
    s = s.replace("import Capacitor", "import Capacitor\nimport WebKit", 1)
s = s.replace(hook, hook + "\n        (window?.rootViewController as? CAPBridgeViewController)?.webView?.allowsBackForwardNavigationGestures = true", 1)
open(p, "w", encoding="utf-8").write(s)
PY
npx cap sync ios
