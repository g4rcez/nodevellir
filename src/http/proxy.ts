import { HTTPVersion, Instance } from "find-my-way";
import { createProxy as CreateProxy } from "http-proxy";
import { compile as compileRegexp } from "path-to-regexp";
import { ContentType } from "../helpers/content-type";
import { HttpMethod, HttpRequest, HttpResponse, ProxyRoutes } from "../typings/index.types";
import { JsonStringify } from "./response";

const defineMethod = (calledMethod: HttpMethod, toMethod?: HttpMethod) => (toMethod === undefined || toMethod === "all" ? calledMethod : toMethod);

export type OnProxyError = (error: Error, req: HttpRequest, res: HttpResponse) => Promise<void> | void;

const onError: OnProxyError = (error, _req, res) => {
  res
    .writeHead(500, {
      "Content-Type": ContentType.Json,
    })
    .end(JsonStringify({ name: "ProxyError", error }));
};

export const createProxy = (router: Instance<HTTPVersion.V1>, onProxyError?: OnProxyError) => {
  const proxy = CreateProxy();

  const handlerError = onProxyError ?? onError;

  proxy.on("error", handlerError as never);
  proxy.on("econnreset", handlerError as never);

  const createProxyMethods = {
    register: (routes: ProxyRoutes[]) => {
      routes.forEach((route) => {
        const fromMethod = route.from.method ?? ("all" as const);
        const destinationRewriter = compileRegexp(route.to.path);
        return router[fromMethod](route.from.path, (req, res, params) => {
          req.url = destinationRewriter(params);
          req.method = defineMethod(req.method! as HttpMethod, route.to.method);
          try {
            return proxy.web(req, res, { target: route.host });
          } catch (error) {
            return onError(error as never, req as never, res as never);
          }
        });
      });
      return createProxyMethods;
    },
  };
  return createProxyMethods;
};
