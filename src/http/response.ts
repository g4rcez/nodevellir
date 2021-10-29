import Stringify from "fast-json-stringify";
import { ServerResponse } from "http";
import { Url } from "../helpers/url";
import { Request, Response } from "../typings/index.types";

const JsonStringify = Stringify({}, { rounding: "ceil" });

export const NodevellirResponse = (req: Request, res: ServerResponse): Response => {
  const response = res as Response;
  Url.createQueryString(req as never);

  response.contentType = (type: string) => {
    response.setHeader("Content-Type", type);
  };

  response.json = (status, object) => {
    const body = JsonStringify(object);
    return response
      .writeHead(status, {
        "Content-Length": Buffer.byteLength(body, "utf-8"),
        "Content-Type": "application/json; charset=utf-8",
      })
      .end(body);
  };

  response.text = (status, object) => {
    const body = Buffer.from(object);
    return response
      .writeHead(status, {
        "Content-Length": Buffer.byteLength(body, "utf-8"),
        "Content-Type": "text/plain; charset=utf-8",
      })
      .end(body);
  };

  response.page = (status, object) => {
    const body = Buffer.from(object);
    return response
      .writeHead(status, {
        "Content-Length": Buffer.byteLength(body, "utf-8"),
        "Content-Type": "text/html; charset=utf-8",
      })
      .end(body);
  };

  response.file = (status, contentType, file) => {
    return response
      .writeHead(status, {
        "Content-Length": Buffer.byteLength(file, "utf-8"),
        "Content-Type": contentType,
      })
      .end(file);
  };

  return response as never;
};
