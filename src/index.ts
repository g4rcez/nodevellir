import Stringify from "fast-json-stringify";
import FindMyWay from "find-my-way";
import { readFileSync } from "fs";
import Http from "http";
import { createProxy as CreateProxy } from "http-proxy";
import { compile as compileRegexp } from "path-to-regexp";
import { Cookies } from "./cookies";
import { Static } from "./static";

export enum HttpStatusCode {
  Ok = 200,
  Created = 201,
  Accepted = 202,
  NonAuthoritativeInformation = 203,
  NoContent = 204,
  ResetContent = 205,
  PartialContent = 206,
  MultiStatus = 207,
  AlreadyReported = 208,
  IMUsed = 226,
  MultipleChoices = 300,
  MovedPermanently = 301,
  Found = 302,
  SeeOther = 303,
  NotModified = 304,
  UseProxy = 305,
  Unused = 306,
  TemporaryRedirect = 307,
  PermanentRedirect = 308,
  BadRequest = 400,
  Unauthorized = 401,
  PaymentRequired = 402,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  ProxyAuthenticationRequired = 407,
  RequestTimeout = 408,
  Conflict = 409,
  Gone = 410,
  LengthRequired = 411,
  PreconditionFailed = 412,
  RequestEntityTooLarge = 413,
  RequestURITooLong = 414,
  UnsupportedMediaType = 415,
  RequestedRangeNotSatisfiable = 416,
  ExpectationFailed = 417,
  Teapot = 418,
  UnprocessableEntity = 422,
  Locked = 423,
  UpgradeRequired = 426,
  PreconditionRequired = 428,
  TooManyRequests = 429,
  RequestHeaderFieldsTooLarge = 431,
  NoResponse = 444,
  UnavailableForLegalReasons = 451,
  ClientClosedRequest = 499,
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
  HTTPVersionNotSupported = 505,
  VariantAlsoNegotiates = 506,
  InsufficientStorage = 507,
  LoopDetected = 508,
  NotExtended = 510,
  NetworkAuthenticationRequired = 511,
  NetworkReadTimeoutError = 598,
  NetworkConnectTimeoutError = 599,
}

export type HttpMethod = "get" | "post" | "patch" | "put" | "head" | "delete" | "all";

type Dict = Partial<Record<string, string>>;

