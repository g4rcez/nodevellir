import Fs from "fs";
import Http from "http";
import lookup from "mime";
import Path from "path";

const fileNotExist = (path: string) => {
  const error = new Error(`File not exist ${path}`);
  error.name = "@Static/NotExist";
  throw error;
};

const isSecurePath = (base: string, maliciousPath: string) => Path.dirname(base) === Path.dirname(maliciousPath);

export const Static = (rootPath: string) => {
  const base = Path.resolve(rootPath);

  return async (req: Http.IncomingMessage, res: Http.ServerResponse) => {
    const path = req.url ?? "";
    const filePath = Path.normalize(Path.join(base, path));

    const secure = isSecurePath(base, filePath);
    if (!Fs.existsSync(filePath) && secure) {
      fileNotExist(path);
    }
    const info = Fs.statSync(filePath);
    const mimeType = (lookup as any).getType(filePath);
    res.writeHead(200, {
      "Content-Type": mimeType,
      "Content-Length": info.size,
    });

    res.write(Fs.readFileSync(filePath));
    res.end();
  };
};
