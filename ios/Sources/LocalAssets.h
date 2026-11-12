#import <WebKit/WebKit.h>
@interface LocalAssets : NSObject <WKURLSchemeHandler>
- (instancetype)initWithRoot:(NSURL*)root;
@end
