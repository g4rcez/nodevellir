import Stringify from "fast-json-stringify";
import FindMyWay from "find-my-way";
import Http from "http";
import * as PathToRegex from "path-to-regexp";
import { createProxy } from "http-proxy";
import { parse } from "querystring";
import Formidable from "formidable";
import { readFileSync } from "fs";

const isPlainObj = (value: unknown) => {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
};

export const joinUrl = (base: string, ...uris: string[]) =>
  uris.reduce((url, uri) => url + "/" + uri.replace(/^\/+/, ""), base.replace(/\/+$/, ""));

const allMethods = ["GET", "POST", "PATCH", "DELETE", "POST"] as const;

type Paths = {
  from: string;
  to: string;
};

type Request = Http.IncomingMessage & {
  urlParams: Record<string, string | undefined>;
  query: NodeJS.Dict<string | string[]>;
  pathname: string;
};

type JsonCallback = (object: unknown, statusCode?: number) => void;

type Response = Http.ServerResponse & {
  json: JsonCallback;
  file: (file: Buffer, contentType: string, statusCode?: number) => void;
  text: (object: string, statusCode?: number) => void;
};

type HttpHandler = (req: Request, res: Response) => void | Promise<void>;

export const NilOrEmpty = (a: any) => {
  if (a === undefined || a === null) return true;
  if (a === "") return true;
  if (Array.isArray(a) && a.length === 0) return true;
  return false;
};

const QS = (req: Request) => {
  const [pathname, search] = (req.url ?? "").split("?");
  req.pathname = pathname;
  if (NilOrEmpty(search)) return;
  req.query = parse(search.replace(/\[\]=/g, "="));
};

export const createPathRewriter = (rewriteConfig: object) => (path: string) => {
  const rulesCache = parsePathRewriteRules(rewriteConfig);
  let result = path;
  for (const rule of rulesCache) {
    if (rule.regex.test(path)) {
      result = result.replace(rule.regex, rule.value);
      break;
    }
  }
  return result;
};

const parsePathRewriteRules = (rewriteConfig: any) => {
  const rules = [];

  if (isPlainObj(rewriteConfig)) {
    for (const [key] of Object.entries(rewriteConfig)) {
      rules.push({
        regex: new RegExp(key),
        value: rewriteConfig[key],
      });
    }
  }

  return rules;
};

const JsonStringify = Stringify({}, { rounding: "ceil" });

export const Nodevellir = () => {
  const router = FindMyWay({ caseSensitive: true, allowUnsafeRegex: false, ignoreTrailingSlash: true });

  const route = (method: FindMyWay.HTTPMethod, path: string, callback: HttpHandler) => {
    router.on(method, path, async (req, res, params) => {
      QS(req as never);
      (req as any).urlParams = params;
      (res as any).json = (object: object, status = 200) => {
        const body = JsonStringify(object);
        res.writeHead(status, {
          "Content-Length": Buffer.byteLength(body, "utf-8"),
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(body);
      };

      (res as any).text = (object: string, status = 200) => {
        const body = Buffer.from(object);
        res.writeHead(status, {
          "Content-Length": Buffer.byteLength(body, "utf-8"),
          "Content-Type": "text/plain; charset=utf-8",
        });
        res.end(body);
      };

      (res as any).file = (file: Buffer, contentType: string, status = 200) => {
        res.writeHead(status, {
          "Content-Length": Buffer.byteLength(file, "utf-8"),
          "Content-Type": contentType,
        });
        res.end(file);
      };

      await callback(req as never, res as never);
      res.end();
    });
  };

  const server = Http.createServer((req, res) => router.lookup(req, res));

  const CreateProxy = () => {
    const proxy = createProxy();
    return {
      register: (target: string, paths: Paths, prefix: string = "") => {
        const from = joinUrl(prefix, paths.from);
        const rewrite = createPathRewriter({ [from]: paths.to });
        const regex = PathToRegex.compile(paths.to);
        router.all(from, (req, res, params) => {
          req.url = rewrite?.(regex(params as never)) ?? "";
          console.log({ target, url: req.url });
          const urlTarget = new URL(req.url, target);
          proxy.web(req, res, { target: urlTarget });
        });
      },
    };
  };

  return {
    createProxy: CreateProxy,
    listen: (port: number) => server.listen(port),
    upload: (path: string) => {
      const form = Formidable({ allowEmptyFiles: false, keepExtensions: true, multiples: true });
      router.on("POST", path, (req, res) => {
        form.parse(req, (err, fields, files) => {
          if (err) {
            res.writeHead(err.httpCode || 400, { "Content-Type": "text/plain" });
            res.end(String(err));
            return;
          }
          fields;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ fields, files }, null, 2));
        });

        return;
      });
    },
    all: (path: string, handler: HttpHandler) => allMethods.map((x) => route(x, path, handler)),
    delete: (path: string, handler: HttpHandler) => route("DELETE", path, handler),
    get: (path: string, handler: HttpHandler) => route("GET", path, handler),
    patch: (path: string, handler: HttpHandler) => route("PATCH", path, handler),
    post: (path: string, handler: HttpHandler) => route("POST", path, handler),
    put: (path: string, handler: HttpHandler) => route("PUT", path, handler),
  };
};

const server = Nodevellir();

const proxy = server.createProxy();

proxy.register("http://localhost:9801", { from: "/api/posts", to: "/posts" });
proxy.register("http://localhost:9801", { from: "/api/posts/:id", to: "/posts/:id" });

server.listen(3000);
console.log("Start on :3000");

server.get("/ids/:id", (req, res) => {
  console.log(req.query);
  res.json({ message: "hello world", id: req.urlParams.id, query: req.query });
});

server.get("/package-json", (req, res) => {
  console.log(req.query);
  res.file(readFileSync("./package.json"), "application/json");
});
