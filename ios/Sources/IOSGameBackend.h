#pragma once
#import <UIKit/UIKit.h>
#include <samp/GameBackend.h>
// Optional backend is linked at build time, never loaded from writable game cache.
// It must mount its real GTA view in gameContainer and use storageRoot for data.
#if defined(SAMP_HAS_IOS_GAME_BACKEND)
extern "C" samp::GameBackend* SampCreateIOSGameBackend(UIView* gameContainer, NSString* storageRoot);
#endif
