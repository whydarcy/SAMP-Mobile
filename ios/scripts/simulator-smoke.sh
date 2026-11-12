#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
device=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; print(next(d["udid"] for ds in json.load(sys.stdin)["devices"].values() for d in ds if d["name"].startswith("iPhone")))')
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" ios/build-iphonesimulator/Release-iphonesimulator/SampIOS.app
xcrun simctl launch "$device" games.samp.port.ios
container=$(xcrun simctl get_app_container "$device" games.samp.port.ios data)
ready="$container/Documents/ios-port-ui.json"
for attempt in {1..20}; do
    if [[ -f "$ready" ]]; then break; fi
    sleep 1
done
if [[ ! -f "$ready" ]]; then echo 'WKWebView did not initialize the native client bridge' >&2; exit 1; fi
python3 - "$ready" <<'PY'
import json,sys
with open(sys.argv[1]) as source:
    value=json.load(source)
assert value['platform']=='iOS' and value['protocol']==1
assert value['gameAvailable'] is False, 'Default build must report its missing game backend'
print('iOS WKWebView -> native C++ bridge initialized')
PY
mkdir -p ios/output
cp "$ready" ios/output/ios-port-ui.json
sleep 2
xcrun simctl io "$device" screenshot ios/output/simulator.png
xcrun simctl shutdown "$device"
