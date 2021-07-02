import Stringify from "fast-json-stringify";
import FindMyWay from "find-my-way";
import { readFileSync } from "fs";
import Http from "http";
import { createProxy as CreateProxy } from "http-proxy";
import { compile as compileRegexp } from "path-to-regexp";
import { parse } from "querystring";

type HttpMethod = "get" | "post" | "patch" | "put" | "head" | "delete" | "all";

type ExceptAllMethod = "get" | "post" | "patch" | "put" | "head" | "delete";

type Dict = Partial<Record<string, string>>;

type Routes = {
  host: string;
  from: {
    method?: HttpMethod;
    path: string;
  };
  to: {
    method?: HttpMethod;
    path: string;
    rewrite?: string;
  };
};

type Request = Http.IncomingMessage & {
  urlParams: Record<string, string | undefined>;
  qs: NodeJS.Dict<string | string[]>;
  path: string;
  body: string;
};

type JsonCallback = (statusCode: number, object: unknown) => void;

type Response = Http.ServerResponse & {
  json: JsonCallback;
  file: (statusCode: number, contentType: string, file: Buffer) => void;
  text: (statusCode: number, text: string) => void;
};

type Done = () => void;

type HttpHandler = (req: Request, res: Response) => void | Promise<void>;

type HttpMiddlewareHandler = (req: Request, res: Response, done: Done) => void | Promise<void>;

const AllMethods = ["GET", "POST", "PATCH", "DELETE", "POST"] as const;

export const NilOrEmpty = (a: any) => {
  if (a === undefined || a === null) return true;
  if (a === "") return true;
  if (Array.isArray(a) && a.length === 0) return true;
  return false;
};

const parseQueryString = (url: string): object => {
  const [pathname, search] = url.split("?");
  if (NilOrEmpty(search)) return {};
  return parse(search.replace(/\[\]=/g, "="));
};

const createQueryString = (req: Request) => {
  const [pathname, search] = (req.url ?? "").split("?");
  req.path = pathname;
  if (NilOrEmpty(search)) return;
  req.qs = parse(search.replace(/\[\]=/g, "="));
};

export const rewriteRules = (from: string, to: string) => (path: string) => {
  const fromRule = new RegExp(from);
  if (!fromRule.test(path)) return path;
  return path.replace(fromRule, to);
};

const JsonStringify = Stringify({}, { rounding: "ceil" });

const defineMethod = (calledMethod: HttpMethod, toMethod?: HttpMethod) => (toMethod === undefined || toMethod === "all" ? calledMethod : toMethod);

type NodevellirInit = {
  on404?: (req: Http.IncomingMessage, res: Http.ServerResponse) => void;
};

const defaultRoute = (_: Http.IncomingMessage, res: Http.ServerResponse) => {
  res.statusCode = 404;
  res.end();
};

