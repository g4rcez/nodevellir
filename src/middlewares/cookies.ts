import Cookie, { SetOption } from "cookies";
import { Request, Response } from "../typings/index.types";

const parseCookie = (str: string) =>
  str === ""
    ? {}
    : str
        .split("; ")
        .map((v) => v.split("="))
        .reduce((acc: any, v: any) => {
          acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
          return acc;
        }, {});

export const Cookies = () => {
  function handler(req: Request, res: Response) {
    const cookies = new Cookie(req, res, {
      secure: true,
      keys: ["prevent-tampering"],
    });

    (req as any).cookies = parseCookie(req.headers.cookie ?? "");

    res.setCookie = (name: string, value?: string, opts?: SetOption) => cookies.set(name, value, opts);

    res.clearCookie = (name: string) => {
      return cookies.set(name, "", { expires: new Date(1), path: "/" });
    };
  }
  return handler;
};
