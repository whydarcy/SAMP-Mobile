#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
sdk="${1:-iphoneos}"
case "$sdk" in iphoneos|iphonesimulator) ;; *) echo 'Expected iphoneos or iphonesimulator' >&2; exit 2;; esac
architecture=arm64
if [[ "$sdk" == iphonesimulator && "$(uname -m)" == x86_64 ]]; then architecture=x86_64; fi
build="ios/build-$sdk"
arguments=(-S ios -B "$build" -G Xcode -DCMAKE_SYSTEM_NAME=iOS
    "-DCMAKE_OSX_SYSROOT=$sdk" "-DCMAKE_OSX_ARCHITECTURES=$architecture"
    -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 -DCMAKE_XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED=NO)
if [[ -n "${SAMP_BUNDLE_ID:-}" ]]; then arguments+=("-DSAMP_BUNDLE_ID=$SAMP_BUNDLE_ID"); fi
if [[ -n "${SAMP_IOS_ASSETS:-}" ]]; then arguments+=("-DSAMP_IOS_ASSETS=$SAMP_IOS_ASSETS"); fi
if [[ -n "${SAMP_IOS_BACKEND_DIR:-}" ]]; then arguments+=("-DSAMP_IOS_BACKEND_DIR=$SAMP_IOS_BACKEND_DIR"); fi
cmake "${arguments[@]}"
cmake --build "$build" --config Release --target SampIOS -- -quiet
if [[ "$sdk" == iphoneos ]]; then
    python3 ios/scripts/package.py "$build/Release-iphoneos/SampIOS.app" ios/output/SampIOS-unsigned.ipa
fi
