import Stringify from "fast-json-stringify";
import { ServerResponse } from "http";
import { ContentType } from "../helpers/content-type";
import { Url } from "../helpers/url";
import { HttpRequest, HttpResponse, HttpStatusCode } from "../typings/index.types";

export const JsonStringify = Stringify({}, { rounding: "ceil" });

export const NodevellirResponse = (req: HttpRequest, res: ServerResponse): HttpResponse => {
  const response = res as HttpResponse;
  Url.createQueryString(req);

  response.contentType = (type: string) => response.setHeader("Content-Type", type);
  const send = (status: number, contentType: string, body: any) =>
    response
      .writeHead(status, {
        "Content-Length": Buffer.byteLength(body, "utf-8"),
        "Content-Type": contentType,
      })
      .end(body);

  response.json = (status, object) => send(status, ContentType.Json, JsonStringify(object));
  response.text = (status, object) => send(status, ContentType.Text, Buffer.from(object));
  response.page = (status, object) => send(status, ContentType.Html, Buffer.from(object));
  response.file = (status, contentType, file) => send(status, contentType, file);

  response.redirect = (path, statusCode, openRedirect = false) => {
    if (openRedirect) {
      response.writeHead(statusCode ?? HttpStatusCode.Found, { location: path });
      response.end();
    }
    // const safeLocation = Url.createUrl({protocol: req.});
  };

  return response as never;
};
