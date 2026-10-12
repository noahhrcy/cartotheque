#!/usr/bin/env bash
# Cartothèque — © 2026 Noah Henricy, Yoni Safran et Tibo Amettler. Tous droits réservés (voir LICENSE).
# Builds the iOS shell for the simulator, runs it on a simulated iPhone and saves screenshots (app + Safari) in $1.
# usage (from mobile/, after prepare-ios.sh): bash ios-simulator.sh <screenshots dir>
set -euo pipefail
OUT="$1"; mkdir -p "$OUT"
DD="${RUNNER_TEMP:-/tmp}/dd"
SITE="https://noahhrcy.github.io/cartotheque/"
( cd ios/App
  if [ -d App.xcworkspace ]; then SRC="-workspace App.xcworkspace"; else SRC="-project App.xcodeproj"; fi
  xcodebuild $SRC -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$DD" -quiet CODE_SIGNING_ALLOWED=NO build )
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
d = json.load(sys.stdin)["devices"]
c = [x for k, v in d.items() if "iOS" in k for x in v if x["name"].startswith("iPhone")]
pref = [x for x in c if "Pro" in x["name"] and "Max" not in x["name"]] or c
print(pref[-1]["udid"]); print(pref[-1]["name"], file=sys.stderr)')
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b
xcrun simctl ui "$UDID" appearance light
xcrun simctl install "$UDID" "$DD/Build/Products/Debug-iphonesimulator/App.app"
xcrun simctl launch "$UDID" io.github.noahhrcy.cartotheque
sleep 30
xcrun simctl io "$UDID" screenshot "$OUT/1-app-clair.png"
xcrun simctl ui "$UDID" appearance dark
sleep 8
xcrun simctl io "$UDID" screenshot "$OUT/2-app-sombre.png"
xcrun simctl ui "$UDID" appearance light
xcrun simctl terminate "$UDID" io.github.noahhrcy.cartotheque || true
n=3
for r in "" "#cards/dracaufeu" "#scan"; do
  xcrun simctl openurl "$UDID" "$SITE$r"
  sleep 20
  xcrun simctl io "$UDID" screenshot "$OUT/$n-safari${r//[#\/]/-}.png"
  n=$((n + 1))
done
ls -l "$OUT"
