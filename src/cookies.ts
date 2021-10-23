import Http from "http";
import Cookie from "cookies";

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
  return (req: Http.IncomingMessage, res: Http.ServerResponse) => {
    const cookies = new Cookie(req, res, {
      secure: true,
      keys: ["prevent-tampering"],
    });
    (res as any).setCookies = cookies.set;
    (req as any).cookies = parseCookie(req.headers.cookie ?? "");
  };
};
