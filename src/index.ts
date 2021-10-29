import FindMyWay from "find-my-way";
import Http from "http";
import { Url } from "./helpers/url";
import { createProxy } from "./http/proxy";
import { NodevellirRequest } from "./http/request";
import { NodevellirResponse } from "./http/response";
import { Dict, DoneFunction, HttpHandler, Request, Response } from "./typings/index.types";

type NodevellirInit = {
  on404?: (req: Request, res: Response) => void | Promise<void>;
  errorHandler?: (req: Request, res: Response, error: Error) => void | Promise<void>;
};

const defaultRoute = (_: Http.IncomingMessage, res: Http.ServerResponse) => {
  res.statusCode = 404;
  res.write("Not found");
  res.end();
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

  const nodevellirHandler = (middlewares: HttpHandler[]) => async (req: Request, res: Response, params: Dict) => {
    (req as any).urlParams = params;
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
      } catch (error) {
        console.error(error);
        await errorHandler(req as never, res as never, error as Error);
      }
    }

    return res.end();
  };

  const route = (method: FindMyWay.HTTPMethod | "all", path: string, callback: HttpHandler[]) => {
    const handler = (req: any, res: any, params: Dict) => nodevellirHandler(callback)(req, res, params);
    return method === "all" ? router.all(path, handler) : router.on(method, path, handler);
  };

  const server = Http.createServer(async (req, res) => {
    const request = await NodevellirRequest(req);
    const response = NodevellirResponse(request, res);
    router.lookup(request, response);
  });

  const nodevellir = {
    createProxy: () => createProxy(router),
    all: (path: string, ...handler: HttpHandler[]) => (route("all", path, handler), nodevellir),
    delete: (path: string, ...handler: HttpHandler[]) => (route("DELETE", path, handler), nodevellir),
    get: (path: string, ...handler: HttpHandler[]) => (route("GET", path, handler), nodevellir),
    listen: (port: number, onStart?: () => void) => server.listen(port, onStart),
    patch: (path: string, ...handler: HttpHandler[]) => (route("PATCH", path, handler), nodevellir),
    post: (path: string, ...handler: HttpHandler[]) => (route("POST", path, handler), nodevellir),
    put: (path: string, ...handler: HttpHandler[]) => (route("PUT", path, handler), nodevellir),
    use: (path: string, ...handler: HttpHandler[]) => {
      const urlFixHandler: HttpHandler = (req, _) => {
        req.url = req.url?.replace(path, "");
      };
      route("all", Url.joinUrls(path, "/*"), [urlFixHandler, ...handler]);
      return nodevellir;
    },
    routes: () => (router as any).routes,
  };

  return nodevellir;
};
