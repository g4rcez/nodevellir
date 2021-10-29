import { HTTPVersion, Instance } from "find-my-way";
import { createProxy as CreateProxy } from "http-proxy";
import { compile as compileRegexp } from "path-to-regexp";
import { Url } from "../helpers/url";
import { HttpMethod, ProxyRoutes } from "../typings/index.types";

const defineMethod = (calledMethod: HttpMethod, toMethod?: HttpMethod) => (toMethod === undefined || toMethod === "all" ? calledMethod : toMethod);

export const createProxy = (router: Instance<HTTPVersion.V1>) => {
  const proxy = CreateProxy();
  const createProxyMethods = {
    register: (routes: ProxyRoutes[]) => {
      routes.forEach((route) => {
        const fromMethod = route.from.method ?? ("all" as const);
        return router[fromMethod](route.from.path, (req, res, params) => {
          const safeUrl = req.url ?? "";
          if (route.to.rewrite === undefined) {
            req.url = Url.rewriteRules(route.from.path, route.to.path)(safeUrl);
          } else {
            const toRewrite = compileRegexp(route.to.rewrite);
            const toPath = compileRegexp(route.to.path);
            req.url = Url.rewriteRules(toRewrite(params), toPath(params))(safeUrl);
          }
          req.method = defineMethod(req.method! as HttpMethod, route.to.method);
          return proxy.web(req, res, { target: route.host });
        });
      });
      return createProxyMethods;
    },
  };
  return createProxyMethods;
};
