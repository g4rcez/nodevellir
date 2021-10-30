import Http from "http";
import { HttpStatusCode } from "./http-status-code";
export { HttpStatusCode } from "./http-status-code";
import { SetOption } from "cookies";

export type HttpMethod = "get" | "post" | "patch" | "put" | "head" | "delete" | "all";

export type Dict = Partial<Record<string, string>>;

export type ProxyRoutes = {
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

export type HttpRequest = Http.IncomingMessage & {
  protocol: "http" | "https";
  urlParams: Record<string, string | undefined>;
  qs: {
    [key: string]: string | string[] | null;
  };
  path: string;
  hostname: string;
  body: string;
  cookies: any;
};

export type JsonCallback = (statusCode: HttpStatusCode, object: unknown) => Promise<void> | void;

export type HttpResponse = Http.ServerResponse & {
  json: JsonCallback;
  res: HttpStatusCode;
  contentType: (type: string) => HttpResponse;
  setCookie(name: string, value?: string | null, opts?: SetOption): void;
  clearCookie(name: string): void;
  file: (statusCode: HttpStatusCode, contentType: string, file: Buffer) => Promise<void> | void;
  text: (statusCode: HttpStatusCode, text: string) => Promise<void> | void;
  page: (statusCode: HttpStatusCode, text: string) => Promise<void> | void;
  redirect: (path: string, statusCode: HttpStatusCode, openRedirect?: boolean) => void;
};

export type DoneFunction = (err?: unknown) => void;
export type HttpHandler = (req: HttpRequest, res: HttpResponse, done: DoneFunction) => void | Promise<void>;
