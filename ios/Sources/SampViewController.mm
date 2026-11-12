#import "SampViewController.h"
#import "LocalAssets.h"
#import "IOSGameBackend.h"
#include <samp/ClientRuntime.h>
#include <cmath>

@interface WeakScriptHandler : NSObject <WKScriptMessageHandler>
@property(nonatomic, weak) id<WKScriptMessageHandler> target;
@end
@implementation WeakScriptHandler
- (void)userContentController:(WKUserContentController*)controller didReceiveScriptMessage:(WKScriptMessage*)message {
    [self.target userContentController:controller didReceiveScriptMessage:message];
}
@end

@interface TouchWebView : WKWebView
@property(nonatomic) BOOL modal;
@property(nonatomic, copy) NSArray<NSValue*>* hitRegions;
@end
@implementation TouchWebView
- (UIView*)hitTest:(CGPoint)point withEvent:(UIEvent*)event {
    if (!self.modal) {
        const CGPoint normalized = CGPointMake(point.x / MAX(1, self.bounds.size.width), point.y / MAX(1, self.bounds.size.height));
        BOOL hit = NO;
        for (NSValue* value in self.hitRegions) if (CGRectContainsPoint(value.CGRectValue, normalized)) { hit = YES; break; }
        if (!hit) return nil;
    }
    return [super hitTest:point withEvent:event];
}
@end

@interface SampViewController () <WKScriptMessageHandler, WKNavigationDelegate>
@end
@implementation SampViewController {
    TouchWebView* _web;
    LocalAssets* _assets;
    NSTimer* _timer;
    std::unique_ptr<samp::ClientRuntime> _runtime;
    BOOL _paused;
}
- (void)viewDidLoad {
    [super viewDidLoad]; self.view.backgroundColor = UIColor.blackColor;
    UIView* game = [[UIView alloc] initWithFrame:self.view.bounds];
    game.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self.view addSubview:game];
    std::unique_ptr<samp::GameBackend> backend;
#if defined(SAMP_HAS_IOS_GAME_BACKEND)
    NSString* storage = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    backend.reset(SampCreateIOSGameBackend(game, storage));
