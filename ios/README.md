# Native iOS client target

See [PORT-STATUS.md](PORT-STATUS.md) for the exact implementation boundary. Current output is a development host with a real portable transport and UI bridge; game integration is still required.

## GitHub build

Push the iOS port branch and open Actions → **iOS port**. The macOS job compiles the portable C++ core, runs contracts, builds arm64 iPhone and simulator targets, and uploads `ios-port-development-unsigned` containing `SampIOS-unsigned.ipa`. No personal Mac is required for CI. The IPA is unsigned and cannot launch on a normal iPhone until signed for that device/distribution method.

Apple signing should use GitHub Secrets, never certificates committed to the repository:
https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications

## Build on a Mac

```bash
bash ios/scripts/build.sh iphoneos
bash ios/scripts/build.sh iphonesimulator
```

Requires CMake >=3.22, Python 3, Xcode and its iOS SDK. Minimum target iOS 15, device arm64. CMake generates an Xcode project; no Android Gradle or NDK dependency is used.

## Use our existing imported Sile interface

Build `webui` first with npm. Its Vite target must include Safari 15. Set an absolute `SAMP_IOS_ASSETS` path to a directory containing `webui/` and `sile-cache/`. The build copies them under the app's `assets/` directory. Keep user-supplied game/UI cache outside Git.

```bash
SAMP_IOS_ASSETS=/private/build-inputs/assets bash ios/scripts/build.sh iphoneos
```

The development status screen has a link to the imported UI. Missing cache returns to the status screen. No demo player, simulated successful login, or server connection is manufactured.

## Integrate the game

Supply a separate CMake directory through `SAMP_IOS_BACKEND_DIR`. It must define target `samp_ios_game_backend` and implement `SampCreateIOSGameBackend` from `Sources/IOSGameBackend.h`. The factory mounts the real game view into the provided container and returns a `samp::GameBackend` implementation.

The backend owns verified iOS engine addresses, rendering, model/texture/streaming compatibility, native input, the SA-MP session and RPC handlers. It forwards real state/events using the existing UI protocol. A bare RakNet connection is not enough: ClientJoin, auth challenge handling, RPC registration and player/entity lifecycle are still needed. All GameBackend calls and its event sink must run on the main thread; network workers must marshal callbacks.

Inspect a user-supplied app before choosing a version profile:

```bash
python3 ios/scripts/inspect-game.py /private/build-inputs/GTA.app --output game-inspection.json
# or: python3 ios/scripts/inspect-game.py /private/build-inputs/game.ipa
```

The inspector never extracts arbitrary ZIP paths and does not remove executable protection. There are currently no approved iOS engine fingerprints/offset profiles.
