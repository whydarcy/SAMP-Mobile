#import "LocalAssets.h"
@implementation LocalAssets {
    NSURL* _root;
    NSDictionary<NSString*, NSString*>* _cachePaths;
}
- (instancetype)initWithRoot:(NSURL*)root {
    if ((self = [super init])) {
        _root = root.URLByResolvingSymlinksInPath.URLByStandardizingPath;
        NSData* data = [NSData dataWithContentsOfURL:[_root URLByAppendingPathComponent:@"sile-cache/paths.json"]];
        id paths = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        _cachePaths = [paths isKindOfClass:NSDictionary.class] ? paths : @{};
    }
    return self;
}
- (NSString*)mime:(NSString*)extension {
    return @{@"html":@"text/html", @"js":@"application/javascript", @"mjs":@"application/javascript",
        @"css":@"text/css", @"json":@"application/json", @"png":@"image/png", @"jpg":@"image/jpeg",
        @"jpeg":@"image/jpeg", @"webp":@"image/webp", @"svg":@"image/svg+xml", @"gif":@"image/gif",
        @"woff":@"font/woff", @"woff2":@"font/woff2", @"ttf":@"font/ttf", @"otf":@"font/otf",
        @"mp3":@"audio/mpeg", @"ogg":@"audio/ogg", @"wav":@"audio/wav", @"mp4":@"video/mp4"}[extension.lowercaseString] ?: @"application/octet-stream";
}
- (void)webView:(WKWebView*)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {
    NSURL* address = task.request.URL;
    NSString* path = address.path;
    if (![address.scheme isEqualToString:@"samplocal"] || ![address.host isEqualToString:@"client"] ||
        ![path hasPrefix:@"/assets/"] || [path.pathComponents containsObject:@".."] ||
        ![task.request.HTTPMethod isEqualToString:@"GET"]) {
        [task didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorNoPermissionsToReadFile userInfo:nil]]; return;
    }
    NSString* relative = [path substringFromIndex:8];
    if ([relative hasPrefix:@"sile-cache/"]) {
        NSString* key = [relative substringFromIndex:11];
        if ([key hasPrefix:@"assets/src/assets/"]) {
            NSString* flat = _cachePaths[[@"assets/" stringByAppendingString:key.lastPathComponent].lowercaseString];
            if ([flat isKindOfClass:NSString.class]) key = flat;
        }
        NSString* actual = _cachePaths[key.lowercaseString];
        relative = [@"sile-cache/" stringByAppendingString:[actual isKindOfClass:NSString.class] ? actual : key];
    }
    NSURL* file = [_root URLByAppendingPathComponent:relative].URLByResolvingSymlinksInPath.URLByStandardizingPath;
    NSString* prefix = [_root.path stringByAppendingString:@"/"];
    if (![file.path hasPrefix:prefix]) {
        [task didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorNoPermissionsToReadFile userInfo:nil]]; return;
    }
    NSError* error;
    NSData* data = [NSData dataWithContentsOfURL:file options:NSDataReadingMappedIfSafe error:&error];
    if (!data) { [task didFailWithError:error]; return; }
    NSURLResponse* response = [[NSURLResponse alloc] initWithURL:address MIMEType:[self mime:file.pathExtension]
        expectedContentLength:data.length textEncodingName:nil];
    [task didReceiveResponse:response]; [task didReceiveData:data]; [task didFinish];
}
- (void)webView:(WKWebView*)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task {
    // Reads and callbacks above are synchronous; no task is retained after completion.
}
@end
