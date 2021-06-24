"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Nodevellir = exports.rewriteRules = exports.NilOrEmpty = exports.joinUrl = void 0;
var tslib_1 = require("tslib");
var fast_json_stringify_1 = tslib_1.__importDefault(require("fast-json-stringify"));
var find_my_way_1 = tslib_1.__importDefault(require("find-my-way"));
var fs_1 = require("fs");
var http_1 = tslib_1.__importDefault(require("http"));
var http_proxy_1 = require("http-proxy");
var querystring_1 = require("querystring");
var joinUrl = function (base) {
    var uris = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        uris[_i - 1] = arguments[_i];
    }
    return uris.reduce(function (url, uri) { return url + "/" + uri.replace(/^\/+/, ""); }, base.replace(/\/+$/, ""));
};
exports.joinUrl = joinUrl;
var allMethods = ["GET", "POST", "PATCH", "DELETE", "POST"];
var NilOrEmpty = function (a) {
    if (a === undefined || a === null)
        return true;
    if (a === "")
        return true;
    if (Array.isArray(a) && a.length === 0)
        return true;
    return false;
};
exports.NilOrEmpty = NilOrEmpty;
var QS = function (req) {
    var _a;
    var _b = tslib_1.__read(((_a = req.url) !== null && _a !== void 0 ? _a : "").split("?"), 2), pathname = _b[0], search = _b[1];
    req.pathname = pathname;
    if (exports.NilOrEmpty(search))
        return;
    req.query = querystring_1.parse(search.replace(/\[\]=/g, "="));
};
var rewriteRules = function (from, to) { return function (path) {
    var fromRule = new RegExp(from);
    if (!fromRule.test(path))
        return path;
    return path.replace(fromRule, to);
}; };
exports.rewriteRules = rewriteRules;
var JsonStringify = fast_json_stringify_1.default({}, { rounding: "ceil" });
var defineMethod = function (calledMethod, toMethod) { return (toMethod === undefined || toMethod === "all" ? calledMethod : toMethod); };
var Nodevellir = function () {
    var router = find_my_way_1.default({
        caseSensitive: true,
        allowUnsafeRegex: false,
        ignoreTrailingSlash: true,
    });
    var route = function (method, path, callback) {
        router.on(method, path, function (req, res, params) { return tslib_1.__awaiter(void 0, void 0, void 0, function () {
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        QS(req);
                        req.urlParams = params;
                        res.json = function (object, status) {
                            if (status === void 0) { status = 200; }
                            var body = JsonStringify(object);
                            res.writeHead(status, {
                                "Content-Length": Buffer.byteLength(body, "utf-8"),
                                "Content-Type": "application/json; charset=utf-8",
                            });
                            res.end(body);
                        };
                        res.text = function (object, status) {
                            if (status === void 0) { status = 200; }
                            var body = Buffer.from(object);
                            res.writeHead(status, {
                                "Content-Length": Buffer.byteLength(body, "utf-8"),
                                "Content-Type": "text/plain; charset=utf-8",
                            });
                            res.end(body);
                        };
                        res.file = function (file, contentType, status) {
                            if (status === void 0) { status = 200; }
                            res.writeHead(status, {
                                "Content-Length": Buffer.byteLength(file, "utf-8"),
                                "Content-Type": contentType,
                            });
                            res.end(file);
                        };
                        return [4 /*yield*/, callback(req, res)];
                    case 1:
                        _a.sent();
                        res.end();
                        return [2 /*return*/];
                }
            });
        }); });
    };
    var server = http_1.default.createServer(function (req, res) { return router.lookup(req, res); });
    var CreateProxy = function () {
        var proxy = http_proxy_1.createProxy();
        var createProxyMethods = {
            register: function (routes) {
                routes.forEach(function (route) {
                    var _a;
                    var rewrite = exports.rewriteRules(route.from.path, route.to.path);
                    var fromMethod = (_a = route.from.method) !== null && _a !== void 0 ? _a : "all";
                    return router[fromMethod](route.from.path, function (req, res) {
                        var _a;
                        req.url = rewrite === null || rewrite === void 0 ? void 0 : rewrite((_a = req.url) !== null && _a !== void 0 ? _a : "");
                        req.method = defineMethod(req.method, route.to.method);
                        return proxy.web(req, res, { target: new URL(req.url, route.host) });
                    });
                });
                return createProxyMethods;
            },
        };
        return createProxyMethods;
    };
    return {
        createProxy: CreateProxy,
        listen: function (port) { return server.listen(port); },
        all: function (path, handler) { return allMethods.map(function (x) { return route(x, path, handler); }); },
        delete: function (path, handler) { return route("DELETE", path, handler); },
        get: function (path, handler) { return route("GET", path, handler); },
        patch: function (path, handler) { return route("PATCH", path, handler); },
        post: function (path, handler) { return route("POST", path, handler); },
        put: function (path, handler) { return route("PUT", path, handler); },
    };
};
exports.Nodevellir = Nodevellir;
var server = exports.Nodevellir();
var proxy = server.createProxy();
proxy.register([
    {
        host: "http://localhost:9801",
        from: { path: "/os-treco", method: "delete" },
        to: { path: "/posts", method: "get" },
    },
]);
server.listen(3000);
console.log("Start on :3000");
server.get("/ids/:id", function (req, res) {
    console.log(req.query, req.url);
    res.json({ message: "hello world", id: req.urlParams.id, query: req.query });
});
server.get("/package-json", function (req, res) {
    console.log(req.query);
    res.file(fs_1.readFileSync("./package.json"), "application/json");
});