#endif
    __weak SampViewController* weakSelf = self;
    _runtime = std::make_unique<samp::ClientRuntime>(std::move(backend), [weakSelf](const samp::Json& packet) {
        SampViewController* owner = weakSelf; if (owner) [owner emit:packet];
    });
    NSURL* root = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"assets" isDirectory:YES];
    _assets = [[LocalAssets alloc] initWithRoot:root];
    WKWebViewConfiguration* config = [WKWebViewConfiguration new];
    [config setURLSchemeHandler:_assets forURLScheme:@"samplocal"];
    WeakScriptHandler* messages = [WeakScriptHandler new]; messages.target = self;
    [config.userContentController addScriptMessageHandler:messages name:@"client"];
    NSString* bootstrap = @"Object.defineProperty(window,'client',{value:Object.freeze({platform:'iOS',graphicsScale:()=>100,postMessage:text=>window.webkit.messageHandlers.client.postMessage(text)})});";
    [config.userContentController addUserScript:[[WKUserScript alloc] initWithSource:bootstrap
        injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    _web = [[TouchWebView alloc] initWithFrame:self.view.bounds configuration:config];
    _web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _web.opaque = NO; _web.backgroundColor = UIColor.clearColor;
    _web.scrollView.backgroundColor = UIColor.clearColor;
    _web.scrollView.scrollEnabled = NO; _web.scrollView.bounces = NO;
    _web.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    _web.navigationDelegate = self; _web.modal = YES; _web.hitRegions = @[];
    [self.view addSubview:_web];
    [_web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"samplocal://client/assets/diagnostic/index.html"]]];
    _timer = [NSTimer scheduledTimerWithTimeInterval:0.1 repeats:YES block:^(NSTimer* timer) {
        SampViewController* owner = weakSelf;
        if (owner && !owner->_paused) owner->_runtime->tick();
    }];
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(keyboardHidden:)
        name:UIKeyboardDidHideNotification object:nil];
}
- (void)dealloc {
    [_timer invalidate];
    [_web.configuration.userContentController removeScriptMessageHandlerForName:@"client"];
    [NSNotificationCenter.defaultCenter removeObserver:self];
}
- (BOOL)prefersStatusBarHidden { return YES; }
- (UIInterfaceOrientationMask)supportedInterfaceOrientations { return UIInterfaceOrientationMaskLandscape; }
- (void)emit:(const samp::Json&)packet {
    if (!_web || _paused) return;
    std::string text = packet.dump(-1, ' ', false, samp::Json::error_handler_t::replace);
    // Encode a string literal first. Server text can never become executable JavaScript.
    std::string literal = samp::Json(text).dump();
    NSString* js = [NSString stringWithFormat:@"window.gtaUi&&window.gtaUi.receive(JSON.parse(%s))", literal.c_str()];
    [_web evaluateJavaScript:js completionHandler:nil];
}
- (void)reply:(NSInteger)identifier ok:(BOOL)ok result:(id)result {
    if (identifier <= 0 || identifier > INT32_MAX) return;
    NSDictionary* packet = @{@"replyTo":@(identifier), @"ok":@(ok), ok ? @"result" : @"error":result ?: NSNull.null};
    NSData* data = [NSJSONSerialization dataWithJSONObject:packet options:0 error:nil];
    if (data) [self emit:samp::Json::parse(static_cast<const char*>(data.bytes), static_cast<const char*>(data.bytes)+data.length)];
}
- (void)userContentController:(WKUserContentController*)controller didReceiveScriptMessage:(WKScriptMessage*)message {
    if (_paused || !message.frameInfo.mainFrame || ![message.frameInfo.request.URL.scheme isEqualToString:@"samplocal"] ||
        ![message.frameInfo.request.URL.host isEqualToString:@"client"] || ![message.body isKindOfClass:NSString.class]) return;
    NSData* data = [(NSString*)message.body dataUsingEncoding:NSUTF8StringEncoding];
    if (!data || data.length > 16384) return;
    id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (![value isKindOfClass:NSDictionary.class]) return;
    NSDictionary* packet = value;
    if (![packet[@"v"] isEqual:@1] || ![packet[@"event"] isKindOfClass:NSString.class] ||
        ![packet[@"id"] isKindOfClass:NSNumber.class] || ![packet[@"args"] isKindOfClass:NSArray.class]) return;
    NSInteger identifier = [packet[@"id"] integerValue];
    NSArray* args = packet[@"args"];
    NSDictionary* arg = args.count && [args[0] isKindOfClass:NSDictionary.class] ? args[0] : @{};
    NSString* event = packet[@"event"];
    if ([event isEqualToString:@"Ui.Ready"]) {
        // Development smoke-test marker, containing no device or account identifiers.
        std::string report = _runtime->status().dump();
        NSString* documents = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
        NSData* marker = [NSData dataWithBytes:report.data() length:report.size()];
        [marker writeToFile:[documents stringByAppendingPathComponent:@"ios-port-ui.json"] atomically:YES];
    }
    if ([event isEqualToString:@"Ui.Focus"]) {
        _web.modal = [arg[@"active"] boolValue];
        if (!_web.modal) [self.view endEditing:YES];
        [self reply:identifier ok:YES result:@YES]; return;
    }
    if ([event isEqualToString:@"Ui.HitRegions"]) {
        NSMutableArray* regions = [NSMutableArray new];
        id list = arg[@"regions"];
        if ([list isKindOfClass:NSArray.class]) for (id item in list) {
            if (regions.count == 32) break;
            if (![item isKindOfClass:NSDictionary.class]) continue;
            BOOL valid = YES; for (NSString* key in @[@"left",@"top",@"right",@"bottom"])
                if (![item[key] isKindOfClass:NSNumber.class]) valid = NO;
            if (!valid) continue;
            double l=[item[@"left"] doubleValue], t=[item[@"top"] doubleValue], r=[item[@"right"] doubleValue], b=[item[@"bottom"] doubleValue];
            if (std::isfinite(l)&&std::isfinite(t)&&std::isfinite(r)&&std::isfinite(b)&&l>=0&&t>=0&&r<=1&&b<=1&&r>l&&b>t)
                [regions addObject:[NSValue valueWithCGRect:CGRectMake(l,t,r-l,b-t)]];
        }
        _web.hitRegions = regions; [self reply:identifier ok:YES result:@YES]; return;
    }
    if ([event isEqualToString:@"Ui.Keyboard"]) {
        if ([arg[@"native"] boolValue]) [_web becomeFirstResponder]; else [self.view endEditing:YES];
        [self reply:identifier ok:YES result:@YES]; return;
    }
    if ([event isEqualToString:@"Ui.Fallback"]) {
        [_web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"samplocal://client/assets/diagnostic/index.html"]]]; return;
    }
    _runtime->receive(std::string(static_cast<const char*>(data.bytes), data.length));
}
- (void)webView:(WKWebView*)webView decidePolicyForNavigationAction:(WKNavigationAction*)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL* url = action.request.URL;
    BOOL allowed = [url.scheme isEqualToString:@"samplocal"] && [url.host isEqualToString:@"client"] &&
        [@[@"/assets/diagnostic/index.html",@"/assets/webui/index.html",@"/assets/webui/sile/index.html"] containsObject:url.path];
    decisionHandler(allowed ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}
- (void)webViewWebContentProcessDidTerminate:(WKWebView*)webView { _web.modal = YES; [_web reload]; }
- (void)setClientPaused:(BOOL)paused {
    _paused = paused; if (_runtime) _runtime->pause(paused);
    if (paused) [self.view endEditing:YES];
    else if (_runtime) _runtime->tick();
}
- (void)keyboardHidden:(NSNotification*)notification {
    [self emit:samp::Json{{"event","Ui.KeyboardHidden"},{"args",samp::Json::array({samp::Json::object()})}}];
}
@end
