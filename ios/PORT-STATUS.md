# iOS client port — 2026-11-12

This is the first native iOS target, NOT a playable GTA/SA-MP client yet.

Implemented:
- Shared C++20 RakNet client transport, built from the existing client sources without JNI, Android logging, ShadowHook, EGL, GLES or Android BASS.
- Existing Sile packet 215 decoder and a validated JSON UI bridge reused by the portable client.
- Server UI events are buffered until web UI readiness and while backgrounded; authorization dialogs are not discarded during initialization. Byte-boundary bit reads no longer depend on undefined C++ evaluation order.
- UIKit/Objective-C++ app, transparent WKWebView overlay, local resource scheme with case-aware Sile asset lookup, native keyboard requests, modal/hit-region input routing and background pause handling.
- Explicit GameBackend boundary for a version-specific iOS GTA renderer, pools, RPC/ClientJoin, input and state. Without it the app reports disconnected and rejects game commands.
- macOS GitHub Actions builds and tests the portable core, builds device and simulator apps, and packages an **unsigned development IPA**.
- Read-only IPA/Mach-O inspection tool reporting arm64 slice, version, UUID, SHA-256 and encryption flag. It does not decrypt, patch, or claim compatibility with an unverified executable.

Not implemented / not verified:
- No GTA SA iOS executable or usable multiplayer backend is available locally.
- Android libGTASA.so, offsets and ARM hooks are not used in iOS. No iOS game version has been mapped yet.
- No playable world, multiplayer join, player/vehicle sync, collision/streaming integration or in-game iOS controls yet.
- No native Cohtml runtime. This target uses WKWebView; imported Sile assets need WebKit runtime verification.
- No Apple signing certificate/profile provided. The unsigned IPA needs valid signing before installation.
- No iPhone hardware test yet. Device and simulator compilation, macOS contracts and a real simulator launch with WKWebView-to-C++ message dispatch passed on GitHub Actions: https://github.com/whydarcy/SAMP-Mobile/actions/runs/43181346452 . This verifies the development host, not GTA gameplay.

GitHub search findings:
- https://github.com/slavpoznyakow486-sketch/samp-ios-project — early skeleton; Renderer.mm only logs a message, GameViewController.mm attempts to include Android main.cpp. Not a working game backend.
- https://github.com/squ1dd13/CLEO-iOS — real iOS GTA mod-loading reference (archived), not a multiplayer client or GTA game distribution.
- https://github.com/squ1dd13/gtasa-ios-ghidra — iOS analysis reference, not a drop-in engine. Addresses require version validation and ASLR handling.

These search results do not supply a verified, ready-to-use GTA/SA-MP iOS engine. No game binaries, Sile cache, credentials or signatures are included in the iOS port commit.