export const Nodevellir = (init?: NodevellirInit) => {
  const router = FindMyWay({
    caseSensitive: false,
    allowUnsafeRegex: false,
    ignoreTrailingSlash: true,
    defaultRoute: init?.on404 ?? defaultRoute,
  });

  const nodevellirHandler = (callback: HttpHandler) => async (req: Http.IncomingMessage, res: Http.ServerResponse, params: Dict) => {
    let body: Uint8Array[] = [];
    if (req.method !== "GET" && req.method !== "DELETE") {
      await new Promise((res) => {
        req
          .on("data", (c) => body.push(c))
          .on("end", () => {
            (req as any).body = Buffer.concat(body).toString();
            res(body);
          });
      });
    }

    createQueryString(req as never);
    (req as any).urlParams = params;
    (res as any).json = (status = 200, object: object) => {
      const body = JsonStringify(object);
      res.writeHead(status, {
        "Content-Length": Buffer.byteLength(body, "utf-8"),
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(body);
    };

    (res as any).text = (status = 200, object: string) => {
      const body = Buffer.from(object);
      res.writeHead(status, {
        "Content-Length": Buffer.byteLength(body, "utf-8"),
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end(body);
    };

    (res as any).file = (status = 200, contentType: string, file: Buffer) => {
      res.writeHead(status, {
        "Content-Length": Buffer.byteLength(file, "utf-8"),
        "Content-Type": contentType,
      });
      res.end(file);
    };
    await callback(req as never, res as never);
    res.end();
  };

  const route = (method: FindMyWay.HTTPMethod | "all", path: string, callback: HttpHandler) =>
    method === "all" ? router.all(path, nodevellirHandler(callback)) : router.on(method, path, nodevellirHandler(callback));

  const server = Http.createServer((req, res) => router.lookup(req, res));

  const createProxy = () => {
    const proxy = CreateProxy();
    const createProxyMethods = {
      register: (routes: Routes[]) => {
        routes.forEach((route) => {
          const fromMethod = route.from.method ?? ("all" as const);
          return router[fromMethod](route.from.path, (req, res, params) => {
            const queryString = parse((req.url ?? "").split("?")[1]);
            const safeUrl = req.url ?? "";
            if (route.to.rewrite === undefined) {
              req.url = rewriteRules(route.from.path, route.to.path)(safeUrl);
            } else {
              const toRewrite = compileRegexp(route.to.rewrite);
              const toPath = compileRegexp(route.to.path);
              req.url = rewriteRules(toRewrite(params), toPath(params))(safeUrl);
            }
            const target = new URL(req.url.split("?")[0], route.host);
            for (const query in queryString) {
              target.searchParams.append(query, (queryString as any)[query]);
            }
            req.method = defineMethod(req.method! as HttpMethod, route.to.method);
            return proxy.web(req, res, { target: target.href });
          });
        });
        return createProxyMethods;
      },
    };
    return createProxyMethods;
  };

  function injectMiddleware(path: string, METHOD: Uppercase<ExceptAllMethod>, middleware: HttpMiddlewareHandler) {
    const route = router.find(METHOD, path);
    if (route === null) return middleware;
    const savedHandler = route.handler;
    router.off(METHOD, path);
    const method: ExceptAllMethod = METHOD.toLowerCase() as any;
    router[method](path, (req, res, params) => {
      const done = () => {
        savedHandler(req, res, params, {});
      };
      nodevellirHandler((req, res) => middleware(req, res, done))(req, res, params);
    });
    return middleware;
  }

  const middleware = {
    get: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "GET", middleware),
    post: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "POST", middleware),
    patch: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "PATCH", middleware),
    put: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "PUT", middleware),
    delete: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "DELETE", middleware),
    all: (path: string, middleware: HttpMiddlewareHandler) => {
      AllMethods.forEach((x) => injectMiddleware(path, x, middleware));
      return middleware;
    },
  };

  const nodevellir = {
    middleware,
    createProxy,
    all: (path: string, handler: HttpHandler) => (route("all", path, handler), nodevellir),
    delete: (path: string, handler: HttpHandler) => (route("DELETE", path, handler), nodevellir),
    get: (path: string, handler: HttpHandler) => (route("GET", path, handler), nodevellir),
    listen: (port: number) => server.listen(port),
    patch: (path: string, handler: HttpHandler) => (route("PATCH", path, handler), nodevellir),
    post: (path: string, handler: HttpHandler) => (route("POST", path, handler), nodevellir),
    put: (path: string, handler: HttpHandler) => (route("PUT", path, handler), nodevellir),
    routes: () => (router as any).routes,
  };

  return nodevellir;
};

const server = Nodevellir();

const proxy = server.createProxy();

proxy.register([
  {
    host: "http://localhost:9801",
    from: { path: "/os-treco/:id/test", method: "get" },
    to: { path: "/posts/:id", method: "get", rewrite: "^/os-treco/:id/test" },
  },
  {
    host: "http://localhost:9801",
    from: { path: "/testing*", method: "get" },
    to: { path: "/posts/", method: "get" },
  },
]);

server.listen(3000);

server.get("/middleware", (_, res) => res.json(200, { message: "Awesome Middlewares" }));
server.get("/ids/:id", (req, res) => res.json(200, { message: "hello world", id: req.urlParams.id, query: req.qs }));

server
  .post("/new", (req, res) => {
    console.log(req.body);
    res.json(200, { message: "hello world" });
  })
  .get("/package-json", (_, res) => {
    res.file(200, "application/json", readFileSync("./package.json"));
  });

server.middleware.get("/middleware", (_, __, done) => {
  console.log("EXECUTE MIDDLEWARE");
  done();
});
