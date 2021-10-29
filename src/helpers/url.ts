import { parse } from "query-string";
import { Request } from "../typings/index.types";

export const NilOrEmpty = (a: any) => {
  if (a === undefined || a === null) return true;
  if (a === "") return true;
  if (Array.isArray(a) && a.length === 0) return true;
  return false;
};

export namespace Url {
  export const joinUrls = (baseURL: string, ...urls: string[]) =>
    urls.reduce((acc, el) => acc.replace(/\/+$/, "") + "/" + el.replace(/^\/+/, ""), baseURL);

  export const parseQs = (url: string): Request["qs"] => parse(url);

  export const createQueryString = (req: Request) => {
    const url = req.url ?? "";
    const [pathname, search] = url.split("?");
    req.path = pathname;
    if (NilOrEmpty(search)) return;
    req.qs = parseQs(url);
  };

  export const rewriteRules = (from: string, to: string) => (path: string) => {
    const fromRule = new RegExp(from);
    if (!fromRule.test(path)) return path;
    const result = path.replace(fromRule, to);
    return result.replace(/\/\//g, "/");
  };

  export const removeHttpProtocol = (url: string) => url.replace(/^https?:\/\//, "");
}
