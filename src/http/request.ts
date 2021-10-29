import { IncomingMessage } from "http";
import { Request } from "../typings/index.types";
import SecureJsonParse from "secure-json-parse";

const contentTypeParsers: Partial<Record<string, (body: string) => any>> = {
  "application/json": SecureJsonParse.safeParse,
};

export const NodevellirRequest = async (req: IncomingMessage): Promise<Request> => {
  const request = req as Request;
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

          resolve(body);
        });
    });
  }

  return req as never;
};
