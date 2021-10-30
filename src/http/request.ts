import { IncomingMessage } from "http";
import SecureJsonParse from "secure-json-parse";
import { HttpRequest } from "../typings/index.types";

const contentTypeParsers: Partial<Record<string, (body: string) => any>> = {
  "application/json": SecureJsonParse.safeParse,
  "application/x-www-form-urlencoded": undefined,
};

export const NodevellirRequest = async (req: IncomingMessage): Promise<HttpRequest> => {
  const request = req as HttpRequest;
  request.hostname = req.headers.host ?? "";

  let body: Uint8Array[] = [];
  if (req.method !== "GET" && req.method !== "DELETE") {
    await new Promise((resolve) => {
      req
        .on("data", (data) => body.push(data))
        .on("end", () => {
          const contentType = req.headers["content-type"]!;
          const parser = contentTypeParsers[contentType];

          if (parser) (req as any).body = parser(Buffer.concat(body).toString());
          else (req as any).body = Buffer.concat(body).toString();

          return resolve(body);
        });
    });
  }

  return req as never;
};
