import Stringify from "fast-json-stringify";
import FindMyWay from "find-my-way";
import { readFileSync } from "fs";
import Http from "http";
import { createProxy } from "http-proxy";
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

const QS = (req: Request) => {
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
    console.log(req.method);
    if (req.method !== "GET") {
      await new Promise((res) => {
        req
          .on("data", (c) => body.push(c))
          .on("end", () => {
            (req as any).body = Buffer.concat(body).toString();
            res(body);
          });
      });
    }

    QS(req as never);
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

  const CreateProxy = () => {
    const proxy = createProxy();
    const createProxyMethods = {
      register: (routes: Routes[]) => {
        routes.forEach((route) => {
          const rewrite = rewriteRules(route.from.path, route.to.path);
          const fromMethod = route.from.method ?? ("all" as const);
          return router[fromMethod](route.from.path, (req, res) => {
            req.url = rewrite?.(req.url ?? "");
            req.method = defineMethod(req.method! as HttpMethod, route.to.method);
            return proxy.web(req, res, { target: new URL(req.url, route.host) });
          });
        });
        return createProxyMethods;
      },
    };
    return createProxyMethods;
  };

  function injectMiddleware(path: string, METHOD: Uppercase<ExceptAllMethod>, middleware: HttpMiddlewareHandler) {
    const route = router.find(METHOD, path);
    if (route === null) return middlewares;
    const savedHandler = route.handler;
    router.off(METHOD, path);
    router.get(path, (req, res, params) => {
      const done = () => {
        savedHandler(req, res, params, {});
      };
      nodevellirHandler((req, res) => middleware(req, res, done))(req, res, params);
    });
    return middlewares;
  }

  const middlewares = {
    Get: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "GET", middleware),
    Post: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "POST", middleware),
    Patch: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "PATCH", middleware),
    Put: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "PUT", middleware),
    Delete: (path: string, middleware: HttpMiddlewareHandler) => injectMiddleware(path, "DELETE", middleware),
    All: (path: string, middleware: HttpMiddlewareHandler) => {
      AllMethods.forEach((x) => injectMiddleware(path, x, middleware));
      return middlewares;
    },
  };

  return {
    middlewares,
    CreateProxy,
    listen: (port: number) => server.listen(port),
    All: (path: string, handler: HttpHandler) => route("all", path, handler),
    Delete: (path: string, handler: HttpHandler) => route("DELETE", path, handler),
    Get: (path: string, handler: HttpHandler) => route("GET", path, handler),
    Patch: (path: string, handler: HttpHandler) => route("PATCH", path, handler),
    Post: (path: string, handler: HttpHandler) => route("POST", path, handler),
    Put: (path: string, handler: HttpHandler) => route("PUT", path, handler),
    AllRoutes: () => (router as any).routes,
  };
};

const server = Nodevellir();

const proxy = server.CreateProxy();

proxy.register([
  {
    host: "http://localhost:9801",
    from: { path: "/os-treco", method: "delete" },
    to: { path: "/posts", method: "get" },
  },
]);

server.listen(3000);

server.Get("/middleware", (_, res) => res.json(200, { message: "Awesome Middlewares" }));
server.Get("/ids/:id", (req, res) => res.json(200, { message: "hello world", id: req.urlParams.id, query: req.qs }));

server.middlewares.Get("/middleware", (_, __, done) => {
  console.log("EXECUTE MIDDLEWARE");
  done();
});
server.Post("/new", (req, res) => {
  console.log(req.body);
  res.json(200, { message: "hello world" });
});

server.Get("/package-json", (req, res) => {
  res.file(200, "application/json", readFileSync("./package.json"));
});