export type ProxyRoutes = {
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

export type Request = Http.IncomingMessage & {
  urlParams: Record<string, string | undefined>;
  qs: Record<string, string | string[]>;
  path: string;
  body: string;
};

type JsonCallback = (statusCode: number, object: unknown) => Promise<void> | void;

export type Response = Http.ServerResponse & {
  json: JsonCallback;
  res: HttpStatusCode;
  file: (statusCode: number, contentType: string, file: Buffer) => Promise<void> | void;
  text: (statusCode: number, text: string) => Promise<void> | void;
};

type HttpHandler = (req: Request, res: Response, done: () => void) => void | Promise<void>;

export const NilOrEmpty = (a: any) => {
  if (a === undefined || a === null) return true;
  if (a === "") return true;
  if (Array.isArray(a) && a.length === 0) return true;
  return false;
};

const joinUrls = (baseURL: string, ...urls: string[]) => urls.reduce((acc, el) => acc.replace(/\/+$/, "") + "/" + el.replace(/^\/+/, ""), baseURL);

const parseQs = (url: string) => {
  const qsString = new URLSearchParams((url ?? "").split("?")[1]);
  const queryString: Record<string, string> = {};
  qsString.forEach((value, key) => (queryString[key] = value));
  return queryString;
};

const createQueryString = (req: Request) => {
  const url = req.url ?? "";
  const [pathname, search] = url.split("?");
  req.path = pathname;
  if (NilOrEmpty(search)) return;
  req.qs = parseQs(url);
};

const rewriteRules = (from: string, to: string) => (path: string) => {
  const fromRule = new RegExp(from);
  if (!fromRule.test(path)) return path;
  return path.replace(fromRule, to);
};

const JsonStringify = Stringify({}, { rounding: "ceil" });

const defineMethod = (calledMethod: HttpMethod, toMethod?: HttpMethod) => (toMethod === undefined || toMethod === "all" ? calledMethod : toMethod);

type NodevellirInit = {
  on404?: (req: Request, res: Response) => void | Promise<void>;
  errorHandler?: (req: Request, res: Response, error: Error) => void | Promise<void>;
};

const defaultRoute = (_: Http.IncomingMessage, res: Http.ServerResponse) => {
  res.statusCode = 404;
  res.write("Not found");
  res.end();
};

const contentTypeParsers: Partial<Record<string, (body: string) => any>> = {
  "application/json": JSON.parse,
};

const defaultErrorHandler = (_: Http.IncomingMessage, res: Response, error: Error) =>
  res.json(500, { stack: error.stack, message: error.message, name: error.name });

export const Nodevellir = (init?: NodevellirInit) => {
  const router = FindMyWay({
    caseSensitive: false,
    allowUnsafeRegex: false,
    ignoreTrailingSlash: true,
    defaultRoute: init?.on404 ?? defaultRoute,
  });

  const errorHandler = init?.errorHandler ?? defaultErrorHandler;

  const nodevellirHandler =
    (...middlewares: HttpHandler[]) =>
    async (req: Http.IncomingMessage, res: Http.ServerResponse, params: Dict) => {
      (req as any).urlParams = params;
      for (let i = 0; i < middlewares.length; i++) {
        const handler = middlewares[i];
        try {
          await handler(req as never, res as never, () => {});
        } catch (error) {
          await errorHandler(req as never, res as never, error as Error);
        }
      }
      return res.end();
    };

  const route = (method: FindMyWay.HTTPMethod | "all", path: string, ...callback: HttpHandler[]) =>
    method === "all" ? router.all(path, nodevellirHandler(...callback)) : router.on(method, path, nodevellirHandler(...callback));

  const server = Http.createServer(async (req, res) => {
    let body: Uint8Array[] = [];
    if (req.method !== "GET" && req.method !== "DELETE") {
      await new Promise((resolve) => {
        req
          .on("data", (data) => body.push(data))
          .on("end", () => {
            const contentType = req.headers["content-type"]!;
            const parser = contentTypeParsers[contentType];

            if (parser) (req as any).body = parser(Buffer.concat(body).toString());
            else (req as any).body = Buffer.concat(body).toString();

            resolve(body);
          });
      });
    }
    createQueryString(req as never);
    (res as any).json = (status: number, object: object) => {
      const body = JsonStringify(object);
      res.writeHead(status, {
        "Content-Length": Buffer.byteLength(body, "utf-8"),
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(body);
    };

    (res as any).status = HttpStatusCode;
    (res as any).text = (status: number, object: string) => {
      const body = Buffer.from(object);
      res.writeHead(status, {
        "Content-Length": Buffer.byteLength(body, "utf-8"),
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end(body);
    };

    (res as any).file = (status: number, contentType: string, file: Buffer) => {
      res.writeHead(status, {
        "Content-Length": Buffer.byteLength(file, "utf-8"),
        "Content-Type": contentType,
      });
      res.end(file);
    };
    router.lookup(req, res);
  });

  const createProxy = () => {
    const proxy = CreateProxy();
    const createProxyMethods = {
      register: (routes: ProxyRoutes[]) => {
        routes.forEach((route) => {
          const fromMethod = route.from.method ?? ("all" as const);
          return router[fromMethod](route.from.path, (req, res, params) => {
            const qsString = new URLSearchParams((req.url ?? "").split("?")[1]);
            const queryString = {};
            qsString.forEach((value, key) => {
              try {
                (queryString as any)[key] = JSON.parse(value);
              } catch (error) {
                (queryString as any)[key] = value;
              }
            });

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

  const nodevellir = {
    createProxy,
    all: (path: string, ...handler: HttpHandler[]) => (route("all", path, ...handler), nodevellir),
    delete: (path: string, ...handler: HttpHandler[]) => (route("DELETE", path, ...handler), nodevellir),
    get: (path: string, ...handler: HttpHandler[]) => (route("GET", path, ...handler), nodevellir),
    listen: (port: number, onStart?: () => void) => server.listen(port, onStart),
    patch: (path: string, ...handler: HttpHandler[]) => (route("PATCH", path, ...handler), nodevellir),
    post: (path: string, ...handler: HttpHandler[]) => (route("POST", path, ...handler), nodevellir),
    put: (path: string, ...handler: HttpHandler[]) => (route("PUT", path, ...handler), nodevellir),
    use: (path: string, ...handler: HttpHandler[]) => {
      const urlFixHandler: HttpHandler = (req, _) => {
        req.url = req.url?.replace(path, "");
      };
      route("all", joinUrls(path, "/*"), ...[urlFixHandler, ...handler]);
    },
    routes: () => (router as any).routes,
  };

  return nodevellir;
};

const server = Nodevellir();

const proxy = server.createProxy();

proxy.register([
  {
    host: "http://localhost:9801",
    from: { path: "/post-test/:id/test", method: "get" },
    to: { path: "/posts/:id", method: "get", rewrite: "^/post-test/:id/test" },
  },
  {
    host: "http://localhost:9801",
    from: { path: "/testing*", method: "get" },
    to: { path: "/posts/", method: "get" },
  },
]);

server.listen(3000, () => console.log(":3000"));

server.get("/ids/:id", (req, res) => res.json(200, { message: "hello world", id: req.urlParams.id, query: req.qs }));

const staticMiddleware = Static("./server");

server
  .post("/new", (req, res) => {
    console.log(req.body);
    res.json(200, { message: "hello world" });
  })
  .get("/package-json", Cookies(), (_, res) => {
    console.log((_ as any).cookies);
    res.file(200, "application/json", readFileSync("./package.json"));
  })
  .use("/static", staticMiddleware);
