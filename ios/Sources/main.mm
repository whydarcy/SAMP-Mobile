#import <UIKit/UIKit.h>
#import "SampViewController.h"
@interface SampAppDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow* window;
@end
@implementation SampAppDelegate
- (BOOL)application:(UIApplication*)application didFinishLaunchingWithOptions:(NSDictionary*)options {
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    self.window.rootViewController = [SampViewController new];
    [self.window makeKeyAndVisible]; return YES;
}
- (void)applicationWillResignActive:(UIApplication*)application {
    [(SampViewController*)self.window.rootViewController setClientPaused:YES];
}
- (void)applicationDidBecomeActive:(UIApplication*)application {
    [(SampViewController*)self.window.rootViewController setClientPaused:NO];
}
@end
int main(int argc, char* argv[]) {
    @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(SampAppDelegate.class)); }
}
