import FindMyWay from "find-my-way";
import Http from "http";
import { Url } from "./helpers/url";
import { HttpError } from "./http/http-error";
import { createProxy, OnProxyError } from "./http/proxy";
import { NodevellirRequest } from "./http/request";
import { NodevellirResponse } from "./http/response";
import { Dict, DoneFunction, HttpHandler, HttpRequest, HttpResponse } from "./typings/index.types";

type NodevellirInit = {
  on404?: (req: HttpRequest, res: HttpResponse) => void | Promise<void>;
  errorHandler?: (req: HttpRequest, res: HttpResponse, error: Error) => void | Promise<void>;
};

const defaultRoute = (_: Http.IncomingMessage, res: Http.ServerResponse) => {
  res.statusCode = 404;
  res.write("Not found");
  res.end();
};

const defaultErrorHandler = (_: Http.IncomingMessage, res: HttpResponse, error: Error) =>
  res.json(500, { stack: error.stack, message: error.message, name: error.name });

export const Nodevellir = (init?: NodevellirInit) => {
  const router = FindMyWay({
    caseSensitive: false,
    allowUnsafeRegex: false,
    ignoreTrailingSlash: true,
    defaultRoute: init?.on404 ?? defaultRoute,
  });

  const errorHandler = init?.errorHandler ?? defaultErrorHandler;

  const nodevellirHandler = (middlewares: HttpHandler[]) => async (req: HttpRequest, res: HttpResponse) => {
    let i = 0;
    const len = middlewares.length;

    const done: DoneFunction = (e) => {
      if (!e) return;
      i = len + 1;
      res.statusCode = res.statusCode ?? 500;
      if (init?.errorHandler) {
        return init.errorHandler(req, res, e as Error);
      }
      res.end();
      res.write(e);
    };

    for (; i < len; i++) {
      const handler = middlewares[i];
      try {
        await handler(req as never, res as never, done);
      } catch (error: any) {
        console.error(error);
        const httpError = new HttpError(error.status ?? 500, error.message);
        await errorHandler(req as never, res as never, httpError);
      }
    }
    return res.end();
  };

  const route = (method: FindMyWay.HTTPMethod | "all", path: string, callback: HttpHandler[]) => {
    const handler = (req: any, res: any, params: Dict) => {
      req.urlParams = params;
      return nodevellirHandler(callback)(req, res);
    };
    return method === "all" ? router.all(path, handler) : router.on(method, path, handler);
  };

  const server = Http.createServer(async (req, res) => {
    const request = await NodevellirRequest(req);
    const response = NodevellirResponse(request, res);
    router.lookup(request, response);
  });

  const nodevellir = {
    createProxy: (onProxyError?: OnProxyError) => createProxy(router, onProxyError),
    listen: (port: number, onStart?: () => void) => server.listen(port, onStart),
    all: (path: string, ...handler: HttpHandler[]) => (route("all", path, handler), nodevellir),
    delete: (path: string, ...handler: HttpHandler[]) => (route("DELETE", path, handler), nodevellir),
    get: (path: string, ...handler: HttpHandler[]) => (route("GET", path, handler), nodevellir),
    patch: (path: string, ...handler: HttpHandler[]) => (route("PATCH", path, handler), nodevellir),
    post: (path: string, ...handler: HttpHandler[]) => (route("POST", path, handler), nodevellir),
    put: (path: string, ...handler: HttpHandler[]) => (route("PUT", path, handler), nodevellir),
    use: (path: string, ...handler: HttpHandler[]) => {
      const urlFixHandler: HttpHandler = (req, _res) => {
        req.url = req.url?.replace(path, "");
      };
      route("all", Url.joinUrls(path, "/*"), [urlFixHandler, ...handler]);
      return nodevellir;
    },
    routes: () => (router as any).routes,
  };

  return nodevellir;
};
